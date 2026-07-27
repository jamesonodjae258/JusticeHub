interface TopBarProps {
  firmName: string
  title: string
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function TopBar({ firmName, title, actions, children }: TopBarProps) {
  return (
    <header className="app-topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-right">
        {actions}
        {children}
        <span className="topbar-firm">{firmName}</span>
      </div>
    </header>
  )
}
