import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireAdminPage, requireModule } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { getSupabase } from "@/lib/supabase/server"
import type { Item } from "@/lib/types"
import { ProductImport } from "./product-import"

export const metadata = { title: "Import products" }

export default async function ImportProductsPage() {
  requireModule("inventory")
  const supabase = await getSupabase()
  const [, { data: items, error }] = await Promise.all([
    requireAdminPage(),
    fetchAll<Item>((from, to) => supabase.from("items").select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell").order("id").range(from, to)),
  ])
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Import products"
        subtitle="Add or update many products at once from an Excel or CSV file. You'll see exactly what will change before anything is saved."
      >
        <Link href="/inventory" className="btn btn-ghost">
          <ArrowLeft size={14} /> Products
        </Link>
      </PageHeader>
      <ProductImport items={items} />
    </>
  )
}
