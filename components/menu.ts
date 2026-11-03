import {
  Contact,
  LayoutDashboard,
  Package,
  Receipt,
  ScanBarcode,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react"

// The app's menu: a short list of sections in the sidebar, and each section's
// pages as tabs along the top of its pages (SectionTabs). What shows depends
// on the business's modules, its product options and the login's permissions.

export type MenuTab = { href: string; label: string; exact?: boolean; also?: string[] }
export type MenuSection = { key: string; label: string; href: string; icon: LucideIcon; match: string[]; tabs: MenuTab[] }

type Draft = Omit<MenuSection, "tabs"> & { show: boolean; tabs: (MenuTab & { show?: boolean })[] }

export function menuSections(modules: readonly string[], options: readonly string[], permissions: readonly string[]): MenuSection[] {
  const sales = modules.includes("sales")
  const inventory = modules.includes("inventory")
  const people = modules.includes("attendance")
  const fleet = modules.includes("fleet")
  const sections: Draft[] = [
    { key: "home", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: ["/dashboard"], tabs: [], show: true },
    { key: "pos", label: "Point of Sale", href: "/pos", icon: ScanBarcode, match: ["/pos"], tabs: [], show: sales },
    {
      key: "sales",
      label: "Sales",
      href: "/sales",
      icon: Receipt,
      match: ["/sales", "/orders"],
      show: sales,
      tabs: [
        { href: "/sales", label: "Sales History", exact: true },
        { href: "/orders", label: "Pending Orders" },
        { href: "/sales/close", label: "End of Day" },
      ],
    },
    { key: "customers", label: "Customers", href: "/customers", icon: Contact, match: ["/customers"], tabs: [], show: sales },
    {
      key: "products",
      label: "Products",
      href: "/inventory",
      icon: Package,
      match: ["/inventory"],
      show: inventory,
      tabs: [
        { href: "/inventory", label: "Products", exact: true, also: ["/inventory/import"] },
        { href: "/inventory/stock-in", label: "Stock In" },
        { href: "/inventory/quick-scan", label: "Quick Scan", show: permissions.includes("adjust_stock") },
        { href: "/inventory/reorder", label: "Reorder List" },
        { href: "/inventory/expiry", label: "Expiry Dates", show: options.includes("expiry") },
        { href: "/inventory/suppliers", label: "Suppliers", show: options.includes("suppliers") },
        { href: "/inventory/movements", label: "Stock Log" },
      ],
    },
    {
      key: "staff",
      label: "Staff",
      href: people ? "/attendance" : "/employees",
      icon: Users,
      match: ["/attendance", "/employees"],
      show: people || fleet,
      tabs: [
        { href: "/attendance", label: "Attendance", exact: true, also: ["/attendance/import"], show: people },
        { href: "/attendance/records", label: "Timesheets", show: people },
        { href: "/employees", label: "Employees" },
        { href: "/time-clock", label: "Time Clock", show: people },
      ],
    },
    {
      key: "vehicles",
      label: "Vehicles",
      href: "/fleet",
      icon: Truck,
      match: ["/fleet"],
      show: fleet,
      tabs: [
        { href: "/fleet", label: "Vehicles", exact: true },
        { href: "/fleet/logs", label: "Trip & Fuel Logs" },
      ],
    },
    { key: "reports", label: "Reports", href: "/reports", icon: TrendingUp, match: ["/reports"], tabs: [], show: sales && permissions.includes("see_costs") },
  ]
  return sections
    .filter(s => s.show)
    .map(s => ({
      key: s.key,
      label: s.label,
      href: s.href,
      icon: s.icon,
      match: s.match,
      tabs: s.tabs.filter(t => t.show !== false).map(t => ({ href: t.href, label: t.label, exact: t.exact, also: t.also })),
    }))
}

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/")

/** The section a page belongs to. */
export function activeSection(sections: MenuSection[], pathname: string) {
  return sections.find(s => s.match.some(m => under(pathname, m))) ?? null
}

export function tabActive(tab: MenuTab, pathname: string) {
  if (tab.also?.some(a => under(pathname, a))) return true
  return tab.exact ? pathname === tab.href : under(pathname, tab.href)
}
