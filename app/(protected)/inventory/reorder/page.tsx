import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { PrintButton } from "@/components/print-button"
import { requireModule, requireUser } from "@/lib/auth"
import { hasOption } from "@/lib/features"
import { formatDate, toYmd } from "@/lib/format"
import { ReorderList, type LowItem } from "./reorder-list"
import { LocationFilter } from "@/components/location-filter"
import { getWorkplace, placeFilter, viewLocation } from "@/lib/locations"

export const metadata = { title: "Reorder List" }

export default async function ReorderPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  await requireModule("inventory")
  const session = await requireUser()
  const { supabase, business } = session
  const workplace = await getWorkplace(session)
  const view = viewLocation(workplace, (await searchParams).at)
  const place = placeFilter(workplace, view)
  const bySupplier = hasOption(business, "suppliers")
  const [low, suppliers] = await Promise.all([
    supabase.rpc("low_stock_items", { p_low_stock: business.low_stock_threshold, p_location_id: view?.id ?? null }),
    bySupplier ? supabase.from("suppliers").select("id, name, phone") : Promise.resolve({ data: [], error: null }),
  ])
  const error = low.error ?? suppliers.error
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        title="Reorder List"
        subtitle={`Products at or below their low-stock level${view ? ` at ${view.name}` : place ? " (all locations together)" : ""}${bySupplier ? ", grouped by supplier" : ""}. Adjust the quantities, then copy or print the order.`}
      >
        {(low.data ?? []).length > 0 && <PrintButton className="btn btn-secondary" />}
      </PageHeader>
      {place && (
        <div className="mb-5">
          <LocationFilter path="/inventory/reorder" value={place.value} locations={place.locations} />
        </div>
      )}
      <ReorderList
        items={(low.data ?? []) as LowItem[]}
        suppliers={(suppliers.data ?? []) as { id: number; name: string; phone: string | null }[]}
        bySupplier={bySupplier}
        businessName={view ? `${business.name} (${view.name})` : business.name}
        defaultLevel={business.low_stock_threshold}
        dateLabel={formatDate(toYmd())}
      />
    </>
  )
}
