import { BadgePercent, Blocks, Building2, HardDriveDownload, Link2, ListChecks, MapPin, Shield, User } from "lucide-react"
import { DownloadAllData } from "@/components/download-all-data"
import { ShowSetupButton } from "@/components/setup-buttons"
import { PageHeader } from "@/components/page-header"
import { MODULE_INFO, config } from "@/lib/config"
import { OPTION_INFO, businessModules, customFields, type BusinessType, type ProductOption } from "@/lib/features"
import type { Business, Location } from "@/lib/types"
import { FeaturesForm } from "./features-form"
import { LocationsManager } from "./locations-form"
import { SeniorForm, type CategoryRates } from "./senior-form"
import { BusinessForm, CopyLink, PasswordForm, Users, type LoginPlaces, type UserRow } from "./settings-forms"

/** The Settings layout. The page (page.tsx) loads the data. */
export function SettingsView({
  isAdmin,
  business,
  users,
  userId,
  username,
  email,
  categories,
  staffLink,
  locations = null,
  units = {},
  places = null,
}: {
  isAdmin: boolean
  business: Business
  users: UserRow[]
  userId: string
  username: string
  email: string | null | undefined
  categories: CategoryRates[] | null
  staffLink: string
  /** Every location, when the business has branches turned on. */
  locations?: Location[] | null
  /** Units in stock at each location. */
  units?: Record<number, number>
  /** Open locations to choose from for each login, when there's more than one. */
  places?: LoginPlaces
}) {
  const sales = businessModules(business).includes("sales")
  // The sections on this page, for the jump list at the top (or the side, on wide screens).
  const sections = [
    ...(isAdmin
      ? [
          { id: "business", label: "Business" },
          { id: "logins", label: "Logins" },
          ...(locations ? [{ id: "locations", label: "Locations" }] : []),
          ...(sales ? [{ id: "senior", label: "Senior & PWD" }] : []),
          { id: "features", label: "Features" },
          ...(business.setup_hidden ? [{ id: "setup", label: "Setup guide" }] : []),
          { id: "data", label: "Your data" },
        ]
      : [{ id: "staff-link", label: "Staff login link" }]),
    { id: "account", label: "My account" },
    ...(isAdmin ? [] : [{ id: "included", label: "Included" }]),
  ]

  return (
    <>
      <PageHeader title="Settings" />

      <div className="xl:grid xl:grid-cols-[11rem_minmax(0,1fr)] xl:gap-10 xl:items-start">
        <nav aria-label="Settings sections" className="mb-6 xl:mb-0 xl:sticky xl:top-8">
          <ul className="flex flex-wrap gap-2 xl:flex-col xl:gap-0.5">
            {sections.map(sec => (
              <li key={sec.id}>
                <a href={`#${sec.id}`} className="settings-jump">
                  {sec.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-6 max-w-4xl min-w-0">
          {isAdmin && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="business">
              <div className="card-header">
                <Building2 size={15} className="text-brand" aria-hidden />
                <h2 className="display text-xl text-white">Business</h2>
              </div>
              <div className="card-body">
                <BusinessForm business={business} />
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="logins">
              <div className="card-header">
                <Shield size={15} className="text-brand" aria-hidden />
                <h2 className="display text-xl text-white">Logins</h2>
              </div>
              <div className="card-body flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <p className="label m-0">Staff login link</p>
                  <p className="text-sm muted">
                    Staff log in here with the username and password you give them. Bookmark it on the shop computer, the time clock and
                    the delivery phone.
                  </p>
                  <CopyLink url={staffLink} />
                </div>
                <Users users={users} currentUserId={userId} slug={business.slug} staffLink={staffLink} places={places} />
              </div>
            </section>
          )}

          {isAdmin && locations && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="locations">
              <div className="card-header">
                <MapPin size={15} className="text-brand" aria-hidden />
                <h2 className="display text-xl text-white">Branches &amp; warehouses</h2>
              </div>
              <div className="card-body">
                <LocationsManager locations={locations} units={units} />
              </div>
            </section>
          )}

          {!isAdmin && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="staff-link">
              <div className="card-header">
                <Link2 size={15} className="text-brand" aria-hidden />
                <h2 className="display text-xl text-white">Staff login link</h2>
              </div>
              <div className="card-body flex flex-col gap-3">
                <p className="text-sm muted">
                  Staff log in here with their username and password. Bookmark it on the shop computer, the time clock and the delivery
                  phone.
                </p>
                <CopyLink url={staffLink} />
              </div>
            </section>
          )}

          {isAdmin && sales && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="senior">
              <div className="card-header">
                <BadgePercent size={15} className="text-brand" aria-hidden />
                <h2 className="display text-xl text-white">Senior Citizen &amp; PWD discounts</h2>
              </div>
              <div className="card-body">
                <SeniorForm seniorDefault={business.senior_default ?? 5} basicExempt={!!business.senior_basic_exempt} categories={categories} />
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="features">
              <div className="card-header">
                <Blocks size={15} className="text-brand" aria-hidden />
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

          {isAdmin && business.setup_hidden && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="setup">
              <div className="card-header">
                <ListChecks size={15} className="text-brand" aria-hidden />
                <h2 className="display text-xl text-white">Setup guide</h2>
              </div>
              <div className="card-body flex flex-col gap-3">
                <p className="text-sm muted">
                  The checklist that walks you through adding products, a test sale, staff and logins. It ticks itself off as you go.
                </p>
                <ShowSetupButton />
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="card scroll-mt-20 md:scroll-mt-6" id="data">
              <div className="card-header">
                <HardDriveDownload size={15} className="text-brand" aria-hidden />
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

          <section className="card scroll-mt-20 md:scroll-mt-6" id="account">
            <div className="card-header">
              <User size={15} className="text-brand" aria-hidden />
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
            <section className="card scroll-mt-20 md:scroll-mt-6" id="included">
              <div className="card-header">
                <Blocks size={15} className="text-brand" aria-hidden />
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
      </div>
    </>
  )
}
