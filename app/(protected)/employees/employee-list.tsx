"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, Plus, Printer, RefreshCw, Trash2, UserCheck, UserX, Users } from "lucide-react"
import { generateCode } from "@/components/barcode"
import { ConfirmButton, Modal } from "@/components/modal"
import { Empty } from "@/components/page-header"
import { codeFieldProps } from "@/components/scan-input"
import type { Employee } from "@/lib/types"
import { deleteEmployee, saveEmployee, setEmployeeActive } from "./actions"

export function EmployeeList({ employees, isAdmin }: { employees: Employee[]; isAdmin: boolean }) {
  const [editing, setEditing] = useState<Employee | "new" | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const inactive = employees.filter(e => !e.active).length
  const shown = employees.filter(e => e.active || showInactive)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs faint">
          {employees.length - inactive} active
          {inactive > 0 && (
            <>
              {" · "}
              <button className="underline decoration-dotted" onClick={() => setShowInactive(s => !s)}>
                {showInactive ? "hide" : "show"} {inactive} inactive
              </button>
            </>
          )}
        </p>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus size={15} /> Add employee
          </button>
        )}
      </div>

      <div className="table-wrap">
        {shown.length === 0 ? (
          <Empty title="No employees yet" icon={<Users size={30} />}>
            {isAdmin ? "Add your staff and drivers to start tracking attendance and trips." : "Ask an admin to add employees."}
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Badge code</th>
                <th>Phone</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(e => (
                <tr key={e.id} style={{ opacity: e.active ? 1 : 0.5 }}>
                  <td className="font-medium text-white">{e.name}</td>
                  <td className="muted">{e.position ?? "—"}</td>
                  <td className="mono">{e.code}</td>
                  <td className="muted">{e.phone ?? "—"}</td>
                  <td>
                    <span className="pill" data-tone={e.active ? "good" : undefined}>
                      {e.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/print/labels/employees?ids=${e.id}`} target="_blank" className="btn btn-ghost btn-icon" title="Print badge">
                      <Printer size={14} />
                    </Link>
                    {isAdmin && (
                      <>
                        <button className="btn btn-ghost btn-icon" onClick={() => setEditing(e)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={() => setEmployeeActive(e.id, !e.active)}
                          title={e.active ? "Deactivate (keeps their history)" : "Reactivate"}
                        >
                          {e.active ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        <ConfirmButton
                          className="btn btn-ghost btn-icon"
                          title={`Delete ${e.name}?`}
                          message="This also deletes all of their attendance records. To keep their history, deactivate them instead."
                          confirmLabel="Delete everything"
                          action={() => deleteEmployee(e.id)}
                        >
                          <Trash2 size={14} />
                        </ConfirmButton>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add employee" : "Edit employee"}>
        {editing !== null && (
          <EmployeeForm key={editing === "new" ? "new" : editing.id} employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
        )}
      </Modal>
    </div>
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
        <p className="hint">Already have ID cards with barcodes? Click the box and scan theirs instead.</p>
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
