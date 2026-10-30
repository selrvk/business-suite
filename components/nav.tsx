"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarClock,
  ClipboardList,
  CreditCard,
  History,
  LayoutDashboard,
  Menu,
  Package,
  PackagePlus,
  Receipt,
  Route,
  ScanBarcode,
  Settings,
  ShieldCheck,
  Sheet,
  Timer,
  Truck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { config, hasModule } from "@/lib/config"
import { BrandMark } from "./brand-mark"
import LogoutButton from "./logout-button"

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; show?: boolean }
type NavGroup = { label: string; items: NavItem[] }

const people = hasModule("attendance")
const fleet = hasModule("fleet")

const ALL_GROUPS: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Sales",
    items: [
      { href: "/pos", label: "Point of Sale", icon: ScanBarcode, show: hasModule("sales") },
      { href: "/orders", label: "Pending Orders", icon: ClipboardList, show: hasModule("sales") },
      { href: "/sales", label: "Sales History", icon: Receipt, show: hasModule("sales") },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Products", icon: Package, exact: true, show: hasModule("inventory") },
      { href: "/inventory/quick-scan", label: "Quick Scan", icon: Zap, show: hasModule("inventory") },
      { href: "/inventory/stock-in", label: "Stock In", icon: PackagePlus, show: hasModule("inventory") },
      { href: "/inventory/movements", label: "Stock Log", icon: History, show: hasModule("inventory") },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/attendance", label: "Attendance", icon: CalendarClock, exact: true, show: people },
      { href: "/time-clock", label: "Time Clock", icon: Timer, show: people },
      { href: "/attendance/records", label: "Timesheets", icon: Sheet, show: people },
      { href: "/employees", label: "Employees", icon: Users, show: people || fleet },
    ],
  },
  {
    label: "Fleet",
    items: [
      { href: "/fleet", label: "Vehicles", icon: Truck, exact: true, show: fleet },
      { href: "/fleet/logs", label: "Trip & Fuel Logs", icon: Route, show: fleet },
    ],
  },
]

const GROUPS = ALL_GROUPS.map(group => ({ ...group, items: group.items.filter(item => item.show !== false) })).filter(
  group => group.items.length > 0,
)

export default function Nav({
  businessName,
  logoUrl,
  username,
  isAdmin,
  isPlatformAdmin = false,
}: {
  businessName: string
  logoUrl: string | null
  username: string
  isAdmin: boolean
  isPlatformAdmin?: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(pathname)

  // Close the mobile menu after navigating.
  if (open && openedAt !== pathname) {
    setOpen(false)
    setOpenedAt(pathname)
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")

  const links = (
    <nav className="flex flex-col gap-5">
      {GROUPS.map(group => (
        <div key={group.label}>
          <p className="px-5 mb-1.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] faint">{group.label}</p>
          {group.items.map(item => {
            const active = isActive(item)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-5 py-2 text-[0.8rem] font-medium border-l-2 transition-colors"
                style={{
                  color: active ? "#fff" : "var(--app-muted)",
                  background: active ? "var(--brand-soft)" : undefined,
                  borderLeftColor: active ? "var(--brand)" : "transparent",
                }}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 2} style={{ color: active ? "var(--brand)" : undefined }} />
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
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
      {isAdmin && footerLink("/billing", "Billing", CreditCard)}
      {isPlatformAdmin && footerLink("/platform", "Platform admin", ShieldCheck)}
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
