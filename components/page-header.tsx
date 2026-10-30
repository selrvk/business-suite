export function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Buttons shown on the right. */
  children?: React.ReactNode
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>}
    </header>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className = "",
  style,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: "brand" | "good" | "warn" | "bad" | "info"
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`stat rise ${className}`} data-tone={tone} style={style}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  )
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="mb-1 opacity-40">{icon}</div>}
      <p className="empty-title">{title}</p>
      {children && <div>{children}</div>}
    </div>
  )
}
