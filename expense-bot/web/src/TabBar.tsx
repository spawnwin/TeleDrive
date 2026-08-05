type Tab = 'home' | 'finance' | 'stats' | 'settings'

type Props = {
  tab: Tab
  onChange: (tab: Tab) => void
  onAdd: () => void
}

const ITEMS: Array<{
  id: Tab | 'add'
  label: string
  icon: string
}> = [
  { id: 'home', label: 'Главная', icon: '⌂' },
  { id: 'finance', label: 'Финансы', icon: '◈' },
  { id: 'add', label: 'Добавить', icon: '+' },
  { id: 'stats', label: 'Сводка', icon: '▤' },
  { id: 'settings', label: 'Ещё', icon: '⚙' },
]

export default function TabBar({ tab, onChange, onAdd }: Props) {
  return (
    <nav className="tabbar" aria-label="Навигация">
      <div className="tabbar-glass">
        {ITEMS.map((item) => {
          if (item.id === 'add') {
            return (
              <button
                key="add"
                type="button"
                className="tabbar-fab"
                aria-label="Добавить расход"
                onClick={onAdd}
              >
                <span className="tabbar-fab-inner">+</span>
              </button>
            )
          }

          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`tabbar-item${active ? ' active' : ''}`}
              onClick={() => onChange(item.id as Tab)}
              aria-current={active ? 'page' : undefined}
            >
              <span className="tabbar-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="tabbar-label">{item.label}</span>
              {active && <span className="tabbar-dot" aria-hidden />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export type { Tab }
