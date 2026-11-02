import Link from "next/link"
import { ArrowLeft, CircleAlert, CircleCheck, Hourglass } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { DownloadAllData } from "@/components/download-all-data"
import { access, requireUser } from "@/lib/auth"
import { MODULE_INFO, config } from "@/lib/config"
import { formatDate, money, price } from "@/lib/format"
import { getPaymentDetails } from "@/lib/platform-settings"
import { SignOutButton } from "../sign-in-form"
import { PaymentForm } from "./payment-form"

export const metadata = { title: "Billing" }

type PaymentRequest = {
  id: number
  period: "month" | "year"
  amount: number
  reference: string
  status: "pending" | "approved" | "rejected"
  created_at: string
}

export default async function BillingPage() {
  const { business, isAdmin, supabase } = await requireUser()
  const status = access(business)
  const [{ data }, payment] = await Promise.all([
    supabase.from("payment_requests").select("id, period, amount, reference, status, created_at").order("created_at", { ascending: false }).limit(20),
    getPaymentDetails(),
  ])
  const requests = (data ?? []) as PaymentRequest[]
  const pending = requests.some(r => r.status === "pending")
  const instructions = payment.instructions
  const yearly = config.price.yearly
  const yearlySaving = yearly ? Math.round((1 - yearly / (config.price.monthly * 12)) * 100) : 0

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandMark name={business.name} logoUrl={business.logo_url} size={40} />
          <p className="display text-2xl text-white">{business.name}</p>
        </div>
        <div className="flex gap-2">
          {status.active && (
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} /> Back to the app
            </Link>
          )}
          <SignOutButton className="btn btn-ghost btn-sm" />
        </div>
      </header>

      <div>
        <p className="eyebrow">Account</p>
        <h1 className="page-title">Billing</h1>
      </div>

      {/* Status */}
      <section
        className="card card-body flex items-start gap-4"
        style={{ borderColor: status.active ? undefined : "var(--app-danger)" }}
      >
        {status.active ? (
          status.onTrial ? <Hourglass size={22} className="text-brand shrink-0" /> : <CircleCheck size={22} className="text-good shrink-0" />
        ) : (
          <CircleAlert size={22} className="text-bad shrink-0" />
        )}
        <div>
          <p className="display text-2xl text-white">
            {status.active
              ? status.onTrial
                ? `Free trial · ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left`
                : `Paid until ${formatDate(status.endsAt)}`
              : business.paid_until
                ? "Your subscription has ended"
                : "Your free trial has ended"}
          </p>
          <p className="text-sm muted mt-1">
            {status.active
              ? status.onTrial
                ? `Everything stays unlocked until ${formatDate(status.endsAt)}. Pay any time; paid time starts when the trial ends.`
                : "Thanks for being a customer. Renew any time and the new period is added on top."
              : `It ended on ${formatDate(status.endsAt)}. Your data is safe. Pay to pick up right where you left off.`}
          </p>
          {pending && <p className="pill mt-3" data-tone="warn">Payment received, waiting for confirmation</p>}
        </div>
      </section>

      {/* Plan */}
      <section className="card card-body grid sm:grid-cols-[1fr_auto] gap-6">
        <div>
          <p className="section-title mb-3">One plan, everything included</p>
          <ul className="grid gap-1.5 text-sm muted">
            {config.modules.map(m => (
              <li key={m} className="flex items-center gap-2">
                <CircleCheck size={14} className="text-good" /> {MODULE_INFO[m].label}: {MODULE_INFO[m].description.toLowerCase()}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <CircleCheck size={14} className="text-good" /> Unlimited staff logins and products
            </li>
          </ul>
        </div>
        <div className="flex sm:flex-col gap-4 sm:text-right">
          <div>
            <p className="display text-4xl text-white">{price(config.price.monthly)}</p>
            <p className="text-xs faint">per month</p>
          </div>
          {yearly && (
            <div>
              <p className="display text-2xl text-white">{price(yearly)}</p>
              <p className="text-xs faint">per year{yearlySaving > 0 && ` · save ${yearlySaving}%`}</p>
            </div>
          )}
        </div>
      </section>

      {/* Pay */}
      {isAdmin ? (
        <section className="card card-body flex flex-col gap-5">
          <div>
            <p className="section-title mb-3">How to pay</p>
            {instructions || payment.qrUrl ? (
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {instructions && (
                  <pre className="flex-1 w-full whitespace-pre-wrap text-sm text-white font-sans leading-relaxed rounded-lg p-4" style={{ background: "var(--app-bg)" }}>
                    {instructions}
                  </pre>
                )}
                {payment.qrUrl && (
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- payment QR code, shown as-is */}
                    <img src={payment.qrUrl} alt="Payment QR code" className="w-44 h-44 object-contain rounded-lg bg-white p-2" />
                    <span className="text-xs faint">Scan to pay</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="alert alert-warn">Payment details aren&apos;t ready yet. Write to {config.contactEmail} to pay.</p>
            )}
          </div>
          <PaymentForm prices={config.price} />
        </section>
      ) : (
        <section className="card card-body text-sm muted">Ask the owner of {business.name} to renew the subscription.</section>
      )}

      {requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="section-title">Payments</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Plan</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td className="muted">{formatDate(r.created_at)}</td>
                    <td>{r.period === "month" ? "1 month" : "1 year"}</td>
                    <td className="mono">{r.reference}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td>
                      <span className="pill" data-tone={r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "warn"}>
                        {r.status === "pending" ? "Checking" : r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="card card-body flex flex-col gap-3">
          <p className="section-title">Your data</p>
          <p className="text-sm muted">
            Your records stay safe whether or not your access is active. Download a copy of everything as an Excel file any time.
          </p>
          <DownloadAllData businessName={business.name} slug={business.slug} />
        </section>
      )}

      <p className="text-xs faint text-center">
        <Link href="/terms" className="underline decoration-dotted">
          Terms of Service
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="underline decoration-dotted">
          Privacy Policy
        </Link>
      </p>
    </main>
  )
}
