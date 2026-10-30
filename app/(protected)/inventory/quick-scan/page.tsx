import Link from "next/link"
import { History } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { requireModule } from "@/lib/auth"
import { hasModule } from "@/lib/config"
import { QuickScan } from "./quick-scan"

export const metadata = { title: "Quick Scan" }

export default function QuickScanPage() {
  requireModule("inventory")
  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Quick Scan"
        subtitle={
          <>
            Every scan changes stock right away. No cart, no save button.
            {hasModule("sales") && " Selling to a customer? Use Point of Sale so the money is recorded too."}
          </>
        }
      >
        <Link href="/inventory/movements" className="btn btn-secondary">
          <History size={14} /> Stock log
        </Link>
      </PageHeader>
      <QuickScan />
    </>
  )
}
