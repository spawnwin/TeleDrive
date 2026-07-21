'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from 'react'

export const EXIT_TO_CHATS_EVENT = 'aurora:exit-to-chats'

export function dispatchExitToChats() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EXIT_TO_CHATS_EVENT))
}

type SwipeState = {
  startX: number
  startY: number
  active: boolean
  decided: boolean
  lastDx: number
}

export type UseSwipeToBackOptions = {
  /** When false, listeners are idle. */
  enabled: boolean
  onBack: () => void
  /** px — archive-style threshold (default 72). */
  threshold?: number
  /** If set, gesture must start within this many px from the left edge. */
  edgeWidth?: number | null
  /** Disable on viewports at/above this width (default 1024). */
  desktopMinWidth?: number
  /**
   * Attach to window so portal dialogs/sheets also get the gesture.
   * When false, return touch handlers to bind on a container.
   */
  attachToWindow?: boolean
}

/**
 * Telegram/Aurora archive-style swipe-right-to-go-back.
 * Horizontal right swipe with light visual offset; vertical scroll stays free.
 */
export function useSwipeToBack({
  enabled,
  onBack,
  threshold = 72,
  edgeWidth = null,
  desktopMinWidth = 1280,
  attachToWindow = false,
}: UseSwipeToBackOptions) {
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const stateRef = useRef<SwipeState | null>(null)
  const pullRef = useRef(0)
  const onBackRef = useRef(onBack)
  const enabledRef = useRef(enabled)
  const animatingRef = useRef(animating)

  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  useEffect(() => {
    animatingRef.current = animating
  }, [animating])

  const isDesktop = useCallback(() => {
    return typeof window !== 'undefined' && window.innerWidth >= desktopMinWidth
  }, [desktopMinWidth])

  const resetVisual = useCallback(() => {
    pullRef.current = 0
    setOffset(0)
  }, [])

  const finish = useCallback(
    (goBack: boolean) => {
      setAnimating(true)
      const width = typeof window !== 'undefined' ? window.innerWidth : 400
      setOffset(goBack ? Math.min(width * 0.35, 140) : 0)
      window.setTimeout(() => {
        if (goBack) {
          onBackRef.current()
        }
        resetVisual()
        setAnimating(false)
      }, goBack ? 140 : 180)
    },
    [resetVisual],
  )

  const onTouchStart = useCallback(
    (e: TouchEvent | ReactTouchEvent) => {
      if (!enabledRef.current || animatingRef.current || isDesktop()) return
      const touch = 'touches' in e ? e.touches[0] : null
      if (!touch) return
      if (edgeWidth != null && touch.clientX > edgeWidth) return

      const target = touch.target as HTMLElement | null
      if (target?.closest?.('input,textarea,select,[contenteditable="true"]')) return

      stateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        active: false,
        decided: false,
        lastDx: 0,
      }
      pullRef.current = 0
    },
    [edgeWidth, isDesktop],
  )

  const onTouchMove = useCallback((e: TouchEvent | ReactTouchEvent) => {
    const state = stateRef.current
    if (!state || !enabledRef.current) return
    const touch = 'touches' in e ? e.touches[0] : null
    if (!touch) return

    const dx = touch.clientX - state.startX
    const dy = touch.clientY - state.startY

    if (!state.decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      state.decided = true
      // Archive-style: clear horizontal-right dominance
      state.active = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.15
      if (!state.active) return
    }
    if (!state.active) return

    if ('cancelable' in e && e.cancelable) e.preventDefault()
    const pull = Math.min(120, dx * 0.85)
    state.lastDx = pull
    pullRef.current = pull
    setOffset(pull)
  }, [])

  const onTouchEnd = useCallback(() => {
    const state = stateRef.current
    const pull = pullRef.current
    stateRef.current = null
    if (!state?.active) {
      resetVisual()
      return
    }
    finish(pull >= threshold)
  }, [finish, resetVisual, threshold])

  useEffect(() => {
    if (!attachToWindow || !enabled) {
      stateRef.current = null
      resetVisual()
      return
    }

    const start = (e: TouchEvent) => onTouchStart(e)
    const move = (e: TouchEvent) => onTouchMove(e)
    const end = () => onTouchEnd()

    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
  }, [attachToWindow, enabled, onTouchStart, onTouchMove, onTouchEnd, resetVisual])

  const bind = {
    onTouchStart: (e: ReactTouchEvent) => onTouchStart(e),
    onTouchMove: (e: ReactTouchEvent) => onTouchMove(e),
    onTouchEnd: () => onTouchEnd(),
    onTouchCancel: () => onTouchEnd(),
  }

  return {
    offset,
    animating,
    bind,
    style: {
      transform: offset ? `translateX(${Math.min(56, offset * 0.35)}px)` : undefined,
      transition: animating ? 'transform 0.18s ease-out' : undefined,
    } as CSSProperties,
    hintOpacity: Math.min(1, offset / threshold),
    hintVisible: offset > 0,
  }
}
