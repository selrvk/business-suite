import type { Metadata } from "next"
import Link from "next/link"
import Nav from "@/components/nav"
import { access, getSession, isPlatformLogin, requireActive } from "@/lib/auth"
import { BusinessFeaturesProvider } from "@/components/business-features"
import { businessModules, customFields, type ProductOption } from "@/lib/features"
import { formatDate, toYmd } from "@/lib/format"

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession()
  const name = session?.business.name
  return name ? { title: { default: name, template: `%s · ${name}` } } : {}
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, platform] = await Promise.all([requireActive(), isPlatformLogin()])
  const { onTrial, daysLeft, endsAt } = access(session.business)

  return (
    <div className="md:flex min-h-screen">
      <Nav
        businessName={session.business.name}
        logoUrl={session.business.logo_url}
        username={session.username}
        isAdmin={session.isAdmin}
        isPlatformAdmin={platform}
        modules={businessModules(session.business)}
        options={session.business.options ?? []}
        permissions={session.permissions}
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
        <main className="px-4 py-6 sm:px-6 md:px-10 md:py-9">
          <BusinessFeaturesProvider
            value={{
              options: (session.business.options ?? []) as ProductOption[],
              customFields: customFields(session.business),
              lowStock: session.business.low_stock_threshold,
              today: toYmd(),
              permissions: session.permissions,
              isAdmin: session.isAdmin,
              vatRegistered: !!session.business.vat_registered,
              seniorDefault: session.business.senior_default ?? 5,
              seniorBasicExempt: !!session.business.senior_basic_exempt,
            }}
          >
            {children}
          </BusinessFeaturesProvider>
        </main>
      </div>
    </div>
  )
}
