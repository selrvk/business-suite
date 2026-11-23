import { PageHeader } from "@/components/page-header"
import { requireModule, requirePermission } from "@/lib/auth"
import { businessModules } from "@/lib/features"
import { getWorkplace } from "@/lib/locations"
import { QuickScan } from "./quick-scan"

export const metadata = { title: "Quick Scan" }

export default async function QuickScanPage() {
  await requireModule("inventory")
  const session = await requirePermission("adjust_stock")
  const selling = businessModules(session.business).includes("sales")
  const { multi, here } = await getWorkplace(session)
  return (
    <>
      <PageHeader
        title="Quick Scan"
        subtitle={
          <>
            Every scan changes stock{multi ? ` at ${here.name}` : ""} right away. No cart, no save button.
            {selling && " Selling to a customer? Use Point of Sale so the money is recorded too."}
          </>
        }
      />
      <QuickScan locationId={multi ? here.id : null} />
    </>
  )
}
