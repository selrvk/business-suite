import { headers } from "next/headers"
import { BadgePercent, Blocks, Building2, HardDriveDownload, Link2, Shield, User } from "lucide-react"
import { DownloadAllData } from "@/components/download-all-data"
import { PageHeader } from "@/components/page-header"
import { requireUser } from "@/lib/auth"
import { MODULE_INFO, config } from "@/lib/config"
import { fetchAll } from "@/lib/db"
import { OPTION_INFO, businessModules, customFields, hasOption, type BusinessType, type ProductOption } from "@/lib/features"
import { FeaturesForm } from "./features-form"
import { SeniorForm, type CategoryRates } from "./senior-form"
import { BusinessForm, CopyLink, PasswordForm, Users, type UserRow } from "./settings-forms"

export const metadata = { title: "Settings" }

export default async function SettingsPage() {
  const [session, h] = await Promise.all([requireUser(), headers()])
  const { supabase, isAdmin, userId, business, username, email } = session
  const { data: users } = isAdmin
    ? await supabase.from("members").select("user_id, username, role, created_at, permissions").order("created_at")
    : { data: null }

  // Senior/PWD rates by category, for setting a whole category at once.
  let categories: CategoryRates[] | null = null
  if (isAdmin && businessModules(business).includes("sales") && hasOption(business, "categories")) {
    const { data: rows } = await fetchAll<{ category: string | null; senior_discount: number | null }>((from, to) =>
      supabase.from("items").select("category, senior_discount").order("id").range(from, to),
    )
    const map = new Map<string, CategoryRates>()
    for (const r of rows) {
      const key = r.category ?? ""
      const entry = map.get(key) ?? { category: r.category, products: 0, rates: {} }
      const rate = r.senior_discount == null ? "default" : String(r.senior_discount)
      entry.products++
      entry.rates[rate] = (entry.rates[rate] ?? 0) + 1
      map.set(key, entry)
    }
    categories = [...map.values()].sort((a, b) => (a.category === null ? 1 : b.category === null ? -1 : a.category.localeCompare(b.category)))
  }

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const staffLink = `${proto}://${host}/s/${business.slug}`

  return (
    <>
      <PageHeader eyebrow="System" title="Settings" />

      <div className="flex flex-col gap-6 max-w-4xl">
        <section className="card">
          <div className="card-header">
            <Link2 size={15} className="text-brand" />
            <h2 className="display text-xl text-white">Staff login link</h2>
          </div>
          <div className="card-body flex flex-col gap-3">
            <p className="text-sm muted">
              Staff log in here with the username and password you give them. Bookmark it on the shop computer, the time clock
              and the delivery phone.
            </p>
            <CopyLink url={staffLink} />
          </div>
        </section>

        {isAdmin && (
          <section className="card">
            <div className="card-header">
              <Building2 size={15} className="text-brand" />
              <h2 className="display text-xl text-white">Business</h2>
            </div>
            <div className="card-body">
              <BusinessForm business={business} />
            </div>
          </section>
        )}

        {isAdmin && businessModules(business).includes("sales") && (
          <section className="card" id="senior">
            <div className="card-header">
              <BadgePercent size={15} className="text-brand" />
              <h2 className="display text-xl text-white">Senior Citizen &amp; PWD discounts</h2>
            </div>
            <div className="card-body">
              <SeniorForm seniorDefault={business.senior_default ?? 5} basicExempt={!!business.senior_basic_exempt} categories={categories} />
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="card" id="features">
            <div className="card-header">
              <Blocks size={15} className="text-brand" />
              <h2 className="display text-xl text-white">Features</h2>
            </div>
            <div className="card-body">
              <FeaturesForm
                initial={{
                  businessType: (business.business_type as BusinessType | null) ?? null,
                  modules: businessModules(business),
                  options: (business.options ?? []) as ProductOption[],
                }}
                initialFields={customFields(business)}
              />
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="card">
            <div className="card-header">
              <Shield size={15} className="text-brand" />
              <h2 className="display text-xl text-white">Logins</h2>
            </div>
            <div className="card-body">
              <Users users={(users ?? []) as UserRow[]} currentUserId={userId} slug={business.slug} staffLink={staffLink} />
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="card">
            <div className="card-header">
              <HardDriveDownload size={15} className="text-brand" />
              <h2 className="display text-xl text-white">Your data</h2>
            </div>
            <div className="card-body flex flex-col gap-3">
              <p className="text-sm muted">
                Everything you&apos;ve recorded (products, sales, customers, stock log, attendance and more) as one Excel file. It&apos;s
                yours to keep, and you can download it any time, even after you stop paying.
              </p>
              <DownloadAllData businessName={business.name} slug={business.slug} />
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-header">
            <User size={15} className="muted" />
            <h2 className="display text-xl text-white">My account</h2>
          </div>
          <div className="card-body flex flex-col gap-4">
            <p className="text-sm muted">
              Signed in as <span className="text-white font-semibold">{username}</span>
              {email && !email.endsWith(`.${config.staffEmailDomain}`) && <> · {email}</>}
            </p>
            <PasswordForm />
          </div>
        </section>

        {!isAdmin && (
          <section className="card">
            <div className="card-header">
              <Blocks size={15} className="muted" />
              <h2 className="display text-xl text-white">Included</h2>
            </div>
            <div className="card-body grid sm:grid-cols-2 gap-3">
              {businessModules(business).map(m => (
                <div key={m} className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                  <p className="text-sm font-semibold text-white">{MODULE_INFO[m].label}</p>
                  <p className="text-xs faint">{MODULE_INFO[m].description}</p>
                </div>
              ))}
              {((business.options ?? []) as ProductOption[]).map(o => (
                <div key={o} className="rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                  <p className="text-sm font-semibold text-white">{OPTION_INFO[o].label}</p>
                  <p className="text-xs faint">{OPTION_INFO[o].description}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
