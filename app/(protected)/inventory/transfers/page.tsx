import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { hasOption } from "@/lib/features"
import { toYmd } from "@/lib/format"
import { getWorkplace, locationNames } from "@/lib/locations"
import { getSupabase } from "@/lib/supabase/server"
import { TransferForm, TransfersList, type TransferRow } from "./transfers"

export const metadata = { title: "Transfers" }

const LIMIT = 100

export default async function TransfersPage() {
  await requireModule("inventory")
  const supabase = await getSupabase()
  const session = await requireUser()
  const workplace = await getWorkplace(session)

  if (!workplace.multi) {
    const branchesOn = hasOption(session.business, "branches")
    return (
      <>
        <PageHeader title="Transfers" />
        <div className="card card-body flex flex-col items-start gap-3 max-w-xl">
          <ArrowLeftRight size={22} className="text-brand" aria-hidden />
          <p className="text-white font-semibold">Move stock between your branches and warehouses</p>
          <p className="text-sm muted">
            {branchesOn
              ? "Add a second location (a branch or a warehouse) in Settings, then send stock between them here."
              : "Turn on Branches & warehouses in Settings → Features, add your other locations, then send stock between them here."}
          </p>
          {session.isAdmin && (
            <Link href={branchesOn ? "/settings#locations" : "/settings#features"} className="btn btn-secondary">
              Open Settings
            </Link>
          )}
        </div>
      </>
    )
  }

  const [items, levels, transfers, members] = await Promise.all([
    fetchAll<{ id: number; barcode: string | null; name: string; brand: string | null; unit: string }>((from, to) =>
      supabase.from("items").select("id, barcode, name, brand, unit").order("name").order("id").range(from, to),
    ),
    fetchAll<{ item_id: number; location_id: number; quantity: number }>((from, to) =>
      supabase
        .from("stock_levels")
        .select("item_id, location_id, quantity")
        .neq("quantity", 0)
        .order("item_id")
        .order("location_id")
        .range(from, to),
    ),
    supabase
      .from("transfers")
      .select("id, from_location_id, to_location_id, note, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase.from("members").select("user_id, username"),
  ])
  const failed = items.error ?? levels.error ?? transfers.error
  if (failed) return <DbError error={failed} />

  // What went in each transfer (the arriving side of each move).
  const ids = (transfers.data ?? []).map(t => t.id)
  const moved: { transfer_id: number; change: number; items: { name: string; unit: string } | null }[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("stock_movements")
      .select("transfer_id, change, items(name, unit)")
      .in("transfer_id", ids.slice(i, i + 100))
      .gt("change", 0)
    moved.push(...((data ?? []) as unknown as typeof moved))
  }

  const stock: Record<number, Record<number, number>> = {}
  for (const l of levels.data) (stock[l.item_id] ??= {})[l.location_id] = l.quantity
  const names = new Map((members.data ?? []).map(m => [m.user_id, m.username]))
  const rows: TransferRow[] = (transfers.data ?? []).map(t => {
    const lines = moved.filter(m => m.transfer_id === t.id)
    return {
      id: t.id,
      from: t.from_location_id,
      to: t.to_location_id,
      note: t.note,
      by: (t.created_by && names.get(t.created_by)) || null,
      at: t.created_at,
      units: lines.reduce((s, l) => s + l.change, 0),
      lines: lines.map(l => ({ name: l.items?.name ?? "(deleted product)", quantity: l.change, unit: l.items?.unit ?? "" })),
    }
  })

  const canMove = session.can("adjust_stock")
  return (
    <>
      <PageHeader
        title="Transfers"
        subtitle="Send stock from one location to another. It leaves one and arrives at the other straight away, with its expiry dates."
      />
      {canMove ? (
        <TransferForm
          items={items.data}
          stock={stock}
          from={workplace.here.id}
          canPickFrom={workplace.canSwitch}
          locations={workplace.open.map(l => ({ id: l.id, name: l.name, kind: l.kind }))}
        />
      ) : (
        <p className="alert alert-warn mb-6">Moving stock needs the &quot;Correct stock&quot; permission. Ask an owner or admin.</p>
      )}
      <TransfersList rows={rows} names={locationNames(workplace)} today={toYmd()} limit={rows.length === LIMIT ? LIMIT : null} />
    </>
  )
}
