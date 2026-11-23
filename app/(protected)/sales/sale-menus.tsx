"use client"

import { useState } from "react"
import { Download, MoreHorizontal, Printer, Trash2, Undo2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { downloadExcel } from "@/components/export-button"
import { ConfirmDialog } from "@/components/modal"
import { deleteHistory, deleteOrder, exportSales } from "./actions"
import { VoidSaleDialog } from "./void-button"

/** The header's "More" menu: export the sales shown, or (owners) delete them. */
export function SalesMenu({
  from,
  to,
  status,
  rangeLabel,
  canDelete,
  at = null,
}: {
  from: string
  to: string
  status: "all" | "COMPLETED" | "CANCELLED"
  /** The location shown (null: all of them). */
  at?: { id: number; name: string } | null
  /** The dates in words, for the delete warning. */
  rangeLabel: string
  canDelete: boolean
}) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle")
  const [deleting, setDeleting] = useState(false)

  async function exportRows() {
    setState("busy")
    try {
      const result = await exportSales(from, to, status, at?.id ?? null)
      if (!result.ok) throw new Error(result.error)
      await downloadExcel(result.data, `sales_${from}_to_${to}`, "Sales")
      setState("idle")
    } catch {
      setState("failed")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="btn btn-secondary" aria-label="More sales actions" disabled={state === "busy"}>
            <MoreHorizontal size={15} aria-hidden /> {state === "busy" ? "Exporting…" : state === "failed" ? "Export failed" : "More"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={exportRows}>
            <Download /> Export to Excel
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 /> Delete these records…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canDelete && (
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title="Delete these records?"
          message={
            <>
              This permanently deletes every completed and cancelled sale{at ? ` at ${at.name}` : ""} from {rangeLabel}. Stock levels
              don&apos;t change. Export
              first if you need a copy.
            </>
          }
          confirmLabel="Delete records"
          action={() => deleteHistory(from, to, at?.id ?? null)}
        />
      )}
    </>
  )
}

/** One sale's actions: its receipt, and (if allowed) voiding it or deleting the record. */
export function SaleActions({
  orderId,
  number,
  total,
  canVoid,
  canDelete,
  compact = false,
}: {
  orderId: number
  number: number
  total: number
  canVoid: boolean
  canDelete: boolean
  /** Phones: the receipt goes in the menu too. */
  compact?: boolean
}) {
  const [voiding, setVoiding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const receipt = `/print/receipt/${orderId}`
  const menu = compact || canVoid || canDelete

  return (
    <div className="flex items-center justify-end shrink-0">
      {!compact && (
        <a className="btn btn-ghost btn-icon" href={receipt} target="_blank" rel="noreferrer" title="Receipt" aria-label={`Receipt for sale #${number}`}>
          <Printer size={14} />
        </a>
      )}
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for sale #${number}`}>
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {compact && (
              <DropdownMenuItem asChild>
                <a href={receipt} target="_blank" rel="noreferrer">
                  <Printer /> Receipt
                </a>
              </DropdownMenuItem>
            )}
            {canVoid && (
              <DropdownMenuItem onSelect={() => setVoiding(true)}>
                <Undo2 /> Void sale…
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                {(compact || canVoid) && <DropdownMenuSeparator />}
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 /> Delete record…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canVoid && <VoidSaleDialog orderId={orderId} number={number} total={total} open={voiding} onClose={() => setVoiding(false)} />}
      {canDelete && (
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title={`Delete sale #${number}?`}
          message="This removes the record permanently. Stock levels don't change. To undo a sale and put its items back in stock, void it instead."
          confirmLabel="Delete"
          action={() => deleteOrder(orderId)}
        />
      )}
    </div>
  )
}
