import { useEffect, useState } from 'react'
import {
  api,
  AdminOverview,
  AdminUserDetail,
  AdminUserRow,
  formatDay,
  formatMoney,
} from './api'
import { BankIcon } from './BankIcon'
import Sheet, { useSheetScrollLock } from './Sheet'

type Props = {
  onToast: (msg: string) => void
  onBack: () => void
}

function displayName(u: {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  id: string
}) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  if (u.username) return `@${u.username}`
  return u.id
}

export default function AdminPanel({ onToast, onBack }: Props) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useSheetScrollLock(detailId !== null)

  async function refresh() {
    const [ov, list] = await Promise.all([
      api.adminOverview(),
      api.adminUsers(),
    ])
    setOverview(ov)
    setUsers(list.items)
  }

  useEffect(() => {
    refresh()
      .catch((err: Error) => onToast(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    api
      .adminUser(detailId)
      .then(setDetail)
      .catch((err: Error) => {
        onToast(err.message)
        setDetailId(null)
      })
      .finally(() => setDetailLoading(false))
  }, [detailId])

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      u.id.toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q) ||
      (u.firstName ?? '').toLowerCase().includes(q) ||
      (u.lastName ?? '').toLowerCase().includes(q)
    )
  })

  if (loading) {
    return <div className="status">Загружаем админку…</div>
  }

  return (
    <section className="section rise rise-delay-2">
      <div className="section-head">
        <h2>Админ</h2>
        <button type="button" className="section-link" onClick={onBack}>
          ← Назад
        </button>
      </div>

      {overview && (
        <div className="admin-overview glass">
          <div className="fin-stat">
            <span>Пользователи</span>
            <strong>{overview.users}</strong>
          </div>
          <div className="fin-stat">
            <span>Траты / месяц</span>
            <strong>{formatMoney(overview.expenseMonth)}</strong>
          </div>
          <div className="fin-stat">
            <span>Траты / всё</span>
            <strong>{formatMoney(overview.expenseTotal)}</strong>
          </div>
          <div className="fin-stat">
            <span>Сегодня</span>
            <strong>{formatMoney(overview.expenseToday)}</strong>
          </div>
          <div className="fin-stat">
            <span>Долг ипотек</span>
            <strong>{formatMoney(overview.mortgageDebt)}</strong>
          </div>
          <div className="fin-stat">
            <span>Платежи / мес</span>
            <strong>{formatMoney(overview.mortgageMonthly)}</strong>
          </div>
          <div className="fin-stat">
            <span>Вклады</span>
            <strong>{formatMoney(overview.depositTotal)}</strong>
          </div>
          <div className="fin-stat">
            <span>К выплате</span>
            <strong>{formatMoney(overview.depositPayout)}</strong>
          </div>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 14 }}>
        <h2>Пользователи</h2>
        <span>{filtered.length}</span>
      </div>

      <input
        className="note-field glass"
        placeholder="Поиск: имя, @username, id"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="empty glass">Нет пользователей</div>
      ) : (
        <div className="list">
          {filtered.map((u) => (
            <button
              type="button"
              key={u.id}
              className="item glass fin-card admin-user-card"
              onClick={() => setDetailId(u.id)}
            >
              <div className="admin-avatar" aria-hidden>
                {(u.firstName?.[0] ?? u.username?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="item-body">
                <div className="item-title">{displayName(u)}</div>
                <div className="item-sub">
                  {u.username ? `@${u.username} · ` : ''}
                  id {u.id}
                </div>
                <div className="admin-money-row">
                  <span>мес {formatMoney(u.expenseMonth)}</span>
                  <span>всё {formatMoney(u.expenseTotal)}</span>
                </div>
                {(u.mortgageDebt > 0 || u.depositTotal > 0) && (
                  <div className="admin-money-row muted">
                    {u.mortgageDebt > 0 && (
                      <span>ипотека {formatMoney(u.mortgageDebt)}</span>
                    )}
                    {u.depositTotal > 0 && (
                      <span>вклады {formatMoney(u.depositTotal)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="settings-chevron">›</div>
            </button>
          ))}
        </div>
      )}

      {detailId && (
        <Sheet
          tall
          title={
            detail
              ? displayName(detail.user)
              : detailLoading
                ? 'Загрузка…'
                : 'Пользователь'
          }
          onClose={() => setDetailId(null)}
        >
          {detailLoading || !detail ? (
            <div className="status" style={{ padding: 24 }}>
              Загружаем…
            </div>
          ) : (
            <>
              <div className="admin-detail-meta glass">
                <div>
                  {detail.user.username
                    ? `@${detail.user.username}`
                    : 'без username'}
                </div>
                <div className="item-sub">id {detail.user.id}</div>
                <div className="item-sub">
                  с {formatDay(detail.user.createdAt.includes('T')
                    ? detail.user.createdAt
                    : `${detail.user.createdAt.replace(' ', 'T')}Z`)}
                </div>
              </div>

              <div className="admin-overview glass" style={{ marginTop: 8 }}>
                <div className="fin-stat">
                  <span>Месяц</span>
                  <strong>{formatMoney(detail.stats.monthTotal)}</strong>
                </div>
                <div className="fin-stat">
                  <span>Сегодня</span>
                  <strong>{formatMoney(detail.stats.todayTotal)}</strong>
                </div>
                <div className="fin-stat">
                  <span>Ипотеки</span>
                  <strong>{detail.mortgages.length}</strong>
                </div>
                <div className="fin-stat">
                  <span>Вклады</span>
                  <strong>{detail.deposits.length}</strong>
                </div>
              </div>

              {detail.byCategoryAll.length > 0 && (
                <>
                  <div className="section-head" style={{ marginTop: 14 }}>
                    <h2>Категории (всё время)</h2>
                  </div>
                  <div className="list">
                    {detail.byCategoryAll.map((c) => (
                      <div className="item glass" key={c.category}>
                        <div className="item-body">
                          <div className="item-title">{c.category}</div>
                          <div className="item-sub">{c.count} зап.</div>
                        </div>
                        <div className="item-amount">{formatMoney(c.total)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {detail.mortgages.length > 0 && (
                <>
                  <div className="section-head" style={{ marginTop: 14 }}>
                    <h2>Ипотеки</h2>
                  </div>
                  <div className="list">
                    {detail.mortgages.map((m) => (
                      <div className="item glass" key={m.id}>
                        {m.bank ? (
                          <BankIcon name={m.bank} size="md" className="item-bank-icon" />
                        ) : (
                          <div className="item-icon tone-home">⌂</div>
                        )}
                        <div className="item-body">
                          <div className="item-title">{m.title}</div>
                          <div className="item-sub">
                            {m.bank ? `${m.bank} · ` : ''}
                            долг {formatMoney(m.principal)}
                          </div>
                        </div>
                        <div className="item-amount">
                          {formatMoney(m.monthly_payment)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {detail.deposits.length > 0 && (
                <>
                  <div className="section-head" style={{ marginTop: 14 }}>
                    <h2>Вклады</h2>
                  </div>
                  <div className="list">
                    {detail.deposits.map((d) => (
                      <div className="item glass" key={d.id}>
                        <BankIcon name={d.bank} size="md" className="item-bank-icon" />
                        <div className="item-body">
                          <div className="item-title">{d.bank}</div>
                          <div className="item-sub">
                            {d.rate}% · {formatMoney(d.amount)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="item-amount">{formatMoney(d.payout)}</div>
                          <div className="item-sub">+{formatMoney(d.profit)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="section-head" style={{ marginTop: 14 }}>
                <h2>Последние траты</h2>
              </div>
              {detail.expenses.length === 0 ? (
                <div className="empty glass">Нет трат</div>
              ) : (
                <div className="list">
                  {detail.expenses.map((e) => (
                    <div className="item glass" key={e.id}>
                      <div className="item-body">
                        <div className="item-title">{e.category}</div>
                        <div className="item-sub">
                          {formatDay(e.spent_at)}
                          {e.note ? ` · ${e.note}` : ''}
                        </div>
                      </div>
                      <div className="item-amount">{formatMoney(e.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Sheet>
      )}
    </section>
  )
}
