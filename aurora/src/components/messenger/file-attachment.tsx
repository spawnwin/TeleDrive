'use client'

import { FileText, Download, File, FileArchive, FileSpreadsheet, FileImage } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileAttachmentProps {
  url: string
  name: string
  mime?: string | null
  size?: number | null
  mine: boolean
}

export function FileAttachment({ url, name, mime, size, mine }: FileAttachmentProps) {
  const sizeStr = size ? formatSize(size) : ''
  const Icon = getFileIcon(mime || '')

  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition',
        mine
          ? 'bg-white/10 hover:bg-white/15'
          : 'bg-background/60 hover:bg-background',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          mine ? 'bg-white/15 text-white' : 'bg-violet-500/15 text-violet-500',
        )}
      >
        <IconComponent Icon={Icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            mine ? 'text-white' : 'text-foreground',
          )}
        >
          {name}
        </p>
        <p
          className={cn(
            'text-xs',
            mine ? 'text-white/60' : 'text-muted-foreground',
          )}
        >
          {mime || 'файл'}{sizeStr && ` · ${sizeStr}`}
        </p>
      </div>
      <Download
        className={cn(
          'h-4 w-4 shrink-0',
          mine ? 'text-white/60' : 'text-muted-foreground',
        )}
      />
    </a>
  )
}

// Wrapper to satisfy the static-components rule
function IconComponent({ Icon }: { Icon: React.ComponentType<{ className?: string }> }) {
  return <Icon className="h-5 w-5" />
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage
  if (mime.includes('pdf')) return FileText
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('rar')) return FileArchive
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet
  return File
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
