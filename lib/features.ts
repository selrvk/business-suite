// What each business uses: its modules, optional product details and custom
// product fields. Chosen at sign-up (from the business type) and changed in
// Settings → Features. Safe to import anywhere.
import { ALL_MODULES, config, type ModuleKey } from "./config"
import type { Business } from "./types"

export type BusinessType = "store" | "pharmacy" | "food" | "hardware" | "wholesale" | "other"
export type ProductOption = "suppliers" | "categories" | "locations" | "expiry"
export type CustomFieldType = "text" | "number" | "date"
export type CustomField = { id: string; label: string; type: CustomFieldType }

export const ALL_OPTIONS: ProductOption[] = ["suppliers", "categories", "locations", "expiry"]
export const MAX_CUSTOM_FIELDS = 5

export const OPTION_INFO: Record<ProductOption, { label: string; description: string }> = {
  suppliers: { label: "Suppliers", description: "Who you buy each product from, a supplier list, and reorder lists per supplier" },
  categories: { label: "Categories", description: "Group products, like Drinks, Canned goods or Medicine" },
  locations: { label: "Shelf / storage location", description: "Where each product is kept, like Shelf A2 or Warehouse" },
  expiry: { label: "Expiry dates", description: "Expiry date and lot number for each delivery, with warnings before they expire" },
}

export const BUSINESS_TYPES: { key: BusinessType; label: string; hint: string; modules: ModuleKey[]; options: ProductOption[] }[] = [
  {
    key: "store",
    label: "Store or sari-sari",
    hint: "Groceries, convenience, general goods",
    modules: ["inventory", "sales", "attendance"],
    options: ["suppliers", "categories"],
  },
  {
    key: "pharmacy",
    label: "Pharmacy or medical",
    hint: "Medicines, medical supplies",
    modules: ["inventory", "sales", "attendance"],
    options: ["suppliers", "categories", "locations", "expiry"],
  },
  {
    key: "food",
    label: "Food and drinks",
    hint: "Food products, bakeries, eateries",
    modules: ["inventory", "sales", "attendance"],
    options: ["suppliers", "categories", "expiry"],
  },
  {
    key: "hardware",
    label: "Hardware or construction",
    hint: "Tools, building materials, parts",
    modules: ["inventory", "sales", "attendance", "fleet"],
    options: ["suppliers", "categories", "locations"],
  },
  {
    key: "wholesale",
    label: "Distributor or wholesale",
    hint: "Supplies other businesses, makes deliveries",
    modules: ["inventory", "sales", "attendance", "fleet"],
    options: ["suppliers", "categories", "locations", "expiry"],
  },
  {
    key: "other",
    label: "Something else",
    hint: "Pick what you need",
    modules: ["inventory", "sales", "attendance"],
    options: ["suppliers"],
  },
]

/** Modules this site offers, in order. Selling needs products, so sales brings inventory. */
function normalizeModules(picked: readonly string[]): ModuleKey[] {
  const modules = config.modules.filter(m => picked.includes(m))
  if (modules.includes("sales") && !modules.includes("inventory") && config.modules.includes("inventory")) modules.unshift("inventory")
  return modules
}

/** The modules a business uses (all of them if it never chose). */
export function businessModules(business: Pick<Business, "modules">): ModuleKey[] {
  return normalizeModules(business.modules ?? ALL_MODULES)
}

export function hasOption(business: Pick<Business, "options">, option: ProductOption) {
  return (business.options ?? []).includes(option)
}

/** The business's custom product fields, ignoring anything malformed. */
export function customFields(business: Pick<Business, "custom_fields">): CustomField[] {
  if (!Array.isArray(business.custom_fields)) return []
  return business.custom_fields
    .filter(
      (f): f is CustomField =>
        !!f && typeof f.id === "string" && typeof f.label === "string" && ["text", "number", "date"].includes(f.type),
    )
    .slice(0, MAX_CUSTOM_FIELDS)
}

export type FeaturesInput = {
  businessType: string | null
  modules: string[]
  options: string[]
  customFields: { id?: string; label: string; type: string }[]
}

/** Checks and tidies features chosen in a form. Returns an error message instead if something's wrong. */
export function cleanFeatures(input: FeaturesInput):
  | { business_type: BusinessType | null; modules: ModuleKey[]; options: ProductOption[]; custom_fields: CustomField[] }
  | { error: string } {
  const type = BUSINESS_TYPES.find(t => t.key === input.businessType)?.key ?? null
  const modules = normalizeModules(Array.isArray(input.modules) ? input.modules : [])
  if (!modules.length) return { error: "Turn on at least one part of the suite." }
  const options = ALL_OPTIONS.filter(o => Array.isArray(input.options) && input.options.includes(o))

  const fields: CustomField[] = []
  const used = new Set<string>()
  for (const f of Array.isArray(input.customFields) ? input.customFields : []) {
    const label = String(f?.label ?? "").trim()
    if (!label) continue
    if (label.length > 40) return { error: `Custom field names can be up to 40 characters ("${label.slice(0, 20)}…").` }
    if (used.has(label.toLowerCase())) return { error: `There are two custom fields called "${label}".` }
    used.add(label.toLowerCase())
    const typeOk = ["text", "number", "date"].includes(f.type) ? (f.type as CustomFieldType) : "text"
    fields.push({ id: typeof f.id === "string" && /^f[0-9a-z]{1,12}$/.test(f.id) ? f.id : "", label, type: typeOk })
  }
  if (fields.length > MAX_CUSTOM_FIELDS) return { error: `Up to ${MAX_CUSTOM_FIELDS} custom fields.` }
  // New fields get ids that never collide with existing ones, so saved values stay attached.
  const taken = new Set(fields.map(f => f.id).filter(Boolean))
  for (const f of fields) {
    if (f.id) continue
    let n = 1
    while (taken.has(`f${n}`)) n++
    f.id = `f${n}`
    taken.add(f.id)
  }
  return { business_type: type, modules, options, custom_fields: fields }
}
