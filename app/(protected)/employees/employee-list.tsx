"use client"

import { useState } from "react"
import Link from "next/link"
import { MoreHorizontal, Pencil, Plus, Printer, RefreshCw, Trash2, UserCheck, UserX, Users } from "lucide-react"
import { generateCode } from "@/components/barcode"
import { ConfirmDialog, Modal } from "@/components/modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty } from "@/components/page-header"
import { codeFieldProps } from "@/components/scan-input"
import type { Employee } from "@/lib/types"
import { deleteEmployee, saveEmployee, setEmployeeActive } from "./actions"

export function EmployeeList({ employees, isAdmin }: { employees: Employee[]; isAdmin: boolean }) {
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [show, setShow] = useState<"active" | "inactive">("active")
  const active = employees.filter(e => e.active)
  const inactive = employees.filter(e => !e.active)
  const shown = show === "inactive" ? inactive : active

  /** Tapping a name opens the edit form, for those who may edit. */
  const nameOf = (e: Employee, className = "") =>
    isAdmin ? (
      <button type="button" className={`product-name ${className}`} onClick={() => setEditing(e)}>
        {e.name}
      </button>
    ) : (
      <p className={`font-medium text-white ${className}`}>{e.name}</p>
    )

  const menu = (e: Employee) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for ${e.name}`}>
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/print/labels/employees?ids=${e.id}`} target="_blank">
            <Printer /> Print badge
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuItem onSelect={() => setEditing(e)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEmployeeActive(e.id, !e.active)}>
              {e.active ? <UserX /> : <UserCheck />} {e.active ? "Mark inactive" : "Mark active"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (employees.length === 0) {
    return (
      <div className="card">
        <Empty title="No employees yet" icon={<Users size={30} />}>
          {isAdmin ? "Add your staff and drivers to start tracking attendance and trips." : "Ask an admin to add employees."}
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {inactive.length > 0 && (
        <div className="segmented self-start" role="group" aria-label="Show">
          {(
            [
              ["active", "Active", active.length],
              ["inactive", "Inactive", inactive.length],
            ] as const
          ).map(([key, label, n]) => (
            <button key={key} type="button" data-active={show === key} aria-pressed={show === key} onClick={() => setShow(key)}>
              {label}
              <span className="seg-count">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table on wide screens */}
      <div className="table-wrap hidden lg:block">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Badge code</th>
              <th>Phone</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(e => (
              <tr key={e.id}>
                <td>
                  {nameOf(e)}
                  {e.position && <p className="text-[0.72rem] faint">{e.position}</p>}
                </td>
                <td className="mono muted">{e.code}</td>
                <td className="muted">{e.phone ?? <span className="faint">—</span>}</td>
                <td className="w-12">{menu(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="empty">Nobody here.</p>}
      </div>

      {/* List on phones and tablets */}
      <div className="lg:hidden card divide-y divide-white/5">
        {shown.map(e => (
          <div key={e.id} className="flex items-center gap-3 pl-4 pr-1 py-3">
            <div className="min-w-0 flex-1">
              {nameOf(e, "block max-w-full truncate text-left")}
              <p className="text-xs faint truncate">
                {[e.position, e.phone].filter(Boolean).join(" · ")}
                {(e.position || e.phone) && " · "}
                <span className="mono">{e.code}</span>
              </p>
            </div>
            {menu(e)}
          </div>
        ))}
        {shown.length === 0 && <p className="empty">Nobody here.</p>}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit employee">
        {editing !== null && <EmployeeForm key={editing.id} employee={editing} onClose={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "employee"}?`}
        message="This also deletes all of their attendance records. To keep their history, mark them inactive instead."
        confirmLabel="Delete everything"
        action={() => deleteEmployee(deleting!.id)}
      />
    </div>
  )
}

/** Header button that opens the add-employee form (owners and admins). */
export function AddEmployeeButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden /> Add employee
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add employee">
        {open && <EmployeeForm employee={null} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  )
}

function EmployeeForm({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const [code, setCode] = useState(() => employee?.code ?? generateCode("EMP"))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const result = await saveEmployee(employee?.id ?? null, {
      name: String(form.get("name")),
      position: String(form.get("position")),
      phone: String(form.get("phone")),
      code,
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Full name *</span>
        <input className="input" name="name" defaultValue={employee?.name} required autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Position</span>
          <input className="input" name="position" defaultValue={employee?.position ?? ""} placeholder="e.g. Driver, Cashier" />
        </label>
        <label>
          <span className="label">Phone</span>
          <input className="input" name="phone" defaultValue={employee?.phone ?? ""} />
        </label>
      </div>
      <div>
        <span className="label">Badge code *</span>
        <div className="flex gap-2">
          <input className="input mono" value={code} onChange={e => setCode(e.target.value)} {...codeFieldProps} required />
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => setCode(generateCode("EMP"))} title="New random code">
            <RefreshCw size={14} />
          </button>
        </div>
        <p className="hint">
          Already have ID cards with barcodes? Click the box and scan theirs instead. Using a fingerprint or face scanner? Enter their number on
          the scanner.
        </p>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}
