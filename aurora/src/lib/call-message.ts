export type CallRecordStatus = 'answered' | 'missed' | 'declined' | 'cancelled'
export type CallRecordType = 'audio' | 'video'

export interface CallMessageMetadata {
  callId: string
  callType: CallRecordType
  status: CallRecordStatus
  durationSec: number
  peerId: string
}

export function parseCallMetadata(raw: string | null | undefined): CallMessageMetadata | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<CallMessageMetadata>
    if (!data.callId || !data.peerId) return null
    const status: CallRecordStatus =
      data.status === 'missed' || data.status === 'declined' || data.status === 'cancelled'
        ? data.status
        : 'answered'
    return {
      callId: String(data.callId),
      callType: data.callType === 'video' ? 'video' : 'audio',
      status,
      durationSec: Math.max(0, Number(data.durationSec) || 0),
      peerId: String(data.peerId),
    }
  } catch {
    return null
  }
}

export function formatCallDuration(sec: number): string {
  if (sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`
  return `0:${s.toString().padStart(2, '0')}`
}

/** Map WebRTC hang-up reason → persisted call status (initiator-side). */
export function mapHangupToStatus(
  reason: string,
  wasConnected: boolean,
): CallRecordStatus {
  if (wasConnected || reason === 'ended') return 'answered'
  if (reason === 'declined') return 'declined'
  if (reason === 'offline' || reason === 'rejected' || reason === 'missed') return 'missed'
  if (reason === 'cancelled') return 'cancelled'
  return 'missed'
}

type LabelKey =
  | 'call.outgoing'
  | 'call.incoming'
  | 'call.missed'
  | 'call.declined'
  | 'call.cancelled'
  | 'call.outgoingMissed'

export function getCallMessageLabel(
  meta: CallMessageMetadata,
  viewerId: string,
  messageSenderId: string,
  t: (key: string) => string,
): string {
  const mine = messageSenderId === viewerId
  const isVideo = meta.callType === 'video'
  const prefix = isVideo ? '📹 ' : '📞 '

  let key: LabelKey
  if (mine) {
    if (meta.status === 'answered') key = 'call.outgoing'
    else if (meta.status === 'declined') key = 'call.declined'
    else if (meta.status === 'cancelled') key = 'call.cancelled'
    else key = 'call.outgoingMissed'
  } else {
    if (meta.status === 'answered') key = 'call.incoming'
    else if (meta.status === 'declined') key = 'call.declined'
    else key = 'call.missed'
  }

  const label = t(key)
  if (meta.status === 'answered' && meta.durationSec > 0) {
    return `${prefix}${label} · ${formatCallDuration(meta.durationSec)}`
  }
  return `${prefix}${label}`
}

export function callPreviewLabel(
  meta: CallMessageMetadata,
  viewerId: string,
  messageSenderId: string,
  t: (key: string) => string,
): string {
  return getCallMessageLabel(meta, viewerId, messageSenderId, t)
}
