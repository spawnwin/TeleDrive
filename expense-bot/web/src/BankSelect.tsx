import { useEffect, useMemo, useRef, useState } from 'react'
import { BankIcon } from './BankIcon'
import { BANKS, findBankByName, type Bank } from './banks'

type Props = {
  value: string
  onChange: (name: string) => void
  placeholder?: string
}

export default function BankSelect({
  value,
  onChange,
  placeholder = 'Выберите банк',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matched = findBankByName(value)
  const [otherMode, setOtherMode] = useState(() => Boolean(value) && !findBankByName(value))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return BANKS
    return BANKS.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.short.toLowerCase().includes(q) ||
        b.id.includes(q),
    )
  }, [query])

  useEffect(() => {
    if (matched) setOtherMode(false)
    else if (value.trim()) setOtherMode(true)
  }, [value, matched])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => searchRef.current?.focus())
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function selectBank(bank: Bank) {
    setOtherMode(false)
    onChange(bank.name)
    setOpen(false)
    setQuery('')
  }

  function pickOther() {
    setOtherMode(true)
    if (matched) onChange('')
    setOpen(false)
    setQuery('')
  }

  const label = matched?.name ?? (otherMode && value.trim() ? value.trim() : null)

  return (
    <div className="bank-select">
      <div ref={rootRef}>
        <button
          type="button"
          className={`bank-select-trigger glass${open ? ' open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {matched ? (
            <BankIcon bank={matched} size="md" />
          ) : label ? (
            <BankIcon size="md" />
          ) : (
            <span className="bank-icon bank-icon-placeholder" aria-hidden>
              🏦
            </span>
          )}
          <span className={label ? 'bank-select-label' : 'bank-select-placeholder'}>
            {label ?? placeholder}
          </span>
          <span className="bank-select-chevron" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
        </button>

        {open && (
          <div className="bank-select-panel glass" role="listbox">
            <input
              ref={searchRef}
              className="bank-select-search"
              placeholder="Поиск банка…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="bank-select-list">
              {filtered.map((bank) => (
                <button
                  key={bank.id}
                  type="button"
                  role="option"
                  aria-selected={matched?.id === bank.id}
                  className={`bank-select-option${matched?.id === bank.id ? ' active' : ''}`}
                  onClick={() => selectBank(bank)}
                >
                  <BankIcon bank={bank} size="md" />
                  <span>{bank.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="bank-select-empty">Ничего не найдено</div>
              )}
              <button
                type="button"
                role="option"
                className={`bank-select-option bank-select-other${otherMode ? ' active' : ''}`}
                onClick={pickOther}
              >
                <BankIcon size="md" />
                <span>Другой банк…</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {otherMode && !open && (
        <input
          className="note-field glass bank-select-custom"
          placeholder="Название банка"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
