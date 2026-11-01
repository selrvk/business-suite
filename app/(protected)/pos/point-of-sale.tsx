"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleCheck, ClipboardList, Minus, Percent, Plus, Printer, ShoppingCart, Trash2, X } from "lucide-react"
import { useBusinessFeatures, useCan } from "@/components/business-features"
import { ScanInput } from "@/components/scan-input"
import { QtyInput, ScanSafeInput } from "@/components/qty-input"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { money } from "@/lib/format"
import { lineDiscountAmount, saleTotals, type LineDiscount, type SaleDiscount } from "@/lib/sale-math"
import type { Item } from "@/lib/types"
import { createSale } from "../sales/actions"

type Line = { id: number; qty: number }
type Done = { id: number; number: number; total: number; change: number | null; pending: boolean; onCredit: number; owes: number | null }
export type PosCustomer = { id: number; name: string; balance: number; credit_limit: number | null }

const METHODS = ["Cash", "GCash", "Maya", "Card", "Bank transfer", "Other"]
const SHOWN = 24

export function PointOfSale({ items, lowStock, customers = [] }: { items: Item[]; lowStock: number; customers?: PosCustomer[] }) {
  const can = useCan()
  const { vatRegistered } = useBusinessFeatures()
  const [lineDiscounts, setLineDiscounts] = useState<Record<number, LineDiscount>>({})
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [discountMode, setDiscountMode] = useState<"none" | "senior" | "pwd" | "other">("none")
  const [scPerson, setScPerson] = useState("")
  const [scId, setScId] = useState("")
  const [otherType, setOtherType] = useState<"amount" | "percent">("percent")
  const [otherValue, setOtherValue] = useState("")
  const [payLater, setPayLater] = useState(false)
  const [paidNowText, setPaidNowText] = useState("0")
  const [paymentRef, setPaymentRef] = useState("")
  const router = useRouter()
  const scanRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [cart, setCart] = useState<Line[]>([])
  const [customer, setCustomer] = useState("")
  const [method, setMethod] = useState("Cash")
  const [tendered, setTendered] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? items.filter(i => [i.name, i.brand, i.barcode].some(v => v?.toLowerCase().includes(q))) : items
    return list.slice(0, SHOWN)
  }, [items, query])

  const lines = cart.map(l => ({ ...l, item: byId.get(l.id)! })).filter(l => l.item)
  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  const saleDiscount: SaleDiscount =
    discountMode === "senior" || discountMode === "pwd"
      ? { kind: discountMode, person: scPerson, idNo: scId }
      : discountMode === "other" && Number(otherValue) > 0
        ? { kind: otherType, value: Number(otherValue) }
        : null
  const totals = saleTotals(
    lines.map(l => ({ price: l.item.price_sell, qty: l.qty, discount: lineDiscounts[l.id] ?? null })),
    saleDiscount,
    vatRegistered,
  )
  const total = totals.total

  const customerMatch = customers.find(c => c.name.toLowerCase() === customer.trim().toLowerCase()) ?? null
  const credit = payLater && !!customerMatch && can("credit")
  const paidNow = credit ? Math.min(Math.max(Number(paidNowText) || 0, 0), total) : total
  const onCredit = credit ? Math.round((total - paidNow) * 100) / 100 : 0
  const overLimit =
    credit && customerMatch?.credit_limit != null && Number(customerMatch.balance) + onCredit > Number(customerMatch.credit_limit)
  const seniorMissing = (discountMode === "senior" || discountMode === "pwd") && (!scPerson.trim() || !scId.trim())

  const paid = tendered.trim() === "" ? null : Number(tendered)
  const change = method === "Cash" && paidNow > 0 && paid !== null ? paid - paidNow : null
  const short = change !== null && change < 0

  function focusScan() {
    requestAnimationFrame(() => scanRef.current?.focus())
  }

  function startNew() {
    setDone(null)
    setCart([])
    setCustomer("")
    setMethod("Cash")
    setTendered("")
    setNotice(null)
    setLineDiscounts({})
    setEditingLine(null)
    setDiscountMode("none")
    setScPerson("")
    setScId("")
    setOtherValue("")
    setPayLater(false)
    setPaidNowText("0")
    setPaymentRef("")
    focusScan()
  }

  function add(item: Item) {
    const current = done ? [] : cart
    if (done) startNew()
    const inCart = current.find(l => l.id === item.id)?.qty ?? 0
    if (inCart + 1 > item.current_stock) {
      beep("error")
      setNotice({
        tone: "bad",
        text: item.current_stock <= 0 ? `${item.name} is out of stock.` : `Only ${item.current_stock} ${item.unit} of ${item.name} in stock.`,
      })
      return
    }
    beep()
    setNotice(null)
    setCart(prev =>
      prev.some(l => l.id === item.id) ? prev.map(l => (l.id === item.id ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { id: item.id, qty: 1 }],
    )
    setQuery("")
    focusScan()
  }

  function setQty(id: number, qty: number) {
    const item = byId.get(id)
    if (!item) return
    if (qty > item.current_stock) {
      beep("error")
      setNotice({ tone: "bad", text: `Only ${item.current_stock} ${item.unit} of ${item.name} in stock.` })
    }
    const clamped = Math.max(1, Math.min(qty, item.current_stock))
    setCart(prev => prev.map(l => (l.id === id ? { ...l, qty: clamped } : l)))
  }

  function handleCode(code: string) {
    const hit = items.find(i => i.barcode === code)
    if (hit) return add(hit)
    const q = code.toLowerCase()
    const named = items.filter(i => [i.name, i.brand].some(v => v?.toLowerCase().includes(q)))
    if (named.length === 1) return add(named[0])
    if (named.length === 0) {
      beep("error")
      setNotice({ tone: "bad", text: `Nothing found for “${code}”.` })
      setQuery("")
    }
  }

  useScanner(handleCode)

  async function checkout(complete: boolean) {
    if (!lines.length || busy) return
    if (complete && short) return
    if (seniorMissing) {
      beep("error")
      return setNotice({ tone: "bad", text: `Enter the ${discountMode === "senior" ? "Senior Citizen" : "PWD"}'s name and ID number.` })
    }
    setBusy(true)
    const result = await createSale({
      lines: lines.map(l => ({ item_id: l.id, quantity: l.qty, discount: discountMode === "senior" || discountMode === "pwd" ? null : (lineDiscounts[l.id] ?? null) })),
      customerName: customer,
      complete,
      paymentMethod: paidNow > 0 ? method : null,
      amountTendered: method === "Cash" && paidNow > 0 ? (paid ?? paidNow) : null,
      paymentRef: method !== "Cash" ? paymentRef : "",
      discount: saleDiscount,
      customerId: customerMatch?.id ?? null,
      paidNow: credit ? paidNow : null,
    })
    setBusy(false)
    if (!result.ok) {
      beep("error")
      setNotice({ tone: "bad", text: result.error })
      return
    }
    beep("out")
    setDone({
      id: result.data.id,
      number: result.data.number,
      total: result.data.total,
      change: complete && method === "Cash" && paidNow > 0 ? (paid ?? paidNow) - paidNow : null,
      pending: !complete,
      onCredit: result.data.onCredit,
      owes: complete && result.data.onCredit > 0 && customerMatch ? Number(customerMatch.balance) + result.data.onCredit : null,
    })
    router.refresh()
  }

  const quickCash = [...new Set([Math.ceil(paidNow), Math.ceil(paidNow / 100) * 100, Math.ceil(paidNow / 500) * 500, Math.ceil(paidNow / 1000) * 1000])]
    .filter(v => v > 0)
    .slice(0, 4)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px] items-start">
      {/* ── Products ── */}
      <section className="flex flex-col gap-4 min-w-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Sales</p>
            <h1 className="page-title">Point of Sale</h1>
          </div>
          <Link href="/orders" className="btn btn-secondary no-print">
            <ClipboardList size={14} /> Pending orders
          </Link>
        </div>

        <ScanInput
          inputRef={scanRef}
          value={query}
          onChange={setQuery}
          onEnter={handleCode}
          placeholder="Scan a barcode or type a product name"
        />

        {notice && (
          <div className={`alert ${notice.tone === "good" ? "alert-success" : "alert-error"} flex items-center justify-between gap-2`}>
            <span>{notice.text}</span>
            <button className="btn btn-ghost btn-icon" onClick={() => setNotice(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-2">
          {results.map(item => {
            const qty = cart.find(l => l.id === item.id)?.qty
            const out = item.current_stock <= 0
            return (
              <button
                key={item.id}
                onClick={() => add(item)}
                disabled={out}
                className="card text-left p-3 flex flex-col gap-1.5 transition-colors hover:border-[var(--brand-line)] disabled:opacity-40 disabled:cursor-not-allowed relative"
                style={qty ? { borderColor: "var(--brand)", background: "var(--brand-soft)" } : undefined}
              >
                {qty && (
                  <span className="absolute top-2 right-2 pill" data-tone="brand">
                    ×{qty}
                  </span>
                )}
                <span className="text-sm font-semibold text-white leading-snug line-clamp-2 pr-8">{item.name}</span>
                <span className="text-xs faint truncate">{item.brand ?? item.unit}</span>
                <span className="flex items-baseline justify-between gap-2 mt-auto pt-1">
                  <span className="display text-xl text-white">{money(item.price_sell)}</span>
                  <span className={`text-[0.68rem] ${out ? "text-bad" : item.current_stock <= lowStock ? "text-warn" : "faint"}`}>
                    {out ? "Out" : `${item.current_stock} left`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {results.length === 0 && <p className="text-sm faint py-6 text-center">No products match “{query}”.</p>}
        {!query && items.length > SHOWN && (
          <p className="text-xs faint text-center">Showing {SHOWN} of {items.length} products. Scan or search to find the rest.</p>
        )}
      </section>

      {/* ── Cart ── */}
      <aside className="card xl:sticky xl:top-8 flex flex-col">
        <div className="card-header justify-between">
          <span className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-brand" />
            <span className="display text-2xl text-white">Current sale</span>
          </span>
          {lines.length > 0 && !done && (
            <button className="btn btn-ghost btn-sm" onClick={startNew}>
              Clear
            </button>
          )}
        </div>

        {done ? (
          <div className="card-body flex flex-col items-center text-center gap-3 py-10">
            <CircleCheck size={44} className="text-good" />
            <p className="display text-3xl text-white">{done.pending ? `Order #${done.number} saved` : `Sale #${done.number} complete`}</p>
            {done.pending ? (
              <p className="text-sm muted">Confirm it on the Pending Orders page when it&apos;s fulfilled. Stock is taken out then.</p>
            ) : (
              <>
                <p className="text-sm muted">Total {money(done.total)}</p>
                {done.onCredit > 0 && (
                  <p className="text-sm text-warn">
                    {money(done.onCredit)} on credit{done.owes !== null && ` · now owes ${money(done.owes)}`}
                  </p>
                )}
                {done.change !== null && (
                  <div className="mt-2">
                    <p className="stat-label">Change due</p>
                    <p className="display text-6xl text-good">{money(done.change)}</p>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <a className="btn btn-secondary" href={`/print/receipt/${done.id}?autoprint=1`} target="_blank" rel="noreferrer">
                <Printer size={14} /> {done.pending ? "Print order slip" : "Print receipt"}
              </a>
              <button className="btn btn-primary" onClick={startNew} autoFocus>
                New sale
              </button>
            </div>
            <p className="text-xs faint">Or just scan the next customer&apos;s first item.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 divide-y divide-white/5 max-h-[45vh] overflow-y-auto">
              {lines.length === 0 ? (
                <p className="empty">Scan an item to start a sale.</p>
              ) : (
                lines.map(({ id, qty, item }) => {
                  const lineTotal = item.price_sell * qty
                  const disc = discountMode === "senior" || discountMode === "pwd" ? null : (lineDiscounts[id] ?? null)
                  const off = lineDiscountAmount(lineTotal, disc)
                  return (
                    <div key={id} className="px-4 py-2.5 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{item.name}</p>
                          <p className="text-xs faint">
                            {money(item.price_sell)} × {qty} = <span className={off ? "line-through" : "text-white"}>{money(lineTotal)}</span>
                            {off > 0 && <span className="text-white"> {money(lineTotal - off)}</span>}
                          </p>
                        </div>
                        {can("discounts") && discountMode !== "senior" && discountMode !== "pwd" && (
                          <button
                            className={`btn btn-icon ${off ? "btn-secondary text-brand" : "btn-ghost"}`}
                            onClick={() => setEditingLine(editingLine === id ? null : id)}
                            aria-label={`Discount on ${item.name}`}
                            title="Discount on this item"
                          >
                            <Percent size={13} />
                          </button>
                        )}
                        <button className="btn btn-secondary btn-icon" onClick={() => (qty > 1 ? setQty(id, qty - 1) : setCart(c => c.filter(l => l.id !== id)))} aria-label="Less">
                          <Minus size={13} />
                        </button>
                        <QtyInput className="w-16" value={qty} onCommit={n => setQty(id, n)} onScan={handleCode} />
                        <button className="btn btn-secondary btn-icon" onClick={() => setQty(id, qty + 1)} disabled={qty >= item.current_stock} aria-label="More">
                          <Plus size={13} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => setCart(c => c.filter(l => l.id !== id))} aria-label="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {editingLine === id && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="faint">Discount</span>
                          <div className="segmented">
                            {(["amount", "percent"] as const).map(t => (
                              <button
                                key={t}
                                data-active={(lineDiscounts[id]?.type ?? "percent") === t}
                                onClick={() => setLineDiscounts(d => ({ ...d, [id]: { type: t, value: d[id]?.value ?? 0 } }))}
                              >
                                {t === "amount" ? "₱" : "%"}
                              </button>
                            ))}
                          </div>
                          <ScanSafeInput
                            className="input input-sm w-24"
                            inputMode="decimal"
                            value={lineDiscounts[id]?.value ? String(lineDiscounts[id]!.value) : ""}
                            onChange={v =>
                              setLineDiscounts(d => ({ ...d, [id]: { type: d[id]?.type ?? "percent", value: Number(v.replace(/[^\d.]/g, "")) || 0 } }))
                            }
                            onScan={handleCode}
                            onEnter={() => setEditingLine(null)}
                            placeholder="0"
                            autoFocus
                          />
                          {off > 0 && <span className="text-good">−{money(off)}</span>}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="card-body border-t flex flex-col gap-4" style={{ borderColor: "var(--app-border)" }}>
              {/* Sale discount */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="label m-0">Discount</span>
                  <div className="segmented">
                    {(["none", "senior", "pwd", ...(can("discounts") ? (["other"] as const) : [])] as const).map(mode => (
                      <button key={mode} data-active={discountMode === mode} onClick={() => setDiscountMode(mode)}>
                        {mode === "none" ? "None" : mode === "senior" ? "Senior" : mode === "pwd" ? "PWD" : "Other"}
                      </button>
                    ))}
                  </div>
                </div>
                {(discountMode === "senior" || discountMode === "pwd") && (
                  <div className="grid grid-cols-2 gap-2">
                    <ScanSafeInput className="input input-sm" value={scPerson} onChange={setScPerson} onScan={handleCode} placeholder={`${discountMode === "senior" ? "Senior Citizen" : "PWD"}'s name`} />
                    <ScanSafeInput className="input input-sm" value={scId} onChange={setScId} onScan={handleCode} placeholder="ID number" />
                    <p className="col-span-2 text-[0.7rem] faint">
                      20% off{vatRegistered ? ", VAT-exempt" : ""}. Other discounts don&apos;t apply on top.
                    </p>
                  </div>
                )}
                {discountMode === "other" && (
                  <div className="flex items-center gap-2">
                    <div className="segmented">
                      {(["amount", "percent"] as const).map(t => (
                        <button key={t} data-active={otherType === t} onClick={() => setOtherType(t)}>
                          {t === "amount" ? "₱" : "%"}
                        </button>
                      ))}
                    </div>
                    <ScanSafeInput className="input input-sm w-28" inputMode="decimal" value={otherValue} onChange={v => setOtherValue(v.replace(/[^\d.]/g, ""))} onScan={handleCode} placeholder="0" />
                    <span className="text-xs faint">off the whole sale</span>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="flex flex-col gap-1 text-sm">
                {(totals.discountTotal > 0 || totals.vatExempt > 0) && (
                  <>
                    <p className="flex justify-between muted">
                      <span>Subtotal</span>
                      <span>{money(totals.subtotal)}</span>
                    </p>
                    {totals.vatExempt > 0 && (
                      <p className="flex justify-between muted">
                        <span>VAT exempt (12%)</span>
                        <span>−{money(totals.vatExempt)}</span>
                      </p>
                    )}
                    <p className="flex justify-between text-good">
                      <span>{discountMode === "senior" ? "Senior Citizen 20%" : discountMode === "pwd" ? "PWD 20%" : "Discounts"}</span>
                      <span>−{money(totals.discountTotal)}</span>
                    </p>
                  </>
                )}
                <div className="flex items-end justify-between">
                  <span className="stat-label">
                    Total · {count} item{count === 1 ? "" : "s"}
                  </span>
                  <span className="display text-5xl text-white">{money(total)}</span>
                </div>
              </div>

              {/* Customer and credit */}
              <div className="flex flex-col gap-2">
                <label>
                  <span className="label">Customer</span>
                  <ScanSafeInput className="input" value={customer} onChange={setCustomer} onScan={handleCode} placeholder="Optional" list="pos-customers" />
                  <datalist id="pos-customers">
                    {customers.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </label>
                {customerMatch && (
                  <p className="text-xs faint -mt-1">
                    Saved customer
                    {Number(customerMatch.balance) > 0 && <span className="text-warn"> · owes {money(customerMatch.balance)}</span>}
                    {customerMatch.credit_limit != null && ` · limit ${money(customerMatch.credit_limit)}`}
                  </p>
                )}
                {customerMatch && can("credit") && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={payLater} onChange={e => setPayLater(e.target.checked)} />
                    <span className="text-white">Pay later: put it on their tab</span>
                  </label>
                )}
                {credit && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="faint">Paying now</span>
                    <ScanSafeInput className="input input-sm w-28" inputMode="decimal" value={paidNowText} onChange={v => setPaidNowText(v.replace(/[^\d.]/g, ""))} onScan={handleCode} />
                    <span className={overLimit ? "text-bad" : "text-warn"}>{money(onCredit)} on credit</span>
                  </div>
                )}
                {overLimit && <p className="text-xs text-bad">Over {customerMatch!.name}&apos;s credit limit of {money(customerMatch!.credit_limit!)}.</p>}
              </div>

              {/* Payment */}
              {paidNow > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="label m-0">Payment{credit ? ` · ${money(paidNow)} now` : ""}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {METHODS.map(m => (
                      <button key={m} className={`btn btn-sm ${method === m ? "btn-primary" : "btn-secondary"}`} onClick={() => setMethod(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {method !== "Cash" && (
                    <ScanSafeInput className="input input-sm" value={paymentRef} onChange={setPaymentRef} onScan={handleCode} placeholder="Reference no. (optional)" />
                  )}
                </div>
              )}

              {method === "Cash" && paidNow > 0 && (
                <div>
                  <label>
                    <span className="label">Cash received</span>
                    <ScanSafeInput
                      className="input text-lg tabular"
                      inputMode="decimal"
                      value={tendered}
                      onChange={v => setTendered(v.replace(/[^\d.]/g, ""))}
                      onScan={handleCode}
                      onEnter={() => checkout(true)}
                      placeholder={paidNow ? `${paidNow.toFixed(2)} (exact)` : "0.00"}
                    />
                  </label>
                  {paidNow > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {quickCash.map(v => (
                        <button key={v} className="btn btn-secondary btn-sm" onClick={() => setTendered(String(v))}>
                          {money(v)}
                        </button>
                      ))}
                    </div>
                  )}
                  {change !== null && (
                    <p className={`mt-3 flex justify-between text-sm font-semibold ${short ? "text-bad" : "text-good"}`}>
                      <span>{short ? "Short by" : "Change"}</span>
                      <span className="display text-2xl">{money(Math.abs(change))}</span>
                    </p>
                  )}
                </div>
              )}

              <button className="btn btn-primary btn-lg btn-block" onClick={() => checkout(true)} disabled={!lines.length || busy || short || overLimit}>
                <CircleCheck size={17} />
                {busy ? "Saving…" : `Complete sale${total ? ` · ${money(total)}` : ""}`}
              </button>
              <button className="btn btn-secondary btn-block" onClick={() => checkout(false)} disabled={!lines.length || busy}>
                <ClipboardList size={14} /> Save as pending order
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
