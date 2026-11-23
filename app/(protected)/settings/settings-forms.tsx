"use client"

import { useRef, useState } from "react"
import { Check, Copy, ImageUp, KeyRound, MapPin, MoreHorizontal, ShieldCheck, ShieldOff, SlidersHorizontal, Trash2, UserPlus } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { ConfirmDialog, Modal } from "@/components/modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDate } from "@/lib/format"
import { shrinkImage } from "@/lib/image"
import type { Business, Role } from "@/lib/types"
import { ALL_PERMISSIONS, PERMISSION_INFO, type Permission } from "@/lib/permissions"
import { addUser, changePassword, removeLogo, removeUser, resetPassword, setAdmin, setPermissions, updateBusiness, uploadLogo, type BusinessInput } from "./actions"
import { setHomeLocation } from "./location-actions"

/** Open locations, for choosing where a login works (null when the business has just one). */
export type LoginPlaces = { id: number; name: string; is_main: boolean }[] | null

function useStatus() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  return { busy, setBusy, status, setStatus }
}

function Status({ status }: { status: { ok: boolean; text: string } | null }) {
  if (!status) return null
  return <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>
}

export function BusinessForm({ business }: { business: Business }) {
  const { busy, setBusy, status, setStatus } = useStatus()
  const [name, setName] = useState(business.name)
  const [logo, setLogoUrl] = useState(business.logo_url ?? "")

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    const result = await updateBusiness({
      name,
      address: String(form.get("address")),
      contact: String(form.get("contact")),
      receipt_footer: String(form.get("receipt_footer")),
      receipt_note: String(form.get("receipt_note")),
      vat_registered: form.get("vat_registered") === "on",
      low_stock_threshold: Number(form.get("low_stock_threshold")),
      slug: String(form.get("slug")),
      digest: String(form.get("digest")) as BusinessInput["digest"],
    })
    setBusy(false)
    setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error })
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_200px]">
      <div className="flex flex-col gap-4">
        <Status status={status} />
        <label>
          <span className="label">Business name</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={80} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            <span className="label">Address</span>
            <input className="input" name="address" defaultValue={business.address ?? ""} placeholder="Shown on receipts" />
          </label>
          <label>
            <span className="label">Contact</span>
            <input className="input" name="contact" defaultValue={business.contact ?? ""} placeholder="Phone or email" />
          </label>
        </div>
        <label>
          <span className="label">Receipt footer</span>
          <input className="input" name="receipt_footer" defaultValue={business.receipt_footer ?? ""} placeholder="e.g. Thank you! No returns after 7 days." />
        </label>
        <label>
          <span className="label">Receipt notice</span>
          <input className="input" name="receipt_note" defaultValue={business.receipt_note ?? ""} maxLength={200} placeholder="This is not an official receipt." />
          <span className="hint">
            Printed in small text at the bottom. Official receipts need a BIR-registered system, so keep this unless yours is.
          </span>
        </label>
        <label>
          <span className="label">Staff login link</span>
          <span className="flex items-center gap-2">
            <span className="text-sm faint mono shrink-0">/s/</span>
            <input className="input mono" name="slug" defaultValue={business.slug} required minLength={2} maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </span>
          <span className="hint">Changing it changes the link your staff bookmark. Their usernames and passwords stay the same.</span>
        </label>
        <label className="check-row">
          <input type="checkbox" name="vat_registered" defaultChecked={!!business.vat_registered} />
          <span>
            <span className="block text-sm font-semibold text-white">VAT-registered</span>
            <span className="block text-xs faint">
              Senior Citizen and PWD sales of medicine and meals then also drop the 12% VAT before the 20% discount, as the law
              requires for VAT-registered businesses. Leave off if you&apos;re non-VAT.
            </span>
          </span>
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            <span className="label">Low-stock level</span>
            <input className="input" name="low_stock_threshold" type="number" min={0} defaultValue={business.low_stock_threshold} required />
            <span className="hint">Products at or below this count are flagged.</span>
          </label>
          <label>
            <span className="label">Summary email</span>
            <select className="input" name="digest" defaultValue={business.digest ?? "weekly"}>
              <option value="weekly">Every Monday morning</option>
              <option value="daily">Every morning</option>
              <option value="off">Off</option>
            </select>
            <span className="hint">Sales, profit, low stock and who owes you, sent to the owner&apos;s email.</span>
          </label>
        </div>
        <div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save business details"}
          </button>
        </div>
      </div>
      <LogoField name={name} logo={logo} onChange={setLogoUrl} />
    </form>
  )
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]

