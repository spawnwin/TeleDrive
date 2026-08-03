import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import { verifySessionToken, isCallsEnabled, canCallUser, isChatMember } from '../shared/ws-auth'
import { sendCallPushNotification, sendCallCancelPush } from '../shared/push-call'
import { endLiveStreamsForUser } from '../shared/end-live-streams'

const CALL_RING_MS = 45_000

const allowedOrigins = (
  process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000'
).split(',')

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  // trycloudflare-домен меняется при каждом перезапуске туннеля — см. chat-service.
  cors: {
    origin: [...allowedOrigins, /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/],
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Map of userId -> Set of socketIds (so we can find a user's active socket)
const userSockets = new Map<string, Set<string>>()

// roomId -> Set of userIds who actually went through group:join for that
// room. group:offer/answer/ice used to relay to any targetUserId with zero
// check that the sender ever joined the room at all — since group-call
// roomIds are derived as `group-${chatId}-${Date.now()}`, a former/uninvited
// chat member who knows (or narrows down) the chatId and rough start time
// could forge a raw `group:offer` straight at a real participant and get
// treated as a legitimate peer. Requiring a prior group:join closes that
// specific forgery path for both group calls and streams (viewers already
// legitimately call group:join to watch).
const roomMembers = new Map<string, Set<string>>()

interface PendingCall {
  callId: string
  callerId: string
  targetUserId: string
  fromName: string
  fromAvatarColor?: string
  fromAvatarUrl?: string | null
  type: 'audio' | 'video'
  sdp: string
  timeout: ReturnType<typeof setTimeout>
  pushSent: boolean
  pushRingCount: number
  pushInterval?: ReturnType<typeof setInterval>
}

interface ActiveCall {
  callId: string
  callerId: string
  targetUserId: string
  type: 'audio' | 'video'
}

const pendingCalls = new Map<string, PendingCall>()
const pendingByTarget = new Map<string, Set<string>>()
const activeCalls = new Map<string, ActiveCall>()

function emitToUser(userId: string, event: string, data: unknown) {
  const sockets = userSockets.get(userId)
  if (!sockets) return
  for (const sid of sockets) {
    io.to(sid).emit(event, data)
  }
}

// A user can have the same incoming call ringing on several devices/tabs at
// once (emitToUser fans call:invite out to all of them). Accepting/rejecting
// on one device previously only told the *other party*, leaving sibling
// devices ringing forever with a stale pending call. This notifies every
// other socket of the acting user so they can dismiss their own overlay.
function emitToOtherSockets(userId: string, exceptSocketId: string, event: string, data: unknown) {
  const sockets = userSockets.get(userId)
  if (!sockets) return
  for (const sid of sockets) {
    if (sid === exceptSocketId) continue
    io.to(sid).emit(event, data)
  }
}

// call:invite had no limit at all — a single authenticated user could fire
// unlimited unique callIds, each spawning a 45s timeout + a 4s-interval push
// ring that only clear on expiry, growing pendingCalls/pendingByTarget and
// hammering the push API for as long as the spam continues.
const inviteTimestamps = new Map<string, number[]>()
const INVITE_LIMIT = 10
const INVITE_WINDOW_MS = 60_000

function tooManyInvites(userId: string): boolean {
  const now = Date.now()
  const hits = (inviteTimestamps.get(userId) ?? []).filter((t) => now - t < INVITE_WINDOW_MS)
  if (hits.length >= INVITE_LIMIT) {
    inviteTimestamps.set(userId, hits)
    return true
  }
  hits.push(now)
  inviteTimestamps.set(userId, hits)
  return false
}

// Periodic cleanup of stale data every 5 minutes
setInterval(() => {
  const now = Date.now()
  // Clean invite timestamps older than 10 minutes
  for (const [userId, timestamps] of inviteTimestamps) {
    const fresh = timestamps.filter((t) => now - t < 600_000)
    if (fresh.length === 0) inviteTimestamps.delete(userId)
    else inviteTimestamps.set(userId, fresh)
  }
  // Clean room members for rooms with no active sockets
  for (const [roomId, members] of roomMembers) {
    let hasAnySocket = false
    for (const memberId of members) {
      if (userSockets.has(memberId)) { hasAnySocket = true; break }
    }
    if (!hasAnySocket) roomMembers.delete(roomId)
  }
}, 300_000).unref?.()

function clearPendingCall(callId: string) {
  const pending = pendingCalls.get(callId)
  if (!pending) return
  clearTimeout(pending.timeout)
  if (pending.pushInterval) clearInterval(pending.pushInterval)
  void sendCallCancelPush({ targetUserId: pending.targetUserId, callId: pending.callId })
  pendingCalls.delete(callId)
  const ids = pendingByTarget.get(pending.targetUserId)
  if (ids) {
    ids.delete(callId)
    if (ids.size === 0) pendingByTarget.delete(pending.targetUserId)
  }
}

function getPendingPeer(callId: string, userId: string, targetUserId: string): string | null {
  const pending = pendingCalls.get(callId)
  if (!pending) return null
  if (pending.callerId === userId && pending.targetUserId === targetUserId) return pending.targetUserId
  if (pending.targetUserId === userId && pending.callerId === targetUserId) return pending.callerId
  return null
}

function getActivePeer(callId: string, userId: string, targetUserId: string): string | null {
  const active = activeCalls.get(callId)
  if (!active) return null
  if (active.callerId === userId && active.targetUserId === targetUserId) return active.targetUserId
  if (active.targetUserId === userId && active.callerId === targetUserId) return active.callerId
  return null
}

function emitToPeer(peerId: string, event: string, data: unknown) {
  const targetSockets = userSockets.get(peerId)
  if (!targetSockets) return
  for (const sid of targetSockets) {
    io.to(sid).emit(event, data)
  }
}

function deliverInvite(pending: PendingCall) {
  emitToUser(pending.targetUserId, 'call:invite', {
    callId: pending.callId,
    fromUserId: pending.callerId,
    fromName: pending.fromName,
    fromAvatarColor: pending.fromAvatarColor,
    fromAvatarUrl: pending.fromAvatarUrl,
    type: pending.type,
    sdp: pending.sdp,
  })
}

function deliverPendingToUser(userId: string) {
  const ids = pendingByTarget.get(userId)
  if (!ids) return
  for (const callId of ids) {
    const pending = pendingCalls.get(callId)
    if (pending) deliverInvite(pending)
  }
}

function registerPendingCall(data: {
  callId: string
  callerId: string
  targetUserId: string
  fromName: string
  fromAvatarColor?: string
  fromAvatarUrl?: string | null
  type: 'audio' | 'video'
  sdp: string
}) {
  clearPendingCall(data.callId)
  activeCalls.delete(data.callId)

  const pending: PendingCall = {
    ...data,
    pushSent: false,
    pushRingCount: 0,
    timeout: setTimeout(() => {
      const p = pendingCalls.get(data.callId)
      if (!p) return
      emitToUser(p.callerId, 'call:reject', { callId: data.callId, reason: 'missed' })
      emitToUser(p.targetUserId, 'call:reject', { callId: data.callId, reason: 'missed' })
      clearPendingCall(data.callId)
    }, CALL_RING_MS),
  }

  pendingCalls.set(data.callId, pending)
  if (!pendingByTarget.has(data.targetUserId)) {
    pendingByTarget.set(data.targetUserId, new Set())
  }
  pendingByTarget.get(data.targetUserId)!.add(data.callId)
  return pending
}

/** Повторный push каждые 4с — socket «online» ≠ приложение на экране. */
function scheduleCallPushRing(pending: PendingCall) {
  if (pending.pushSent) return

  const sendRingPush = () => {
    if (!pendingCalls.has(pending.callId)) return
    pending.pushRingCount += 1
    void sendCallPushNotification({
      targetUserId: pending.targetUserId,
      fromUserId: pending.callerId,
      fromName: pending.fromName,
      callId: pending.callId,
      callType: pending.type,
      ringCount: pending.pushRingCount,
    })
  }

  pending.pushRingCount = 0
  sendRingPush()
  pending.pushSent = true
  pending.pushInterval = setInterval(sendRingPush, 4000)
}

function getAuthUserId(socket: Socket): string | null {
  return (socket.data.userId as string | undefined) ?? null
}

io.on('connection', (socket) => {
  console.log(`[call-service] Socket connected: ${socket.id}`)

  socket.on('user:online', async (data: { token: string; userId?: string }) => {
    const verified = await verifySessionToken(data.token)
    if (!verified) {
      console.warn(`[call-service] user:online verification FAILED (socket ${socket.id})`)
      socket.emit('user:online-ack', { ok: false, error: 'invalid token' })
      return
    }

    if (data.userId && data.userId !== verified.userId) {
      socket.emit('user:online-ack', { ok: false, error: 'userId mismatch' })
      return
    }

    const { userId } = verified
    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId)!.add(socket.id)
    socket.data.userId = userId
    socket.data.userName = verified.name
    socket.data.userAvatarColor = verified.avatarColor
    socket.emit('user:online-ack', { ok: true })
    console.log(`[call-service] user registered: ${userId} (socket ${socket.id})`)
    deliverPendingToUser(userId)
  })

  socket.on('call:invite', async (data: {
    callId: string
    targetUserId: string
    fromUserId: string
    fromName: string
    fromAvatarColor?: string
    fromAvatarUrl?: string | null
    type: 'audio' | 'video'
    sdp: string
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId || data.fromUserId !== userId) {
      // Без явного ответа звонящий вечно висит на «Звоним...»
      socket.emit('call:reject', { callId: data.callId, reason: 'unauthorized' })
      return
    }
    if (tooManyInvites(userId)) {
      socket.emit('call:reject', { callId: data.callId, reason: 'rate_limited' })
      return
    }
    if (!(await isCallsEnabled())) {
      socket.emit('call:reject', { callId: data.callId, reason: 'calls_disabled' })
      return
    }

    const gate = await canCallUser(userId, data.targetUserId)
    if (!gate.ok) {
      socket.emit('call:reject', {
        callId: data.callId,
        reason: gate.error === 'Пользователь заблокирован' ? 'blocked' : 'privacy',
        message: gate.error,
      })
      return
    }

    const pending = registerPendingCall({
      callId: data.callId,
      callerId: userId,
      targetUserId: data.targetUserId,
      fromName: (socket.data.userName as string) || data.fromName,
      fromAvatarColor: (socket.data.userAvatarColor as string) || data.fromAvatarColor,
      fromAvatarUrl: data.fromAvatarUrl,
      type: data.type,
      sdp: data.sdp,
    })

    const targetSockets = userSockets.get(data.targetUserId)
    if (targetSockets && targetSockets.size > 0) {
      deliverInvite(pending)
    }
    scheduleCallPushRing(pending)

    socket.emit('call:ringing', { callId: data.callId })
  })

  socket.on('call:accept', (data: {
    callId: string
    targetUserId: string
    sdp: string
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const pending = pendingCalls.get(data.callId)
    if (!pending || pending.targetUserId !== userId || pending.callerId !== data.targetUserId) return
    activeCalls.set(data.callId, {
      callId: data.callId,
      callerId: pending.callerId,
      targetUserId: pending.targetUserId,
      type: pending.type,
    })
    clearPendingCall(data.callId)
    emitToPeer(pending.callerId, 'call:accept', {
      callId: data.callId,
      sdp: data.sdp,
    })
    emitToOtherSockets(userId, socket.id, 'call:end', {
      callId: data.callId,
      reason: 'accepted_elsewhere',
    })
  })

  socket.on('call:reject', (data: {
    callId: string
    targetUserId: string
    reason?: string
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const peerId = getPendingPeer(data.callId, userId, data.targetUserId)
    if (!peerId) return
    clearPendingCall(data.callId)
    emitToPeer(peerId, 'call:reject', {
      callId: data.callId,
      reason: data.reason,
    })
    emitToOtherSockets(userId, socket.id, 'call:end', {
      callId: data.callId,
      reason: 'rejected_elsewhere',
    })
  })

  socket.on('call:end', (data: {
    callId: string
    targetUserId: string
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const peerId =
      getActivePeer(data.callId, userId, data.targetUserId) ||
      getPendingPeer(data.callId, userId, data.targetUserId)
    if (!peerId) return
    activeCalls.delete(data.callId)
    clearPendingCall(data.callId)
    emitToPeer(peerId, 'call:end', {
      callId: data.callId,
    })
  })

  // Состояние камеры собеседника (выкл/вкл) — чтобы показывать аватар
  // вместо чёрного экрана, как в Telegram.
  socket.on('call:camera', (data: {
    callId: string
    targetUserId: string
    enabled: boolean
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const peerId = getActivePeer(data.callId, userId, data.targetUserId)
    if (!peerId) return
    emitToPeer(peerId, 'call:camera', {
      callId: data.callId,
      enabled: data.enabled,
    })
  })

  // Ренегоциация SDP: включение камеры посреди аудиозвонка (upgrade до видео)
  socket.on('call:renegotiate', (data: {
    callId: string
    targetUserId: string
    sdp: string
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const peerId = getActivePeer(data.callId, userId, data.targetUserId)
    if (!peerId) return
    emitToPeer(peerId, 'call:renegotiate', {
      callId: data.callId,
      sdp: data.sdp,
    })
  })

  socket.on('call:renegotiate-answer', (data: {
    callId: string
    targetUserId: string
    sdp: string
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const peerId = getActivePeer(data.callId, userId, data.targetUserId)
    if (!peerId) return
    emitToPeer(peerId, 'call:renegotiate-answer', {
      callId: data.callId,
      sdp: data.sdp,
    })
  })

  socket.on('call:ice', (data: {
    callId: string
    targetUserId: string
    candidate: unknown
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    const peerId =
      getActivePeer(data.callId, userId, data.targetUserId) ||
      getPendingPeer(data.callId, userId, data.targetUserId)
    if (!peerId) return
    emitToPeer(peerId, 'call:ice', {
      callId: data.callId,
      candidate: data.candidate,
    })
  })

  socket.on('group:invite', async (data: {
    roomId: string
    chatId: string
    fromUserId: string
    fromName: string
    participantIds: string[]
  }) => {
    const userId = getAuthUserId(socket)
    if (!userId || data.fromUserId !== userId) return
    // Verify the inviter is a member of the chat
    if (!(await isChatMember(userId, data.chatId))) return

    for (const pid of data.participantIds) {
      if (!pid || pid === userId) continue
      // Respect whoCanCall / blocklist the same as 1:1 invites
      const gate = await canCallUser(userId, pid)
      if (!gate.ok) continue
      const sockets = userSockets.get(pid)
      if (!sockets) continue
      for (const sid of sockets) {
        io.to(sid).emit('group:invite', data)
      }
    }
  })

  socket.on('group:join', async (data: {
    roomId: string
    chatId: string
    userId: string
    name: string
  }) => {
    const authUserId = getAuthUserId(socket)
    if (!authUserId || data.userId !== authUserId) return
    // Live streams (src/hooks/use-live-stream.ts) reuse this same event but
    // aren't scoped to any chat — roomIds there are `stream-<uuid>` (vs.
    // `group-<chatId>-<ts>` for actual group calls), and any authenticated
    // user is meant to be able to watch any live stream (the roomId is
    // already only discoverable via the authenticated /api/streams list —
    // that's the feature's real trust boundary, same as before this
    // isChatMember check existed). Without this carve-out, isChatMember
    // always fails for streams (no chatId is ever sent), so `socket.join`
    // below never runs for either the host or viewers, and the client sits
    // on "Подключение к эфиру..." forever.
    const isStreamRoom = data.roomId.startsWith('stream-')
    if (!isStreamRoom && !(await isChatMember(authUserId, data.chatId))) return
    socket.join(`group:${data.roomId}`)
    let members = roomMembers.get(data.roomId)
    if (!members) {
      members = new Set()
      roomMembers.set(data.roomId, members)
    }
    members.add(authUserId)
    socket.to(`group:${data.roomId}`).emit('group:join', data)
  })

  socket.on('group:offer', (data: {
    roomId: string
    targetUserId: string
    sdp: string
  }) => {
    const userId = getAuthUserId(socket)
    const members = roomMembers.get(data.roomId)
    if (!userId || !members?.has(userId) || !members.has(data.targetUserId)) return
    const sockets = userSockets.get(data.targetUserId)
    if (!sockets) return
    for (const sid of sockets) {
      io.to(sid).emit('group:offer', {
        roomId: data.roomId,
        fromUserId: userId,
        sdp: data.sdp,
      })
    }
  })

  socket.on('group:answer', (data: {
    roomId: string
    targetUserId: string
    sdp: string
  }) => {
    const userId = getAuthUserId(socket)
    const members = roomMembers.get(data.roomId)
    if (!userId || !members?.has(userId) || !members.has(data.targetUserId)) return
    const sockets = userSockets.get(data.targetUserId)
    if (!sockets) return
    for (const sid of sockets) {
      io.to(sid).emit('group:answer', {
        fromUserId: userId,
        sdp: data.sdp,
      })
    }
  })

  socket.on('group:ice', (data: {
    roomId: string
    targetUserId: string
    candidate: unknown
  }) => {
    const userId = getAuthUserId(socket)
    const members = roomMembers.get(data.roomId)
    if (!userId || !members?.has(userId) || !members.has(data.targetUserId)) return
    const sockets = userSockets.get(data.targetUserId)
    if (!sockets) return
    for (const sid of sockets) {
      io.to(sid).emit('group:ice', {
        fromUserId: userId,
        candidate: data.candidate,
      })
    }
  })

  socket.on('group:end', (data: { roomId: string }) => {
    const userId = getAuthUserId(socket)
    if (!userId || !roomMembers.get(data.roomId)?.has(userId)) return
    roomMembers.delete(data.roomId)
    io.to(`group:${data.roomId}`).emit('group:end', data)
  })

  // Live streaming (MVP, reuses the group:* rooms above for WebRTC signaling).
  // Chat/donation announcements are ephemeral — relayed to the room only, not
  // persisted. Donation amounts here are display-only; the actual coin
  // transfer already happened via the authenticated REST endpoint
  // (/api/streams/[id]/donate) before the client emits this.
  socket.on(
    'stream:chat',
    (data: { roomId: string; userId: string; name: string; message: string }) => {
      const userId = getAuthUserId(socket)
      if (!userId || data.userId !== userId || !data.message?.trim()) return
      if (!roomMembers.get(data.roomId)?.has(userId)) return
      io.to(`group:${data.roomId}`).emit('stream:chat', {
        userId,
        name: data.name,
        message: data.message.slice(0, 500),
        at: Date.now(),
      })
    },
  )

  socket.on(
    'stream:donation',
    (data: { roomId: string; userId: string; name: string; amountCoins: number; message?: string }) => {
      const userId = getAuthUserId(socket)
      if (!userId || data.userId !== userId) return
      if (!roomMembers.get(data.roomId)?.has(userId)) return
      // Cap the displayed amount to prevent clients from broadcasting fake large donations.
      // The real transfer is validated server-side via REST; this is display-only.
      const safeAmount = Math.min(Math.max(1, Math.floor(data.amountCoins)), 1_000_000)
      io.to(`group:${data.roomId}`).emit('stream:donation', {
        userId,
        name: data.name,
        amountCoins: safeAmount,
        message: data.message?.slice(0, 200),
        at: Date.now(),
      })
    },
  )

  socket.on('disconnect', () => {
    const userId = socket.data.userId as string | undefined
    if (userId) {
      const sockets = userSockets.get(userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) userSockets.delete(userId)
      }
      for (const [roomId, members] of roomMembers) {
        if (members.delete(userId)) {
          socket.to(`group:${roomId}`).emit('group:leave', { roomId, userId })
          if (members.size === 0) roomMembers.delete(roomId)
        }
      }
      // Звонящий закрыл приложение — сбрасываем его исходящие звонки.
      if (!userSockets.has(userId)) {
        for (const [callId, pending] of pendingCalls) {
          if (pending.callerId === userId) {
            emitToUser(pending.targetUserId, 'call:end', { callId })
            clearPendingCall(callId)
          }
        }
        for (const [callId, active] of activeCalls) {
          if (active.callerId === userId || active.targetUserId === userId) {
            const peerId = active.callerId === userId ? active.targetUserId : active.callerId
            emitToUser(peerId, 'call:end', { callId })
            activeCalls.delete(callId)
          }
        }
      }
      // Only bother the DB once this was this user's last open socket —
      // they may still be connected in another tab actively hosting.
      if (!userSockets.has(userId)) {
        void endLiveStreamsForUser(userId).then((roomIds) => {
          for (const roomId of roomIds) {
            io.to(`group:${roomId}`).emit('group:end', { roomId })
          }
        })
      }
    }
    console.log(`[call-service] Socket disconnected: ${socket.id}`)
  })

  socket.on('error', (err) => {
    console.error(`[call-service] socket error (${socket.id}):`, err)
  })
})

const PORT = 3004
httpServer.listen(PORT, () => {
  console.log(`[call-service] WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[call-service] SIGTERM received, shutting down...')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[call-service] SIGINT received, shutting down...')
  httpServer.close(() => process.exit(0))
})
