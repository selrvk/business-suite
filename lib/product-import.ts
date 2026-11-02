/**
 * Product import from Excel or CSV: finding the columns, reading and checking
 * each row, and working out what will happen to it. The import page uses this
 * for its preview, and the server checks the rows again before saving. The
 * matching rules mirror import_items() in supabase/schema.sql.
 */
import type { CustomField, ProductOption } from "./features"
import { money, num } from "./format"
import type { Item } from "./types"

export const MAX_IMPORT_ROWS = 5000

type BaseField =
  | "name"
  | "barcode"
  | "brand"
  | "unit"
  | "stock"
  | "price_buy"
  | "price_sell"
  | "supplier"
  | "category"
  | "location"
  | "reorder_level"
  | "senior_discount"
  | "expires_on"
  | "lot"
/** A product field a column can fill. Custom fields are "extra:<field id>". */
export type ImportField = BaseField | `extra:${string}`

const BASE_FIELDS: { key: BaseField; label: string; option?: ProductOption }[] = [
  { key: "name", label: "Name (required)" },
  { key: "barcode", label: "Barcode" },
  { key: "brand", label: "Brand" },
  { key: "unit", label: "Unit (pieces, boxes…)" },
  { key: "stock", label: "Stock" },
  { key: "price_buy", label: "Cost (what you pay)" },
  { key: "price_sell", label: "Price (what you charge)" },
  { key: "supplier", label: "Supplier", option: "suppliers" },
  { key: "category", label: "Category", option: "categories" },
  { key: "location", label: "Shelf / location", option: "locations" },
  { key: "reorder_level", label: "Low-stock level" },
  { key: "senior_discount", label: "Senior/PWD discount (20, 5 or 0)" },
  { key: "expires_on", label: "Expiry date", option: "expiry" },
  { key: "lot", label: "Lot / batch no.", option: "expiry" },
]

/** The fields this business can import into: the basics, the details it turned on, and its custom fields. */
export function importFields(options: readonly string[], customFields: CustomField[]): { key: ImportField; label: string }[] {
  return [
    ...BASE_FIELDS.filter(f => !f.option || options.includes(f.option)).map(({ key, label }) => ({ key, label }) as { key: ImportField; label: string }),
    ...customFields.map(f => ({ key: `extra:${f.id}` as ImportField, label: f.label })),
  ]
}

