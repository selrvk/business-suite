import { money, num } from "@/lib/format"

/** The card at the top of Customers: what's owed, and this month's credit sales and payments. */
export function CustomersSummary({
  owed,
  owing,
  overLimit,
  collected,
  lent,
}: {
  owed: number
  /** Customers with a balance. */
  owing: number
  overLimit: number
  /** Payments received this month. */
  collected: number
  /** Sold on credit this month. */
  lent: number
}) {
  return (
    <section className="card summary rise mb-6" data-lead="" aria-labelledby="customers-owed">
      <div className="grid gap-x-10 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <h2 id="customers-owed" className="stat-label">
            Owed to you
          </h2>
          <p className="summary-value">{money(owed)}</p>
          <p className="stat-hint">
            {owing ? `${num(owing)} ${owing === 1 ? "customer owes" : "customers owe"} you` : "Nobody owes you anything"}
            {overLimit > 0 && <span className="text-bad"> · {num(overLimit)} over their limit</span>}
          </p>
        </div>
        <ul className="summary-rows lg:mt-0 lg:border-t-0" aria-label="This month">
          <li>
            <div className="summary-row">
              <span>Collected this month</span>
              <span className="summary-num" data-zero={collected === 0 ? "" : undefined}>
                {money(collected)}
              </span>
            </div>
          </li>
          <li>
            <div className="summary-row">
              <span>Sold on credit this month</span>
              <span className="summary-num" data-zero={lent === 0 ? "" : undefined}>
                {money(lent)}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  )
}
