// The totals of a sale, worked out the same way as create_sale() in
// supabase/schema.sql, so the register can show them before saving. The
// database's numbers are the ones that count.

export type LineDiscount = { type: "amount" | "percent"; value: number } | null
export type SaleDiscount =
  | { kind: "senior" | "pwd"; person: string; idNo: string }
  | { kind: "amount" | "percent"; value: number }
  | null

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function lineDiscountAmount(lineTotal: number, discount: LineDiscount) {
  if (!discount || !(discount.value > 0)) return 0
  return discount.type === "amount" ? Math.min(discount.value, lineTotal) : round2((lineTotal * Math.min(discount.value, 100)) / 100)
}

export function saleTotals(lines: { price: number; qty: number; discount: LineDiscount }[], discount: SaleDiscount, vatRegistered: boolean) {
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0))
  const seniorOrPwd = discount?.kind === "senior" || discount?.kind === "pwd"
  // Senior/PWD: no other discounts on top.
  const lineDiscounts = seniorOrPwd ? 0 : round2(lines.reduce((s, l) => s + lineDiscountAmount(l.price * l.qty, l.discount), 0))
  let vatExempt = 0
  let saleDiscount = 0
  if (seniorOrPwd) {
    if (vatRegistered) vatExempt = round2(subtotal - round2(subtotal / 1.12))
    saleDiscount = round2((subtotal - vatExempt) * 0.2)
  } else if (discount?.kind === "amount") {
    saleDiscount = Math.min(Math.max(discount.value || 0, 0), subtotal - lineDiscounts)
  } else if (discount?.kind === "percent") {
    saleDiscount = round2(((subtotal - lineDiscounts) * Math.min(Math.max(discount.value || 0, 0), 100)) / 100)
  }
  const total = round2(subtotal - vatExempt - lineDiscounts - saleDiscount)
  return { subtotal, lineDiscounts, saleDiscount, vatExempt, discountTotal: round2(lineDiscounts + saleDiscount), total }
}
