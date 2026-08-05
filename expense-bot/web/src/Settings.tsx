import type { Category } from './api'

type Theme = 'dark' | 'light'

type Props = {
  theme: Theme
  onToggleTheme: () => void
  firstName?: string
  categoriesCount: number
  onOpenCategories: () => void
  categories: Category[]
}

export default function SettingsPanel({
  theme,
  onToggleTheme,
  firstName,
  categoriesCount,
  onOpenCategories,
  categories,
}: Props) {
  return (
    <section className="section rise rise-delay-2">
      <div className="settings-hero glass">
        <div className="settings-avatar" aria-hidden>
          {(firstName?.[0] ?? 'З').toUpperCase()}
        </div>
        <div>
          <div className="settings-name">{firstName ?? 'Златник'}</div>
          <div className="settings-sub">Профиль в Telegram</div>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Оформление</h2>
      </div>
      <div className="settings-list">
        <button type="button" className="settings-row glass" onClick={onToggleTheme}>
          <span className="settings-row-icon">{theme === 'dark' ? '☾' : '☀'}</span>
          <span className="settings-row-body">
            <strong>Тема</strong>
            <span>{theme === 'dark' ? 'Тёмная Liquid Glass' : 'Светлая'}</span>
          </span>
          <span className="settings-switch" data-on={theme === 'dark' ? '1' : '0'}>
            <i />
          </span>
        </button>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Данные</h2>
      </div>
      <div className="settings-list">
        <button type="button" className="settings-row glass" onClick={onOpenCategories}>
          <span className="settings-row-icon">▣</span>
          <span className="settings-row-body">
            <strong>Категории</strong>
            <span>{categoriesCount} шт. · добавить и изменить</span>
          </span>
          <span className="settings-chevron">›</span>
        </button>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>О приложении</h2>
      </div>
      <div className="settings-about glass">
        <div className="brand-mark settings-brand">
          Златник
        </div>
        <p>
          Учёт расходов, ипотек и вкладов. Имя от золотой монеты Древней Руси.
        </p>
        <div className="settings-tags">
          {categories.slice(0, 4).map((c) => (
            <span key={c.id} className={`settings-tag ${c.tone}`}>
              {c.glyph} {c.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
