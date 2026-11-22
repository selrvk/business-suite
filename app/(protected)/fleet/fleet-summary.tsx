import { num } from "@/lib/format"

/** The card at the top of Vehicles: what's out now, and this month's driving. */
export function FleetSummary({ onRoad, vehicles, km, trips }: { onRoad: number; vehicles: number; km: number; trips: number }) {
  return (
    <section className="card summary rise mb-6" data-lead="" aria-labelledby="fleet-out">
      <div className="grid gap-x-10 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <h2 id="fleet-out" className="stat-label">
            On the road now
          </h2>
          <p className="summary-value">
            {onRoad}
            <span className="text-2xl muted"> of {vehicles}</span>
          </p>
          <p className="stat-hint">{onRoad === 0 ? "All vehicles are in" : `${vehicles - onRoad} available`}</p>
        </div>
        <ul className="summary-rows lg:mt-0 lg:border-t-0" aria-label="This month">
          <li>
            <div className="summary-row">
              <span>Driven this month</span>
              <span className="summary-num" data-zero={km === 0 ? "" : undefined}>
                {num(km)} km
              </span>
            </div>
          </li>
          <li>
            <div className="summary-row">
              <span>Trips this month</span>
              <span className="summary-num" data-zero={trips === 0 ? "" : undefined}>
                {num(trips)}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  )
}
