import Link from "next/link"
import { ScanBarcode, Timer, Truck, Zap, type LucideIcon } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader, Stat } from "@/components/page-header"
import { SetupChecklist, type SetupStep } from "@/components/setup-checklist"
import { requireUser } from "@/lib/auth"
import { EXPIRY_SOON_DAYS, describeExpiry } from "@/lib/expiry"
import { businessModules, hasOption } from "@/lib/features"
import { addDays, dayRange, formatDuration, formatLongDate, formatShortDateTime, formatTime, money, monthStart, num, toYmd } from "@/lib/format"

export const metadata = { title: "Dashboard" }

type SalesSummary = { count: number; total: number }
type InventorySummary = { products: number; units: number; cost_value: number; sell_value: number; low_stock: number; out_of_stock: number }

const none = Promise.resolve({ data: null, error: null, count: null })

export default async function DashboardPage() {
  // The business's low-stock level is needed for the queries, so get the session first
  // (fast: the membership is cached).
  const { supabase, username, business, can, isAdmin } = await requireUser()
  const today = toYmd()
  const todayRange = dayRange(today)
  const month = dayRange(monthStart(today), today)
  const modules = businessModules(business)
  const sales = modules.includes("sales")
  const inventory = modules.includes("inventory")
  const attendance = modules.includes("attendance")
  const fleet = modules.includes("fleet")
  const expiry = inventory && hasOption(business, "expiry")
  // Owners of a new business see the setup checklist until it's done or hidden.
  const setup = isAdmin && business.setup_hidden === false
  const count = { count: "exact", head: true } as const

  const [salesToday, salesMonth, pending, recentSales, invSummary, lowItems, inNow, onRoad, monthTrips, expiring, anySales, staffCount, vehicleCount, loginCount] = await Promise.all([
    sales ? supabase.rpc("sales_summary", { p_from: todayRange.from.toISOString(), p_to: todayRange.to.toISOString() }) : none,
    sales ? supabase.rpc("sales_summary", { p_from: month.from.toISOString(), p_to: month.to.toISOString() }) : none,
    sales ? supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "PENDING") : none,
    sales
      ? supabase.from("orders").select("id, number, customer_name, total_price, date_completed").eq("status", "COMPLETED").order("date_completed", { ascending: false }).limit(6)
      : none,
    inventory ? supabase.rpc("inventory_summary", { p_low_stock: business.low_stock_threshold }) : none,
    inventory ? supabase.rpc("low_stock_items", { p_low_stock: business.low_stock_threshold, p_limit: 8 }) : none,
    attendance ? supabase.from("attendance").select("id, clock_in, employees(name)").is("clock_out", null).order("clock_in") : none,
    fleet ? supabase.from("trips").select("id, started_at, purpose, vehicles(name), employees(name)").is("ended_at", null).order("started_at") : none,
    fleet
      ? supabase.from("trips").select("start_odometer, end_odometer").not("ended_at", "is", null).gte("started_at", month.from.toISOString()).lt("started_at", month.to.toISOString())
      : none,
    expiry
      ? supabase
          .from("stock_batches")
          .select("id, quantity, expires_on, lot, items(name, unit)")
          .gt("quantity", 0)
          .lte("expires_on", addDays(today, EXPIRY_SOON_DAYS))
          .order("expires_on")
          .limit(200)
      : none,
    setup && sales ? supabase.from("orders").select("id", count) : none,
    setup && (attendance || fleet) ? supabase.from("employees").select("id", count) : none,
    setup && fleet ? supabase.from("vehicles").select("id", count) : none,
    setup ? supabase.from("members").select("user_id", count) : none,
  ])

  const error = [salesToday, salesMonth, pending, recentSales, invSummary, lowItems, inNow, onRoad, monthTrips, expiring, anySales, staffCount, vehicleCount, loginCount].find(r => r.error)?.error
  if (error) return <DbError error={error} />

  const st = salesToday.data as SalesSummary | null
  const sm = salesMonth.data as SalesSummary | null
  const inv = invSummary.data as InventorySummary | null
  const low = (lowItems.data ?? []) as { id: number; name: string; unit: string; current_stock: number }[]
  const present = (inNow.data ?? []) as unknown as { id: number; clock_in: string; employees: { name: string } | null }[]
  const road = (onRoad.data ?? []) as unknown as {
    id: number
    started_at: string
    purpose: string | null
    vehicles: { name: string } | null
    employees: { name: string } | null
  }[]
  const kmMonth = ((monthTrips.data ?? []) as { start_odometer: number; end_odometer: number }[]).reduce(
    (s, t) => s + (t.end_odometer - t.start_odometer),
    0,
  )
  const soon = (expiring.data ?? []) as unknown as {
    id: number
    quantity: number
    expires_on: string
    lot: string | null
    items: { name: string; unit: string } | null
  }[]
  const expiredCount = soon.filter(b => b.expires_on < today).length
  const recent = (recentSales.data ?? []) as { id: number; number: number; customer_name: string | null; total_price: number; date_completed: string }[]
  const now = new Date()

  const products = inv?.products ?? 0
  const steps: SetupStep[] = [
    {
      key: "details",
      title: "Add your address and contact number",
      hint: "They go on your receipts. Add your logo too.",
      done: !!(business.address?.trim() || business.contact?.trim()),
      actions: [{ href: "/settings#business", label: "Open Settings" }],
    },
    ...(inventory
      ? [
          {
            key: "products",
            title: "Add your products",
            hint: "One at a time, by scanning their barcodes, or all at once from an Excel file.",
            done: products > 0,
            actions: [
              { href: "/inventory", label: "Add products" },
              { href: "/inventory/import", label: "Import from Excel" },
            ],
          },
        ]
      : []),
    ...(sales
      ? [
          {
            key: "sale",
            title: "Make a test sale",
            hint: "Ring up a product at the Point of Sale to see how it works. You can void it after.",
            done: (anySales.count ?? 0) > 0,
            actions: [{ href: "/pos", label: "Open Point of Sale" }],
          },
        ]
      : []),
    ...(attendance
      ? [
          {
            key: "staff",
            title: "Add your staff",
            hint: "Then print their badges for the time clock, or use their numbers from a fingerprint scanner.",
            done: (staffCount.count ?? 0) > 0,
            actions: [{ href: "/employees", label: "Add staff" }],
          },
        ]
      : []),
    ...(fleet
      ? [
          {
            key: "vehicles",
            title: "Add your vehicles",
            hint: "Trucks, vans or motorcycles, with what their odometers read now.",
            done: (vehicleCount.count ?? 0) > 0,
            actions: [{ href: "/fleet", label: "Add vehicles" }],
          },
        ]
      : []),
    {
      key: "logins",
      title: "Give your staff their own login",
      hint: "Each cashier gets a username, and only sees what you allow.",
      done: (loginCount.count ?? 0) > 1,
      actions: [{ href: "/settings#logins", label: "Add a login" }],
    },
  ]
  const showSetup = setup && steps.some(s => !s.done)
  // Nothing recorded yet: the checklist alone, instead of a page of zeros.
  const fresh = showSetup && products === 0 && (anySales.count ?? 0) === 0

  const actions: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/pos", label: "New sale", icon: ScanBarcode, show: sales },
    { href: "/inventory/quick-scan", label: "Quick scan", icon: Zap, show: inventory && can("adjust_stock") },
    { href: "/time-clock", label: "Time clock", icon: Timer, show: attendance },
    { href: "/fleet", label: "Log a trip", icon: Truck, show: fleet },
  ]

  return (
    <>
      <PageHeader eyebrow={business.name} title="Dashboard" subtitle={`${formatLongDate(now)} · Hi, ${username}`} />

      {showSetup && <SetupChecklist steps={steps} businessName={business.name} />}

      {!fresh && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {sales && <Stat label="Sales today" value={money(st?.total)} hint={`${st?.count ?? 0} transactions`} tone="good" />}
            {sales && <Stat label="This month" value={money(sm?.total)} hint={`${sm?.count ?? 0} sales`} tone="brand" />}
            {inventory && <Stat label="Stock value" value={money(inv?.sell_value)} hint={can("see_costs") ? `${money(inv?.cost_value)} at cost` : "At selling price"} tone="info" />}
            {inventory && (
              <Stat
                label="Needs restock"
                value={(inv?.low_stock ?? 0) + (inv?.out_of_stock ?? 0)}
                hint={`${inv?.out_of_stock ?? 0} out of stock`}
                tone={inv?.out_of_stock ? "bad" : inv?.low_stock ? "warn" : "good"}
              />
            )}
            {attendance && <Stat label="Clocked in" value={present.length} hint="Staff working now" tone="good" />}
            {fleet && <Stat label="On the road" value={road.length} hint={`${num(kmMonth)} km this month`} tone="info" />}
            {sales && <Stat label="Pending orders" value={pending.count ?? 0} tone={pending.count ? "warn" : undefined} />}
            {expiry && (
              <Stat
                label="Expiring soon"
                value={soon.length - expiredCount}
                hint={expiredCount ? `${expiredCount} batch${expiredCount === 1 ? "" : "es"} already expired` : `Within ${EXPIRY_SOON_DAYS} days`}
                tone={expiredCount ? "bad" : soon.length ? "warn" : "good"}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-10">
            {actions
              .filter(a => a.show)
              .map(a => (
                <Link key={a.href} href={a.href} className="btn btn-secondary btn-lg">
                  <a.icon size={17} className="text-brand" /> {a.label}
                </Link>
              ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {inventory && (
              <Panel title="Running low" link={{ href: "/inventory/reorder", label: "Reorder list" }}>
                {products === 0 ? (
                  <p className="text-sm faint py-4">
                    No products yet.{" "}
                    <Link href="/inventory" className="underline">
                      Add your products
                    </Link>{" "}
                    to see what&apos;s running low.
                  </p>
                ) : low.length === 0 ? (
                  <p className="text-sm faint py-4">Everything is above its low-stock level. Nice.</p>
                ) : (
                  low.map(i => (
                    <div key={i.id} className="list-row text-sm">
                      <span className="flex-1 text-white truncate">{i.name}</span>
                      <span className="pill" data-tone={i.current_stock <= 0 ? "bad" : "warn"}>
                        {i.current_stock <= 0 ? "Out" : `${i.current_stock} ${i.unit}`}
                      </span>
                    </div>
                  ))
                )}
              </Panel>
            )}

            {expiry && (
              <Panel title="Expiring soon" link={{ href: "/inventory/expiry", label: "Expiry dates" }}>
                {soon.length === 0 ? (
                  <p className="text-sm faint py-4">Nothing expires in the next {EXPIRY_SOON_DAYS} days.</p>
                ) : (
                  soon.slice(0, 8).map(b => {
                    const e = describeExpiry(b.expires_on, today)
                    return (
                      <div key={b.id} className="list-row text-sm">
                        <span className="flex-1 text-white truncate">
                          {b.items?.name}
                          {b.lot && <span className="faint text-xs"> · lot {b.lot}</span>}
                        </span>
                        <span className="muted text-xs">
                          {num(b.quantity)} {b.items?.unit}
                        </span>
                        <span className="pill" data-tone={e.tone}>
                          {e.text}
                        </span>
                      </div>
                    )
                  })
                )}
              </Panel>
            )}

            {sales && (
              <Panel title="Latest sales" link={{ href: "/sales", label: "Sales history" }}>
                {recent.length === 0 ? (
                  <p className="text-sm faint py-4">No sales yet.</p>
                ) : (
                  recent.map(o => (
                    <div key={o.id} className="list-row text-sm">
                      <span className="faint w-14">#{o.number}</span>
                      <span className="flex-1 muted truncate">{o.customer_name || "Walk-in"}</span>
                      <span className="faint text-xs">{formatShortDateTime(o.date_completed)}</span>
                      <span className="text-white font-semibold w-28 text-right">{money(o.total_price)}</span>
                    </div>
                  ))
                )}
              </Panel>
            )}

            {attendance && (
              <Panel title="Who's in" link={{ href: "/attendance", label: "Attendance" }}>
                {present.length === 0 ? (
                  <p className="text-sm faint py-4">Nobody is clocked in.</p>
                ) : (
                  present.map(p => (
                    <div key={p.id} className="list-row text-sm">
                      <span className="flex-1 text-white">{p.employees?.name}</span>
                      <span className="faint text-xs">since {formatTime(p.clock_in)}</span>
                      <span className="muted w-20 text-right">{formatDuration(now.getTime() - new Date(p.clock_in).getTime())}</span>
                    </div>
                  ))
                )}
              </Panel>
            )}

            {fleet && (
              <Panel title="On the road" link={{ href: "/fleet", label: "Vehicles" }}>
                {road.length === 0 ? (
                  <p className="text-sm faint py-4">All vehicles are in.</p>
                ) : (
                  road.map(t => (
                    <div key={t.id} className="list-row text-sm">
                      <span className="text-white w-28 truncate">{t.vehicles?.name}</span>
                      <span className="flex-1 muted truncate">
                        {t.employees?.name ?? "—"} · {t.purpose ?? "—"}
                      </span>
                      <span className="faint text-xs">since {formatTime(t.started_at)}</span>
                    </div>
                  ))
                )}
              </Panel>
            )}
          </div>
        </>
      )}
    </>
  )
}

function Panel({ title, link, children }: { title: string; link: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="card card-body rise">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">{title}</h2>
        <Link href={link.href} className="text-xs muted underline decoration-dotted">
          {link.label}
        </Link>
      </div>
      <div>{children}</div>
    </section>
  )
}
