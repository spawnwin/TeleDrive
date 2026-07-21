import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared surface for admin cards / panels */
export const adminCardClass =
  'admin-card border border-white/8 bg-white/[0.035] shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl rounded-3xl'

export const adminCardHoverClass =
  'transition-all duration-200 hover:border-sky-400/35 hover:bg-white/[0.05] hover:shadow-[0_12px_40px_rgba(14,165,233,0.08)]'

export const adminInsetClass =
  'rounded-2xl border border-white/8 bg-black/25'

export const adminPageTitleClass =
  'text-2xl font-semibold tracking-tight text-zinc-50'

export const adminSectionLabelClass =
  'mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

export function AdminPageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className={adminPageTitleClass}>{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
