"use server"

import { guard } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { dbMessage } from "@/lib/db"
import { customFields } from "@/lib/features"
import { toDateTimeLocal } from "@/lib/format"
import type { ActionResult } from "@/lib/types"
import { EXPORT_TABLES, type ExportTable } from "./data-tables"

type Cell = string | number | boolean | null
const PAGE = 2000
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** One row as spreadsheet cells: embedded names become their own columns, lists and objects become text. */
function flatten(row: Record<string, unknown>, fieldNames: Map<string, string>): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === "business_id") continue
    if (key === "extra" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [id, v] of Object.entries(value)) out[fieldNames.get(id) ?? id] = v == null ? null : String(v)
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const values = Object.entries(value)
      if (values.length && values.every(([, v]) => v == null || typeof v !== "object")) {
        for (const [sub, v] of values) out[`${key}_${sub}`] = v as Cell
      } else {
        out[key] = JSON.stringify(value)
      }
    } else if (Array.isArray(value)) {
      out[key] = value.every(v => typeof v !== "object") ? value.join(", ") : JSON.stringify(value)
    } else if (typeof value === "string" && TIMESTAMP.test(value)) {
      out[key] = toDateTimeLocal(value).replace("T", " ")
    } else {
      out[key] = value as Cell
    }
  }
  return out
}

/**
 * One page of one table of the business's records, for "Download all my
 * data". The browser asks for every table, page by page, and builds one Excel
 * file. Owners and admins only; works even after the trial or paid time ends.
 */
export async function exportTablePage(table: ExportTable, page: number): Promise<ActionResult<{ rows: Record<string, Cell>[]; more: boolean }>> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  const spec = EXPORT_TABLES.find(t => t.table === table)
  if (!spec || !Number.isInteger(page) || page < 0) return { ok: false, error: "Unknown table." }

  const { supabase, business } = g.session
  const start = page * PAGE
  const select: string = "select" in spec ? spec.select : "*"
  const order: string = "order" in spec ? spec.order : "id"
  let query = supabase.from(spec.table).select(select)
  if (spec.table === "businesses") query = query.eq("id", business.id)
  const { data, error } = await query.order(order).range(start, start + PAGE - 1)
  if (error) return { ok: false, error: dbMessage(error) }

  if (table === "businesses") await logActivity(g.session, "data_exported", business.name, {})
  const fieldNames = new Map(customFields(business).map(f => [f.id, f.label]))
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(r => flatten(r, fieldNames))
  return { ok: true, data: { rows, more: rows.length === PAGE } }
}
