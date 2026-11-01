import { DbError } from "@/components/db-error"
import { ExportButton } from "@/components/export-button"
import { PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { money, toYmd } from "@/lib/format"
import type { Customer } from "@/lib/types"
import { AddCustomerButton, CustomerList } from "./customer-list"

export const metadata = { title: "Customers" }

export default async function CustomersPage() {
  await requireModule("sales")
  const { supabase, isAdmin, can } = await requireUser()
  const { data: customers, error } = await fetchAll<Customer>((from, to) =>
    supabase.from("customers").select("id, name, phone, address, notes, credit_limit, balance").order("name").order("id").range(from, to),
  )
  if (error) return <DbError error={error} />

  const owing = customers.filter(c => Number(c.balance) > 0)
  const totalOwed = owing.reduce((s, c) => s + Number(c.balance), 0)
  const overLimit = customers.filter(c => c.credit_limit != null && Number(c.balance) > Number(c.credit_limit))

  return (
    <>
      <PageHeader eyebrow="Sales" title="Customers" subtitle="Regular customers and what they owe. Sell on credit from Point of Sale; record payments here.">
        <ExportButton
          rows={customers.map(c => ({ Name: c.name, Phone: c.phone ?? "", Address: c.address ?? "", "Owes": Number(c.balance), "Credit limit": c.credit_limit ?? "", Notes: c.notes ?? "" }))}
          filename={`customers_${toYmd()}`}
          sheet="Customers"
        />
        <AddCustomerButton canSetLimit={can("credit")} />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Stat label="Owed to you" value={money(totalOwed)} tone={totalOwed > 0 ? "warn" : "good"} hint={`${owing.length} customer${owing.length === 1 ? "" : "s"} with a balance`} />
        <Stat label="Over their limit" value={overLimit.length} tone={overLimit.length ? "bad" : "good"} />
        <Stat label="Customers" value={customers.length} tone="info" />
      </div>

      <CustomerList customers={customers} isAdmin={isAdmin} canCredit={can("credit")} />
    </>
  )
}
