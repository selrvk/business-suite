import Link from "next/link"
import { ScanBarcode, Timer, Truck, Zap, type LucideIcon } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader, Stat } from "@/components/page-header"
import { requireUser } from "@/lib/auth"
import { hasModule } from "@/lib/config"
import { dayRange, formatDuration, formatLongDate, formatShortDateTime, formatTime, money, monthStart, num, toYmd } from "@/lib/format"

export const metadata = { title: "Dashboard" }

type SalesSummary = { count: number; total: number }
type InventorySummary = { products: number; units: number; cost_value: number; sell_value: number; low_stock: number; out_of_stock: number }

const none = Promise.resolve({ data: null, error: null, count: null })

export default async function DashboardPage() {
  // The business's low-stock level is needed for the queries, so get the session first
  // (fast: the membership is cached).
  const { supabase, username, business } = await requireUser()
  const today = toYmd()
  const todayRange = dayRange(today)
  const month = dayRange(monthStart(today), today)
  const sales = hasModule("sales")
  const inventory = hasModule("inventory")
  const attendance = hasModule("attendance")
  const fleet = hasModule("fleet")

  const [salesToday, salesMonth, pending, recentSales, invSummary, lowItems, inNow, onRoad, monthTrips] = await Promise.all([
    sales ? supabase.rpc("sales_summary", { p_from: todayRange.from.toISOString(), p_to: todayRange.to.toISOString() }) : none,
    sales ? supabase.rpc("sales_summary", { p_from: month.from.toISOString(), p_to: month.to.toISOString() }) : none,
    sales ? supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "PENDING") : none,
    sales
      ? supabase.from("orders").select("id, number, customer_name, total_price, date_completed").eq("status", "COMPLETED").order("date_completed", { ascending: false }).limit(6)
      : none,
    inventory ? supabase.rpc("inventory_summary", { p_low_stock: business.low_stock_threshold }) : none,
    inventory
      ? supabase.from("items").select("id, name, unit, current_stock").lte("current_stock", business.low_stock_threshold).order("current_stock").limit(8)
      : none,
    attendance ? supabase.from("attendance").select("id, clock_in, employees(name)").is("clock_out", null).order("clock_in") : none,
    fleet ? supabase.from("trips").select("id, started_at, purpose, vehicles(name), employees(name)").is("ended_at", null).order("started_at") : none,
    fleet
      ? supabase.from("trips").select("start_odometer, end_odometer").not("ended_at", "is", null).gte("started_at", month.from.toISOString()).lt("started_at", month.to.toISOString())
      : none,
  ])

  const error = [salesToday, salesMonth, pending, recentSales, invSummary, lowItems, inNow, onRoad, monthTrips].find(r => r.error)?.error
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
  const recent = (recentSales.data ?? []) as { id: number; number: number; customer_name: string | null; total_price: number; date_completed: string }[]
  const now = new Date()

  const actions: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/pos", label: "New sale", icon: ScanBarcode, show: sales },
    { href: "/inventory/quick-scan", label: "Quick scan", icon: Zap, show: inventory },
    { href: "/time-clock", label: "Time clock", icon: Timer, show: attendance },
    { href: "/fleet", label: "Log a trip", icon: Truck, show: fleet },
  ]

  return (
    <>
      <PageHeader eyebrow={business.name} title="Dashboard" subtitle={`${formatLongDate(now)} · Hi, ${username}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {sales && <Stat label="Sales today" value={money(st?.total)} hint={`${st?.count ?? 0} transactions`} tone="good" />}
        {sales && <Stat label="This month" value={money(sm?.total)} hint={`${sm?.count ?? 0} sales`} tone="brand" />}
        {inventory && <Stat label="Stock value" value={money(inv?.sell_value)} hint={`${money(inv?.cost_value)} at cost`} tone="info" />}
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
          <Panel title="Running low" link={{ href: "/inventory", label: "All products" }}>
            {low.length === 0 ? (
              <p className="text-sm faint py-4">Everything is above {business.low_stock_threshold}. Nice.</p>
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
