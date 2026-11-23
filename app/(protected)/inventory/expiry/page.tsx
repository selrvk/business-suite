import { DbError } from "@/components/db-error"
import { ExportButton } from "@/components/export-button"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireOption, requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { daysUntil } from "@/lib/expiry"
import { toYmd } from "@/lib/format"
import { ExpiryBoard, type BatchRow, type UndatedProduct } from "./expiry-board"
import { LocationFilter } from "@/components/location-filter"
import { getWorkplace, levelsAt, placeFilter, viewLocation } from "@/lib/locations"

export const metadata = { title: "Expiry Dates" }

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  await requireModule("inventory")
  await requireOption("expiry")
  const session = await requireUser()
  const { supabase } = session
  const today = toYmd()
  const workplace = await getWorkplace(session)
  const view = viewLocation(workplace, (await searchParams).at)
  const place = placeFilter(workplace, view)
  const batchQuery = () =>
    supabase.from("stock_batches").select("id, item_id, quantity, expires_on, lot, received_at, location_id, items(name, unit, barcode), suppliers(name)")

  const [batches, items, stock] = await Promise.all([
    fetchAll<BatchRow>((from, to) =>
      (view ? batchQuery().eq("location_id", view.id) : batchQuery())
        .gt("quantity", 0)
        .order("expires_on", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, to)
        .overrideTypes<BatchRow[], { merge: false }>(),
    ),
    fetchAll<{ id: number; name: string; unit: string; current_stock: number }>((from, to) =>
      supabase.from("items").select("id, name, unit, current_stock").gt("current_stock", 0).order("name").order("id").range(from, to),
    ),
    view ? levelsAt(supabase, view.id) : null,
  ])
  const error = batches.error ?? items.error ?? stock?.error
  if (error) return <DbError error={error} />
  // With one location picked, its own stock.
  const onHand = (i: { id: number; current_stock: number }) => (stock ? (stock.levels.get(i.id) ?? 0) : i.current_stock)

  // Stock with no date yet: each product's stock minus what's in its batches.
  const dated: Record<number, number> = {}
  for (const b of batches.data) dated[b.item_id] = (dated[b.item_id] ?? 0) + b.quantity
  const undated: UndatedProduct[] = items.data
    .map(i => ({ id: i.id, name: i.name, unit: i.unit, undated: onHand(i) - (dated[i.id] ?? 0) }))
    .filter(i => i.undated > 0)

  const exportRows = batches.data.map(b => ({
    Product: b.items?.name ?? "",
    Barcode: b.items?.barcode ?? "",
    ...(place ? { Location: (b.location_id && place.names[b.location_id]) || "" } : {}),
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
        title="Expiry Dates"
        subtitle={`Each delivery's expiry date${view ? ` at ${view.name}` : ""}, soonest first. Sales and stock taken out use the batch that expires first.`}
      >
        <ExportButton rows={exportRows} filename={`expiry_${today}`} sheet="Expiry dates" />
      </PageHeader>

      {place && (
        <div className="mb-5">
          <LocationFilter path="/inventory/expiry" value={place.value} locations={place.locations} />
        </div>
      )}
      <ExpiryBoard
        batches={batches.data}
        undated={undated}
        today={today}
        datingAt={!place ? null : view ? view.id : "all"}
        places={place?.value === "all" ? place.names : null}
      />
    </>
  )
}
