import { DbError } from "@/components/db-error"
import { type SetupStep } from "@/components/setup-checklist"
import { requireUser } from "@/lib/auth"
import { EXPIRY_SOON_DAYS } from "@/lib/expiry"
import { businessModules, hasOption } from "@/lib/features"
import { addDays, dayRange, monthStart, toYmd } from "@/lib/format"
import { DashboardView, type DashboardData } from "./dashboard-view"

export const metadata = { title: "Dashboard" }

type SalesSummary = DashboardData["salesToday"]
type InventorySummary = DashboardData["inventory"]

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
  const skipped = new Set(business.setup_skipped ?? [])
  for (const step of steps) step.skipped = !step.done && skipped.has(step.key)
  const showSetup = setup && steps.some(s => !s.done && !s.skipped)
  // Nothing recorded yet: the checklist alone, instead of a page of zeros.
  const fresh = showSetup && products === 0 && (anySales.count ?? 0) === 0

  const data: DashboardData = {
    modules: { sales, inventory, attendance, fleet, expiry },
    username,
    businessName: business.name,
    today,
    now,
    canSeeCosts: can("see_costs"),
    canAdjustStock: can("adjust_stock"),
    steps,
    showSetup,
    fresh,
    salesToday: st,
    salesMonth: sm,
    pending: pending.count ?? 0,
    recent,
    inventory: inv,
    low,
    present,
    road,
    kmMonth,
    soon,
    expiredCount,
  }
  return <DashboardView data={data} />
}
