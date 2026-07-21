'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface SwipeAction {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  bg: string
  onClick: () => void
}

interface SwipeableRowProps {
  children: React.ReactNode
  actions: SwipeAction[]
  /** px, минимальный свайп чтобы раскрыть панель */
  openThreshold?: number
  /** ширина одной кнопки-действия */
  actionWidth?: number
  className?: string
}

// Глобальная координация: только одна строка может быть раскрыта за раз.
const SWIPE_CLOSE_EVENT = 'aurora:swipe-close-others'

/**
 * Telegram-style swipe row: тянем влево — раскрываются быстрые действия.
 * Паттерн «раскрыл → тапнул нужную»: после свайпа панель остаётся открытой,
 * пользователь тапает кнопку, тап по строке в открытом состоянии — закрывает.
 *
 * row имеет непрозрачный фон (bg-sidebar), чтобы в покое панель за ней не
 * просвечивала. Событие закрытия других строк несёт токен экземпляра в detail,
 * чтобы строка не закрыла сама себя (свой обработчик получает то же событие).
 */
export function SwipeableRow({
  children,
  actions,
  openThreshold = 24,
  actionWidth = 64,
  className,
}: SwipeableRowProps) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const startX = useRef<number | null>(null)
  const movedRef = useRef(false)
  // Уникальный токен экземпляра, чтобы строка игнорировала собственный
  // SWIPE_CLOSE_EVENT (иначе она открывается и тут же закрывает сама себя).
  const selfToken = useRef(Math.random())

  const maxDrag = actions.length * actionWidth

  const snapTo = useCallback(
    (target: number) => {
      animate(x, target, { type: 'spring', stiffness: 500, damping: 42 })
    },
    [x],
  )

  const close = useCallback(() => {
    setOpen(false)
    snapTo(0)
  }, [snapTo])

  const openPanel = useCallback(() => {
    setOpen(true)
    snapTo(-maxDrag)
    // попросить другие строки закрыться (себя не трогаем — токен в detail)
    window.dispatchEvent(
      new CustomEvent(SWIPE_CLOSE_EVENT, { detail: { source: selfToken.current } }),
    )
  }, [maxDrag, snapTo])

  // Закрыться, когда другая строка раскрывается
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { source?: number } | undefined
      // Игнорируем собственное событие — мы только что открылись, закрываться не должны.
      if (detail?.source === selfToken.current) return
      if (startX.current !== null) return // мы сейчас dragging — не мешаем
      setOpen((cur) => {
        if (cur) {
          snapTo(0)
          return false
        }
        return cur
      })
    }
    window.addEventListener(SWIPE_CLOSE_EVENT, handler)
    return () => window.removeEventListener(SWIPE_CLOSE_EVENT, handler)
  }, [snapTo])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Мышь не участвует в свайпах: на десктопе все действия доступны через
    // контекстное меню, а перехват микро-сдвигов мыши глотал обычные клики
    // («чат не открывается»). Свайп остаётся только для touch/pen.
    if (e.pointerType === 'mouse') return
    startX.current = e.clientX
    movedRef.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (startX.current === null) return
      const delta = e.clientX - startX.current
      if (Math.abs(delta) > 4) movedRef.current = true
      const clamped = Math.max(-maxDrag, Math.min(0, delta))
      x.set(clamped)
    },
    [maxDrag, x],
  )

  const onPointerUp = useCallback(() => {
    if (startX.current === null) return
    startX.current = null

    // Тап без движения — не трогаем x; всё решат onClick-обработчики
    // (оверлей закроет, контент строки откроет чат).
    if (!movedRef.current) return

    const current = x.get()
    // Раскрываем если протянули достаточно; иначе закрываем.
    // Авто-срабатывание действия НЕ происходит — пользователь тапает кнопку сам.
    if (Math.abs(current) >= openThreshold) {
      openPanel()
    } else {
      setOpen(false)
      snapTo(0)
    }
  }, [openThreshold, openPanel, snapTo, x])

  return (
    <div className={cn('relative overflow-hidden rounded-none', className)}>
      {/* Action panel — сидит справа за строкой, в покое скрыта фоновой строкой.
          flex-row-reverse: первый элемент массива (archive) оказывается у правого края
          и открывается первым при свайпе влево. */}
      <div className="absolute inset-0 flex flex-row-reverse justify-start" aria-hidden={!open}>
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <motion.button
              key={a.key}
              type="button"
              tabIndex={open ? 0 : -1}
              onPointerDown={(e) => {
                // Сбрасываем флаг перетаскивания: это новый жест (тап по кнопке),
                // иначе остаточный movedRef=true заблокировал бы onClick.
                movedRef.current = false
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (movedRef.current) return
                a.onClick()
                close()
              }}
              className={cn(
                'flex h-full w-16 shrink-0 flex-col items-center justify-center gap-1 text-white',
                a.bg,
              )}
              style={{ width: actionWidth }}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="w-full truncate px-1 text-center text-[9px] font-medium leading-tight">
                {a.label}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Draggable row — непрозрачный фон скрывает действия в покое */}
      <motion.div
        style={{ x }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startX.current = null
          if (!open) snapTo(0)
        }}
        // pan-y: вертикальный скролл списка остаётся браузеру,
        // горизонтальный жест забираем под свайп-действия (иначе pointercancel).
        className="relative touch-pan-y select-none bg-sidebar"
        onClick={(e) => {
          // Если строка была раскрыта — тап по ней просто закрывает, чат не открываем.
          if (open) {
            e.stopPropagation()
            e.preventDefault()
            close()
          } else if (movedRef.current) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        <div className="relative bg-sidebar">{children}</div>

        {/* Когда панель раскрыта — прозрачный оверлей поверх контента строки,
            чтобы тап по видимой части строки закрывал панель, а не открывал чат. */}
        {open && <div className="absolute inset-0 z-10" onClick={(e) => {
          e.stopPropagation()
          close()
        }} />}
      </motion.div>
    </div>
  )
}