/** Logo preview with upload (click or drag a file onto it) and remove. Saves immediately. */
function LogoField({ name, logo, onChange }: { name: string; logo: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    if (!LOGO_TYPES.includes(file.type)) return setError("Use a PNG, JPG or WebP image.")
    if (file.size > 10 * 1024 * 1024) return setError("That image is over 10 MB. Try a smaller one.")
    setBusy(true)
    try {
      const image = await shrinkImage(file, 512)
      const form = new FormData()
      form.set("logo", image, `logo.${image.type === "image/webp" ? "webp" : "png"}`)
      const result = await uploadLogo(form)
      if (!result.ok) throw new Error(result.error)
      onChange(result.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    const result = await removeLogo()
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onChange("")
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl p-5 text-center border-2 border-dashed transition-colors"
      style={{ background: "var(--app-bg)", borderColor: dragging ? "var(--brand)" : "transparent" }}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) upload(file)
      }}
    >
      <BrandMark name={name || "?"} logoUrl={logo || null} size={64} />
      <p className="display text-xl text-white">{name || "Your business"}</p>
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_TYPES.join(",")}
        hidden
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) upload(file)
        }}
      />
      <div className="flex flex-wrap justify-center gap-1.5">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          <ImageUp size={13} /> {busy ? "Saving…" : logo ? "Change logo" : "Upload logo"}
        </button>
        {logo && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-bad">{error}</p> : <p className="text-[0.65rem] faint">PNG, JPG or WebP. Or drag it here.</p>}
    </div>
  )
}

export type UserRow = {
  user_id: string
  username: string
  role: Role
  created_at: string
  permissions: string[] | null
  /** Home branch (null: the main location). */
  location_id: number | null
}