/** Column names people use for each field, compared without spaces, symbols or case. */
const COLUMN_NAMES: Record<BaseField, string[]> = {
  name: ["name", "product", "productname", "item", "itemname", "description", "itemdescription", "pangalan"],
  barcode: ["barcode", "barcodes", "code", "sku", "upc", "ean", "itemcode", "productcode", "barcodenumber"],
  brand: ["brand", "maker", "manufacturer", "tatak"],
  unit: ["unit", "units", "uom", "unitofmeasure"],
  stock: ["stock", "qty", "quantity", "onhand", "instock", "currentstock", "stockonhand", "count", "inventory", "dami"],
  price_buy: ["cost", "buyingprice", "buyprice", "purchaseprice", "unitcost", "pricebuy", "costprice", "capital", "puhunan"],
  price_sell: ["price", "sellingprice", "sellprice", "srp", "retailprice", "unitprice", "pricesell", "presyo"],
  supplier: ["supplier", "suppliername", "vendor", "distributor", "suppliervendor"],
  category: ["category", "categories", "group", "department", "kategorya"],
  location: ["location", "shelf", "shelflocation", "bin", "aisle", "rack", "storage", "storagelocation", "warehouse", "lugar"],
  reorder_level: ["lowstocklevel", "reorderlevel", "reorderpoint", "minstock", "minimumstock", "minimum", "safetystock"],
  senior_discount: ["seniordiscount", "seniorpwd", "seniorpwddiscount", "scdiscount", "scpwd", "scpwddiscount", "seniorcitizendiscount", "pwddiscount", "scrate"],
  expires_on: ["expiry", "expirydate", "expiration", "expirationdate", "exp", "expdate", "bestbefore", "useby", "nearestexpiry"],
  lot: ["lot", "lotno", "lotnumber", "batch", "batchno", "batchnumber"],
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const nameKey = (s: string) => s.trim().toLowerCase()
const round2 = (n: number) => Math.round(n * 100) / 100

/** Which field a column header means, among the fields offered. */
export function guessField(header: string, offered: { key: ImportField; label: string }[]): ImportField | null {
  const h = squash(header)
  if (!h) return null
  const custom = offered.find(f => f.key.startsWith("extra:") && squash(f.label) === h)
  if (custom) return custom.key
  for (const f of offered) {
    if (!f.key.startsWith("extra:") && COLUMN_NAMES[f.key as BaseField].includes(h)) return f.key
  }
  return null
}

/**
 * Finds the header row (the first of the top 10 rows with a name-like column,
 * so a title row above it is skipped) and guesses what each column holds.
 */
export function findHeader(cells: unknown[][], offered: { key: ImportField; label: string }[]) {
  const top = cells.slice(0, 10)
  let index = top.findIndex(row => row.some(c => guessField(text(c), offered) === "name"))
  if (index < 0) index = Math.max(0, top.findIndex(row => row.filter(c => text(c)).length >= 2))
  const headers = (cells[index] ?? []).map(text)
  const taken = new Set<ImportField>()
  const mapping = headers.map(h => {
    const field = guessField(h, offered)
    if (!field || taken.has(field)) return null
    taken.add(field)
    return field
  })
  return { index, headers, mapping }
}

/** A cell as text. Whole numbers keep all their digits (barcodes saved as numbers in Excel). */
export function text(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return Number.isInteger(value) ? value.toFixed(0) : String(value)
  return String(value).trim()
}

/** A cell as a number: accepts "₱1,234.50", "P65", "1 200". Empty is null; anything else is "bad". */
function toNumber(value: unknown): number | null | "bad" {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : "bad"
  const s = String(value).trim().replace(/^(php|p|₱)\s*/i, "").replace(/[₱,\s]/g, "")
  if (s === "" || s === "-") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : "bad"
}

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}

/**
 * A cell as a date (YYYY-MM-DD). Accepts Excel dates, 2027-06-30, 6/30/2027
 * (month first, as written in the Philippines; 30/6/2027 works too), and
 * "Jun 30, 2027". Empty is null; anything else is "bad".
 */
export function toDate(value: unknown): string | null | "bad" {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") {
    // Excel stores dates as days since 1899-12-30.
    if (value < 20000 || value > 80000) return "bad"
    const d = new Date(Math.round((value - 25569) * 86_400_000))
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) ?? "bad"
  }
  const s = String(value).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return ymd(+m[1], +m[2], +m[3]) ?? "bad"
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]]
    return (a > 12 ? ymd(y, b, a) : ymd(y, a, b)) ?? "bad"
  }
  const parsed = new Date(s)
  if (/[a-z]/i.test(s) && !Number.isNaN(parsed.getTime())) return ymd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()) ?? "bad"
  return "bad"
}

export type ImportRow = {
  /** The row number in the spreadsheet, for messages. */
  line: number
  name: string
  barcode: string | null
  brand: string | null
  unit: string | null
  stock: number | null
  price_buy: number | null
  price_sell: number | null
  supplier: string | null
  category: string | null
  location: string | null
  reorder_level: number | null
  /** Senior/PWD discount: 20, 5 or 0; null = leave as is. */
  senior_discount: number | null
  /** Custom field values by field id; only filled-in cells. */
  extra: Record<string, string | number>
  expires_on: string | null
  lot: string | null
}

