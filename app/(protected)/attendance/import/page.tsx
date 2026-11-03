import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireAdminPage, requireModule } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { ScannerImport, type ImportEmployee } from "./scanner-import"

export const metadata = { title: "Import from a scanner" }

export default async function ScannerImportPage() {
  await requireModule("attendance")
  const supabase = await getSupabase()
  const [, { data, error }] = await Promise.all([requireAdminPage(), supabase.from("employees").select("id, name, code, active").order("name")])
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Import from a scanner"
        subtitle="Bring in the punches from a fingerprint or face scanner. You'll see who's in the file before anything is saved."
      >
        <Link href="/attendance" className="btn btn-ghost">
          <ArrowLeft size={14} /> Attendance
        </Link>
      </PageHeader>
      <ScannerImport employees={data as ImportEmployee[]} />
    </>
  )
}
