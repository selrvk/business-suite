"use client"

import { Check } from "lucide-react"
import { MODULE_INFO, config, type ModuleKey } from "@/lib/config"
import { ALL_OPTIONS, BUSINESS_TYPES, OPTION_INFO, type BusinessType, type ProductOption } from "@/lib/features"

export type FeaturesValue = { businessType: BusinessType | null; modules: ModuleKey[]; options: ProductOption[] }

/** The suggested features for a business type. */
export function presetFor(type: BusinessType): FeaturesValue {
  const preset = BUSINESS_TYPES.find(t => t.key === type)!
  return { businessType: type, modules: preset.modules.filter(m => config.modules.includes(m)), options: [...preset.options] }
}

/** Cards for choosing the kind of business. Choosing one applies its suggested features. */
export function BusinessTypePicker({ value, onChange }: { value: BusinessType | null; onChange: (type: BusinessType) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Kind of business">
      {BUSINESS_TYPES.map(t => {
        const selected = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.key)}
            className="text-left rounded-lg p-3 border transition-colors"
            style={{
              background: selected ? "var(--brand-soft)" : "var(--app-bg)",
              borderColor: selected ? "var(--brand)" : "var(--app-border)",
            }}
          >
            <span className="block text-sm font-semibold text-white">{t.label}</span>
            <span className="block text-xs faint mt-0.5">{t.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ on, disabled, label, description, onClick }: { on: boolean; disabled?: boolean; label: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg p-3 text-left border transition-colors disabled:opacity-40"
      style={{ background: "var(--app-bg)", borderColor: on ? "var(--brand-line)" : "var(--app-border)" }}
    >
      <span
        className="mt-0.5 w-5 h-5 shrink-0 rounded-md flex items-center justify-center border"
        style={{ background: on ? "var(--brand)" : "transparent", borderColor: on ? "var(--brand)" : "var(--app-border)" }}
      >
        {on && <Check size={13} color="#fff" strokeWidth={3} />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block text-xs faint">{description}</span>
      </span>
    </button>
  )
}

/** On/off switches for modules and optional product details. */
export function FeatureToggles({ value, onChange }: { value: FeaturesValue; onChange: (value: FeaturesValue) => void }) {
  const inventory = value.modules.includes("inventory")

  function toggleModule(m: ModuleKey) {
    let modules = value.modules.includes(m) ? value.modules.filter(x => x !== m) : [...value.modules, m]
    // Selling needs products: turning sales on brings inventory; turning inventory off drops sales.
    if (m === "sales" && modules.includes("sales") && !modules.includes("inventory")) modules.push("inventory")
    if (m === "inventory" && !modules.includes("inventory")) modules = modules.filter(x => x !== "sales")
    onChange({ ...value, modules: config.modules.filter(x => modules.includes(x)) })
  }

  function toggleOption(o: ProductOption) {
    const options = value.options.includes(o) ? value.options.filter(x => x !== o) : [...value.options, o]
    onChange({ ...value, options: ALL_OPTIONS.filter(x => options.includes(x)) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="label">Parts of the suite</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {config.modules.map(m => (
            <Toggle key={m} on={value.modules.includes(m)} label={MODULE_INFO[m].label} description={MODULE_INFO[m].description} onClick={() => toggleModule(m)} />
          ))}
        </div>
      </div>
      <div>
        <p className="label">Product details</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {ALL_OPTIONS.map(o => (
            <Toggle
              key={o}
              on={inventory && value.options.includes(o)}
              disabled={!inventory}
              label={OPTION_INFO[o].label}
              description={OPTION_INFO[o].description}
              onClick={() => toggleOption(o)}
            />
          ))}
        </div>
        {!inventory && <p className="hint mt-2">Product details need Inventory turned on.</p>}
      </div>
    </div>
  )
}
