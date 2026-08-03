'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { fetchWsToken } from '@/lib/ws-token-client'
import {
  startIncomingCallRing,
  stopIncomingCallRing,
  startOutgoingRingback,
  stopOutgoingRingback,
} from '@/lib/notification-sound'
import { getIceServersAsync } from '@/lib/ice-servers'

export type CallType = 'audio' | 'video'
export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected' | 'ended'

export interface CallInfo {
  callId: string
  type: CallType
  peerId: string
  peerName: string
  peerAvatarColor?: string
  peerAvatarUrl?: string | null
  state: CallState
  isInitiator: boolean
  startedAt?: number
  sdp?: string
}

interface UseWebRTCOptions {
  userId: string | null
  /** Caller's own display name (sent to recipient in call:invite) */
  name?: string | null
  /** Caller's own avatar color */
  avatarColor?: string | null
  /** Caller's own avatar URL */
  avatarUrl?: string | null
  onIncomingCall?: (call: CallInfo) => void
  onCallEnded?: (callId: string, reason: string) => void
}

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

export function useWebRTC(opts: UseWebRTCOptions) {
  const { userId, name, avatarColor, avatarUrl, onIncomingCall, onCallEnded } = opts

  // Keep latest caller identity in a ref so startCall always has fresh values
  // without needing to be in its dependency array (avoids re-creating the call
  // peer connection when the user profile reloads).
  const selfRef = useRef({ name, avatarColor, avatarUrl })
  useEffect(() => {
    selfRef.current = { name, avatarColor, avatarUrl }
  }, [name, avatarColor, avatarUrl])

  const socketRef = useRef<Socket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const pendingOfferRef = useRef<{ sdp: string } | null>(null)
  const currentCallRef = useRef<CallInfo | null>(null)
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renegotiatingRef = useRef(false)

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }, [])

  const [call, setCall] = useState<CallInfo | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [peerCameraEnabled, setPeerCameraEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('unknown')
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const callbacksRef = useRef({ onIncomingCall, onCallEnded })
  useEffect(() => {
    callbacksRef.current = { onIncomingCall, onCallEnded }
  })

  /** Новый MediaStream в state — иначе React не перезапускает <audio> при ontrack. */
  const appendRemoteTrack = useCallback((track: MediaStreamTrack) => {
    const remote = remoteStreamRef.current ?? new MediaStream()
    if (!remoteStreamRef.current) remoteStreamRef.current = remote
    if (remote.getTracks().some((t) => t.id === track.id)) return
    remote.addTrack(track)
    setRemoteStream(new MediaStream(remote.getTracks()))
  }, [])

  const bindRemoteTracks = useCallback(
    (pc: RTCPeerConnection) => {
      pc.ontrack = (event) => {
        console.log('[webrtc] ontrack:', event.track?.kind, event.track?.id, 'streams:', event.streams?.length)
        if (event.track) {
          appendRemoteTrack(event.track)
          return
        }
        event.streams[0]?.getTracks().forEach(appendRemoteTrack)
      }
    },
    [appendRemoteTrack],
  )

  const cleanupCall = useCallback(() => {
    clearRingTimeout()
    stopIncomingCallRing()
    stopOutgoingRingback()
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    remoteStreamRef.current = null
    pendingCandidatesRef.current = []
    currentCallRef.current = null
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setMicEnabled(true)
    setCameraEnabled(true)
    setPeerCameraEnabled(true)
    setConnectionQuality('unknown')
  }, [clearRingTimeout])

  // Wires connection-state monitoring shared by both call directions. When
  // the underlying ICE connection fails (network drop, symmetric NAT with no
  // working TURN candidate, etc.) we used to only clean up locally — the peer
  // never got a call:end, so their UI/ring kept showing the call as active
  // and the call-service's in-memory activeCalls entry leaked until that
  // socket eventually disconnected. Emitting call:end here mirrors endCall().
  const bindConnectionState = useCallback(
    (pc: RTCPeerConnection, callId: string, peerId: string) => {
      const failCall = (reason: string) => {
        if (currentCallRef.current?.callId !== callId) return
        if (socketRef.current?.connected) {
          socketRef.current.emit('call:end', { callId, targetUserId: peerId })
        }
        cleanupCall()
        setCall(null)
        setError('Не удалось установить соединение. Проверьте сеть и попробуйте ещё раз.')
        callbacksRef.current.onCallEnded?.(callId, reason)
      }

      pc.oniceconnectionstatechange = () => {
        console.log('[webrtc] ICE state:', pc.iceConnectionState)
        if (pc.iceConnectionState === 'failed') {
          failCall('ice_failed')
        }
      }
      pc.onconnectionstatechange = () => {
        console.log('[webrtc] Connection state:', pc.connectionState)
        if (pc.connectionState === 'failed') {
          failCall('connection_failed')
        }
      }
    },
    [cleanupCall],
  )

  // Monitor connection quality using WebRTC getStats() API
  const startQualityMonitor = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)
    statsIntervalRef.current = setInterval(async () => {
      const pc = peerConnectionRef.current
      if (!pc) return
      try {
        const stats = await pc.getStats()
        let rtt: number | null = null
        let packetsLost = 0
        let packetsReceived = 0
        let jitter = 0
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.nominated) {
            // Current round-trip time in ms
            if (typeof report.currentRoundTripTime === 'number') {
              rtt = report.currentRoundTripTime * 1000
            }
          }
          if (report.type === 'inbound-rtp') {
            packetsLost += report.packetsLost || 0
            packetsReceived += report.packetsReceived || 0
            jitter = report.jitter || 0
          }
        })
        // Determine quality based on RTT and packet loss
        if (rtt !== null) {
          const lossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0
          if (rtt < 150 && lossRate < 0.02) setConnectionQuality('excellent')
          else if (rtt < 300 && lossRate < 0.05) setConnectionQuality('good')
          else if (rtt < 500 && lossRate < 0.1) setConnectionQuality('fair')
          else setConnectionQuality('poor')
        }
      } catch {
        // Stats not available yet
      }
    }, 2000)
  }, [])

  // Connect to the dedicated calls signaling socket
  useEffect(() => {
    if (!userId) return
    const socket = io(process.env.NEXT_PUBLIC_CALL_WS_URL || '/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000,
    })
    socketRef.current = socket

    socket.on('connect', async () => {
      const token = await fetchWsToken()
      if (!token) {
        setTimeout(() => {
          if (socketRef.current === socket && !socket.connected) socket.connect()
        }, 2000)
        socket.disconnect()
        return
      }
      socket.emit('user:online', { token, userId })
    })

    // Incoming call invitation
    socket.on('call:invite', (data: { callId: string; fromUserId: string; fromName: string; fromAvatarColor?: string; fromAvatarUrl?: string | null; type: CallType; sdp: string }) => {
      const current = currentCallRef.current
      if (current?.callId === data.callId && current.state === 'incoming') return
      if (current && current.state !== 'ended') {
        socket.emit('call:reject', {
          callId: data.callId,
          targetUserId: data.fromUserId,
          reason: 'busy',
        })
        return
      }

      const incomingCall: CallInfo = {
        callId: data.callId,
        type: data.type,
        peerId: data.fromUserId,
        peerName: data.fromName,
        peerAvatarColor: data.fromAvatarColor,
        peerAvatarUrl: data.fromAvatarUrl,
        state: 'incoming',
        isInitiator: false,
      }
      currentCallRef.current = { ...incomingCall, sdp: data.sdp }
      pendingCandidatesRef.current = []
      setCall(incomingCall)
      callbacksRef.current.onIncomingCall?.(incomingCall)
    })

    // Call accepted by remote peer — they sent us their answer SDP
    socket.on('call:accept', async (data: { callId: string; sdp: string }) => {
      if (currentCallRef.current?.callId !== data.callId) return
      console.log('[webrtc] Received call:accept, setting remote description')
      clearRingTimeout()
      stopIncomingCallRing()
      stopOutgoingRingback()
      const pc = peerConnectionRef.current
      if (!pc) {
        console.error('[webrtc] call:accept but no peer connection!')
        return
      }
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        console.log('[webrtc] Remote description set (answer), ICE state:', pc.iceConnectionState)
        // Apply any pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(candidate)
          } catch {}
        }
        pendingCandidatesRef.current = []
        const startedAt = Date.now()
        currentCallRef.current = currentCallRef.current
          ? { ...currentCallRef.current, state: 'connected', startedAt }
          : null
        setCall((c) => (c && c.callId === data.callId ? { ...c, state: 'connected', startedAt } : c))
        startQualityMonitor()
      } catch (e) {
        console.error('[webrtc] setRemoteDescription failed', e)
        setError('Не удалось установить соединение')
      }
    })

    // Call rejected by remote peer
    socket.on('call:reject', (data: { callId: string; reason?: string; message?: string }) => {
      if (currentCallRef.current?.callId !== data.callId) return
      clearRingTimeout()
      stopIncomingCallRing()
      cleanupCall()
      setCall(null)
      if (data.reason === 'privacy' || data.reason === 'blocked') {
        setError(data.message || (data.reason === 'blocked' ? 'Пользователь заблокирован' : 'Звонок недоступен'))
      } else if (data.reason === 'rate_limited') {
        setError('Слишком много звонков. Подождите немного.')
      } else if (data.reason === 'calls_disabled') {
        setError('Звонки временно отключены')
      } else if (data.reason === 'busy') {
        setError('Абонент занят')
      } else if (data.reason === 'declined' || data.reason === 'rejected') {
        setError(data.message || 'Звонок отклонён')
      } else if (data.reason === 'unauthorized') {
        setError('Не удалось начать звонок')
      } else if (data.message) {
        setError(data.message)
      } else if (data.reason) {
        setError('Звонок недоступен')
      }
      callbacksRef.current.onCallEnded?.(data.callId, data.reason || 'rejected')
    })

    // Call ended by remote peer (or by another of our own devices — see
    // 'accepted_elsewhere'/'rejected_elsewhere', sent when the same call was
    // handled on a sibling tab/device).
    socket.on('call:end', (data: { callId: string; reason?: string }) => {
      if (currentCallRef.current?.callId !== data.callId) return
      stopIncomingCallRing()
      cleanupCall()
      setCall(null)
      callbacksRef.current.onCallEnded?.(data.callId, data.reason || 'ended')
    })

    // Собеседник выключил/включил камеру — показываем аватар вместо чёрного экрана
    socket.on('call:camera', (data: { callId: string; enabled: boolean }) => {
      if (currentCallRef.current?.callId !== data.callId) return
      setPeerCameraEnabled(data.enabled)
    })

    // Собеседник включил камеру посреди аудиозвонка — принимаем новый offer
    // (upgrade до видеозвонка) и отвечаем answer'ом.
    socket.on('call:renegotiate', async (data: { callId: string; sdp: string }) => {
      const pc = peerConnectionRef.current
      const current = currentCallRef.current
      if (!pc || !current || current.callId !== data.callId) return
      // If we're also in the middle of renegotiating, wait for our own to finish
      if (renegotiatingRef.current) {
        // Queue this offer to process after our renegotiation completes
        pendingOfferRef.current = { sdp: data.sdp }
        return
      }
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socketRef.current?.emit('call:renegotiate-answer', {
          callId: data.callId,
          targetUserId: current.peerId,
          sdp: answer.sdp,
        })
        // Ренегоциация в этом приложении происходит только при включении
        // камеры — переводим звонок в видео-режим.
        currentCallRef.current = { ...current, type: 'video' }
        setCall((c) => (c && c.callId === data.callId ? { ...c, type: 'video' } : c))
      } catch (e) {
        console.error('[webrtc] renegotiate failed', e)
      }
    })

    socket.on('call:renegotiate-answer', async (data: { callId: string; sdp: string }) => {
      const pc = peerConnectionRef.current
      if (!pc || currentCallRef.current?.callId !== data.callId) return
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
      } catch (e) {
        console.error('[webrtc] renegotiate-answer failed', e)
      }
    })

    // ICE candidate from remote peer
    socket.on('call:ice', async (data: { callId: string; candidate: RTCIceCandidateInit }) => {
      const current = currentCallRef.current
      if (!current || current.callId !== data.callId) return
      console.log('[webrtc] Received ICE candidate')
      const pc = peerConnectionRef.current
      // The recipient hasn't accepted yet (pc not created). Queue the
      // candidate so it can be applied once setRemoteDescription runs in
      // acceptCall. Without this, the caller's ICE candidates sent between
      // the offer and the recipient accepting are lost and the connection
      // never forms.
      if (!pc) {
        console.log('[webrtc] No PC yet, queuing ICE candidate')
        pendingCandidatesRef.current.push(data.candidate)
        return
      }
      // If remote description isn't set yet, queue the candidate
      if (!pc.remoteDescription && !pc.currentRemoteDescription) {
        console.log('[webrtc] No remote description yet, queuing ICE candidate')
        pendingCandidatesRef.current.push(data.candidate)
        return
      }
      try {
        await pc.addIceCandidate(data.candidate)
        console.log('[webrtc] ICE candidate added, ICE state:', pc.iceConnectionState)
      } catch (e) {
        console.error('[webrtc] addIceCandidate failed', e)
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      cleanupCall()
    }
  }, [userId, cleanupCall, clearRingTimeout])

  // Initiate a call to a peer
  const startCall = useCallback(
    async (
      peerId: string,
      peerName: string,
      peerAvatarColor: string,
      peerAvatarUrl: string | null,
      type: CallType,
    ) => {
      const socket = socketRef.current
      if (!userId || !socket) {
        setError('Нет соединения с сервером звонков')
        return
      }
      if (!socket.connected) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => resolve(), 4000)
          socket.once('connect', () => {
            clearTimeout(timer)
            resolve()
          })
          if (!socket.active) socket.connect()
        })
      }
      if (!socket.connected) {
        setError('Сервер звонков ещё подключается. Подождите секунду и попробуйте снова.')
        return
      }
      if (currentCallRef.current && currentCallRef.current.state !== 'ended') {
        setError('Уже идёт другой звонок')
        return
      }
      setError(null)
      try {
        // Privacy / block gate before requesting mic/camera
        const gateRes = await fetch(`/api/users/${encodeURIComponent(peerId)}/can-call`)
        const gate = await gateRes.json().catch(() => ({}))
        if (!gateRes.ok || !gate.canCall) {
          setError(typeof gate.error === 'string' ? gate.error : 'Звонок недоступен')
          return
        }
        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video',
        })
        localStreamRef.current = stream
        setLocalStream(stream)

        // Create peer connection
        const pc = new RTCPeerConnection({ iceServers: await getIceServersAsync() })
        peerConnectionRef.current = pc

        // Add local tracks
        stream.getTracks().forEach((track) => {
          console.log('[webrtc] Adding local track:', track.kind, track.id)
          pc.addTrack(track, stream)
        })

        // Set up remote stream
        const remote = new MediaStream()
        remoteStreamRef.current = remote
        setRemoteStream(remote)
        bindRemoteTracks(pc)

        const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const newCall: CallInfo = {
          callId,
          type,
          peerId,
          peerName,
          peerAvatarColor,
          peerAvatarUrl,
          state: 'outgoing',
          isInitiator: true,
        }
        currentCallRef.current = newCall
        setCall(newCall)
        bindConnectionState(pc, callId, peerId)

        // ICE candidate handler
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('[webrtc] ICE candidate:', event.candidate.candidate?.substring(0, 50))
            if (socket.connected) {
              socket.emit('call:ice', {
                callId,
                targetUserId: peerId,
                candidate: event.candidate.toJSON(),
              })
            } else {
              console.warn('[webrtc] Socket not connected, ICE candidate dropped')
            }
          }
        }

        // Create offer
        console.log('[webrtc] Creating offer')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        console.log('[webrtc] Local description set (offer), ICE state:', pc.iceConnectionState)

        startOutgoingRingback()

        clearRingTimeout()
        ringTimeoutRef.current = setTimeout(() => {
          const current = currentCallRef.current
          if (!current || current.callId !== callId || current.state !== 'outgoing') return
          if (socketRef.current) {
            socketRef.current.emit('call:end', {
              callId: current.callId,
              targetUserId: current.peerId,
            })
          }
          const endedId = current.callId
          cleanupCall()
          setCall(null)
          callbacksRef.current.onCallEnded?.(endedId, 'missed')
        }, 45_000)

        // Send the invite
        socket.emit('call:invite', {
          callId,
          targetUserId: peerId,
          fromUserId: userId,
          fromName: selfRef.current.name || 'Aurora user',
          fromAvatarColor: selfRef.current.avatarColor ?? undefined,
          fromAvatarUrl: selfRef.current.avatarUrl ?? null,
          type,
          sdp: offer.sdp,
        })
      } catch (e) {
        console.error('[webrtc] startCall failed', e)
        setError(
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Доступ к камере/микрофону запрещён'
            : 'Не удалось начать звонок',
        )
        cleanupCall()
        setCall(null)
      }
    },
    [userId, cleanupCall, bindRemoteTracks, clearRingTimeout, bindConnectionState],
  )

  // Accept an incoming call
  const acceptCall = useCallback(async () => {
    const incoming = currentCallRef.current as any
    if (!incoming || !socketRef.current || !userId) return
    console.log('[webrtc] acceptCall:', incoming.callId, incoming.peerId)
    stopIncomingCallRing()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incoming.type === 'video',
      })
      localStreamRef.current = stream
      setLocalStream(stream)

      const pc = new RTCPeerConnection({ iceServers: await getIceServersAsync() })
      peerConnectionRef.current = pc

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      const remote = new MediaStream()
      remoteStreamRef.current = remote
      setRemoteStream(remote)
      bindRemoteTracks(pc)
      bindConnectionState(pc, incoming.callId, incoming.peerId)

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('call:ice', {
            callId: incoming.callId,
            targetUserId: incoming.peerId,
            candidate: event.candidate.toJSON(),
          })
        }
      }

      // Set remote description (the offer)
      console.log('[webrtc] Setting remote description (offer)')
      await pc.setRemoteDescription({ type: 'offer', sdp: incoming.sdp })
      console.log('[webrtc] Remote description set, ICE state:', pc.iceConnectionState)

      // Apply any ICE candidates that arrived before we accepted (they were
      // queued because the peer connection didn't exist yet).
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(candidate)
        } catch {}
      }
      pendingCandidatesRef.current = []

      // Create answer
      console.log('[webrtc] Creating answer')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log('[webrtc] Local description set (answer), ICE state:', pc.iceConnectionState)

      // Send the answer
      socketRef.current.emit('call:accept', {
        callId: incoming.callId,
        targetUserId: incoming.peerId,
        sdp: answer.sdp,
      })
      console.log('[webrtc] Answer sent to server')

      const startedAt = Date.now()
      currentCallRef.current = { ...incoming, state: 'connected', startedAt }
      setCall((c) =>
        c && c.callId === incoming.callId
          ? { ...c, state: 'connected', startedAt }
          : c,
      )
      startQualityMonitor()
    } catch (e) {
      console.error('[webrtc] acceptCall failed', e)
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Доступ к камере/микрофону запрещён'
            : 'Не удалось принять звонок',
      )
      socketRef.current?.emit('call:reject', {
        callId: incoming.callId,
        targetUserId: incoming.peerId,
        reason: 'media_failed',
      })
      cleanupCall()
      setCall(null)
    }
  }, [userId, cleanupCall, startQualityMonitor, bindRemoteTracks, clearRingTimeout, bindConnectionState])

  // Reject an incoming call
  const rejectCall = useCallback(() => {
    const incoming = currentCallRef.current as any
    if (!incoming || !socketRef.current) return
    stopIncomingCallRing()
    socketRef.current.emit('call:reject', {
      callId: incoming.callId,
      targetUserId: incoming.peerId,
      reason: 'declined',
    })
    cleanupCall()
    setCall(null)
  }, [cleanupCall])

  // End an active call
  const endCall = useCallback(() => {
    const current = currentCallRef.current
    if (!current || !socketRef.current) return
    stopIncomingCallRing()
    socketRef.current.emit('call:end', {
      callId: current.callId,
      targetUserId: current.peerId,
    })
    const callId = current.callId
    const reason = current.state === 'connected' ? 'ended' : 'cancelled'
    cleanupCall()
    setCall(null)
    callbacksRef.current.onCallEnded?.(callId, reason)
  }, [cleanupCall])

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return
    const audioTrack = localStreamRef.current.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setMicEnabled(audioTrack.enabled)
    }
  }, [])

  // Toggle camera (Telegram-style):
  //  - в видеозвонке выключает/включает трек и сообщает собеседнику
  //    (он показывает аватар вместо чёрного экрана);
  //  - в аудиозвонке первое включение добавляет видеотрек и делает
  //    ренегоциацию — звонок становится видеозвонком.
  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current
    const current = currentCallRef.current
    if (!stream) return

    const existingTrack = stream.getVideoTracks()[0]
    if (existingTrack) {
      existingTrack.enabled = !existingTrack.enabled
      setCameraEnabled(existingTrack.enabled)
      if (current && socketRef.current) {
        socketRef.current.emit('call:camera', {
          callId: current.callId,
          targetUserId: current.peerId,
          enabled: existingTrack.enabled,
        })
      }
      return
    }

    // Аудиозвонок: включаем камеру — upgrade до видео
    const pc = peerConnectionRef.current
    if (!pc || !current || !socketRef.current) return
    if (renegotiatingRef.current) return
    renegotiatingRef.current = true
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
      const videoTrack = camStream.getVideoTracks()[0]
      if (!videoTrack) {
        camStream.getTracks().forEach((t) => t.stop())
        return
      }
      stream.addTrack(videoTrack)
      pc.addTrack(videoTrack, stream)
      setCameraEnabled(true)
      currentCallRef.current = { ...current, type: 'video' }
      setCall((c) => (c && c.callId === current.callId ? { ...c, type: 'video' } : c))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socketRef.current.emit('call:renegotiate', {
        callId: current.callId,
        targetUserId: current.peerId,
        sdp: offer.sdp,
      })
      socketRef.current.emit('call:camera', {
        callId: current.callId,
        targetUserId: current.peerId,
        enabled: true,
      })
    } catch (e) {
      console.error('[webrtc] enable camera failed', e)
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Доступ к камере запрещён'
          : 'Не удалось включить камеру',
      )
    } finally {
      renegotiatingRef.current = false
      // Process any queued renegotiation offer from the remote peer
      const pendingOffer = pendingOfferRef.current
      if (pendingOffer) {
        pendingOfferRef.current = null
        const pc = peerConnectionRef.current
        const current = currentCallRef.current
        if (pc && current) {
          try {
            await pc.setRemoteDescription({ type: 'offer', sdp: pendingOffer.sdp })
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socketRef.current?.emit('call:renegotiate-answer', {
              callId: current.callId,
              targetUserId: current.peerId,
              sdp: answer.sdp,
            })
            currentCallRef.current = { ...current, type: 'video' }
            setCall((c) => (c && c.callId === current.callId ? { ...c, type: 'video' } : c))
          } catch (e) {
            console.error('[webrtc] Failed to process queued renegotiation offer:', e)
          }
        }
      }
    }
  }, [])

  // Рингтон только для входящего звонка.
  useEffect(() => {
    if (call?.state === 'incoming') {
      startIncomingCallRing(call.callId)
      return () => stopIncomingCallRing()
    }
    stopIncomingCallRing()
  }, [call?.callId, call?.state])

  return {
    call,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    peerCameraEnabled,
    error,
    connectionQuality,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
  }
}