/** What's wrong with a row on its own, or null. */
export function rowProblem(row: ImportRow): string | null {
  if (!row.name) return "No name"
  if (row.name.length > 200) return "Name is too long"
  if (row.barcode && row.barcode.length > 64) return "Barcode is too long"
  if (row.brand && row.brand.length > 100) return "Brand is too long"
  if (row.unit && row.unit.length > 30) return "Unit is too long"
  if (row.supplier && row.supplier.length > 120) return "Supplier name is too long"
  if (row.category && row.category.length > 60) return "Category is too long"
  if (row.location && row.location.length > 60) return "Location is too long"
  if (row.lot && row.lot.length > 60) return "Lot number is too long"
  if (row.stock !== null && (!Number.isInteger(row.stock) || row.stock < 0 || row.stock > 1e9))
    return "Stock must be a whole number, zero or more"
  if (row.reorder_level !== null && (!Number.isInteger(row.reorder_level) || row.reorder_level < 0 || row.reorder_level > 1e9))
    return "Low-stock level must be a whole number, zero or more"
  if (row.senior_discount !== null && ![0, 5, 20].includes(row.senior_discount)) return "Senior/PWD discount must be 20, 5 or 0"
  if (row.price_buy !== null && (row.price_buy < 0 || row.price_buy > 1e9)) return "Cost must be zero or more"
  if (row.price_sell !== null && (row.price_sell < 0 || row.price_sell > 1e9)) return "Price must be zero or more"
  if (row.expires_on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(row.expires_on)) return "Expiry isn't a date"
  for (const v of Object.values(row.extra)) if (typeof v === "string" && v.length > 200) return "A custom field is too long"
  return null
}

export type ReadRow = { row: ImportRow; problem: string | null }

/** Reads the rows under the header with the chosen columns. Blank rows are skipped. */
export function readRows(
  cells: unknown[][],
  headerIndex: number,
  mapping: (ImportField | null)[],
  customFields: CustomField[],
  firstLine = 1,
): ReadRow[] {
  const columnOf = (field: ImportField) => mapping.indexOf(field)
  const cell = (r: unknown[], field: ImportField) => (columnOf(field) < 0 ? null : r[columnOf(field)])
  const out: ReadRow[] = []

  for (let i = headerIndex + 1; i < cells.length; i++) {
    const r = cells[i] ?? []
    if (!r.some(c => text(c))) continue
    const problems: string[] = []
    const number = (field: ImportField, label: string) => {
      const value = toNumber(cell(r, field))
      if (value === "bad") {
        problems.push(`${label} isn't a number`)
        return null
      }
      return value
    }
    const date = (field: ImportField, label: string) => {
      const value = toDate(cell(r, field))
      if (value === "bad") {
        problems.push(`${label} isn't a date`)
        return null
      }
      return value
    }
    // "20%", "5", "none" and the like.
    const seniorCell = text(cell(r, "senior_discount")).toLowerCase().replace(/[%\s]/g, "")
    const senior = !seniorCell ? null : ["none", "no", "n/a", "na", "-", "wala"].includes(seniorCell) ? 0 : Number(seniorCell)
    if (senior !== null && !Number.isFinite(senior)) problems.push("Senior/PWD discount must be 20, 5 or 0")
    const buy = number("price_buy", "Cost")
    const sell = number("price_sell", "Price")
    const extra: Record<string, string | number> = {}
    for (const f of customFields) {
      const key = `extra:${f.id}` as ImportField
      if (columnOf(key) < 0) continue
      const value = f.type === "number" ? number(key, f.label) : f.type === "date" ? date(key, f.label) : text(cell(r, key)) || null
      if (value !== null) extra[f.id] = value
    }
    const row: ImportRow = {
      line: firstLine + i,
      name: text(cell(r, "name")),
      barcode: text(cell(r, "barcode")) || null,
      brand: text(cell(r, "brand")) || null,
      unit: text(cell(r, "unit")).toLowerCase() || null,
      stock: number("stock", "Stock"),
      price_buy: buy === null ? null : round2(buy),
      price_sell: sell === null ? null : round2(sell),
      supplier: text(cell(r, "supplier")) || null,
      category: text(cell(r, "category")) || null,
      location: text(cell(r, "location")) || null,
      reorder_level: number("reorder_level", "Low-stock level"),
      senior_discount: senior !== null && Number.isFinite(senior) ? senior : null,
      extra,
      expires_on: date("expires_on", "Expiry"),
      lot: text(cell(r, "lot")) || null,
    }
    out.push({ row, problem: problems[0] ?? rowProblem(row) })
  }
  return out
}

