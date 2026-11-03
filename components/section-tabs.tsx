"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { activeSection, menuSections, tabActive, type MenuSection } from "./menu"

/** The pages of the current menu section, as tabs along the top (only for sections with more than one page). */
export function SectionTabs({ modules, options, permissions }: { modules: string[]; options: string[]; permissions: string[] }) {
  const pathname = usePathname()
  return <SectionTabsView section={activeSection(menuSections(modules, options, permissions), pathname)} pathname={pathname} />
}

export function SectionTabsView({ section, pathname }: { section: MenuSection | null; pathname: string }) {
  if (!section || section.tabs.length < 2) return null

  return (
    <nav aria-label={section.label} className="no-print -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 mb-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 border-b min-w-max" style={{ borderColor: "var(--app-border)" }}>
        {section.tabs.map(tab => {
          const active = tabActive(tab, pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="px-3 py-2.5 -mb-px text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
              style={{ color: active ? "#fff" : "var(--app-muted)", borderBottomColor: active ? "var(--brand)" : "transparent" }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
