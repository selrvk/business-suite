import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { hasOption } from "@/lib/features"
import { formatDate, toYmd } from "@/lib/format"
import { ReorderList, type LowItem } from "./reorder-list"

export const metadata = { title: "Reorder List" }

export default async function ReorderPage() {
  await requireModule("inventory")
  const { supabase, business } = await requireUser()
  const bySupplier = hasOption(business, "suppliers")
  const [low, suppliers] = await Promise.all([
    supabase.rpc("low_stock_items", { p_low_stock: business.low_stock_threshold }),
    bySupplier ? supabase.from("suppliers").select("id, name, phone") : Promise.resolve({ data: [], error: null }),
  ])
  const error = low.error ?? suppliers.error
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Reorder List"
        subtitle={`Products at or below their low-stock level${bySupplier ? ", grouped by supplier" : ""}. Adjust the quantities, then copy or print the order.`}
      />
      <ReorderList
        items={(low.data ?? []) as LowItem[]}
        suppliers={(suppliers.data ?? []) as { id: number; name: string; phone: string | null }[]}
        bySupplier={bySupplier}
        businessName={business.name}
        defaultLevel={business.low_stock_threshold}
        dateLabel={formatDate(toYmd())}
      />
    </>
  )
}
