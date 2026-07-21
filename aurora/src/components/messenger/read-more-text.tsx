'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LinkifyText } from './linkify-text'

const DEFAULT_MAX_LENGTH = 280

interface ReadMoreTextProps {
  text: string
  maxLength?: number
  className?: string
  linkClassName?: string
  readMoreLabel: string
  readLessLabel: string
  onLinkClick?: (url: string) => void
}

export function ReadMoreText({
  text,
  maxLength = DEFAULT_MAX_LENGTH,
  className,
  linkClassName,
  readMoreLabel,
  readLessLabel,
  onLinkClick,
}: ReadMoreTextProps) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncate = text.length > maxLength
  const visibleText = expanded || !needsTruncate ? text : `${text.slice(0, maxLength).trimEnd()}…`

  return (
    <p className={cn('aurora-wrap-anywhere whitespace-pre-wrap break-words', className)}>
      <LinkifyText
        text={visibleText}
        linkClassName={linkClassName}
        onLinkClick={onLinkClick}
      />
      {needsTruncate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className={cn(
            'ml-1 inline text-sm font-medium underline-offset-2 hover:underline',
            linkClassName,
          )}
        >
          {expanded ? readLessLabel : readMoreLabel}
        </button>
      )}
    </p>
  )
}
