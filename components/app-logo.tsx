import { config } from "@/lib/config"
import { BRAND_COLORS } from "@/lib/brand"

/** The Business Suite mark (the product's own logo, not a customer's). */
export function AppLogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const c = BRAND_COLORS
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`shrink-0 ${className}`} role="img" aria-label={config.appName}>
      <rect width="64" height="64" rx="15" fill={c.tile} />
      <path
        d="M19 11h26a1 1 0 0 1 1 1v38l-3.5 3-3.5-3-3.5 3-3.5-3-3.5 3-3.5-3-3.5 3-3.5-3V12a1 1 0 0 1 1-1z"
        fill={c.paper}
      />
      <g fill={c.ink}>
        <rect x="22" y="17" width="2.2" height="18" />
        <rect x="25.4" y="17" width="1.1" height="18" />
        <rect x="27.6" y="17" width="3" height="18" />
        <rect x="31.8" y="17" width="1.1" height="18" />
        <rect x="34" y="17" width="2.2" height="18" />
        <rect x="37.3" y="17" width="1.1" height="18" />
        <rect x="39.5" y="17" width="2.5" height="18" />
      </g>
      <rect x="22" y="40" width="20" height="2.2" rx="1.1" fill="#A19E96" />
      <rect x="22" y="44.5" width="12" height="2.2" rx="1.1" fill="#A19E96" />
      <rect x="9" y="22.5" width="46" height="8" rx="4" fill={c.laser} opacity="0.25" />
      <rect x="9" y="25" width="46" height="3" rx="1.5" fill={c.laser} />
    </svg>
  )
}

/** Mark plus the product name. */
export function AppLogo({ size = 34, textClass = "text-2xl" }: { size?: number; textClass?: string }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <AppLogoMark size={size} />
      <span className={`display text-white truncate ${textClass}`}>{config.appName}</span>
    </span>
  )
}
