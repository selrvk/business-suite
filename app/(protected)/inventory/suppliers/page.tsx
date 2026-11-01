import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireOption, requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import type { Supplier } from "@/lib/types"
import { AddSupplierButton, SupplierList } from "./supplier-list"

export const metadata = { title: "Suppliers" }

export default async function SuppliersPage() {
  await requireModule("inventory")
  await requireOption("suppliers")
  const { supabase, isAdmin, business } = await requireUser()
  const [suppliers, items, low] = await Promise.all([
    supabase.from("suppliers").select("id, name, contact_person, phone, email, address, notes").order("name"),
    fetchAll<{ supplier_id: number | null }>((from, to) => supabase.from("items").select("supplier_id").not("supplier_id", "is", null).order("id").range(from, to)),
    supabase.rpc("low_stock_items", { p_low_stock: business.low_stock_threshold }),
  ])
  const error = suppliers.error ?? items.error ?? low.error
  if (error) return <DbError error={error} />

  const count = (rows: { supplier_id: number | null }[]) =>
    rows.reduce<Record<number, number>>((acc, r) => (r.supplier_id ? { ...acc, [r.supplier_id]: (acc[r.supplier_id] ?? 0) + 1 } : acc), {})

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Suppliers" subtitle="Who you buy from. Pick a supplier on each product and in Stock In.">
        <AddSupplierButton />
      </PageHeader>
      <SupplierList
        suppliers={(suppliers.data ?? []) as Supplier[]}
        productCounts={count(items.data)}
        lowCounts={count((low.data ?? []) as { supplier_id: number | null }[])}
        isAdmin={isAdmin}
      />
    </>
  )
}
