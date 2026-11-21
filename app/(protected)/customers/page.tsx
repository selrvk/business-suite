import { DbError } from "@/components/db-error"
import { ExportButton } from "@/components/export-button"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { dayRange, monthStart, toYmd } from "@/lib/format"
import type { Customer } from "@/lib/types"
import { AddCustomerButton, CustomerList } from "./customer-list"
import { CustomersSummary } from "./customers-summary"

export const metadata = { title: "Customers" }

export default async function CustomersPage() {
  await requireModule("sales")
  const { supabase, isAdmin, can } = await requireUser()
  const month = dayRange(monthStart(toYmd()), toYmd())
  const [{ data: customers, error }, { data: ledger, error: ledgerError }] = await Promise.all([
    fetchAll<Customer>((from, to) =>
      supabase.from("customers").select("id, name, phone, address, notes, credit_limit, balance").order("name").order("id").range(from, to),
    ),
    // This month's credit sales, voids and payments, for the summary.
    fetchAll<{ change: number; kind: string }>((from, to) =>
      supabase
        .from("customer_ledger")
        .select("change, kind")
        .in("kind", ["sale", "void", "payment"])
        .gte("created_at", month.from.toISOString())
        .lt("created_at", month.to.toISOString())
        .order("id")
        .range(from, to),
    ),
  ])
  if (error) return <DbError error={error} />
  if (ledgerError) return <DbError error={ledgerError} />

  const owing = customers.filter(c => Number(c.balance) > 0)
  const totalOwed = owing.reduce((s, c) => s + Number(c.balance), 0)
  const overLimit = customers.filter(c => c.credit_limit != null && Number(c.balance) > Number(c.credit_limit))
  const collected = ledger.filter(l => l.kind === "payment").reduce((s, l) => s - Number(l.change), 0)
  // Credit sales, less any of them voided.
  const lent = ledger.filter(l => l.kind === "sale" || l.kind === "void").reduce((s, l) => s + Number(l.change), 0)

  return (
    <>
      <PageHeader title="Customers">
        <ExportButton
          rows={customers.map(c => ({ Name: c.name, Phone: c.phone ?? "", Address: c.address ?? "", Owes: Number(c.balance), "Credit limit": c.credit_limit ?? "", Notes: c.notes ?? "" }))}
          filename={`customers_${toYmd()}`}
          sheet="Customers"
        />
        <AddCustomerButton canSetLimit={can("credit")} />
      </PageHeader>

      {customers.length > 0 && (
        <CustomersSummary owed={totalOwed} owing={owing.length} overLimit={overLimit.length} collected={collected} lent={lent} />
      )}

      <CustomerList customers={customers} isAdmin={isAdmin} canCredit={can("credit")} />
    </>
  )
}