/** Rows that clash with another row in the same file, by their index. */
export function duplicateProblems(rows: ImportRow[]) {
  const problems = new Map<number, string>()
  const byBarcode = new Map<string, number[]>()
  const byName = new Map<string, number[]>()
  rows.forEach((r, i) => {
    if (r.barcode) byBarcode.set(r.barcode, [...(byBarcode.get(r.barcode) ?? []), i])
    byName.set(nameKey(r.name), [...(byName.get(nameKey(r.name)) ?? []), i])
  })
  for (const [code, list] of byBarcode) {
    if (list.length < 2) continue
    for (const i of list) problems.set(i, `Barcode ${code} is on rows ${list.map(j => rows[j].line).join(", ")}`)
  }
  rows.forEach((r, i) => {
    const same = byName.get(nameKey(r.name)) ?? []
    if (!r.barcode && same.length > 1 && !problems.has(i)) {
      problems.set(i, `"${r.name}" is on rows ${same.map(j => rows[j].line).join(", ")}. Add barcodes or remove the extra row.`)
    }
  })
  return problems
}

export type RowPlan =
  | { kind: "new" }
  | { kind: "update"; changes: string[] }
  | { kind: "same" }
  | { kind: "problem"; problem: string }

/** What importing each row will do, given the products already saved. */
export function planRows(
  rows: ReadRow[],
  items: Item[],
  setStock: boolean,
  context: { suppliers: Record<number, string>; customFields: CustomField[] } = { suppliers: {}, customFields: [] },
): RowPlan[] {
  const byBarcode = new Map(items.filter(i => i.barcode).map(i => [i.barcode as string, i]))
  const byName = new Map<string, Item[]>()
  for (const item of items) byName.set(nameKey(item.name), [...(byName.get(nameKey(item.name)) ?? []), item])
  const clashes = duplicateProblems(rows.map(r => r.row))
  const matchedBy = new Map<number, number>() // product id → row line

  return rows.map(({ row, problem }, i): RowPlan => {
    const issue = problem ?? clashes.get(i)
    if (issue) return { kind: "problem", problem: issue }

    let item: Item | undefined
    const sameName = byName.get(nameKey(row.name)) ?? []
    if (row.barcode) {
      item = byBarcode.get(row.barcode)
      if (!item) {
        const withoutBarcode = sameName.filter(p => !p.barcode)
        if (withoutBarcode.length === 1) item = withoutBarcode[0]
      }
    } else {
      if (sameName.length > 1) return { kind: "problem", problem: `${sameName.length} saved products are named "${row.name}". Add the barcode to say which one.` }
      item = sameName[0]
    }
    if (!item) return { kind: "new" }

    const earlier = matchedBy.get(item.id)
    if (earlier !== undefined) return { kind: "problem", problem: `Same product as row ${earlier}` }
    matchedBy.set(item.id, row.line)

    const changes: string[] = []
    const changed = (label: string, from: string | null | undefined, to: string | null) => {
      if (to !== null && to !== (from ?? "")) changes.push(`${label} ${from || "—"} → ${to}`)
    }
    if (row.barcode && !item.barcode) changes.push(`adds barcode ${row.barcode}`)
    if (row.name !== item.name) changes.push(`name was "${item.name}"`)
    changed("brand", item.brand, row.brand)
    changed("unit", item.unit, row.unit)
    if (row.price_buy !== null && row.price_buy !== round2(Number(item.price_buy)))
      changes.push(`cost ${money(item.price_buy)} → ${money(row.price_buy)}`)
    if (row.price_sell !== null && row.price_sell !== round2(Number(item.price_sell)))
      changes.push(`price ${money(item.price_sell)} → ${money(row.price_sell)}`)
    if (setStock && row.stock !== null && row.stock !== item.current_stock)
      changes.push(`stock ${num(item.current_stock)} → ${num(row.stock)}`)
    const supplierNow = item.supplier_id ? (context.suppliers[item.supplier_id] ?? "") : ""
    if (row.supplier && nameKey(row.supplier) !== nameKey(supplierNow)) changes.push(`supplier ${supplierNow || "—"} → ${row.supplier}`)
    changed("category", item.category, row.category)
    changed("shelf", item.location, row.location)
    if (row.reorder_level !== null && row.reorder_level !== item.reorder_level)
      changes.push(`low-stock level ${item.reorder_level ?? "default"} → ${row.reorder_level}`)
    if (row.senior_discount !== null && row.senior_discount !== (item.senior_discount ?? null))
      changes.push(`Senior/PWD ${item.senior_discount == null ? "default" : `${item.senior_discount}%`} → ${row.senior_discount}%`)
    for (const f of context.customFields) {
      const to = row.extra[f.id]
      const from = item.extra?.[f.id]
      if (to !== undefined && String(to) !== String(from ?? "")) changes.push(`${f.label} → ${to}`)
    }
    return changes.length ? { kind: "update", changes } : { kind: "same" }
  })
}

