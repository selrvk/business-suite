"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import type { ActionResult, StockReason } from "@/lib/types"

export type ProductInput = {
  name: string
  brand: string
  barcode: string
  unit: string
  price_buy: number
  price_sell: number
  current_stock: number
}

function clean(input: ProductInput) {
  const name = input.name.trim()
  const price_buy = Number(input.price_buy)
  const price_sell = Number(input.price_sell)
  const current_stock = Number(input.current_stock)
  if (!name) return { error: "Enter a product name." }
  if (!Number.isFinite(price_buy) || price_buy < 0) return { error: "Cost must be zero or more." }
  if (!Number.isFinite(price_sell) || price_sell < 0) return { error: "Selling price must be zero or more." }
  if (!Number.isInteger(current_stock) || current_stock < 0) return { error: "Stock must be a whole number, zero or more." }
  return {
    fields: {
      name,
      brand: input.brand.trim() || null,
      barcode: input.barcode.trim() || null,
      unit: input.unit.trim().toLowerCase() || "pieces",
      price_buy,
      price_sell,
    },
    current_stock,
  }
}

function refresh() {
  revalidatePath("/", "layout")
}

export async function addProduct(input: ProductInput): Promise<ActionResult<{ id: number }>> {
  const g = await guard()
  if (!g.ok) return g
  const product = clean(input)
  if ("error" in product) return { ok: false, error: product.error! }

  const { supabase } = g.session
  const { data, error } = await supabase
    .from("items")
    .insert({ ...product.fields, current_stock: 0 })
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
  }

  refresh()
  return { ok: true, data: { id: data.id } }
}

/**
 * `stockShown` is the stock the form displayed when opened. Only the difference the
 * user typed is applied, so a sale made while the form was open isn't undone.
 */
export async function updateProduct(id: number, input: ProductInput, stockShown: number): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const product = clean(input)
  if ("error" in product) return { ok: false, error: product.error! }

  const { supabase } = g.session
  const { error } = await supabase.from("items").update(product.fields).eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }

  const change = product.current_stock - stockShown
  if (change !== 0) {
    const { error: stockError } = await supabase.rpc("adjust_stock", {
      p_item_id: id,
      p_change: change,
      p_reason: "adjust",
      p_note: "Corrected in product details",
    })
    if (stockError) return { ok: false, error: dbMessage(stockError) }
  }

  refresh()
  return { ok: true, data: null }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.from("items").delete().eq("id", id).select("id")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "Product not found, or you don't have permission to delete it." }
  refresh()
  return { ok: true, data: null }
}

export async function adjustStock(id: number, change: number, reason: StockReason, note: string): Promise<ActionResult<number>> {
  const g = await guard()
  if (!g.ok) return g
  if (!Number.isInteger(change) || change === 0) return { ok: false, error: "Enter a whole number other than zero." }
  const { data, error } = await g.session.supabase.rpc("adjust_stock", {
    p_item_id: id,
    p_change: change,
    p_reason: reason,
    p_note: note,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: data as number }
}

export async function receiveStock(lines: { item_id: number; quantity: number }[], note: string): Promise<ActionResult<number>> {
  const g = await guard()
  if (!g.ok) return g
  if (!lines.length) return { ok: false, error: "Scan or add at least one product." }
  const { data, error } = await g.session.supabase.rpc("receive_stock", { p_items: lines, p_note: note })
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
  const g = await guard()
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
  const g = await guard()
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
