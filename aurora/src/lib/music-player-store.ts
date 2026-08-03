'use client'

import { create } from 'zustand'
import type { ChatMusicMetadata } from '@/lib/music-message'

export type MusicQueueItem = ChatMusicMetadata & { key: string }

type MusicPlayerState = {
  queue: MusicQueueItem[]
  index: number
  playing: boolean
  current: number
  duration: number
  preview: boolean
  loading: boolean
  expanded: boolean
  seekRequest: number | null
  setExpanded: (v: boolean) => void
  playQueue: (items: MusicQueueItem[], startIndex?: number) => void
  playOne: (item: MusicQueueItem) => void
  enqueue: (item: MusicQueueItem) => void
  playNext: () => void
  playPrev: () => void
  setPlaying: (v: boolean) => void
  setProgress: (current: number, duration: number) => void
  setPreview: (v: boolean) => void
  setLoading: (v: boolean) => void
  seekTo: (seconds: number) => void
  clearSeekRequest: () => void
  clear: () => void
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  current: 0,
  duration: 0,
  preview: false,
  loading: false,
  expanded: false,
  seekRequest: null,
  setExpanded: (expanded) => set({ expanded }),
  playQueue: (items, startIndex = 0) => {
    if (!items.length) return
    const index = Math.max(0, Math.min(startIndex, items.length - 1))
    set({
      queue: items,
      index,
      playing: true,
      current: 0,
      duration: items[index]?.durationSec || 0,
      preview: false,
      loading: true,
      expanded: true,
      seekRequest: null,
    })
  },
  playOne: (item) => {
    set({
      queue: [item],
      index: 0,
      playing: true,
      current: 0,
      duration: item.durationSec || 0,
      preview: false,
      loading: true,
      expanded: true,
      seekRequest: null,
    })
  },
  enqueue: (item) => {
    const { queue } = get()
    if (queue.some((q) => q.key === item.key)) return
    set({ queue: [...queue, item] })
  },
  playNext: () => {
    const { queue, index } = get()
    if (index + 1 >= queue.length) {
      set({ playing: false, current: 0, loading: false })
      return
    }
    const next = index + 1
    set({
      index: next,
      playing: true,
      current: 0,
      duration: queue[next]?.durationSec || 0,
      preview: false,
      loading: true,
      seekRequest: null,
    })
  },
  playPrev: () => {
    const { queue, index, current } = get()
    if (current > 3 && queue[index]) {
      set({ seekRequest: 0, current: 0 })
      return
    }
    const prev = Math.max(0, index - 1)
    set({
      index: prev,
      playing: true,
      current: 0,
      duration: queue[prev]?.durationSec || 0,
      preview: false,
      loading: true,
      seekRequest: null,
    })
  },
  setPlaying: (playing) => set({ playing }),
  setProgress: (current, duration) => set({ current, duration }),
  setPreview: (preview) => set({ preview }),
  setLoading: (loading) => set({ loading }),
  seekTo: (seconds) => set({ seekRequest: Math.max(0, seconds), current: Math.max(0, seconds) }),
  clearSeekRequest: () => set({ seekRequest: null }),
  clear: () =>
    set({
      queue: [],
      index: 0,
      playing: false,
      current: 0,
      duration: 0,
      preview: false,
      loading: false,
      expanded: false,
      seekRequest: null,
    }),
}))

export function musicItemFromMeta(
  meta: ChatMusicMetadata,
  key: string,
): MusicQueueItem {
  return { ...meta, key }
}
