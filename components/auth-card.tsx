import Link from "next/link"
import { BrandMark } from "./brand-mark"
import { AppLogoMark } from "./app-logo"
import { config } from "@/lib/config"

/** Centered card used by the login, sign-up and staff login pages. */
export function AuthCard({
  title,
  subtitle,
  brandName = config.appName,
  logoUrl,
  children,
  footer,
}: {
  title: string
  subtitle?: React.ReactNode
  brandName?: string
  logoUrl?: string | null
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(600px circle at 50% 40%, var(--brand-soft), transparent 70%)" }}
      />
      <div className="relative w-full max-w-[420px] card overflow-hidden rise">
        <div style={{ height: 3, background: "var(--brand)" }} />
        <div className="px-8 pt-8 pb-6 text-center border-b" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex justify-center mb-4">
            {brandName === config.appName && !logoUrl ? (
              <AppLogoMark size={52} />
            ) : (
              <BrandMark name={brandName} logoUrl={logoUrl} size={52} />
            )}
          </div>
          <h1 className="display text-3xl text-white">{title}</h1>
          {subtitle && <p className="text-xs faint mt-2 tracking-wide">{subtitle}</p>}
        </div>
        <div className="px-8 pt-6 pb-8">{children}</div>
      </div>
      {footer && <div className="relative text-sm muted text-center">{footer}</div>}
      <Link href="/" className="relative text-[0.68rem] faint tracking-wider hover:text-white">
        {config.appName}
      </Link>
    </main>
  )
}
