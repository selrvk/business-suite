"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CreditCard, Menu, ScrollText, Settings, ShieldCheck, X, type LucideIcon } from "lucide-react"
import { config } from "@/lib/config"
import { BrandMark } from "./brand-mark"
import { InstallAppButton } from "./install-app-button"
import LogoutButton from "./logout-button"
import { activeSection, menuSections } from "./menu"

export default function Nav({
  businessName,
  logoUrl,
  username,
  isAdmin,
  isPlatformAdmin = false,
  modules,
  options,
  permissions,
}: {
  businessName: string
  logoUrl: string | null
  username: string
  isAdmin: boolean
  isPlatformAdmin?: boolean
  modules: string[]
  options: string[]
  permissions: string[]
}) {
  const sections = menuSections(modules, options, permissions)
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(pathname)

  // Close the mobile menu after navigating.
  if (open && openedAt !== pathname) {
    setOpen(false)
    setOpenedAt(pathname)
  }

  const current = activeSection(sections, pathname)

  const links = (
    <nav className="flex flex-col gap-0.5">
      {sections.map(section => {
        const active = section === current
        const Icon = section.icon
        return (
          <Link
            key={section.key}
            href={section.href}
            className="flex items-center gap-3 px-5 py-2.5 text-[0.86rem] font-medium border-l-2 transition-colors"
            style={{
              color: active ? "#fff" : "var(--app-muted)",
              background: active ? "var(--brand-soft)" : undefined,
              borderLeftColor: active ? "var(--brand)" : "transparent",
            }}
          >
            <Icon size={17} strokeWidth={active ? 2.4 : 2} style={{ color: active ? "var(--brand)" : undefined }} />
            {section.label}
          </Link>
        )
      })}
    </nav>
  )

  const footerLink = (href: string, label: string, Icon: LucideIcon) => {
    const active = pathname.startsWith(href)
    return (
      <Link
        href={href}
        className="flex items-center gap-2.5 px-5 py-2 text-[0.8rem] font-medium border-l-2"
        style={{
          color: active ? "#fff" : "var(--app-muted)",
          borderLeftColor: active ? "var(--brand)" : "transparent",
          background: active ? "var(--brand-soft)" : undefined,
        }}
      >
        <Icon size={15} />
        {label}
      </Link>
    )
  }

  const footer = (
    <div className="border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
      {footerLink("/settings", "Settings", Settings)}
      {isAdmin && footerLink("/activity", "Activity Log", ScrollText)}
      {isAdmin && footerLink("/billing", "Billing", CreditCard)}
      {isPlatformAdmin && footerLink("/platform", "Platform admin", ShieldCheck)}
      <InstallAppButton />
      <LogoutButton />
      <p className="px-5 pt-3 text-[0.68rem] faint truncate">
        Signed in as <span className="muted font-semibold">{username}</span>
        {isAdmin && " · admin"}
      </p>
    </div>
  )

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
      <BrandMark name={businessName} logoUrl={logoUrl} size={36} />
      <div className="min-w-0">
        <p className="display text-xl text-white truncate">{businessName}</p>
        <p className="text-[0.6rem] uppercase tracking-[0.18em] faint truncate">{config.appName}</p>
      </div>
    </Link>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="no-print hidden md:flex flex-col justify-between w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-5 gap-6"
        style={{ background: "var(--app-surface-2)", borderRight: "1px solid var(--app-border)" }}
      >
        <div className="flex flex-col gap-6">
          <div className="px-5">{brand}</div>
          {links}
        </div>
        {footer}
      </aside>

      {/* Mobile top bar + drawer */}
      <div
        className="no-print md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3"
        style={{ background: "var(--app-surface-2)", borderBottom: "1px solid var(--app-border)" }}
      >
        {brand}
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => {
            setOpen(true)
            setOpenedAt(pathname)
          }}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {open && (
        <div className="no-print md:hidden fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="relative w-72 max-w-[85vw] h-full overflow-y-auto py-5 flex flex-col justify-between gap-6"
            style={{ background: "var(--app-surface-2)", borderRight: "1px solid var(--app-border)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between gap-2 pl-5 pr-3">
                {brand}
                <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              {links}
            </div>
            {footer}
          </aside>
        </div>
      )}
    </>
  )
}
