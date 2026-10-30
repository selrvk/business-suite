import { notFound } from "next/navigation"
import Link from "next/link"
import { Printer } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { hasModule } from "@/lib/config"
import type { Employee } from "@/lib/types"
import { EmployeeList } from "./employee-list"

export const metadata = { title: "Employees" }

export default async function EmployeesPage() {
  if (!hasModule("attendance") && !hasModule("fleet")) notFound()
  const supabase = await getSupabase()
  const [{ isAdmin }, { data, error }] = await Promise.all([
    requireUser(),
    supabase.from("employees").select("id, name, code, position, phone, active").order("name"),
  ])
  if (error) return <DbError error={error} />
  const employees = data as Employee[]

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Employees"
        subtitle={
          hasModule("attendance")
            ? "Everyone who clocks in or drives. Each person gets a badge code. Print it on an ID card and they scan it at the time clock."
            : "Your drivers and staff."
        }
      >
        {employees.some(e => e.active) && (
          <Link href="/print/labels/employees" target="_blank" className="btn btn-secondary">
            <Printer size={14} /> Print all badges
          </Link>
        )}
      </PageHeader>
      <EmployeeList employees={employees} isAdmin={isAdmin} />
    </>
  )
}
