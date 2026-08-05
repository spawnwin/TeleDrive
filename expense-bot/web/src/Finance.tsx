import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  Deposit,
  FinanceSummary,
  formatMoney,
  Mortgage,
} from './api'
import { BankIcon } from './BankIcon'
import BankSelect from './BankSelect'
import Sheet, { useSheetScrollLock } from './Sheet'

type Props = {
  onToast: (msg: string) => void
  haptic: (ok?: boolean) => void
}

type FormKind = 'mortgage' | 'deposit' | null

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function plusYearsIso(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso.includes('T') ? iso : `${iso}T12:00:00`))
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`)
  const b = new Date(`${to}T12:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return 0
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function previewDepositPayout(
  amount: number,
  ratePct: number,
  start: string,
  end: string,
  cap: 'none' | 'monthly' | 'daily',
): { payout: number; profit: number } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (!Number.isFinite(ratePct) || ratePct < 0) return null
  const days = daysBetween(start, end)
  if (days <= 0) return null
  const rate = ratePct / 100
  let payout = amount
  if (cap === 'monthly') {
    const months = Math.max(1, Math.round(days / 30.4375))
    payout = amount * Math.pow(1 + rate / 12, months)
  } else if (cap === 'daily') {
    payout = amount * Math.pow(1 + rate / 365, days)
  } else {
    payout = amount * (1 + rate * (days / 365))
  }
  payout = Math.round(payout * 100) / 100
  return { payout, profit: Math.round((payout - amount) * 100) / 100 }
}