/** Checks a row sent from the browser has the right shape, and tidies it. Null if it doesn't. */
export function cleanImportRow(value: unknown): ImportRow | null {
  if (!value || typeof value !== "object") return null
  const o = value as Record<string, unknown>
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : x === null || x === undefined ? null : undefined)
  const numb = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : x === null || x === undefined ? null : undefined)
  const fields = {
    name: str(o.name),
    barcode: str(o.barcode),
    brand: str(o.brand),
    unit: str(o.unit),
    supplier: str(o.supplier),
    category: str(o.category),
    location: str(o.location),
    expires_on: str(o.expires_on),
    lot: str(o.lot),
  }
  const numbers = {
    stock: numb(o.stock),
    price_buy: numb(o.price_buy),
    price_sell: numb(o.price_sell),
    reorder_level: numb(o.reorder_level),
    senior_discount: numb(o.senior_discount),
  }
  if (typeof o.line !== "number" || typeof fields.name !== "string") return null
  if ([...Object.values(fields), ...Object.values(numbers)].some(v => v === undefined)) return null

  const extra: Record<string, string | number> = {}
  if (o.extra !== undefined && o.extra !== null) {
    if (typeof o.extra !== "object" || Array.isArray(o.extra)) return null
    for (const [k, v] of Object.entries(o.extra as Record<string, unknown>)) {
      if (!/^f[0-9a-z]{1,12}$/.test(k)) return null
      if (typeof v === "number" && Number.isFinite(v)) extra[k] = v
      else if (typeof v === "string") extra[k] = v.trim()
      else return null
    }
  }
  return {
    line: o.line,
    name: fields.name,
    barcode: fields.barcode || null,
    brand: fields.brand || null,
    unit: fields.unit ? fields.unit.toLowerCase() : null,
    stock: numbers.stock ?? null,
    price_buy: numbers.price_buy == null ? null : round2(numbers.price_buy),
    price_sell: numbers.price_sell == null ? null : round2(numbers.price_sell),
    supplier: fields.supplier || null,
    category: fields.category || null,
    location: fields.location || null,
    reorder_level: numbers.reorder_level ?? null,
    senior_discount: numbers.senior_discount ?? null,
    extra,
    expires_on: fields.expires_on || null,
    lot: fields.lot || null,
  }
}
