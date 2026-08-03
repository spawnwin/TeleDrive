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
  expanded: boolean
  setExpanded: (v: boolean) => void
  playQueue: (items: MusicQueueItem[], startIndex?: number) => void
  playOne: (item: MusicQueueItem) => void
  enqueue: (item: MusicQueueItem) => void
  playNext: () => void
  playPrev: () => void
  setPlaying: (v: boolean) => void
  setProgress: (current: number, duration: number) => void
  setPreview: (v: boolean) => void
  clear: () => void
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  current: 0,
  duration: 0,
  preview: false,
  expanded: false,
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
      expanded: true,
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
      expanded: true,
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
      set({ playing: false, current: 0 })
      return
    }
    const next = index + 1
    set({
      index: next,
      playing: true,
      current: 0,
      duration: queue[next]?.durationSec || 0,
      preview: false,
    })
  },
  playPrev: () => {
    const { queue, index, current } = get()
    if (current > 3 && queue[index]) {
      set({ current: 0 })
      return
    }
    const prev = Math.max(0, index - 1)
    set({
      index: prev,
      playing: true,
      current: 0,
      duration: queue[prev]?.durationSec || 0,
      preview: false,
    })
  },
  setPlaying: (playing) => set({ playing }),
  setProgress: (current, duration) => set({ current, duration }),
  setPreview: (preview) => set({ preview }),
  clear: () =>
    set({
      queue: [],
      index: 0,
      playing: false,
      current: 0,
      duration: 0,
      preview: false,
      expanded: false,
    }),
}))

export function musicItemFromMeta(
  meta: ChatMusicMetadata,
  key: string,
): MusicQueueItem {
  return { ...meta, key }
}