export default function FinancePanel({ onToast, haptic }: Props) {
  const [data, setData] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormKind>(null)
  const [editMortgage, setEditMortgage] = useState<Mortgage | null>(null)
  const [editDeposit, setEditDeposit] = useState<Deposit | null>(null)

  // mortgage fields
  const [mPerson, setMPerson] = useState('')
  const [mBank, setMBank] = useState('')
  const [mTitle, setMTitle] = useState('Ипотека')
  const [mPrincipal, setMPrincipal] = useState('')
  const [mRate, setMRate] = useState('')
  const [mPayment, setMPayment] = useState('')
  const [mDay, setMDay] = useState('15')
  const [mEnd, setMEnd] = useState('')
  const [mNotify, setMNotify] = useState(true)

  // deposit fields
  const [dPerson, setDPerson] = useState('')
  const [dBank, setDBank] = useState('')
  const [dAmount, setDAmount] = useState('')
  const [dRate, setDRate] = useState('')
  const [dStart, setDStart] = useState(todayIso())
  const [dEnd, setDEnd] = useState(plusYearsIso(1))
  const [dCap, setDCap] = useState<'none' | 'monthly' | 'daily'>('none')
  const [dNotifyBefore, setDNotifyBefore] = useState('3')
  const [dNotify, setDNotify] = useState(true)

  async function refresh() {
    const res = await api.finance()
    setData(res)
  }

  useEffect(() => {
    refresh()
      .catch((err: Error) => onToast(err.message))
      .finally(() => setLoading(false))
  }, [])

  useSheetScrollLock(form !== null)

  function openMortgage(m?: Mortgage) {
    setEditDeposit(null)
    if (m) {
      setEditMortgage(m)
      setMPerson(m.person)
      setMBank(m.bank)
      setMTitle(m.title)
      setMPrincipal(String(m.principal))
      setMRate(String(m.rate))
      setMPayment(String(m.monthly_payment))
      setMDay(String(m.payment_day))
      setMEnd(m.end_date ?? '')
      setMNotify(!!m.notify_enabled)
    } else {
      setEditMortgage(null)
      setMPerson('')
      setMBank('')
      setMTitle('Ипотека')
      setMPrincipal('')
      setMRate('')
      setMPayment('')
      setMDay('15')
      setMEnd('')
      setMNotify(true)
    }
    setForm('mortgage')
    haptic(false)
  }

  function openDeposit(d?: Deposit) {
    setEditMortgage(null)
    if (d) {
      setEditDeposit(d)
      setDPerson(d.person)
      setDBank(d.bank)
      setDAmount(String(d.amount))
      setDRate(String(d.rate))
      setDStart(d.start_date.slice(0, 10))
      setDEnd(d.end_date.slice(0, 10))
      setDCap(d.capitalization)
      setDNotifyBefore(String(d.notify_days_before))
      setDNotify(!!d.notify_enabled)
    } else {
      setEditDeposit(null)
      setDPerson('')
      setDBank('')
      setDAmount('')
      setDRate('')
      setDStart(todayIso())
      setDEnd(plusYearsIso(1))
      setDCap('none')
      setDNotifyBefore('3')
      setDNotify(true)
    }
    setForm('deposit')
    haptic(false)
  }

  async function submitMortgage(e: FormEvent) {
    e.preventDefault()
    const principal = Number(mPrincipal.replace(',', '.'))
    const monthlyPayment = Number(mPayment.replace(',', '.'))
    const rate = Number(mRate.replace(',', '.') || 0)
    const paymentDay = Number(mDay)
    if (!Number.isFinite(principal) || principal < 0) {
      onToast('Укажите остаток долга')
      return
    }
    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
      onToast('Укажите ежемесячный платёж')
      return
    }
    if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
      onToast('День платежа: 1–31')
      return
    }

    setSaving(true)
    try {
      const body = {
        person: mPerson.trim(),
        bank: mBank.trim(),
        title: mTitle.trim() || 'Ипотека',
        principal,
        rate,
        monthlyPayment,
        paymentDay,
        endDate: mEnd || undefined,
        notifyEnabled: mNotify,
      }
      if (editMortgage) await api.updateMortgage(editMortgage.id, body)
      else await api.createMortgage(body)
      await refresh()
      setForm(null)
      onToast(editMortgage ? 'Ипотека обновлена' : 'Ипотека добавлена')
      haptic(true)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Ошибка')
      haptic(false)
    } finally {
      setSaving(false)
    }
  }

  async function submitDeposit(e: FormEvent) {
    e.preventDefault()
    const amount = Number(dAmount.replace(',', '.'))
    const rate = Number(dRate.replace(',', '.'))
    if (!dBank.trim()) {
      onToast('Укажите банк')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      onToast('Укажите сумму вклада')
      return
    }
    if (!Number.isFinite(rate) || rate < 0) {
      onToast('Укажите процент')
      return
    }
    if (!dStart || !dEnd || dEnd < dStart) {
      onToast('Проверьте даты вклада')
      return
    }

    setSaving(true)
    try {
      const body = {
        person: dPerson.trim(),
        bank: dBank.trim(),
        amount,
        rate,
        startDate: dStart,
        endDate: dEnd,
        capitalization: dCap,
        notifyEnabled: dNotify,
        notifyDaysBefore: Number(dNotifyBefore) || 3,
      }
      if (editDeposit) await api.updateDeposit(editDeposit.id, body)
      else await api.createDeposit(body)
      await refresh()
      setForm(null)
      onToast(editDeposit ? 'Вклад обновлён' : 'Вклад добавлен')
      haptic(true)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Ошибка')
      haptic(false)
    } finally {
      setSaving(false)
    }
  }

  async function removeMortgage(id: number) {
    try {
      await api.deleteMortgage(id)
      await refresh()
      setForm(null)
      onToast('Ипотека удалена')
      haptic(true)
    } catch {
      onToast('Не удалось удалить')
      haptic(false)
    }
  }

  async function removeDeposit(id: number) {
    try {
      await api.deleteDeposit(id)
      await refresh()
      setForm(null)
      onToast('Вклад удалён')
      haptic(true)
    } catch {
      onToast('Не удалось удалить')
      haptic(false)
    }
  }

  if (loading) {
    return <div className="status">Загружаем финансы…</div>
  }

  const mortgages = data?.mortgages ?? []
  const deposits = data?.deposits ?? []
  const depositPreview = previewDepositPayout(
    Number(dAmount.replace(',', '.')),
    Number(dRate.replace(',', '.')),
    dStart,
    dEnd,
    dCap,
  )

  return (
    <section className="section rise rise-delay-2">
      <div className="finance-summary glass">
        <div className="fin-stat">
          <span>Платежи / мес</span>
          <strong>{formatMoney(data?.mortgageMonthly ?? 0)}</strong>
        </div>
        <div className="fin-stat">
          <span>Долг по ипотекам</span>
          <strong>{formatMoney(data?.mortgageDebt ?? 0)}</strong>
        </div>
        <div className="fin-stat">
          <span>Вклады</span>
          <strong>{formatMoney(data?.depositTotal ?? 0)}</strong>
        </div>
        <div className="fin-stat">
          <span>К выплате</span>
          <strong>{formatMoney(data?.depositPayout ?? 0)}</strong>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 14 }}>
        <h2>Ипотеки</h2>
        <button type="button" className="section-link" onClick={() => openMortgage()}>
          + Добавить
        </button>
      </div>
      {mortgages.length === 0 ? (
        <div className="empty glass">Нет ипотек — добавьте платёж и день оплаты</div>
      ) : (
        <div className="list">
          {mortgages.map((m) => (
            <button
              type="button"
              className="item glass fin-card"
              key={m.id}
              onClick={() => openMortgage(m)}
            >
              {m.bank ? (
                <BankIcon name={m.bank} size="md" className="item-bank-icon" />
              ) : (
                <div className="item-icon tone-home">⌂</div>
              )}
              <div className="item-body">
                <div className="item-title">
                  {m.title}
                  {m.person ? ` · ${m.person}` : ''}
                </div>
                <div className="item-sub">
                  {m.bank ? `${m.bank} · ` : ''}
                  платёж {m.payment_day}-го · след. {formatDateShort(m.next_payment_date)}
                  {m.notify_enabled ? ' · 🔔' : ''}
                </div>
              </div>
              <div className="item-amount">{formatMoney(m.monthly_payment)}</div>
            </button>
          ))}
        </div>
      )}

      <div className="section-head" style={{ marginTop: 14 }}>
        <h2>Вклады</h2>
        <button type="button" className="section-link" onClick={() => openDeposit()}>
          + Добавить
        </button>
      </div>
      {deposits.length === 0 ? (
        <div className="empty glass">Нет вкладов — укажите банк, % и срок</div>
      ) : (
        <div className="list">
          {deposits.map((d) => (
            <button
              type="button"
              className="item glass fin-card"
              key={d.id}
              onClick={() => openDeposit(d)}
            >
              <BankIcon name={d.bank} size="md" className="item-bank-icon" />
              <div className="item-body">
                <div className="item-title">
                  {d.bank}
                  {d.person ? ` · ${d.person}` : ''}
                </div>
                <div className="item-sub">
                  {d.rate}% · до {formatDateShort(d.end_date)}
                  {d.matured
                    ? ' · истёк'
                    : ` · ${d.days_left} дн.`}
                  {d.notify_enabled ? ' · 🔔' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="item-amount">{formatMoney(d.payout)}</div>
                <div className="item-sub">+{formatMoney(d.profit)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {form === 'mortgage' && (
        <Sheet
          tall
          asForm
          title={editMortgage ? 'Ипотека' : 'Новая ипотека'}
          onClose={() => setForm(null)}
          onSubmit={submitMortgage}
          footer={
            editMortgage ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="submit danger"
                  onClick={() => removeMortgage(editMortgage.id)}
                >
                  Удалить
                </button>
                <button className="submit" type="submit" disabled={saving}>
                  {saving ? '…' : 'Сохранить'}
                </button>
              </div>
            ) : (
              <button className="submit" type="submit" disabled={saving}>
                {saving ? 'Сохраняем…' : 'Добавить'}
              </button>
            )
          }
        >
          <input
            className="note-field glass"
            placeholder="Название (Ипотека / квартира)"
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
          />
          <input
            className="note-field glass"
            placeholder="Кто платит (имя)"
            value={mPerson}
            onChange={(e) => setMPerson(e.target.value)}
          />
          <BankSelect value={mBank} onChange={setMBank} placeholder="Банк" />
          <label className="text-field glass">
            <input
              inputMode="decimal"
              placeholder="Остаток долга, ₽"
              value={mPrincipal}
              onChange={(e) => setMPrincipal(e.target.value)}
            />
          </label>
          <label className="text-field glass">
            <input
              inputMode="decimal"
              placeholder="Ежемесячный платёж, ₽"
              value={mPayment}
              onChange={(e) => setMPayment(e.target.value)}
            />
          </label>
          <label className="text-field glass">
            <input
              inputMode="decimal"
              placeholder="Ставка, % годовых"
              value={mRate}
              onChange={(e) => setMRate(e.target.value)}
            />
          </label>
          <label className="text-field glass">
            <input
              inputMode="numeric"
              placeholder="День платежа (1–31)"
              value={mDay}
              onChange={(e) => setMDay(e.target.value)}
            />
          </label>
          <label className="text-field glass">
            <input
              type="date"
              placeholder="Дата окончания"
              value={mEnd}
              onChange={(e) => setMEnd(e.target.value)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={mNotify}
              onChange={(e) => setMNotify(e.target.checked)}
            />
            Напоминать в день платежа
          </label>
        </Sheet>
      )}

      {form === 'deposit' && (
        <Sheet
          tall
          asForm
          title={editDeposit ? 'Вклад' : 'Новый вклад'}
          onClose={() => setForm(null)}
          onSubmit={submitDeposit}
          footer={
            editDeposit ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="submit danger"
                  onClick={() => removeDeposit(editDeposit.id)}
                >
                  Удалить
                </button>
                <button className="submit" type="submit" disabled={saving}>
                  {saving ? '…' : 'Сохранить'}
                </button>
              </div>
            ) : (
              <button className="submit" type="submit" disabled={saving}>
                {saving ? 'Сохраняем…' : 'Добавить'}
              </button>
            )
          }
        >
          <BankSelect value={dBank} onChange={setDBank} placeholder="Банк" />
          <input
            className="note-field glass"
            placeholder="Чей вклад (имя)"
            value={dPerson}
            onChange={(e) => setDPerson(e.target.value)}
          />
          <label className="text-field glass">
            <input
              inputMode="decimal"
              placeholder="Сумма, ₽"
              value={dAmount}
              onChange={(e) => setDAmount(e.target.value)}
            />
          </label>
          <label className="text-field glass">
            <input
              inputMode="decimal"
              placeholder="Ставка, % годовых"
              value={dRate}
              onChange={(e) => setDRate(e.target.value)}
            />
          </label>
          <div className="date-row">
            <label className="text-field glass">
              <span className="field-hint">Открытие</span>
              <input
                type="date"
                value={dStart}
                onChange={(e) => setDStart(e.target.value)}
              />
            </label>
            <label className="text-field glass">
              <span className="field-hint">Окончание</span>
              <input
                type="date"
                value={dEnd}
                onChange={(e) => setDEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="chip-row">
            {(
              [
                ['none', 'Простые %'],
                ['monthly', 'Ежемес.'],
                ['daily', 'Ежедн.'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`chip glass${dCap === val ? ' active' : ''}`}
                onClick={() => setDCap(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="text-field glass">
            <input
              inputMode="numeric"
              placeholder="Напомнить за N дней"
              value={dNotifyBefore}
              onChange={(e) => setDNotifyBefore(e.target.value)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={dNotify}
              onChange={(e) => setDNotify(e.target.checked)}
            />
            Напоминать об окончании
          </label>
          {depositPreview && (
            <div className="payout-preview glass">
              К выплате ≈ <strong>{formatMoney(depositPreview.payout)}</strong>
              <span> (+{formatMoney(depositPreview.profit)})</span>
            </div>
          )}
        </Sheet>
      )}
    </section>
  )
}
