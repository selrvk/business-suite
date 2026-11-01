import { requireModule, requireUser } from "@/lib/auth"
import { TimeClock } from "./time-clock"

export const metadata = { title: "Time Clock" }

export default async function TimeClockPage() {
  await requireModule("attendance")
  const { business } = await requireUser()
  return <TimeClock businessName={business.name} logoUrl={business.logo_url} />
}
