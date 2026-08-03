'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useWebRTC, type CallType } from '@/hooks/use-webrtc'
import { CallOverlay } from './call-overlay'
import { useAppStore } from '@/lib/store'
import type { ChatMessage } from '@/hooks/use-socket'
import { useI18n } from '@/hooks/use-i18n'
import { stopIncomingCallRing, retryIncomingCallRingIfNeeded, unlockNotificationAudio } from '@/lib/notification-sound'
import { mapHangupToStatus, callPreviewLabel, parseCallMetadata } from '@/lib/call-message'
import { openPrivateChatWithUser } from '@/lib/open-private-chat'

export type StartCallFn = (
  peerId: string,
  peerName: string,
  peerAvatarColor: string,
  peerAvatarUrl: string | null,
  type: CallType,
) => void

/** Глобальный менеджер звонков — всегда в DOM, ловит входящие в любом разделе. */
export function CallManager() {
  const { t } = useI18n()
  const {
    currentUser,
    chats,
    pendingCall,
    setPendingCall,
    updateLastMessage,
    messageBroadcastFn,
    appendMessageFn,
    setWebrtcStartCall,
  } = useAppStore()

  const callSessionRef = useRef<{
    callId: string
    type: CallType
    peerId: string
    isInitiator: boolean
    connectedAt?: number
  } | null>(null)
  const recordedCallIdsRef = useRef<Set<string>>(new Set())
  const pendingCallStartedRef = useRef<string | null>(null)

  const recordCallMarker = useCallback(
    async (callId: string, reason: string) => {
      const session = callSessionRef.current
      if (!session || session.callId !== callId || !currentUser) return
      if (recordedCallIdsRef.current.has(callId)) return

      const chat = chats.find(
        (c) =>
          c.type === 'private' &&
          c.members.some((m) => m.id === session.peerId) &&
          c.members.some((m) => m.id === currentUser.id),
      )
      if (!chat) return

      recordedCallIdsRef.current.add(callId)

      const wasConnected = !!session.connectedAt
      const status = mapHangupToStatus(reason, wasConnected)
      const durationSec =
        wasConnected && session.connectedAt
          ? Math.max(1, Math.floor((Date.now() - session.connectedAt) / 1000))
          : 0

      try {
        const res = await fetch(`/api/chats/${chat.id}/calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            callId,
            callType: session.type,
            status,
            durationSec,
            peerId: session.peerId,
            isInitiator: session.isInitiator,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.message || data.message.duplicate) return

        const newMsg = data.message as ChatMessage
        appendMessageFn?.(newMsg)
        const callMeta = parseCallMetadata(newMsg.metadata)
        if (!callMeta) return
        updateLastMessage(chat.id, {
          id: newMsg.id,
          content: callPreviewLabel(
            callMeta,
            currentUser.id,
            newMsg.senderId,
            t,
          ),
          createdAt: newMsg.createdAt,
          senderName: newMsg.sender.name,
          senderId: newMsg.senderId,
          type: 'call',
        })
        messageBroadcastFn?.(newMsg)
      } catch (e) {
        console.error('[call] record failed', e)
        recordedCallIdsRef.current.delete(callId)
      } finally {
        callSessionRef.current = null
      }
    },
    [chats, currentUser, appendMessageFn, updateLastMessage, messageBroadcastFn, t],
  )

  const {
    call: activeCall,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    peerCameraEnabled,
    error: callError,
    connectionQuality,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
  } = useWebRTC({
    userId: currentUser?.id ?? null,
    name: currentUser?.name ?? null,
    avatarColor: currentUser?.avatarColor ?? null,
    avatarUrl: currentUser?.avatarUrl ?? null,
    onIncomingCall: (incoming) => {
      const { chats: list, setView: goChats, setActiveChat: openChat } = useAppStore.getState()
      goChats('chats')
      const chat = list.find(
        (c) => c.type === 'private' && c.members.some((m) => m.id === incoming.peerId),
      )
      if (chat) {
        openChat(chat.id)
      } else {
        void openPrivateChatWithUser(incoming.peerId)
      }
    },
    onCallEnded: (callId, reason) => {
      stopIncomingCallRing()
      // Privacy/busy/declined errors are surfaced via callError → toast below.
      // Sent by the call-service to sibling devices/tabs of this user when
      // the same incoming call was already accepted/rejected elsewhere —
      // this device was never actually part of the call, so it must not
      // record a call marker (the device that really handled it already
      // does, or will, record the authoritative outcome).
      if (reason === 'accepted_elsewhere' || reason === 'rejected_elsewhere') {
        callSessionRef.current = null
        return
      }
      // recordCallMarker reads callSessionRef which may be nulled by the
      // useEffect on activeCall→null in the same React commit.  The ref is
      // still populated here (the effect hasn't flushed yet), so calling
      // recordCallMarker immediately is safe.
      void recordCallMarker(callId, reason)
    },
  })

  useEffect(() => {
    setWebrtcStartCall(startCall)
    return () => setWebrtcStartCall(null)
  }, [startCall, setWebrtcStartCall])

  // Исходящий звонок из профиля / deep link — работает даже в режиме шортсов.
  useEffect(() => {
    if (!pendingCall || !currentUser) {
      pendingCallStartedRef.current = null
      return
    }
    const dedupeKey = `${pendingCall.userId}:${pendingCall.type}`
    if (pendingCallStartedRef.current === dedupeKey) return

    const chat = chats.find(
      (c) => c.type === 'private' && c.members.some((m) => m.id === pendingCall.userId),
    )
    const peer = chat?.members.find((m) => m.id === pendingCall.userId)
    if (!peer) return

    pendingCallStartedRef.current = dedupeKey
    unlockNotificationAudio()
    startCall(peer.id, peer.name, peer.avatarColor, peer.avatarUrl || null, pendingCall.type)
    setPendingCall(null)
  }, [pendingCall, chats, currentUser, startCall, setPendingCall])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      retryIncomingCallRingIfNeeded(activeCall?.state === 'incoming', activeCall?.callId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeCall?.state, activeCall?.callId])

  // CallOverlay only renders once there's an active `call` — but startCall()
  // can fail (getUserMedia denied/no device) before a call object is ever
  // created, leaving `callError` set with nothing on screen to show it. A
  // toast guarantees the user always sees why the call didn't start.
  useEffect(() => {
    if (callError && !activeCall) toast.error(callError)
  }, [callError, activeCall])

  useEffect(() => {
    if (!activeCall) {
      callSessionRef.current = null
      return
    }
    callSessionRef.current = {
      callId: activeCall.callId,
      type: activeCall.type,
      peerId: activeCall.peerId,
      isInitiator: activeCall.isInitiator,
      connectedAt:
        activeCall.state === 'connected' && activeCall.startedAt
          ? activeCall.startedAt
          : callSessionRef.current?.callId === activeCall.callId
            ? callSessionRef.current.connectedAt
            : undefined,
    }
  }, [activeCall])

  if (!currentUser) return null

  return (
    <CallOverlay
      call={activeCall}
      localStream={localStream}
      remoteStream={remoteStream}
      micEnabled={micEnabled}
      cameraEnabled={cameraEnabled}
      peerCameraEnabled={peerCameraEnabled}
      error={callError}
      connectionQuality={connectionQuality}
      onAccept={acceptCall}
      onReject={rejectCall}
      onEnd={endCall}
      onToggleMic={toggleMic}
      onToggleCamera={toggleCamera}
    />
  )
}
