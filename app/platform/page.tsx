import Link from "next/link"
import { ArrowLeft, Globe } from "lucide-react"
import { AppLogo } from "@/components/app-logo"
import { PageHeader, Stat } from "@/components/page-header"
import { access, getSession, isPlatformEmail, requirePlatformAdmin } from "@/lib/auth"
import { config } from "@/lib/config"
import { formatDate, formatShortDateTime, money } from "@/lib/format"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { Business } from "@/lib/types"
import { SignOutButton } from "../sign-in-form"
import { getPaymentDetails } from "@/lib/platform-settings"
import { PaymentDetailsForm } from "./payment-details-form"
import { BusinessActions, PaymentActions } from "./platform-actions"

export const metadata = { title: "Platform admin" }

type Request = {
  id: number
  business_id: string
  period: "month" | "year"
  amount: number
  reference: string
  note: string | null
  status: "pending" | "approved" | "rejected"
  created_at: string
  reviewed_at: string | null
}

/** You, the seller: every business on the platform, their trials and payments. */
export default async function PlatformPage() {
  await requirePlatformAdmin()
  const admin = createSupabaseAdminClient()
  const [session, businessesResult, requestsResult, membersResult, usersResult, paymentDetails] = await Promise.all([
    getSession(),
    admin.from("businesses").select("*").order("created_at", { ascending: false }),
    admin.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("members").select("business_id, user_id, role"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    getPaymentDetails(),
  ])

  const businesses = (businessesResult.data ?? []) as Business[]
  const requests = (requestsResult.data ?? []) as Request[]
  const members = membersResult.data ?? []
  const emails = new Map((usersResult.data?.users ?? []).map(u => [u.id, u.email ?? ""]))
  const byId = new Map(businesses.map(b => [b.id, b]))
  const ownerEmail = (businessId: string) => {
    const owner = members.find(m => m.business_id === businessId && m.role === "owner")
    return owner ? emails.get(owner.user_id) : undefined
  }

  const statuses = businesses.map(b => ({ b, s: access(b) }))
  const pending = requests.filter(r => r.status === "pending")
  const paying = statuses.filter(x => x.s.active && !x.s.onTrial).length
  const trialing = statuses.filter(x => x.s.onTrial).length
  const expired = statuses.filter(x => !x.s.active).length
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const monthlyRevenue = requests
    .filter(r => r.status === "approved" && new Date(r.reviewed_at ?? r.created_at) >= since)
    .reduce((s, r) => s + Number(r.amount), 0)

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <Link href="/platform">
          <AppLogo size={34} />
        </Link>
        <div className="flex flex-wrap gap-2">
          {session && (
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} /> A business I&apos;m in
            </Link>
          )}
          <Link href="/" className="btn btn-ghost btn-sm" target="_blank">
            <Globe size={14} /> Website
          </Link>
          <SignOutButton className="btn btn-ghost btn-sm" />
        </div>
      </div>

      <PageHeader eyebrow={`${config.appName} · owner`} title="Platform admin" subtitle="Every business on the platform. Approve payments here to unlock or extend a suite." />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <Stat label="Businesses" value={businesses.length} />
        <Stat label="Paying" value={paying} tone="good" />
        <Stat label="On trial" value={trialing} tone="brand" />
        <Stat label="Expired" value={expired} tone={expired ? "bad" : undefined} />
        <Stat label="Approved, 30 days" value={money(monthlyRevenue)} tone="info" />
      </div>

      <section className="flex flex-col gap-3 mb-10">
        <h2 className="section-title">Payments to check {pending.length > 0 && <span className="pill" data-tone="warn">{pending.length}</span>}</h2>
        <div className="table-wrap">
          {pending.length === 0 ? (
            <p className="empty">Nothing waiting. New payment reports appear here.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Business</th>
                  <th>Plan</th>
                  <th className="num">Amount</th>
                  <th>Reference</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r.id}>
                    <td className="muted whitespace-nowrap">{formatShortDateTime(r.created_at)}</td>
                    <td>
                      <p className="text-white">{byId.get(r.business_id)?.name ?? "?"}</p>
                      <p className="text-xs faint">{ownerEmail(r.business_id)}</p>
                    </td>
                    <td>{r.period === "month" ? "1 month" : "1 year"}</td>
                    <td className="num text-white">{money(r.amount)}</td>
                    <td className="mono">{r.reference}</td>
                    <td className="muted">{r.note ?? "—"}</td>
                    <td className="text-right">
                      <PaymentActions id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs faint">Check each reference number in your GCash or bank app before approving.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Payment details</h2>
        <div className="card card-body flex flex-col gap-3">
          <p className="text-sm muted">Every business sees this on its Billing page when it&apos;s time to pay.</p>
          <PaymentDetailsForm instructions={paymentDetails.instructions} qrUrl={paymentDetails.qrUrl} />
        </div>
      </section>

      <section className="flex flex-col gap-3 mb-10">
        <h2 className="section-title">Businesses</h2>
        <div className="table-wrap">
          {businesses.length === 0 ? (
            <p className="empty">No sign-ups yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Signed up</th>
                  <th>Status</th>
                  <th className="num">Logins</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {statuses.map(({ b, s }) => (
                  <tr key={b.id}>
                    <td>
                      <p className="text-white font-medium">
                        {b.name}{" "}
                        {isPlatformEmail(ownerEmail(b.id)) && (
                          <span className="pill" data-tone="brand">
                            You
                          </span>
                        )}
                      </p>
                      <Link href={`/s/${b.slug}`} className="text-xs faint mono hover:text-white" target="_blank">
                        /s/{b.slug}
                      </Link>
                    </td>
                    <td className="muted">{ownerEmail(b.id) ?? "—"}</td>
                    <td className="muted whitespace-nowrap">{formatDate(b.created_at)}</td>
                    <td>
                      <span className="pill" data-tone={!s.active ? "bad" : s.onTrial ? "brand" : "good"}>
                        {!s.active ? "Expired" : s.onTrial ? `Trial · ${s.daysLeft}d` : "Paid"}
                      </span>
                      <p className="text-xs faint mt-1">until {formatDate(s.endsAt)}</p>
                    </td>
                    <td className="num">{members.filter(m => m.business_id === b.id).length}</td>
                    <td className="text-right">
                      <BusinessActions id={b.id} name={b.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {requests.some(r => r.status !== "pending") && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Payment history</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Checked</th>
                  <th>Business</th>
                  <th>Plan</th>
                  <th className="num">Amount</th>
                  <th>Reference</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {requests
                  .filter(r => r.status !== "pending")
                  .map(r => (
                    <tr key={r.id}>
                      <td className="muted whitespace-nowrap">{formatShortDateTime(r.reviewed_at ?? r.created_at)}</td>
                      <td className="text-white">{byId.get(r.business_id)?.name ?? "?"}</td>
                      <td>{r.period === "month" ? "1 month" : "1 year"}</td>
                      <td className="num">{money(r.amount)}</td>
                      <td className="mono">{r.reference}</td>
                      <td>
                        <span className="pill" data-tone={r.status === "approved" ? "good" : "bad"}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
