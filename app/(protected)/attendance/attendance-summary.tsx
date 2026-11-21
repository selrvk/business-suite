import { formatDuration } from "@/lib/format"

/** The card at the top of Attendance: who's in now, and today so far. */
export function AttendanceSummary({ inNow, cameIn, staff, workedMs }: { inNow: number; cameIn: number; staff: number; workedMs: number }) {
  const notIn = staff - cameIn
  return (
    <section className="card summary rise mb-6" data-lead="" aria-labelledby="attendance-in">
      <div className="grid gap-x-10 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <h2 id="attendance-in" className="stat-label">
            Clocked in now
          </h2>
          <p className="summary-value">
            {inNow}
            <span className="text-2xl muted"> of {staff}</span>
          </p>
          <p className="stat-hint">
            {cameIn} of {staff} came in today
          </p>
        </div>
        <ul className="summary-rows lg:mt-0 lg:border-t-0" aria-label="Today">
          <li>
            <div className="summary-row">
              <span>Not in yet</span>
              <span className="summary-num" data-tone={notIn > 0 ? "warn" : undefined} data-zero={notIn === 0 ? "" : undefined}>
                {notIn}
              </span>
            </div>
          </li>
          <li>
            <div className="summary-row">
              <span>Hours worked today</span>
              <span className="summary-num" data-zero={workedMs === 0 ? "" : undefined}>
                {workedMs ? formatDuration(workedMs) : "0m"}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  )
}
