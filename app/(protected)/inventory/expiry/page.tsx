import { DbError } from "@/components/db-error"
import { ExportButton } from "@/components/export-button"
import { PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireOption, requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { EXPIRY_SOON_DAYS, daysUntil } from "@/lib/expiry"
import { num, toYmd } from "@/lib/format"
import { ExpiryBoard, type BatchRow, type UndatedProduct } from "./expiry-board"

export const metadata = { title: "Expiry Dates" }

export default async function ExpiryPage() {
  await requireModule("inventory")
  await requireOption("expiry")
  const { supabase } = await requireUser()
  const today = toYmd()

  const [batches, items] = await Promise.all([
    fetchAll<BatchRow>((from, to) =>
      supabase
        .from("stock_batches")
        .select("id, item_id, quantity, expires_on, lot, received_at, items(name, unit, barcode), suppliers(name)")
        .gt("quantity", 0)
        .order("expires_on", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, to)
        .overrideTypes<BatchRow[], { merge: false }>(),
    ),
    fetchAll<{ id: number; name: string; unit: string; current_stock: number }>((from, to) =>
      supabase.from("items").select("id, name, unit, current_stock").gt("current_stock", 0).order("name").order("id").range(from, to),
    ),
  ])
  const error = batches.error ?? items.error
  if (error) return <DbError error={error} />

  // Stock with no date yet: each product's stock minus what's in its batches.
  const dated: Record<number, number> = {}
  for (const b of batches.data) dated[b.item_id] = (dated[b.item_id] ?? 0) + b.quantity
  const undated: UndatedProduct[] = items.data
    .map(i => ({ id: i.id, name: i.name, unit: i.unit, undated: i.current_stock - (dated[i.id] ?? 0) }))
    .filter(i => i.undated > 0)

  const withDate = batches.data.filter(b => b.expires_on)
  const expired = withDate.filter(b => b.expires_on! < today)
  const soon = withDate.filter(b => b.expires_on! >= today && daysUntil(b.expires_on!, today) <= EXPIRY_SOON_DAYS)

  const exportRows = batches.data.map(b => ({
    Product: b.items?.name ?? "",
    Barcode: b.items?.barcode ?? "",
    Lot: b.lot ?? "",
    Quantity: b.quantity,
    Unit: b.items?.unit ?? "",
    "Expiry date": b.expires_on ?? "",
    "Days left": b.expires_on ? daysUntil(b.expires_on, today) : "",
    Supplier: b.suppliers?.name ?? "",
    Received: b.received_at.slice(0, 10),
  }))

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Expiry Dates"
        subtitle="Each delivery's expiry date, soonest first. Sales and stock taken out use the batch that expires first."
      >
        <ExportButton rows={exportRows} filename={`expiry_${today}`} sheet="Expiry dates" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Expired, still in stock" value={expired.length} hint={`${num(expired.reduce((s, b) => s + b.quantity, 0))} units`} tone={expired.length ? "bad" : "good"} />
        <Stat label={`Expiring in ${EXPIRY_SOON_DAYS} days`} value={soon.length} hint={`${num(soon.reduce((s, b) => s + b.quantity, 0))} units`} tone={soon.length ? "warn" : "good"} />
        <Stat label="Batches with dates" value={withDate.length} tone="info" />
        <Stat label="Products without dates" value={undated.length} hint="Stock on hand with no expiry recorded" />
      </div>

      <ExpiryBoard batches={batches.data} undated={undated} today={today} />
    </>
  )
}
