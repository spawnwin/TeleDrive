'use client'

import { useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoMessageProps {
  url: string
  durationSec?: number | null
  mine: boolean
  avatarColor: string
  senderName: string
}

// Displays a video message as a circular ("кружочек") like in Telegram.
// Click to play/pause. The video is cropped to a circle via CSS.
export function VideoMessage({
  url,
  durationSec,
  mine,
  avatarColor,
  senderName,
}: VideoMessageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const formatDuration = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const total = Math.floor(s)
    const m = Math.floor(total / 60)
    const sec = total % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="relative h-52 w-52">
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="1.5"
        />
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke={mine ? '#ffffff' : avatarColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 48}`}
          strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress)}`}
          className="transition-all duration-100"
        />
      </svg>

      {/* Circular video */}
      <div className="absolute inset-2 overflow-hidden rounded-full bg-black">
        <video
          ref={videoRef}
          src={url}
          className="h-full w-full object-cover [-webkit-transform:scaleX(-1)] [transform:scaleX(-1)]"
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (v.duration) {
              setProgress(v.currentTime / v.duration)
            }
          }}
          onEnded={() => {
            setPlaying(false)
            setProgress(0)
          }}
          onClick={toggle}
          playsInline
        />
        {/* Play/pause overlay */}
        {!playing && (
          <button
            onClick={toggle}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition hover:bg-black/40"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/30 backdrop-blur-md">
              <Play className="h-7 w-7 translate-x-0.5 fill-white text-white" />
            </div>
          </button>
        )}
        {playing && (
          <button
            onClick={toggle}
            className="absolute inset-0 flex items-center justify-center bg-transparent opacity-0 transition hover:opacity-100 hover:bg-black/20"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/30 backdrop-blur-md">
              <Pause className="h-6 w-6 fill-white text-white" />
            </div>
          </button>
        )}
      </div>

      {/* Duration badge */}
      {durationSec != null && (
        <div
          className={cn(
            'absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur',
            mine ? 'bg-black/40 text-white' : 'bg-black/40 text-white',
          )}
        >
          {formatDuration(durationSec)}
        </div>
      )}
    </div>
  )
}
