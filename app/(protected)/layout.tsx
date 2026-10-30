import type { Metadata } from "next"
import Link from "next/link"
import Nav from "@/components/nav"
import { access, getSession, isPlatformAdmin, requireActive } from "@/lib/auth"
import { formatDate } from "@/lib/format"

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession()
  const name = session?.business.name
  return name ? { title: { default: name, template: `%s · ${name}` } } : {}
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, platform] = await Promise.all([requireActive(), isPlatformAdmin()])
  const { onTrial, daysLeft, endsAt } = access(session.business)

  return (
    <div className="md:flex min-h-screen">
      <Nav
        businessName={session.business.name}
        logoUrl={session.business.logo_url}
        username={session.username}
        isAdmin={session.isAdmin}
        isPlatformAdmin={platform}
      />
      <div className="flex-1 min-w-0">
        {onTrial && session.isAdmin && (
          <div
            className="no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-center"
            style={{ background: "var(--brand-soft)", borderBottom: "1px solid var(--brand-line)" }}
          >
            <span className="text-white">
              Free trial: <strong>{daysLeft} day{daysLeft === 1 ? "" : "s"} left</strong> (until {formatDate(endsAt)})
            </span>
            <Link href="/billing" className="underline decoration-dotted text-white">
              Keep your suite running
            </Link>
          </div>
        )}
        <main className="px-4 py-6 sm:px-6 md:px-10 md:py-9">{children}</main>
      </div>
    </div>
  )
}
