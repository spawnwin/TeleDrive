'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { fetchWsToken } from '@/lib/ws-token-client'
import { getIceServersAsync } from '@/lib/ice-servers'

export interface GroupParticipant {
  userId: string
  name: string
  avatarColor?: string
  stream: MediaStream | null
  isLocal: boolean
}

export interface GroupCallState {
  roomId: string
  chatId: string
  participants: GroupParticipant[]
  isActive: boolean
}

export function useGroupCall(userId: string | null, userName?: string | null) {
  const socketRef = useRef<Socket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map())
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const roomIdRef = useRef<string | null>(null)
  const [call, setCall] = useState<GroupCallState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upsertParticipant = useCallback((participant: GroupParticipant) => {
    setCall((prev) => {
      if (!prev) return prev
      const exists = prev.participants.some((p) => p.userId === participant.userId)
      return {
        ...prev,
        participants: exists
          ? prev.participants.map((p) =>
              p.userId === participant.userId ? { ...p, ...participant } : p,
            )
          : [...prev.participants, participant],
      }
    })
  }, [])

  const getGroupMedia = useCallback(async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    } catch (firstError) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch {
        throw firstError
      }
    }
  }, [])

  const queueCandidate = useCallback((peerUserId: string, candidate: RTCIceCandidateInit) => {
    const list = pendingCandidatesRef.current.get(peerUserId) ?? []
    list.push(candidate)
    pendingCandidatesRef.current.set(peerUserId, list)
  }, [])

  const flushPendingCandidates = useCallback(async (peerUserId: string, pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.get(peerUserId)
    if (!candidates?.length) return
    pendingCandidatesRef.current.delete(peerUserId)
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(candidate)
      } catch (err) {
        console.warn('[group-call] queued ICE candidate failed', err)
      }
    }
  }, [])

  const cleanupGroupCall = useCallback((notify: boolean) => {
    const roomId = roomIdRef.current
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    remoteStreamsRef.current.clear()
    pendingCandidatesRef.current.clear()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    roomIdRef.current = null
    if (notify && roomId) {
      socketRef.current?.emit('group:end', { roomId })
    }
    setCall(null)
  }, [])

  const createPeerConnection = useCallback(
    async (roomId: string, peerUserId: string, initiator: boolean) => {
      const existing = peersRef.current.get(peerUserId)
      if (existing && existing.connectionState !== 'closed') return existing

      const pc = new RTCPeerConnection({ iceServers: await getIceServersAsync() })
      peersRef.current.set(peerUserId, pc)

      const stream = localStreamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      }

      let remoteStream = remoteStreamsRef.current.get(peerUserId)
      if (!remoteStream) {
        remoteStream = new MediaStream()
        remoteStreamsRef.current.set(peerUserId, remoteStream)
      }

      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? remoteStreamsRef.current.get(peerUserId) ?? new MediaStream()
        if (event.track && !stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track)
        }
        remoteStreamsRef.current.set(peerUserId, stream)
        const streamSnapshot = new MediaStream(stream.getTracks())
        setCall((prev) => {
          if (!prev) return prev
          const existingParticipant = prev.participants.find((p) => p.userId === peerUserId)
          const participant: GroupParticipant = {
            userId: peerUserId,
            name: existingParticipant?.name || peerUserId,
            stream: streamSnapshot,
            isLocal: false,
          }
          return {
            ...prev,
            participants: existingParticipant
              ? prev.participants.map((p) => (p.userId === peerUserId ? { ...p, ...participant } : p))
              : [...prev.participants, participant],
          }
        })
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.connected) {
          socketRef.current.emit('group:ice', {
            roomId,
            targetUserId: peerUserId,
            candidate: event.candidate.toJSON(),
          })
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          if (peersRef.current.get(peerUserId) === pc) peersRef.current.delete(peerUserId)
          remoteStreamsRef.current.delete(peerUserId)
          pendingCandidatesRef.current.delete(peerUserId)
          setCall((prev) =>
            prev
              ? { ...prev, participants: prev.participants.filter((p) => p.userId !== peerUserId) }
              : prev,
          )
        }
      }

      if (initiator) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socketRef.current?.emit('group:offer', {
          roomId,
          targetUserId: peerUserId,
          sdp: offer.sdp,
        })
      }

      return pc
    },
    [],
  )

  const joinRoom = useCallback(
    async (roomId: string, chatId: string) => {
      if (!userId) {
        setError('Не удалось войти в звонок')
        return false
      }

      try {
        setError(null)
        const stream = localStreamRef.current ?? (await getGroupMedia())
        localStreamRef.current = stream
        roomIdRef.current = roomId
        setCall((prev) => {
          const participants = prev?.roomId === roomId ? prev.participants : []
          return {
            roomId,
            chatId,
            isActive: true,
            participants: [
              { userId, name: userName || 'Вы', stream, isLocal: true },
              ...participants.filter((p) => p.userId !== userId),
            ],
          }
        })
        socketRef.current?.emit('group:join', { roomId, chatId, userId, name: userName || 'Вы' })
        return true
      } catch {
        setError('Не удалось получить доступ к камере/микрофону')
        cleanupGroupCall(false)
        return false
      }
    },
    [cleanupGroupCall, getGroupMedia, userId],
  )

  const startGroupCall = useCallback(
    async (chatId: string, participantIds: string[]) => {
      const socket = socketRef.current
      if (!userId || !socket?.connected) {
        setError('Сервер звонков ещё подключается')
        return
      }
      if (roomIdRef.current) {
        setError('Уже идёт групповой звонок')
        return
      }

      const roomId = `group-${chatId}-${Date.now()}`
      const joined = await joinRoom(roomId, chatId)
      if (!joined) return

      socket.emit('group:invite', {
        roomId,
        chatId,
        fromUserId: userId,
        fromName: userName || 'Вы',
        participantIds: participantIds.filter((id) => id !== userId),
      })
    },
    [joinRoom, userId],
  )

  const endCall = useCallback(() => {
    cleanupGroupCall(true)
  }, [cleanupGroupCall])

  useEffect(() => {
    if (!userId) return
    const socket = io(process.env.NEXT_PUBLIC_CALL_WS_URL || '/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10000,
    })
    socketRef.current = socket

    socket.on('connect', async () => {
      const token = await fetchWsToken()
      if (!token) {
        socket.disconnect()
        return
      }
      socket.emit('user:online', { token, userId })
    })

    socket.on('group:invite', async (data: {
      roomId: string
      chatId: string
      fromUserId: string
      fromName: string
      participantIds: string[]
    }) => {
      if (roomIdRef.current && roomIdRef.current !== data.roomId) return
      await joinRoom(data.roomId, data.chatId)
    })

    socket.on('group:invite-denied', (data: {
      roomId: string
      chatId: string
      reason?: string
    }) => {
      if (roomIdRef.current && roomIdRef.current !== data.roomId) return
      if (data.reason === 'calls_disabled') {
        setError('Звонки временно отключены')
      } else if (data.reason === 'no_recipients') {
        setError('Никого не удалось пригласить (приватность или офлайн)')
      } else {
        setError('Не удалось начать групповой звонок')
      }
      cleanupGroupCall(false)
    })

    socket.on('group:join', async (data: { roomId: string; userId: string; name: string }) => {
      if (data.userId === userId || roomIdRef.current !== data.roomId) return
      upsertParticipant({
        userId: data.userId,
        name: data.name || data.userId,
        stream: remoteStreamsRef.current.get(data.userId) ?? null,
        isLocal: false,
      })
      try {
        await createPeerConnection(data.roomId, data.userId, true)
      } catch (err) {
        console.warn('[group-call] create offer failed', err)
        setError('Не удалось подключить участника')
      }
    })

    socket.on('group:offer', async (data: { roomId: string; fromUserId: string; sdp: string }) => {
      if (roomIdRef.current !== data.roomId) return
      try {
        const pc = await createPeerConnection(data.roomId, data.fromUserId, false)
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        await flushPendingCandidates(data.fromUserId, pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('group:answer', {
          roomId: data.roomId,
          targetUserId: data.fromUserId,
          sdp: answer.sdp,
        })
      } catch (err) {
        console.warn('[group-call] answer offer failed', err)
        setError('Не удалось принять групповой звонок')
      }
    })

    socket.on('group:answer', async (data: { fromUserId: string; sdp: string }) => {
      const pc = peersRef.current.get(data.fromUserId)
      if (!pc) return
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        await flushPendingCandidates(data.fromUserId, pc)
      } catch (err) {
        console.warn('[group-call] set answer failed', err)
      }
    })

    socket.on('group:ice', async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!data.candidate) return
      const pc = peersRef.current.get(data.fromUserId)
      if (!pc || (!pc.remoteDescription && !pc.currentRemoteDescription)) {
        queueCandidate(data.fromUserId, data.candidate)
        return
      }
      try {
        await pc.addIceCandidate(data.candidate)
      } catch {
        queueCandidate(data.fromUserId, data.candidate)
      }
    })

    socket.on('group:leave', (data: { roomId: string; userId: string }) => {
      if (roomIdRef.current !== data.roomId || data.userId === userId) return
      peersRef.current.get(data.userId)?.close()
      peersRef.current.delete(data.userId)
      remoteStreamsRef.current.delete(data.userId)
      pendingCandidatesRef.current.delete(data.userId)
      setCall((prev) =>
        prev
          ? { ...prev, participants: prev.participants.filter((p) => p.userId !== data.userId) }
          : prev,
      )
    })

    socket.on('group:end', () => {
      cleanupGroupCall(false)
    })

    return () => {
      cleanupGroupCall(false)
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [
    cleanupGroupCall,
    createPeerConnection,
    flushPendingCandidates,
    joinRoom,
    queueCandidate,
    upsertParticipant,
    userId,
  ])

  return { call, error, startGroupCall, endCall }
}
