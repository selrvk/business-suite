"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { BusinessTypePicker, FeatureToggles, presetFor, type FeaturesValue } from "@/components/features-picker"
import { MAX_CUSTOM_FIELDS, type CustomField, type CustomFieldType } from "@/lib/features"
import { updateFeatures } from "./actions"

type FieldRow = { id?: string; label: string; type: CustomFieldType }

/** Settings → Features: business type, modules, product details and custom product fields. */
export function FeaturesForm({ initial, initialFields }: { initial: FeaturesValue; initialFields: CustomField[] }) {
  const [value, setValue] = useState<FeaturesValue>(initial)
  const [fields, setFields] = useState<FieldRow[]>(initialFields)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setBusy(true)
    setStatus(null)
    const result = await updateFeatures({ businessType: value.businessType, modules: value.modules, options: value.options, customFields: fields })
    setBusy(false)
    setStatus(result.ok ? { ok: true, text: "Saved. The menu and product forms now match." } : { ok: false, text: result.error })
  }

  const setField = (i: number, patch: Partial<FieldRow>) => setFields(f => f.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  return (
    <div className="flex flex-col gap-5">
      {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
      <div>
        <p className="label">Kind of business</p>
        <BusinessTypePicker
          value={value.businessType}
          onChange={type => {
            setValue(presetFor(type))
            setStatus({ ok: true, text: "Suggested features for this kind of business are selected below. Adjust them, then save." })
          }}
        />
      </div>

      <FeatureToggles value={value} onChange={setValue} />

      <div>
        <p className="label">Your own product fields</p>
        <p className="hint mb-2">
          Extra details you want on every product, like Generic name, Dosage, Size or Color. Up to {MAX_CUSTOM_FIELDS}.
        </p>
        <div className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <div key={f.id ?? `new-${i}`} className="flex gap-2">
              <input className="input" value={f.label} maxLength={40} placeholder="Field name, e.g. Generic name" onChange={e => setField(i, { label: e.target.value })} />
              <select className="input w-32 shrink-0" value={f.type} onChange={e => setField(i, { type: e.target.value as CustomFieldType })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </select>
              <button type="button" className="btn btn-ghost shrink-0" aria-label={`Remove ${f.label || "field"}`} onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {fields.length < MAX_CUSTOM_FIELDS && (
            <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setFields(f => [...f, { label: "", type: "text" }])}>
              <Plus size={13} /> Add a field
            </button>
          )}
        </div>
        {fields.length < initialFields.length && <p className="hint mt-2">Removed fields are hidden; values already typed in are kept in case you add them back.</p>}
      </div>

      <button type="button" className="btn btn-primary self-start" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save features"}
      </button>
    </div>
  )
}
