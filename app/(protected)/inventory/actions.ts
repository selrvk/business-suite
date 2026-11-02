"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { dbMessage } from "@/lib/db"
import { customFields, type CustomField } from "@/lib/features"
import { MAX_IMPORT_ROWS, cleanImportRow, duplicateProblems, rowProblem, type ImportRow } from "@/lib/product-import"
import type { ActionResult, StockReason } from "@/lib/types"

/**
 * Saves rows from the import page, all or nothing. Owners/admins only. The
 * rows are checked again here, since anything can be sent from a browser.
 */
export async function importProducts(
  input: unknown[],
  setStock: boolean,
): Promise<ActionResult<{ added: number; updated: number; unchanged: number }>> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "There's nothing to import." }
  if (input.length > MAX_IMPORT_ROWS) return { ok: false, error: `Import up to ${MAX_IMPORT_ROWS.toLocaleString()} products at a time.` }

  const rows: ImportRow[] = []
  for (const value of input) {
    const row = cleanImportRow(value)
    if (!row) return { ok: false, error: "Some rows couldn't be read. Reload the page and try again." }
    const problem = rowProblem(row)
    if (problem) return { ok: false, error: `Row ${row.line}: ${problem}.` }
    rows.push(row)
  }
  const clash = duplicateProblems(rows).entries().next().value
  if (clash) return { ok: false, error: `Row ${rows[clash[0]].line}: ${clash[1]}.` }

  const { data, error } = await g.session.supabase.rpc("import_items", {
    p_rows: rows.map(r => ({
      name: r.name,
      barcode: r.barcode,
      brand: r.brand,
      unit: r.unit,
      stock: r.stock,
      price_buy: r.price_buy,
      price_sell: r.price_sell,
      supplier: r.supplier,
      category: r.category,
      location: r.location,
      reorder_level: r.reorder_level,
      senior_discount: r.senior_discount,
      extra: r.extra,
      expires_on: r.expires_on,
      lot: r.lot,
    })),
    p_set_stock: setStock === true,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  const counts = data as { added: number; updated: number; unchanged: number }
  await logActivity(g.session, "products_imported", `${rows.length} rows`, { added: counts.added, updated: counts.updated, set_stock: setStock === true })
  refresh()
  return { ok: true, data: counts }
}

export type ProductInput = {
  name: string
  brand: string
  barcode: string
  unit: string
  /** Left out by people who can't see costs: the saved cost stays. */
  price_buy?: number
  price_sell: number
  current_stock: number
  // Optional details, sent only when the business uses them. Left out = keep what's saved.
  supplier_id?: number | null
  category?: string
  location?: string
  reorder_level?: number | null
  /** Senior/PWD discount: 20, 5 or 0; null = the business's default. Left out = keep what's saved. */
  senior_discount?: number | null
  /** Custom field values, by field id. */
  extra?: Record<string, string>
  /** For a new product's opening stock, when expiry dates are on. */
  expires_on?: string
  lot?: string
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Checks custom field values against the business's fields. Unknown fields are dropped. */
function cleanExtra(extra: Record<string, string> | undefined, fields: CustomField[]) {
  if (!extra) return undefined
  const out: Record<string, string | number | null> = {}
  for (const field of fields) {
    if (!(field.id in extra)) continue
    const raw = String(extra[field.id] ?? "").trim()
    if (!raw) {
      out[field.id] = null
    } else if (field.type === "number") {
      const n = Number(raw.replace(/,/g, ""))
      if (!Number.isFinite(n)) return { error: `${field.label} must be a number.` }
      out[field.id] = n
    } else if (field.type === "date") {
      if (!YMD.test(raw)) return { error: `${field.label} must be a date.` }
      out[field.id] = raw
    } else {
      out[field.id] = raw.slice(0, 200)
    }
  }
  return out
}

function clean(input: ProductInput, fields: CustomField[]) {
  const name = input.name.trim()
  const price_buy = input.price_buy === undefined ? undefined : Number(input.price_buy)
  const price_sell = Number(input.price_sell)
  const current_stock = Number(input.current_stock)
  if (!name) return { error: "Enter a product name." }
  if (price_buy !== undefined && (!Number.isFinite(price_buy) || price_buy < 0)) return { error: "Cost must be zero or more." }
  if (!Number.isFinite(price_sell) || price_sell < 0) return { error: "Selling price must be zero or more." }
  if (!Number.isInteger(current_stock) || current_stock < 0) return { error: "Stock must be a whole number, zero or more." }

  const optional: Record<string, string | number | null> = {}
  if (input.supplier_id !== undefined) optional.supplier_id = Number.isInteger(input.supplier_id) && input.supplier_id! > 0 ? input.supplier_id! : null
  if (input.category !== undefined) optional.category = input.category.trim().slice(0, 60) || null
  if (input.location !== undefined) optional.location = input.location.trim().slice(0, 60) || null
  if (input.reorder_level !== undefined) {
    const level = input.reorder_level
    if (level !== null && (!Number.isInteger(level) || level < 0)) return { error: "Low-stock level must be a whole number, zero or more." }
    optional.reorder_level = level
  }
  if (input.senior_discount !== undefined) {
    if (input.senior_discount !== null && ![0, 5, 20].includes(input.senior_discount)) return { error: "Pick a Senior/PWD discount." }
    optional.senior_discount = input.senior_discount
  }
  const extra = cleanExtra(input.extra, fields)
  if (extra && "error" in extra) return { error: extra.error as string }
  if (input.expires_on && !YMD.test(input.expires_on)) return { error: "Pick a valid expiry date." }

  return {
    fields: {
      name,
      brand: input.brand.trim() || null,
      barcode: input.barcode.trim() || null,
      unit: input.unit.trim().toLowerCase() || "pieces",
      ...(price_buy !== undefined ? { price_buy } : {}),
      price_sell,
      ...optional,
    },
    extra: extra as Record<string, string | number | null> | undefined,
    current_stock,
    batch: input.expires_on || input.lot?.trim() ? { expires_on: input.expires_on || null, lot: input.lot?.trim() || null } : null,
  }
}

function refresh() {
  revalidatePath("/", "layout")
}

/** Choices for the product form: suppliers, and categories and locations already in use. */
export async function productChoices(): Promise<ActionResult<{ suppliers: { id: number; name: string }[]; categories: string[]; locations: string[] }>> {
  const g = await guard({ allowExpired: true })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.rpc("product_choices")
  if (error) return { ok: false, error: dbMessage(error) }
  return { ok: true, data }
}

export async function addProduct(input: ProductInput): Promise<ActionResult<{ id: number }>> {
  const g = await guard({ permission: "edit_products" })
  if (!g.ok) return g
  const product = clean(input, customFields(g.session.business))
  if ("error" in product) return { ok: false, error: product.error! }

  const { supabase } = g.session
  const { data, error } = await supabase
    .from("items")
    .insert({ ...product.fields, extra: product.extra ?? {}, current_stock: 0 })
    .select("id")
    .single()
  if (error) return { ok: false, error: dbMessage(error) }

  if (product.current_stock > 0) {
    const { error: stockError } = await supabase.rpc("adjust_stock", {
      p_item_id: data.id,
      p_change: product.current_stock,
      p_reason: "initial",
    })
    if (stockError) return { ok: false, error: dbMessage(stockError) }
    if (product.batch) {
      const { error: batchError } = await supabase.rpc("record_batch", {
        p_item_id: data.id,
        p_quantity: product.current_stock,
        p_expires_on: product.batch.expires_on,
        p_lot: product.batch.lot,
      })
      if (batchError) return { ok: false, error: dbMessage(batchError) }
    }
  }

  await logActivity(g.session, "product_added", product.fields.name, { price: product.fields.price_sell, stock: product.current_stock })
  refresh()
  return { ok: true, data: { id: data.id } }
}

/**
 * `stockShown` is the stock the form displayed when opened. Only the difference the
 * user typed is applied, so a sale made while the form was open isn't undone.
 */
export async function updateProduct(id: number, input: ProductInput, stockShown: number): Promise<ActionResult> {
  const g = await guard({ permission: "edit_products" })
  if (!g.ok) return g
  const product = clean(input, customFields(g.session.business))
  if ("error" in product) return { ok: false, error: product.error! }
  const change = product.current_stock - stockShown
  if (change !== 0 && !g.session.can("adjust_stock")) return { ok: false, error: "You don't have permission to correct stock. Use Stock In for deliveries." }

  const { supabase } = g.session
  const { data: before } = await supabase.from("items").select("*").eq("id", id).maybeSingle()
  if (!before) return { ok: false, error: "That product no longer exists." }
  let extra: Record<string, unknown> | undefined
  if (product.extra) {
    // Merge, so values of fields that are hidden right now are kept.
    extra = { ...((before.extra as Record<string, unknown>) ?? {}), ...product.extra }
  }
  const { error } = await supabase
    .from("items")
    .update({ ...product.fields, ...(extra ? { extra } : {}) })
    .eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }

  // Log what changed: prices on their own (they matter most), then everything else.
  const fields = product.fields as Record<string, unknown>
  if (Number(before.price_sell) !== Number(fields.price_sell))
    await logActivity(g.session, "price_changed", fields.name as string, { field: "price", from: Number(before.price_sell), to: Number(fields.price_sell) })
  if (fields.price_buy !== undefined && Number(before.price_buy) !== Number(fields.price_buy))
    await logActivity(g.session, "price_changed", fields.name as string, { field: "cost", from: Number(before.price_buy), to: Number(fields.price_buy) })
  const others = Object.keys(fields).filter(k => !["price_sell", "price_buy"].includes(k) && String(fields[k] ?? "") !== String(before[k] ?? ""))
  if (others.length || (extra && JSON.stringify(extra) !== JSON.stringify(before.extra ?? {})))
    await logActivity(g.session, "product_changed", fields.name as string, { changed: [...others, ...(extra && JSON.stringify(extra) !== JSON.stringify(before.extra ?? {}) ? ["custom fields"] : [])] })

  if (change !== 0) {
    const { error: stockError } = await supabase.rpc("adjust_stock", {
      p_item_id: id,
      p_change: change,
      p_reason: "adjust",
      p_note: "Corrected in product details",
    })
    if (stockError) return { ok: false, error: dbMessage(stockError) }
    await logActivity(g.session, "stock_corrected", fields.name as string, { from: stockShown, to: product.current_stock, change })
  }

  refresh()
  return { ok: true, data: null }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.from("items").delete().eq("id", id).select("id, name, current_stock")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "Product not found, or you don't have permission to delete it." }
  await logActivity(g.session, "product_deleted", data[0].name, { stock: data[0].current_stock })
  refresh()
  return { ok: true, data: null }
}

