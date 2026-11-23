import Link from "next/link"
import { ChevronRight, ScanBarcode, Timer, Truck, Zap, type LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { LocationFilter } from "@/components/location-filter"
import type { PlaceFilter } from "@/lib/locations"
import { SetupChecklist, type SetupStep } from "@/components/setup-checklist"
import { EXPIRY_SOON_DAYS, describeExpiry } from "@/lib/expiry"
import { formatDuration, formatLongDate, formatShortDate, formatTime, greeting, money, num, pesos, toYmd } from "@/lib/format"

export type DashboardData = {
  modules: { sales: boolean; inventory: boolean; attendance: boolean; fleet: boolean; expiry: boolean }
  username: string
  businessName: string
  today: string
  now: Date
  canSeeCosts: boolean
  canAdjustStock: boolean
  steps: SetupStep[]
  showSetup: boolean
  /** Nothing recorded yet: the checklist alone, instead of a page of zeros. */
  fresh: boolean
  salesToday: { count: number; total: number } | null
  salesMonth: { count: number; total: number } | null
  pending: number
  recent: { id: number; number: number; customer_name: string | null; total_price: number; date_completed: string; location_id?: number | null }[]
  inventory: { products: number; units: number; cost_value: number; sell_value: number; low_stock: number; out_of_stock: number } | null
  low: { id: number; name: string; unit: string; current_stock: number }[]
  present: { id: number; clock_in: string; employees: { name: string } | null }[]
  road: { id: number; started_at: string; purpose: string | null; vehicles: { name: string } | null; employees: { name: string } | null }[]
  kmMonth: number
  soon: { id: number; quantity: number; expires_on: string; lot: string | null; items: { name: string; unit: string } | null }[]
  expiredCount: number
  /** The location filter, when the business has more than one location. */
  place?: PlaceFilter | null
}

/** The dashboard's layout. The page (page.tsx) loads the numbers. */
export function DashboardView({ data }: { data: DashboardData }) {
  const { sales, inventory, attendance, fleet, expiry } = data.modules
  const { username, businessName, today, now, steps, showSetup, fresh, recent, low, present, road, kmMonth, soon, expiredCount } = data
  const st = data.salesToday
  const sm = data.salesMonth
  const inv = data.inventory
  const products = inv?.products ?? 0
  const place = data.place ?? null
  // Links to the detail pages keep the location being shown.
  const at = (href: string) => (place ? `${href}?at=${place.value}` : href)
  const where = (id: number | null | undefined) => (place?.value === "all" && id ? place.names[id] : null)

  const actions: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: "/pos", label: "New sale", icon: ScanBarcode, show: sales },
    { href: "/inventory/quick-scan", label: "Quick scan", icon: Zap, show: inventory && data.canAdjustStock },
    { href: "/time-clock", label: "Time clock", icon: Timer, show: attendance },
    { href: "/fleet", label: "Log a trip", icon: Truck, show: fleet },
  ]
  const shownActions = fresh ? [] : actions.filter(a => a.show)

  // The page is grouped by area (sales, stock, team): each area's summary card
  // with its lists under it. On wide screens each area is a column; on phones
  // the summary cards come first, then the lists.
  const areas: { key: string; summary: (lead: boolean) => React.ReactNode; panels: React.ReactNode[] }[] = []

  if (sales) {
    areas.push({
      key: "sales",
      summary: lead => (
        <Summary
          id="summary-sales"
          lead={lead}
          label="Sales today"
          value={pesos(st?.total)}
          hint={plural(st?.count ?? 0, "sale")}
          rows={[
            { label: "This month", value: `${pesos(sm?.total)} · ${plural(sm?.count ?? 0, "sale")}`, count: sm?.count ?? 0, href: at("/sales") },
            { label: "Pending orders", value: num(data.pending), count: data.pending, tone: "warn", href: "/orders" },
          ]}
        />
      ),
      panels: [
        <Panel key="sales" title="Latest sales" link={{ href: at("/sales"), label: "Sales history" }}>
          {recent.length === 0 ? (
            <p className="text-sm faint py-4">No sales yet.</p>
          ) : (
            recent.map(o => (
              <div key={o.id} className="list-row text-sm">
                <span className="faint tabular">#{o.number}</span>
                <span className="flex-1 min-w-0 muted truncate">
                  {o.customer_name || "Walk-in"}
                  {where(o.location_id) && <span className="faint"> · {where(o.location_id)}</span>}
                </span>
                <span className="faint text-xs whitespace-nowrap">{toYmd(o.date_completed) === today ? formatTime(o.date_completed) : formatShortDate(o.date_completed)}</span>
                <span className="text-white font-semibold tabular text-right whitespace-nowrap">{money(o.total_price)}</span>
              </div>
            ))
          )}
        </Panel>,
      ],
    })
  }

  if (inventory) {
    const out = inv?.out_of_stock ?? 0
    const lowOnly = inv?.low_stock ?? 0
    const expiringOnly = soon.length - expiredCount
    areas.push({
      key: "stock",
      summary: lead => (
        <Summary
          id="summary-stock"
          lead={lead}
          label="Stock value"
          value={pesos(inv?.sell_value)}
          hint={data.canSeeCosts ? `${pesos(inv?.cost_value)} at cost` : "At selling price"}
          rows={[
            { label: "Out of stock", value: num(out), count: out, tone: "bad", href: at("/inventory/reorder") },
            { label: "Running low", value: num(lowOnly), count: lowOnly, tone: "warn", href: at("/inventory/reorder") },
            ...(expiry
              ? [{ label: `Expiring in ${EXPIRY_SOON_DAYS} days`, value: num(expiringOnly), count: expiringOnly, tone: "warn" as const, href: at("/inventory/expiry") }]
              : []),
            ...(expiry && expiredCount > 0
              ? [{ label: "Already expired", value: num(expiredCount), count: expiredCount, tone: "bad" as const, href: at("/inventory/expiry") }]
              : []),
          ]}
        />
      ),
      panels: [
        <Panel key="low" title="Running low" link={{ href: at("/inventory/reorder"), label: "Reorder list" }}>
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
                <span className="flex-1 min-w-0 text-white truncate">{i.name}</span>
                <span className="pill" data-tone={i.current_stock <= 0 ? "bad" : "warn"}>
                  {i.current_stock <= 0 ? "Out" : `${i.current_stock} ${i.unit}`}
                </span>
              </div>
            ))
          )}
        </Panel>,
        ...(expiry
          ? [
              <Panel key="expiry" title="Expiring soon" link={{ href: at("/inventory/expiry"), label: "Expiry dates" }}>
                {soon.length === 0 ? (
                  <p className="text-sm faint py-4">Nothing expires in the next {EXPIRY_SOON_DAYS} days.</p>
                ) : (
                  soon.slice(0, 8).map(b => {
                    const e = describeExpiry(b.expires_on, today)
                    return (
                      <div key={b.id} className="list-row text-sm">
                        <span className="flex-1 min-w-0 text-white truncate">
                          {b.items?.name}
                          {b.lot && <span className="faint text-xs"> · lot {b.lot}</span>}
                        </span>
                        <span className="muted text-xs whitespace-nowrap">
                          {num(b.quantity)} {b.items?.unit}
                        </span>
                        <span className="pill" data-tone={e.tone}>
                          {e.text}
                        </span>
                      </div>
                    )
                  })
                )}
              </Panel>,
            ]
          : []),
      ],
    })
  }

  if (attendance || fleet) {
    const roadRows = fleet
      ? [
          ...(attendance ? [{ label: "Vehicles on the road", value: num(road.length), count: road.length, href: "/fleet" }] : []),
          { label: "Driven this month", value: `${num(kmMonth)} km`, count: kmMonth, href: "/fleet/logs" },
        ]
      : []
    areas.push({
      key: "team",
      summary: lead =>
        attendance ? (
          <Summary
            id="summary-team"
            lead={lead}
            label="Clocked in"
            value={present.length}
            hint={present.length ? "Working now" : "Nobody is in yet"}
            rows={roadRows}
          />
        ) : (
          <Summary id="summary-team" lead={lead} label="On the road" value={road.length} hint="Vehicles out now" rows={roadRows} />
        ),
      // Lists only when there's someone to list; the card above already says "0".
      panels: [
        ...(attendance && present.length > 0
          ? [
              <Panel key="in" title="Who's in" link={{ href: "/attendance", label: "Attendance" }}>
                {present.map(p => (
                  <div key={p.id} className="list-row text-sm">
                    <span className="flex-1 min-w-0 text-white truncate">{p.employees?.name}</span>
                    <span className="faint text-xs whitespace-nowrap">since {formatTime(p.clock_in)}</span>
                    <span className="muted text-right whitespace-nowrap">{formatDuration(now.getTime() - new Date(p.clock_in).getTime())}</span>
                  </div>
                ))}
              </Panel>,
            ]
          : []),
        ...(fleet && road.length > 0
          ? [
              <Panel key="road" title="On the road" link={{ href: "/fleet", label: "Vehicles" }}>
                {road.map(t => (
                  <div key={t.id} className="list-row text-sm">
                    <span className="text-white max-w-[40%] truncate">{t.vehicles?.name}</span>
                    <span className="flex-1 min-w-0 muted truncate">
                      {t.employees?.name ?? "—"} · {t.purpose ?? "—"}
                    </span>
                    <span className="faint text-xs whitespace-nowrap">since {formatTime(t.started_at)}</span>
                  </div>
                ))}
              </Panel>,
            ]
          : []),
      ],
    })
  }

  // Columns for the areas on wide screens: the first (lead) area is a bit wider.
  const columns =
    areas.length >= 3
      ? "sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
      : areas.length === 2
        ? "sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
        : "max-w-3xl"
  // On phones and tablets the summary cards sit two to a row, with the lead one full width;
  // the last one is full width too when it would be alone on its row.
  const summarySpan = (i: number) =>
    areas.length > 1 && (i === 0 || (i === areas.length - 1 && (areas.length - 1) % 2 === 1)) ? "sm:col-span-2 lg:col-auto" : ""

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${formatLongDate(now)} · ${greeting(now)}, ${username}`}
        actionsClassName="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center"
      >
        {shownActions.length > 0 ? (
          shownActions.map((a, i) => (
            <Link
              key={a.href}
              href={a.href}
              className={`btn ${i === 0 ? "btn-primary" : "btn-secondary"} min-h-11 sm:min-h-0 ${i === shownActions.length - 1 && shownActions.length % 2 === 1 ? "col-span-2" : ""}`}
            >
              <a.icon size={16} className={i === 0 ? "" : "text-brand"} aria-hidden /> {a.label}
            </Link>
          ))
        ) : undefined}
      </PageHeader>

      {place && !fresh && (
        <div className="mb-5 -mt-1">
          <LocationFilter path="/dashboard" value={place.value} locations={place.locations} />
        </div>
      )}

      {showSetup && <SetupChecklist steps={steps} businessName={businessName} />}

      {!fresh && areas.length > 0 && (
        <div className={`grid gap-4 lg:gap-6 ${columns}`}>
          {areas.map((area, i) => (
            <div key={area.key} className="contents lg:grid lg:min-w-0 lg:row-span-2 lg:grid-rows-subgrid lg:grid-cols-[minmax(0,1fr)] lg:gap-y-4">
              <div className={`order-first grid min-w-0 ${summarySpan(i)}`}>{area.summary(i === 0)}</div>
              {area.panels.length > 0 && <div className={`flex flex-col gap-4 min-w-0 lg:gap-6 ${areas.length > 1 ? "sm:col-span-2 lg:col-auto" : ""}`}>{area.panels}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function plural(n: number, word: string) {
  return `${num(n)} ${word}${n === 1 ? "" : "s"}`
}

type SummaryRow = { label: string; value: React.ReactNode; count: number; tone?: "warn" | "bad"; href?: string }

/** One area's card: a headline number, then a few related figures. Colour only marks what needs attention. */
function Summary({
  id,
  label,
  value,
  hint,
  rows,
  lead,
}: {
  id: string
  label: string
  value: React.ReactNode
  hint: string
  rows: SummaryRow[]
  lead: boolean
}) {
  return (
    <section className="card summary rise" data-lead={lead ? "" : undefined} aria-labelledby={id}>
      <h2 id={id} className="stat-label">
        {label}
      </h2>
      <p className="summary-value">{value}</p>
      <p className="stat-hint">{hint}</p>
      {rows.length > 0 && (
        <ul className="summary-rows">
          {rows.map(r => {
            const inner = (
              <>
                <span>{r.label}</span>
                <span className="summary-num" data-tone={r.count > 0 ? r.tone : undefined} data-zero={r.count === 0 ? "" : undefined}>
                  {r.value}
                </span>
                {r.href && <ChevronRight size={14} className="summary-go" aria-hidden />}
              </>
            )
            return (
              <li key={r.label}>
                {r.href ? (
                  <Link href={r.href} className="summary-row">
                    {inner}
                  </Link>
                ) : (
                  <div className="summary-row">{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Panel({ title, link, children }: { title: string; link: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="card card-body rise min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="section-title">{title}</h2>
        <Link href={link.href} className="text-xs muted underline decoration-dotted whitespace-nowrap">
          {link.label}
        </Link>
      </div>
      <div>{children}</div>
    </section>
  )
}
