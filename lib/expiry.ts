// How expiry dates are described and colored everywhere. Dates are "YYYY-MM-DD"
// in the business's time zone; pass `today` (toYmd()) from the server so the
// browser and server agree.
import { formatDate } from "./format"

/** Batches expiring within this many days count as "expiring soon". */
export const EXPIRY_SOON_DAYS = 30
/** ...and within this many, as worth watching. */
export const EXPIRY_WATCH_DAYS = 90

export function daysUntil(ymd: string, today: string) {
  const at = (d: string) => {
    const [y, m, day] = d.split("-").map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((at(ymd) - at(today)) / 86_400_000)
}

export type ExpiryTone = "bad" | "warn" | "info" | undefined

export function describeExpiry(ymd: string, today: string): { text: string; tone: ExpiryTone; days: number } {
  const days = daysUntil(ymd, today)
  if (days < 0) return { text: `Expired ${formatDate(ymd)}`, tone: "bad", days }
  if (days === 0) return { text: "Expires today", tone: "bad", days }
  if (days <= EXPIRY_SOON_DAYS) return { text: `${days} day${days === 1 ? "" : "s"} left`, tone: "warn", days }
  if (days <= EXPIRY_WATCH_DAYS) return { text: formatDate(ymd), tone: "info", days }
  return { text: formatDate(ymd), tone: undefined, days }
}
