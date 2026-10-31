/**
 * Product import from Excel or CSV: finding the columns, reading and checking
 * each row, and working out what will happen to it. The import page uses this
 * for its preview, and the server checks the rows again before saving. The
 * matching rules mirror import_items() in supabase/schema.sql.
 */
import { money, num } from "./format"
import type { Item } from "./types"

export const MAX_IMPORT_ROWS = 5000

export type ImportField = "name" | "barcode" | "brand" | "unit" | "stock" | "price_buy" | "price_sell"

export const IMPORT_FIELDS: { key: ImportField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "barcode", label: "Barcode" },
  { key: "brand", label: "Brand" },
  { key: "unit", label: "Unit" },
  { key: "stock", label: "Stock" },
  { key: "price_buy", label: "Cost" },
  { key: "price_sell", label: "Price" },
]

/** Column names people use for each field, compared without spaces, symbols or case. */
const COLUMN_NAMES: Record<ImportField, string[]> = {
  name: ["name", "product", "productname", "item", "itemname", "description", "itemdescription", "pangalan"],
  barcode: ["barcode", "barcodes", "code", "sku", "upc", "ean", "itemcode", "productcode", "barcodenumber"],
  brand: ["brand", "maker", "manufacturer", "tatak"],
  unit: ["unit", "units", "uom", "unitofmeasure"],
  stock: ["stock", "qty", "quantity", "onhand", "instock", "currentstock", "stockonhand", "count", "inventory", "dami"],
  price_buy: ["cost", "buyingprice", "buyprice", "purchaseprice", "unitcost", "pricebuy", "costprice", "capital", "puhunan"],
  price_sell: ["price", "sellingprice", "sellprice", "srp", "retailprice", "unitprice", "pricesell", "presyo"],
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const nameKey = (s: string) => s.trim().toLowerCase()
const round2 = (n: number) => Math.round(n * 100) / 100

export function guessField(header: string): ImportField | null {
  const h = squash(header)
  if (!h) return null
  for (const [field, names] of Object.entries(COLUMN_NAMES)) if (names.includes(h)) return field as ImportField
  return null
}

/**
 * Finds the header row (the first of the top 10 rows with a name-like column,
 * so a title row above it is skipped) and guesses what each column holds.
 */
export function findHeader(cells: unknown[][]) {
  const top = cells.slice(0, 10)
  let index = top.findIndex(row => row.some(c => guessField(text(c)) === "name"))
  if (index < 0) index = Math.max(0, top.findIndex(row => row.filter(c => text(c)).length >= 2))
  const headers = (cells[index] ?? []).map(text)
  const taken = new Set<ImportField>()
  const mapping = headers.map(h => {
    const field = guessField(h)
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
}

/** What's wrong with a row on its own, or null. */
export function rowProblem(row: ImportRow): string | null {
  if (!row.name) return "No name"
  if (row.name.length > 200) return "Name is too long"
  if (row.barcode && row.barcode.length > 64) return "Barcode is too long"
  if (row.brand && row.brand.length > 100) return "Brand is too long"
  if (row.unit && row.unit.length > 30) return "Unit is too long"
  if (row.stock !== null && (!Number.isInteger(row.stock) || row.stock < 0 || row.stock > 1e9))
    return "Stock must be a whole number, zero or more"
  if (row.price_buy !== null && (row.price_buy < 0 || row.price_buy > 1e9)) return "Cost must be zero or more"
  if (row.price_sell !== null && (row.price_sell < 0 || row.price_sell > 1e9)) return "Price must be zero or more"
  return null
}

export type ReadRow = { row: ImportRow; problem: string | null }

/** Reads the rows under the header with the chosen columns. Blank rows are skipped. */
export function readRows(cells: unknown[][], headerIndex: number, mapping: (ImportField | null)[], firstLine = 1): ReadRow[] {
  const column = Object.fromEntries(IMPORT_FIELDS.map(f => [f.key, mapping.indexOf(f.key)])) as Record<ImportField, number>
  const cell = (r: unknown[], field: ImportField) => (column[field] < 0 ? null : r[column[field]])
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
    const buy = number("price_buy", "Cost")
    const sell = number("price_sell", "Price")
    const row: ImportRow = {
      line: firstLine + i,
      name: text(cell(r, "name")),
      barcode: text(cell(r, "barcode")) || null,
      brand: text(cell(r, "brand")) || null,
      unit: text(cell(r, "unit")).toLowerCase() || null,
      stock: number("stock", "Stock"),
      price_buy: buy === null ? null : round2(buy),
      price_sell: sell === null ? null : round2(sell),
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
export function planRows(rows: ReadRow[], items: Item[], setStock: boolean): RowPlan[] {
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
    if (row.barcode && !item.barcode) changes.push(`adds barcode ${row.barcode}`)
    if (row.name !== item.name) changes.push(`name was "${item.name}"`)
    if (row.brand && row.brand !== (item.brand ?? "")) changes.push(`brand ${item.brand ?? "—"} → ${row.brand}`)
    if (row.unit && row.unit !== item.unit) changes.push(`unit ${item.unit} → ${row.unit}`)
    if (row.price_buy !== null && row.price_buy !== round2(Number(item.price_buy)))
      changes.push(`cost ${money(item.price_buy)} → ${money(row.price_buy)}`)
    if (row.price_sell !== null && row.price_sell !== round2(Number(item.price_sell)))
      changes.push(`price ${money(item.price_sell)} → ${money(row.price_sell)}`)
    if (setStock && row.stock !== null && row.stock !== item.current_stock)
      changes.push(`stock ${num(item.current_stock)} → ${num(row.stock)}`)
    return changes.length ? { kind: "update", changes } : { kind: "same" }
  })
}

/** Checks a row sent from the browser has the right shape, and tidies it. Null if it doesn't. */
export function cleanImportRow(value: unknown): ImportRow | null {
  if (!value || typeof value !== "object") return null
  const o = value as Record<string, unknown>
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : x === null || x === undefined ? null : undefined)
  const numb = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : x === null || x === undefined ? null : undefined)
  const name = str(o.name)
  const barcode = str(o.barcode)
  const brand = str(o.brand)
  const unit = str(o.unit)
  const stock = numb(o.stock)
  const buy = numb(o.price_buy)
  const sell = numb(o.price_sell)
  if (typeof o.line !== "number" || typeof name !== "string") return null
  if ([barcode, brand, unit, stock, buy, sell].some(v => v === undefined)) return null
  return {
    line: o.line,
    name,
    barcode: barcode || null,
    brand: brand || null,
    unit: unit ? unit.toLowerCase() : null,
    stock: stock ?? null,
    price_buy: buy === null || buy === undefined ? null : round2(buy),
    price_sell: sell === null || sell === undefined ? null : round2(sell),
  }
}
