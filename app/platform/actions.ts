"use server"

import { revalidatePath, updateTag } from "next/cache"
import { after } from "next/server"
import { isPlatformAdmin, isPlatformEmail } from "@/lib/auth"
import { dayRange, isYmd } from "@/lib/format"
import { notifyPaymentReviewed } from "@/lib/notify"
import { getPaymentDetails, savePaymentDetails } from "@/lib/platform-settings"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { ActionResult } from "@/lib/types"

const NOT_ALLOWED = { ok: false as const, error: "Only the platform owner can do that." }

function refresh() {
  updateTag("tenancy")
  revalidatePath("/platform")
}

/** Adds months to a date, keeping the day where possible (Jan 31 + 1 month = Feb 28/29). */
function addMonths(date: Date, months: number) {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

/** Approves a reported payment: paid time starts after any trial or paid time still left. */
export async function approvePayment(id: number): Promise<ActionResult<string>> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const admin = createSupabaseAdminClient()

  // Mark it first so a double click can't add the time twice.
  const { data: request } = await admin
    .from("payment_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("business_id, period, amount, reference")
    .maybeSingle()
  if (!request) return { ok: false, error: "That payment was already handled." }

  const { data: business } = await admin.from("businesses").select("trial_ends_at, paid_until").eq("id", request.business_id).single()
  const start = new Date(
    Math.max(Date.now(), new Date(business!.trial_ends_at).getTime(), business!.paid_until ? new Date(business!.paid_until).getTime() : 0),
  )
  const paidUntil = addMonths(start, request.period === "year" ? 12 : 1).toISOString()
  const { error } = await admin.from("businesses").update({ paid_until: paidUntil }).eq("id", request.business_id)
  if (error) {
    await admin.from("payment_requests").update({ status: "pending", reviewed_at: null }).eq("id", id)
    return { ok: false, error: error.message }
  }
  after(() =>
    notifyPaymentReviewed(request.business_id, { approved: true, amount: Number(request.amount), reference: request.reference, paidUntil }),
  )
  refresh()
  return { ok: true, data: paidUntil }
}

export async function rejectPayment(id: number): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const { data: request, error } = await createSupabaseAdminClient()
    .from("payment_requests")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("business_id, amount, reference")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (request) {
    after(() => notifyPaymentReviewed(request.business_id, { approved: false, amount: Number(request.amount), reference: request.reference }))
  }
  refresh()
  return { ok: true, data: null }
}

export async function extendTrial(businessId: string, days: number): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const admin = createSupabaseAdminClient()
  const { data: business } = await admin.from("businesses").select("trial_ends_at").eq("id", businessId).single()
  if (!business) return { ok: false, error: "Business not found." }
  const from = Math.max(Date.now(), new Date(business.trial_ends_at).getTime())
  const { error } = await admin
    .from("businesses")
    .update({ trial_ends_at: new Date(from + days * 86_400_000).toISOString() })
    .eq("id", businessId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, data: null }
}

/** Sets (or clears, with "") the date a business is paid up to, through the end of that day. */
export async function setPaidUntil(businessId: string, ymd: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  if (ymd && !isYmd(ymd)) return { ok: false, error: "Pick a date." }
  const { error } = await createSupabaseAdminClient()
    .from("businesses")
    .update({ paid_until: ymd ? dayRange(ymd).to.toISOString() : null })
    .eq("id", businessId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, data: null }
}

/**
 * Permanently deletes a business: all of its data, its logo files, and its
 * people's logins (except platform-owner logins). For spam sign-ups, closed
 * accounts, or your own test business. Requires typing the business's name.
 */
export async function deleteBusiness(businessId: string, typedName: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const admin = createSupabaseAdminClient()
  const { data: business } = await admin.from("businesses").select("id, name").eq("id", businessId).maybeSingle()
  if (!business) return { ok: false, error: "That business no longer exists." }
  if (typedName.trim() !== business.name) return { ok: false, error: `Type "${business.name}" exactly to confirm.` }

  const { data: members } = await admin.from("members").select("user_id").eq("business_id", businessId)
  const { data: files } = await admin.storage.from("branding").list(businessId)

  const { error } = await admin.from("businesses").delete().eq("id", businessId) // removes all its rows too
  if (error) return { ok: false, error: error.message }

  if (files?.length) await admin.storage.from("branding").remove(files.map(f => `${businessId}/${f.name}`))
  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id)
    if (data.user && !isPlatformEmail(data.user.email)) await admin.auth.admin.deleteUser(m.user_id)
  }
  refresh()
  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Payment details shown on every business's Billing page.
// ---------------------------------------------------------------------------

const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const QR_PREFIX = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/platform/`

export async function savePaymentInstructions(instructions: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const text = instructions.trim()
  if (text.length > 1000) return { ok: false, error: "Keep it under 1,000 characters." }
  const current = await getPaymentDetails()
  const { error } = await savePaymentDetails({ instructions: text, qrUrl: current.qrUrl })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/platform")
  revalidatePath("/billing")
  return { ok: true, data: null }
}

/** Uploads a payment QR code (e.g. GCash's "Receive money" QR) to show on Billing. */
export async function uploadPaymentQr(form: FormData): Promise<ActionResult<string>> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const file = form.get("qr")
  if (!(file instanceof Blob)) return { ok: false, error: "Pick an image." }
  const ext = QR_TYPES[file.type]
  if (!ext) return { ok: false, error: "Use a PNG, JPG or WebP image." }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "That image is too big. Try a smaller one." }

  const bucket = createSupabaseAdminClient().storage.from("branding")
  const path = `platform/payment-qr-${Date.now()}.${ext}`
  const { error } = await bucket.upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000" })
  if (error) return { ok: false, error: error.message }
  const url = bucket.getPublicUrl(path).data.publicUrl

  const current = await getPaymentDetails()
  const { error: saveError } = await savePaymentDetails({ instructions: current.instructions, qrUrl: url })
  if (saveError) {
    await bucket.remove([path])
    return { ok: false, error: saveError.message }
  }
  if (current.qrUrl?.startsWith(QR_PREFIX())) await bucket.remove([`platform/${current.qrUrl.slice(QR_PREFIX().length)}`])
  revalidatePath("/platform")
  revalidatePath("/billing")
  return { ok: true, data: url }
}

export async function removePaymentQr(): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return NOT_ALLOWED
  const current = await getPaymentDetails()
  const { error } = await savePaymentDetails({ instructions: current.instructions, qrUrl: null })
  if (error) return { ok: false, error: error.message }
  if (current.qrUrl?.startsWith(QR_PREFIX()))
    await createSupabaseAdminClient().storage.from("branding").remove([`platform/${current.qrUrl.slice(QR_PREFIX().length)}`])
  revalidatePath("/platform")
  revalidatePath("/billing")
  return { ok: true, data: null }
}