export async function adjustStock(id: number, change: number, reason: StockReason, note: string): Promise<ActionResult<number>> {
  const g = await guard({ permission: "adjust_stock" })
  if (!g.ok) return g
  if (!Number.isInteger(change) || change === 0) return { ok: false, error: "Enter a whole number other than zero." }
  const { data, error } = await g.session.supabase.rpc("adjust_stock", {
    p_item_id: id,
    p_change: change,
    p_reason: reason,
    p_note: note,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  if (reason === "adjust") {
    const { data: item } = await g.session.supabase.from("items").select("name").eq("id", id).maybeSingle()
    await logActivity(g.session, "stock_corrected", item?.name ?? `Product ${id}`, { change, stock: data as number, note: note || null })
  }
  refresh()
  return { ok: true, data: data as number }
}

export type ReceiveLine = { item_id: number; quantity: number; expires_on?: string; lot?: string }

/** Stock In: a delivery, optionally from a supplier, with expiry dates and lot numbers per line. */
export async function receiveStock(lines: ReceiveLine[], note: string, supplierId: number | null = null): Promise<ActionResult<number>> {
  const g = await guard()
  if (!g.ok) return g
  if (!lines.length) return { ok: false, error: "Scan or add at least one product." }
  for (const line of lines) {
    if (line.expires_on && !YMD.test(line.expires_on)) return { ok: false, error: "One of the expiry dates isn't a valid date." }
    if (line.lot && line.lot.length > 60) return { ok: false, error: "Lot numbers can be up to 60 characters." }
  }
  const items = lines.map(l => ({ item_id: l.item_id, quantity: l.quantity, expires_on: l.expires_on || null, lot: l.lot?.trim() || null }))
  const supplier = Number.isInteger(supplierId) && supplierId! > 0 ? supplierId : null
  const { data, error } = await g.session.supabase.rpc("receive_stock", { p_items: items, p_note: note, p_supplier_id: supplier })
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: data as number }
}

export type ScanResult =
  | { found: false; code: string }
  | { found: true; item_id: number; name: string; unit: string; change: number; stock: number }

/**
 * Quick Scan: one scan, one stock change, saved immediately. Skips page
 * revalidation on purpose so rapid scanning stays fast.
 */
export async function quickScan(code: string, change: number, note: string): Promise<ActionResult<ScanResult>> {
  const g = await guard({ permission: "adjust_stock" })
  if (!g.ok) return g
  if (!Number.isInteger(change) || change === 0 || Math.abs(change) > 99999)
    return { ok: false, error: "Quantity per scan must be a whole number." }
  const { data, error } = await g.session.supabase.rpc("scan_stock", {
    p_code: code,
    p_change: change,
    p_reason: change > 0 ? "receive" : "out",
    p_note: note,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  return { ok: true, data: data as ScanResult }
}

/** Reverses a Quick Scan (logged as a correction). */
export async function undoScan(itemId: number, change: number): Promise<ActionResult<number>> {
  const g = await guard({ permission: "adjust_stock" })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.rpc("adjust_stock", {
    p_item_id: itemId,
    p_change: -change,
    p_reason: "adjust",
    p_note: "Undo quick scan",
  })
  if (error) return { ok: false, error: dbMessage(error) }
  return { ok: true, data: data as number }
}
