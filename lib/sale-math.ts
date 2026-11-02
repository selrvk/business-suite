// The totals of a sale, worked out the same way as create_sale() in
// supabase/schema.sql, so the register can show them before saving. The
// database's numbers are the ones that count.

export type LineDiscount = { type: "amount" | "percent"; value: number } | null
export type SaleDiscount =
  | { kind: "senior" | "pwd"; person: string; idNo: string }
  | { kind: "amount" | "percent"; value: number }
  | null

/**
 * The Senior Citizen/PWD discount a product gets:
 * 20 = 20% off and VAT-exempt (medicine, meals), 5 = 5% off with VAT (basic
 * necessities and prime commodities, at most ₱125 a week), 0 = none required.
 */
export type SeniorRate = 0 | 5 | 20
export const SENIOR_WEEKLY_CAP = 125

export const SENIOR_RATE_LABELS: Record<SeniorRate, string> = {
  20: "20%: medicine, meals",
  5: "5%: basic goods",
  0: "None",
}

/** A product's rate: its own, or the business's default. BMBEs and cooperatives don't give the 5%. */
export function seniorRate(own: number | null | undefined, business: { seniorDefault: number; seniorBasicExempt: boolean }): SeniorRate {
  const rate = (own ?? business.seniorDefault) as SeniorRate
  return rate === 5 && business.seniorBasicExempt ? 0 : rate
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function lineDiscountAmount(lineTotal: number, discount: LineDiscount) {
  if (!discount || !(discount.value > 0)) return 0
  return discount.type === "amount" ? Math.min(discount.value, lineTotal) : round2((lineTotal * Math.min(discount.value, 100)) / 100)
}

export type LineResult = { off: number; vatExempt: number; senior: 20 | 5 | null }

export function saleTotals(
  lines: { price: number; qty: number; discount: LineDiscount; seniorRate?: SeniorRate }[],
  discount: SaleDiscount,
  vatRegistered: boolean,
  /** 5% Senior/PWD discount this ID already got this week. */
  seniorUsedThisWeek = 0,
) {
  const senior = discount?.kind === "senior" || discount?.kind === "pwd"
  let room = Math.max(0, SENIOR_WEEKLY_CAP - seniorUsedThisWeek)
  let subtotal = 0
  let lineDiscounts = 0
  let vatExempt = 0
  let senior20 = 0
  let senior5 = 0
  let promos = 0
  const perLine: LineResult[] = []

  for (const l of lines) {
    const gross = round2(l.price * l.qty)
    subtotal += gross
    const promo = lineDiscountAmount(gross, l.discount)
    let result: LineResult = { off: promo, vatExempt: 0, senior: null }
    // Senior/PWD: each line gets its own rate, or its promo if that's bigger (never both).
    if (senior && l.seniorRate === 20) {
      const vx = vatRegistered ? round2(gross - round2(gross / 1.12)) : 0
      const sc = round2((gross - vx) * 0.2)
      if (promo <= sc + vx) result = { off: sc, vatExempt: vx, senior: 20 }
    } else if (senior && l.seniorRate === 5) {
      const sc = Math.min(round2(gross * 0.05), room)
      if (sc > 0 && promo < sc) {
        result = { off: sc, vatExempt: 0, senior: 5 }
        room = round2(room - sc)
      }
    }
    if (result.senior === 20) senior20 += result.off
    else if (result.senior === 5) senior5 += result.off
    else promos += result.off
    lineDiscounts += result.off
    vatExempt += result.vatExempt
    perLine.push(result)
  }
  subtotal = round2(subtotal)
  lineDiscounts = round2(lineDiscounts)
  vatExempt = round2(vatExempt)

  let saleDiscount = 0
  if (discount?.kind === "amount") {
    saleDiscount = Math.min(Math.max(discount.value || 0, 0), subtotal - lineDiscounts)
  } else if (discount?.kind === "percent") {
    saleDiscount = round2(((subtotal - lineDiscounts) * Math.min(Math.max(discount.value || 0, 0), 100)) / 100)
  }
  const total = round2(subtotal - vatExempt - lineDiscounts - saleDiscount)
  return {
    subtotal,
    lineDiscounts,
    saleDiscount,
    vatExempt,
    senior20: round2(senior20),
    senior5: round2(senior5),
    promos: round2(promos),
    discountTotal: round2(lineDiscounts + saleDiscount),
    total,
    perLine,
    /** What's left of this week's ₱125 after this sale. */
    seniorRoomLeft: round2(room),
  }
}
