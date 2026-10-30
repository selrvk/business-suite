/**
 * PostgREST filter for finished orders in a time range: completed sales count on
 * the day they were completed, cancellations on the day they were cancelled.
 */
export function finishedInRange(from: Date, to: Date, status: "all" | "COMPLETED" | "CANCELLED" = "all") {
  const f = `"${from.toISOString()}"`
  const t = `"${to.toISOString()}"`
  const completed = `and(status.eq.COMPLETED,date_completed.gte.${f},date_completed.lt.${t})`
  const cancelled = `and(status.eq.CANCELLED,date_cancelled.gte.${f},date_cancelled.lt.${t})`
  return status === "COMPLETED" ? completed : status === "CANCELLED" ? cancelled : `${completed},${cancelled}`
}
