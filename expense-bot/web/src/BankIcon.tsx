import { BANKS, findBankByName, isDarkBankColor, type Bank } from './banks'

type Size = 'sm' | 'md'

type Props = {
  bank?: Bank | null
  name?: string
  size?: Size
  className?: string
}

const SIZE_PX: Record<Size, number> = { sm: 22, md: 28 }

function SberMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.1 3.5c.5 1.4 1 2.9 1.1 4.4 1.9-.1 3.7-.8 5.3-1.8-1.4 3.4-3.4 6.4-6 8.6.2-2 .6-4 1.6-5.8-1.7.2-3.3.9-4.8 2C9.7 8.2 10.7 5.8 12.1 3.5zm-5.4 9.6c.9-.2 1.8-.2 2.7 0-.5 1.2-.7 2.5-.6 3.8-.7-.1-1.4-.1-2.1 0-.3-1.2-.3-2.5 0-3.8z"
      />
    </svg>
  )
}

function VtbMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6.5h3.2l2.6 8.2L13.2 6.5H20v2.2h-3.4l-2.8 8.8h-3.4L7.4 8.7H4V6.5z"
      />
    </svg>
  )
}

function AlfaMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4.2 5.2 19.5h3.1l1.3-3.2h5l1.3 3.2h3.1L12 4.2zm0 5.2 1.7 4.2h-3.4L12 9.4z"
      />
    </svg>
  )
}

function TBankMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M5.5 6.2h13v2.6H13.4v9h-2.8v-9H5.5V6.2z"
      />
    </svg>
  )
}

function GpbMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        fill="currentColor"
        d="M12 7.2c-1.5 1.6-2.4 3.4-2.6 5.4 1.2-.9 2.4-1.4 3.8-1.5-.7 1.4-1 2.8-.9 4.3 1.9-1.6 3.4-3.8 4.4-6.4-1.7.7-3.3 1.3-5.2 1.4.9-1.1 1.3-2.1 1.4-3-.4 0-.8 0-1.1-.2z"
      />
    </svg>
  )
}

function RaifMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7.2 17.5 12 5.8l4.8 11.7h-2.6l-.8-2.1H10.6l-.8 2.1H7.2zm4.8-8.2 1.2 3.2h-2.4l1.2-3.2z"
      />
    </svg>
  )
}

function YandexMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.8 4.5h2.6v10.2c0 2.6-1.4 4.8-4.6 4.8-1.2 0-2.3-.3-3.1-.8l.9-2.3c.5.3 1.1.5 1.8.5 1.5 0 2.4-1 2.4-2.7V4.5zm-3.6 0h2.6v5.2h-2.6V4.5z"
      />
    </svg>
  )
}

function OzonMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7.2 8.2c1.8-1.4 4-2.1 6.4-1.8 2.2.3 4 1.5 4.8 3.4.4.9.5 1.9.3 2.9-.4 2.2-2 4-4.2 4.8-2.4.9-5 .6-7-.8l1.4-2.1c1.4 1 3.2 1.2 4.8.6 1.4-.5 2.3-1.6 2.5-2.9.1-.5 0-1-.2-1.4-.4-1-1.4-1.6-2.8-1.8-1.5-.2-2.9.2-4 1.1L7.2 8.2z"
      />
    </svg>
  )
}

function DomRfMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4.5 4.5 11h2.2v8h4.2v-5.2h2.2V19h4.2v-8h2.2L12 4.5z"
      />
    </svg>
  )
}

function MarkFor({ bank }: { bank: Bank }) {
  switch (bank.id) {
    case 'sber':
      return <SberMark />
    case 'vtb':
      return <VtbMark />
    case 'alfa':
      return <AlfaMark />
    case 'tbank':
      return <TBankMark />
    case 'gpb':
      return <GpbMark />
    case 'raif':
      return <RaifMark />
    case 'yandex':
      return <YandexMark />
    case 'ozon':
      return <OzonMark />
    case 'domrf':
      return <DomRfMark />
    default:
      return <span className="bank-mark-text">{bank.mark}</span>
  }
}

export function BankIcon({ bank, name, size = 'md', className = '' }: Props) {
  const resolved = bank ?? (name ? findBankByName(name) : null)
  const px = SIZE_PX[size]

  if (!resolved) {
    return (
      <span
        className={`bank-icon bank-icon-unknown ${className}`.trim()}
        style={{ width: px, height: px, fontSize: px * 0.42 }}
        aria-hidden
      >
        ₽
      </span>
    )
  }

  const darkFg = isDarkBankColor(resolved.color)
  const fg = darkFg ? '#fff' : '#1a1408'

  return (
    <span
      className={`bank-icon ${className}`.trim()}
      style={{
        width: px,
        height: px,
        background: resolved.color,
        color: fg,
        fontSize: px * 0.38,
      }}
      title={resolved.name}
      aria-hidden
    >
      <MarkFor bank={resolved} />
    </span>
  )
}

export function bankFromList(id: string): Bank | undefined {
  return BANKS.find((b) => b.id === id)
}
