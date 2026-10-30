import { notFound } from "next/navigation"
import { CloseButton, PrintButton } from "@/components/print-button"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { formatDateTime, money } from "@/lib/format"
import type { Order, OrderLine } from "@/lib/types"

export const metadata = { title: "Receipt" }

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  requireModule("sales")
  const [{ id }, { autoprint }] = await Promise.all([params, searchParams])
  const orderId = Number(id)
  if (!Number.isInteger(orderId)) notFound()

  const supabase = await getSupabase()
  const [{ business: settings }, { data: order }, { data: lines }] = await Promise.all([
    requireUser(),
    supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
    supabase.from("order_item").select("*, items(name, unit)").eq("order_id", orderId).order("id"),
  ])
  if (!order) notFound()

  const o = order as Order
  const items = (lines ?? []) as OrderLine[]
  const { data: cashier } = o.created_by
    ? await supabase.from("members").select("username").eq("user_id", o.created_by).maybeSingle()
    : { data: null }

  const title = o.status === "COMPLETED" ? "Receipt" : o.status === "PENDING" ? "Order slip" : "Cancelled order"
  const date = o.date_completed ?? o.date_cancelled ?? o.date_created
  const tendered = o.amount_tendered != null ? Number(o.amount_tendered) : null

  return (
    <div className="receipt-screen">
      <style>{`
        .receipt-screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; gap: 1.25rem; padding: 2rem 1rem; }
        .receipt { width: 80mm; max-width: 100%; background: #fff; color: #111; font-family: ui-monospace, Menlo, Consolas, monospace;
          font-size: 12px; line-height: 1.45; padding: 6mm 5mm; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .receipt .center { text-align: center; }
        .receipt .rule { border-top: 1px dashed #999; margin: 8px 0; }
        .receipt .row { display: flex; justify-content: space-between; gap: 8px; }
        .receipt .big { font-size: 16px; font-weight: 700; }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          .receipt-screen { padding: 0; display: block; }
          .receipt { box-shadow: none; padding: 4mm; }
        }
      `}</style>

      <div className="no-print flex gap-2">
        <PrintButton auto={autoprint === "1"} />
        <CloseButton />
      </div>

      <div className="receipt">
        <div className="center">
          {settings.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, printed as-is
            <img src={settings.logo_url} alt="" style={{ maxHeight: 48, maxWidth: "60%", margin: "0 auto 6px", filter: "grayscale(1)" }} />
          )}
          <p className="big">{settings.name}</p>
          {settings.address && <p>{settings.address}</p>}
          {settings.contact && <p>{settings.contact}</p>}
          <p style={{ marginTop: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{title}</p>
        </div>
        <div className="rule" />
        <div className="row">
          <span>No. {o.number}</span>
          <span>{formatDateTime(date)}</span>
        </div>
        {cashier?.username && <p>Cashier: {cashier.username}</p>}
        {o.customer_name && <p>Customer: {o.customer_name}</p>}
        <div className="rule" />

        {items.map(l => (
          <div key={l.id} style={{ marginBottom: 4 }}>
            <p>{l.item_name ?? l.items?.name ?? "Item"}</p>
            <div className="row">
              <span>
                &nbsp;&nbsp;{l.quantity} × {money(l.price_at_time)}
              </span>
              <span>{money(l.quantity * l.price_at_time)}</span>
            </div>
          </div>
        ))}

        <div className="rule" />
        <div className="row big">
          <span>TOTAL</span>
          <span>{money(o.total_price)}</span>
        </div>
        {o.payment_method && (
          <div className="row">
            <span>{o.payment_method}</span>
            <span>{money(tendered ?? o.total_price)}</span>
          </div>
        )}
        {tendered != null && tendered > Number(o.total_price) && (
          <div className="row">
            <span>Change</span>
            <span>{money(tendered - Number(o.total_price))}</span>
          </div>
        )}
        {settings.receipt_footer && (
          <>
            <div className="rule" />
            <p className="center">{settings.receipt_footer}</p>
          </>
        )}
      </div>
    </div>
  )
}
