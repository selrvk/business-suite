import "server-only"
import { createSupabaseAdminClient } from "./supabase/admin"

export type PaymentDetails = { instructions: string; qrUrl: string | null }

/**
 * The payment details shown on Billing: what you saved on /platform, or the
 * PAYMENT_INSTRUCTIONS setting if nothing is saved yet.
 */
export async function getPaymentDetails(): Promise<PaymentDetails> {
  const { data } = await createSupabaseAdminClient().from("platform_settings").select("value").eq("key", "payment").maybeSingle()
  const value = (data?.value ?? {}) as { instructions?: string; qr_url?: string | null }
  const fallback = (process.env.PAYMENT_INSTRUCTIONS ?? "").replace(/\\n/g, "\n").trim()
  return { instructions: (value.instructions ?? "").trim() || fallback, qrUrl: value.qr_url || null }
}

export async function savePaymentDetails(details: PaymentDetails) {
  return createSupabaseAdminClient()
    .from("platform_settings")
    .upsert({ key: "payment", value: { instructions: details.instructions, qr_url: details.qrUrl }, updated_at: new Date().toISOString() })
}
