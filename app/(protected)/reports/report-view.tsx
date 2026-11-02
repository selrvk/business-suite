import Link from "next/link"
import { Info, PackageX, TrendingUp } from "lucide-react"
import { DateRange } from "@/components/date-range"
import { ExportButton } from "@/components/export-button"
import { Empty, PageHeader, Stat } from "@/components/page-header"
import { formatDate, money, num } from "@/lib/format"
import { chartBuckets, margin, percent, type ProfitReport } from "@/lib/reports"
import { ProductRanking } from "./product-ranking"
import { ProfitChart } from "./profit-chart"

export const SLOW_DAYS = [30, 60, 90] as const

/** The Profit Report page's content, from a report already loaded. */
export function ReportView({
  report,
  from,
  to,
  today,
  slow,
  slowParam,
  categories,
}: {
  report: ProfitReport
  from: string
  to: string
  today: string
  slow: number
  slowParam?: string
  categories: boolean
}) {
  const profit = report.revenue - report.cost
  const { buckets, monthly } = chartBuckets(report.by_day, from, to < today ? to : today)
  const noCost = report.by_product.filter(p => p.cost === 0 && p.revenue > 0).length
  const showCategories = categories && report.by_category.some(c => c.category)
  const tiedUp = report.slow_movers.reduce((s, x) => s + x.value, 0)
  const keep = { from, to }

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Profit Report"
        subtitle="What you sold, minus what those goods cost you. Rent, wages and other expenses aren't included."
      >
        {report.by_product.length > 0 && (
          <ExportButton
            filename={`profit_${from}_to_${to}`}
            sheet="Profit by product"
            rows={report.by_product.map(p => ({
              Product: p.name,
              ...(showCategories ? { Category: p.category ?? "" } : {}),
              Sold: p.quantity,
              Sales: p.revenue,
              Cost: p.cost,
              Profit: p.profit,
              "Margin %": margin(p.revenue, p.cost) == null ? null : Math.round(margin(p.revenue, p.cost)! * 1000) / 10,
            }))}
          />
        )}
      </PageHeader>

      <div className="mb-6">
        <DateRange path="/reports" from={from} to={to} extra={{ slow: slowParam }} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Sales" value={money(report.revenue)} hint={`${num(report.sales)} sale${report.sales === 1 ? "" : "s"} · ${num(report.items_sold)} items`} tone="info" />
        <Stat label="Cost of the goods" value={money(report.cost)} hint="What you paid for what you sold" />
        <Stat label="Profit" value={money(profit)} tone={profit < 0 ? "bad" : "good"} hint={report.discounts > 0 ? `After ${money(report.discounts)} in discounts` : undefined} />
        <Stat label="Margin" value={percent(margin(report.revenue, report.cost))} tone="brand" hint="Profit as a share of sales" />
      </div>

      {(report.estimated_lines > 0 || noCost > 0) && (
        <div className="flex flex-col gap-1.5 mb-6 text-xs muted">
          {report.estimated_lines > 0 && (
            <p className="flex gap-2">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                {num(report.estimated_lines)} sold line{report.estimated_lines === 1 ? " is" : "s are"} from before the cost was saved with each sale, so
                {report.estimated_lines === 1 ? " its" : " their"} cost uses today&apos;s buying price.
              </span>
            </p>
          )}
          {noCost > 0 && (
            <p className="flex gap-2 text-warn">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                {num(noCost)} product{noCost === 1 ? " has" : "s have"} no buying price, so {noCost === 1 ? "its" : "their"} whole price counts as profit.{" "}
                <Link href="/inventory" className="underline decoration-dotted">
                  Add buying prices in Products
                </Link>
                .
              </span>
            </p>
          )}
        </div>
      )}

      <section className="card mb-6">
        <div className="card-header">
          <h2 className="display text-xl text-white">{monthly ? "By month" : "By day"}</h2>
        </div>
        <div className="card-body">
          <ProfitChart buckets={buckets} monthly={monthly} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="display text-2xl text-white mb-3">Best sellers</h2>
        {report.by_product.length ? (
          <ProductRanking products={report.by_product} showCategory={showCategories} />
        ) : (
          <div className="card">
            <Empty title="No sales in this period" icon={<TrendingUp size={30} />} />
          </div>
        )}
      </section>

      {showCategories && (
        <section className="mb-8">
          <h2 className="display text-2xl text-white mb-3">By category</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Sold</th>
                  <th className="num">Sales</th>
                  <th className="num">Profit</th>
                  <th className="num hidden sm:table-cell">Share of sales</th>
                </tr>
              </thead>
              <tbody>
                {report.by_category.map(c => (
                  <tr key={c.category || "none"}>
                    <td className={c.category ? "text-white" : "faint"}>{c.category || "No category"}</td>
                    <td className="num tabular-nums">{num(c.quantity)}</td>
                    <td className="num tabular-nums">{money(c.revenue)}</td>
                    <td className={`num tabular-nums font-semibold ${c.revenue - c.cost < 0 ? "text-bad" : "text-white"}`}>{money(c.revenue - c.cost)}</td>
                    <td className="num muted hidden sm:table-cell">{percent(report.revenue > 0 ? c.revenue / report.revenue : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="display text-2xl text-white">Slow movers</h2>
            <p className="text-xs muted mt-1">
              In stock but not sold in the last {slow} days, most money tied up first.
              {tiedUp > 0 && ` About ${money(tiedUp)} at cost.`}
            </p>
          </div>
          <div className="segmented">
            {SLOW_DAYS.map(d => (
              <Link key={d} href={`/reports?${new URLSearchParams({ ...keep, slow: String(d) })}`} data-active={slow === d}>
                {d} days
              </Link>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          {report.slow_movers.length === 0 ? (
            <Empty title="No slow movers" icon={<PackageX size={30} />}>
              Everything in stock sold at least once in the last {slow} days.
            </Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">In stock</th>
                  <th className="num">Value at cost</th>
                  <th className="num">Last sold</th>
                </tr>
              </thead>
              <tbody>
                {report.slow_movers.map(s => (
                  <tr key={s.id}>
                    <td className="text-white">{s.name}</td>
                    <td className="num tabular-nums">
                      {num(s.current_stock)} <span className="faint text-xs">{s.unit}</span>
                    </td>
                    <td className="num tabular-nums">{money(s.value)}</td>
                    <td className="num muted whitespace-nowrap">{s.last_sold ? formatDate(s.last_sold) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {report.slow_movers.length === 100 && <p className="text-xs faint mt-3">Showing the 100 with the most money tied up.</p>}
      </section>
    </>
  )
}