export function Users({
  users,
  currentUserId,
  slug,
  staffLink,
  places = null,
}: {
  users: UserRow[]
  currentUserId: string
  slug: string
  staffLink: string
  places?: LoginPlaces
}) {
  const { busy, setBusy, status, setStatus } = useStatus()
  const [isAdmin, setIsAdmin] = useState(false)
  const [placing, setPlacing] = useState<UserRow | null>(null)
  const placeName = (id: number | null) => places?.find(l => l.id === id)?.name ?? places?.find(l => l.is_main)?.name ?? "the main location"
  const [resetting, setResetting] = useState<UserRow | null>(null)
  const [permitting, setPermitting] = useState<UserRow | null>(null)
  const [promoting, setPromoting] = useState<UserRow | null>(null)
  const [removing, setRemoving] = useState<UserRow | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setBusy(true)
    const at = String(form.get("location") ?? "")
    const result = await addUser({
      username: String(form.get("username")),
      password: String(form.get("password")),
      isAdmin,
      locationId: at ? Number(at) : null,
    })
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    const name = String(form.get("username")).trim().toLowerCase()
    setStatus({
      ok: true,
      text: `${name} can log in now: at ${staffLink} with the username "${name}", or on the main login page as "${name}@${slug}".${isAdmin ? "" : " They start as a cashier; use their menu (⋯) to allow more."}`,
    })
    formEl.reset()
    setIsAdmin(false)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="label">Add a login</p>
        <Status status={status} />
        <label>
          <span className="label">Username</span>
          <input className="input" name="username" required placeholder="e.g. jdelacruz" autoCapitalize="none" autoComplete="off" />
        </label>
        <label>
          <span className="label">Password</span>
          <input className="input" name="password" type="password" required minLength={8} placeholder="At least 8 characters" autoComplete="new-password" />
        </label>
        {places && (
          <label>
            <span className="label">{isAdmin ? "Starts at" : "Works at"}</span>
            <select className="input" name="location" defaultValue="">
              {places.map(l => (
                <option key={l.id} value={l.is_main ? "" : l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="check-row">
          <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
          <span>
            <span className="block text-sm font-semibold text-white">Admin</span>
            <span className="block text-xs faint">Can manage users, employees, vehicles and settings, delete records, and fix timesheets.</span>
          </span>
        </label>
        <button className="btn btn-primary self-start" disabled={busy}>
          <UserPlus size={14} /> {busy ? "Creating…" : "Add user"}
        </button>
        <p className="text-xs faint">
          Staff use their username at your staff login link (above). People who only clock in with a badge don&apos;t need a login;
          add them under Staff → Employees.
        </p>
      </form>

      <div>
        <p className="label">Current users</p>
        <div className="flex flex-col">
          {users.map(u => {
            const me = u.user_id === currentUserId
            const isAdmin = u.role !== "staff"
            return (
              <div key={u.user_id} className="list-row">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {u.username} {me && <span className="faint font-normal">(you)</span>}
                  </p>
                  <p className="text-xs faint">
                    Logs in as <span className="mono muted">{u.username}@{slug}</span> · since {formatDate(u.created_at)}
                  </p>
                  {places && (
                    <p className="text-[0.7rem] faint truncate">
                      {isAdmin ? "Starts at" : "Works at"} <span className="muted">{placeName(u.location_id)}</span>
                    </p>
                  )}
                  {u.role === "staff" && (
                    <p className="text-[0.7rem] faint truncate">
                      {u.permissions === null
                        ? "Can do everything staff can"
                        : u.permissions.length === 0
                          ? "Cashier: sells, stock in, time clock"
                          : `Also: ${u.permissions.map(p => PERMISSION_INFO[p as Permission]?.label.toLowerCase() ?? p).join(", ")}`}
                    </p>
                  )}
                </div>
                <span className="pill">{u.role === "owner" ? "Owner" : isAdmin ? "Admin" : "Staff"}</span>
                {!me && u.role !== "owner" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for ${u.username}`}>
                        <MoreHorizontal size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {u.role === "staff" && (
                        <DropdownMenuItem onSelect={() => setPermitting(u)}>
                          <SlidersHorizontal /> What they can do
                        </DropdownMenuItem>
                      )}
                      {places && (
                        <DropdownMenuItem onSelect={() => setPlacing(u)}>
                          <MapPin /> {isAdmin ? "Where they start" : "Where they work"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => setResetting(u)}>
                        <KeyRound /> Reset password
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPromoting(u)}>
                        {isAdmin ? <ShieldOff /> : <ShieldCheck />} {isAdmin ? "Make staff" : "Make admin"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(u)}>
                        <Trash2 /> Remove login
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Modal open={!!placing} onClose={() => setPlacing(null)} title={placing ? `Where ${placing.username} works` : "Branch"} width={420}>
        {placing && places && <PlaceForm key={placing.user_id} user={placing} places={places} onClose={() => setPlacing(null)} />}
      </Modal>
      <Modal open={!!resetting} onClose={() => setResetting(null)} title="Reset password" width={400}>
        {resetting && <ResetForm key={resetting.user_id} user={resetting} onClose={() => setResetting(null)} />}
      </Modal>
      <Modal open={!!permitting} onClose={() => setPermitting(null)} title={permitting ? `What ${permitting.username} can do` : "Permissions"} width={480}>
        {permitting && <PermissionsForm key={permitting.user_id} user={permitting} onClose={() => setPermitting(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!promoting}
        onClose={() => setPromoting(null)}
        title={promoting ? (promoting.role !== "staff" ? `Make ${promoting.username} staff?` : `Make ${promoting.username} an admin?`) : ""}
        message={promoting?.role !== "staff" ? "They'll lose admin powers." : "They'll be able to manage users, delete records and change settings."}
        confirmLabel={promoting?.role !== "staff" ? "Make staff" : "Make admin"}
        danger={promoting?.role !== "staff"}
        action={() => setAdmin(promoting!.user_id, promoting!.role === "staff")}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.username ?? "this login"}?`}
        message="They won't be able to log in anymore. Their past sales and records stay."
        confirmLabel="Remove"
        action={() => removeUser(removing!.user_id)}
      />
    </div>
  )
}

function PlaceForm({ user, places, onClose }: { user: UserRow; places: NonNullable<LoginPlaces>; onClose: () => void }) {
  const main = places.find(l => l.is_main)
  const [chosen, setChosen] = useState<number | null>(places.some(l => l.id === user.location_id && !l.is_main) ? user.location_id : null)
  const { busy, setBusy, status, setStatus } = useStatus()
  const staff = user.role === "staff"

  async function save() {
    setBusy(true)
    const result = await setHomeLocation(user.user_id, chosen)
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <Status status={status} />
      <p className="text-sm muted">
        {staff
          ? `${user.username} sells, takes stock in and closes the day only at this location.`
          : `${user.username} is an ${user.role}, so they can switch locations any time. This is where they start.`}
      </p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Location">
        {places.map(l => {
          const value = l.is_main ? null : l.id
          return (
            <label key={l.id} className="check-row">
              <input type="radio" name="place" checked={chosen === value} onChange={() => setChosen(value)} />
              <span className="text-sm font-semibold text-white">
                {l.name} {l.id === main?.id && <span className="faint font-normal">(main)</span>}
              </span>
            </label>
          )
        })}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}

function ResetForm({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { busy, setBusy, status, setStatus } = useStatus()
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const result = await resetPassword(user.user_id, String(new FormData(e.currentTarget).get("password")))
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    onClose()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm muted">
        Set a new password for <span className="text-white font-semibold">{user.username}</span>, then tell them what it is.
      </p>
      <Status status={status} />
      <input className="input" name="password" type="password" minLength={8} required autoFocus placeholder="New password" autoComplete="new-password" />
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Set password"}
        </button>
      </div>
    </form>
  )
}

export function PasswordForm() {
  const { busy, setBusy, status, setStatus } = useStatus()
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const password = String(form.get("password"))
    if (password !== String(form.get("confirm"))) return setStatus({ ok: false, text: "The two new passwords don't match." })
    setBusy(true)
    const result = await changePassword(String(form.get("current")), password)
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    setStatus({ ok: true, text: "Password updated. Any other devices using this login were logged out." })
    formEl.reset()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-sm">
      <Status status={status} />
      <input className="input" name="current" type="password" required placeholder="Current password" autoComplete="current-password" />
      <input className="input" name="password" type="password" minLength={8} required placeholder="New password" autoComplete="new-password" />
      <input className="input" name="confirm" type="password" minLength={8} required placeholder="Type it again" autoComplete="new-password" />
      <button className="btn btn-secondary self-start" disabled={busy}>
        <KeyRound size={14} /> {busy ? "Updating…" : "Change password"}
      </button>
    </form>
  )
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input className="input mono text-sm" value={url} readOnly onFocus={e => e.target.select()} />
      <button
        type="button"
        className="btn btn-secondary shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            // clipboard blocked; the box is selectable
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

/** Per-staff permissions, with quick presets. Everyone can sell, do Stock In and use the time clock. */
function PermissionsForm({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [chosen, setChosen] = useState<Permission[]>(user.permissions === null ? [...ALL_PERMISSIONS] : (user.permissions as Permission[]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (p: Permission) => setChosen(c => (c.includes(p) ? c.filter(x => x !== p) : [...c, p]))

  async function save() {
    setBusy(true)
    setError(null)
    const result = await setPermissions(user.user_id, chosen)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <p className="text-sm muted">Everyone can sell at Point of Sale (including Senior/PWD discounts), do Stock In and use the time clock.</p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChosen([])}>
          Cashier only
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChosen([...ALL_PERMISSIONS])}>
          Everything
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {ALL_PERMISSIONS.map(p => (
          <label key={p} className="check-row">
            <input type="checkbox" checked={chosen.includes(p)} onChange={() => toggle(p)} />
            <span>
              <span className="block text-sm font-semibold text-white">{PERMISSION_INFO[p].label}</span>
              <span className="block text-xs faint">{PERMISSION_INFO[p].description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}
