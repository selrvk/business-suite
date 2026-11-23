"use client"

import { useState } from "react"
import Link from "next/link"
import { MapPin, MoreHorizontal, Pencil, Plus, RotateCcw, Store, Warehouse, XCircle } from "lucide-react"
import { ConfirmDialog, Modal } from "@/components/modal"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { num } from "@/lib/format"
import type { Location } from "@/lib/types"
import { addLocation, setLocationOpen, updateLocation } from "./location-actions"

/** Settings → Locations: the business's branches and warehouses. */
export function LocationsManager({ locations, units }: { locations: Location[]; units: Record<number, number> }) {
  const [editing, setEditing] = useState<Location | "new" | null>(null)
  const [closing, setClosing] = useState<Location | null>(null)
  const [reopening, setReopening] = useState<Location | null>(null)
  const main = locations.find(l => l.is_main)
  const stockOf = (l: Location) => units[l.id] ?? 0
  const openCount = locations.filter(l => l.active).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm muted">
        Branches sell; warehouses only store stock. Each keeps its own stock count, and you move stock between them with{" "}
        {openCount > 1 ? (
          <Link href="/inventory/transfers" className="underline decoration-dotted">
            Transfers
          </Link>
        ) : (
          "Transfers"
        )}
        . Prices are the same everywhere.
      </p>

      <div className="flex flex-col">
        {locations.map(l => {
          const Icon = l.kind === "warehouse" ? Warehouse : Store
          const stock = units[l.id] ?? 0
          return (
            <div key={l.id} className="list-row" style={l.active ? undefined : { opacity: 0.55 }}>
              <Icon size={16} className={l.active ? "text-brand shrink-0" : "faint shrink-0"} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {l.name} {l.is_main && <span className="faint font-normal">(main)</span>}
                </p>
                <p className="text-xs faint truncate">
                  {l.kind === "warehouse" ? "Warehouse" : "Branch"} · {stock > 0 ? `${num(stock)} units in stock` : "No stock"}
                  {l.address && ` · ${l.address}`}
                </p>
              </div>
              {!l.active && <span className="pill">Closed</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for ${l.name}`}>
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(l)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  {!l.is_main && l.active && (
                    <DropdownMenuItem variant="destructive" onSelect={() => setClosing(l)}>
                      <XCircle /> Close location
                    </DropdownMenuItem>
                  )}
                  {!l.active && (
                    <DropdownMenuItem onSelect={() => setReopening(l)}>
                      <RotateCcw /> Open again
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>

      <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setEditing("new")}>
        <Plus size={13} /> Add a branch or warehouse
      </button>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add a location" : "Edit location"} width={460}>
        {editing && (
          <LocationForm
            key={editing === "new" ? "new" : editing.id}
            location={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
      {/* A location with stock can't close yet: say what to do instead. */}
      <Modal
        open={!!closing && stockOf(closing) > 0}
        onClose={() => setClosing(null)}
        title={`Move ${closing?.name ?? "its"} stock first`}
        width={420}
      >
        <p className="text-sm muted leading-relaxed">
          {closing?.name} still has {num(closing ? stockOf(closing) : 0)} units in stock. Send them to another location with Transfers, or
          correct them to zero, then close it.
        </p>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => setClosing(null)}>
            OK
          </button>
          <Link href="/inventory/transfers" className="btn btn-primary">
            Go to Transfers
          </Link>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!closing && stockOf(closing) === 0}
        onClose={() => setClosing(null)}
        title={`Close ${closing?.name ?? "this location"}?`}
        message={
          <>
            It leaves the location switcher, and nobody can sell or take stock in there. Its past sales and records stay, and you can open
            it again later. Logins based there move to {main?.name ?? "the main location"}.
          </>
        }
        confirmLabel="Close location"
        action={() => setLocationOpen(closing!.id, false)}
      />
      <ConfirmDialog
        open={!!reopening}
        onClose={() => setReopening(null)}
        title={`Open ${reopening?.name ?? "this location"} again?`}
        message="It comes back to the location switcher, ready for stock and sales."
        confirmLabel="Open again"
        danger={false}
        action={() => setLocationOpen(reopening!.id, true)}
      />
    </div>
  )
}

function LocationForm({ location, onClose }: { location: Location | null; onClose: () => void }) {
  const [kind, setKind] = useState<Location["kind"]>(location?.kind ?? "branch")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const input = { name: String(form.get("name") ?? ""), kind, address: String(form.get("address") ?? "") }
    setBusy(true)
    setError(null)
    const result = location ? await updateLocation(location.id, input) : await addLocation(input)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  const kinds: { key: Location["kind"]; label: string; hint: string; Icon: typeof MapPin }[] = [
    { key: "branch", label: "Branch", hint: "Sells to customers", Icon: Store },
    { key: "warehouse", label: "Warehouse", hint: "Only stores stock", Icon: Warehouse },
  ]

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Name</span>
        <input
          className="input"
          name="name"
          required
          maxLength={60}
          defaultValue={location?.name ?? ""}
          placeholder="e.g. Lipa branch"
          autoFocus
        />
      </label>
      <div>
        <span className="label">Kind</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind">
          {kinds.map(k => {
            const selected = kind === k.key
            const locked = !!location?.is_main && k.key === "warehouse"
            return (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => setKind(k.key)}
                className="text-left rounded-lg p-3 border transition-colors disabled:opacity-40"
                style={{
                  background: selected ? "var(--brand-soft)" : "var(--app-bg)",
                  borderColor: selected ? "var(--brand)" : "var(--app-border)",
                }}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <k.Icon size={14} aria-hidden /> {k.label}
                </span>
                <span className="block text-xs faint mt-0.5">{k.hint}</span>
              </button>
            )
          })}
        </div>
        {location?.is_main && <p className="hint mt-2">The main location sells, so it stays a branch.</p>}
      </div>
      <label>
        <span className="label">Address (optional)</span>
        <input className="input" name="address" maxLength={200} defaultValue={location?.address ?? ""} placeholder="Street, town" />
      </label>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : location ? "Save" : "Add location"}
        </button>
      </div>
    </form>
  )
}
