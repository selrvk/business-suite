// Pieces of the showcase site. The "screens" mirror the real app's layouts with sample data.

import { money as currency } from "@/lib/format"

/** A decorative barcode strip used between sections. Same seed, same bars. */
export function BarcodeDivider({ seed, className = "", style }: { seed: string; className?: string; style?: React.CSSProperties }) {
  let x = 0
  let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const bars: { x: number; w: number }[] = []
  while (x < 600) {
    h = (h * 1103515245 + 12345) >>> 0
    const w = 1 + (h % 4)
    if ((h >>> 8) % 3 !== 0) bars.push({ x, w })
    x += w + 1 + ((h >>> 4) % 3)
  }
  return (
    <svg className={`lp-barcode-divider ${className}`} style={style} viewBox="0 0 600 28" preserveAspectRatio="none" aria-hidden>
      {bars.map(b => (
        <rect key={b.x} x={b.x} y="0" width={b.w} height="28" fill="currentColor" />
      ))}
    </svg>
  )
}

/** A small black-on-paper barcode for receipts and the hero scanner. */
export function PaperBarcode({ seed, height = 44 }: { seed: string; height?: number }) {
  return <BarcodeDivider seed={seed} style={{ height, color: "#111" }} />
}

/** The frame around a sample app screen. */
export function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lp-window overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <span className="ml-2 text-[0.7rem] faint uppercase tracking-[0.18em]">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

export function QuickScanScreen() {
  const rows = [
    { name: "Cola 1.5L", change: -1, stock: 47, note: "Counter" },
    { name: "Rice 25kg", change: -2, stock: 14, note: "Truck 1 delivery" },
    { name: "Cooking Oil 1L", change: 12, stock: 30, note: "Supplier DR-1042" },
    { name: "Nails 2in (kg)", change: -5, stock: 35, note: "Job site" },
  ]
  return (
    <Screen title="Inventory · Quick Scan">
      <div className="flex gap-2 mb-4">
        <span className="pill" data-tone="warn">
          Stock out
        </span>
        <span className="pill">Stock in</span>
      </div>
      <div className="flex flex-col">
        {rows.map(r => (
          <div key={r.name} className="list-row text-sm">
            <span className="flex-1 min-w-0">
              <span className="block text-white truncate">{r.name}</span>
              <span className="block text-xs faint truncate">{r.note}</span>
            </span>
            <span className={`font-semibold tabular ${r.change < 0 ? "text-warn" : "text-good"}`}>
              {r.change < 0 ? "−" : "+"}
              {Math.abs(r.change)}
            </span>
            <span className="w-16 text-right text-white tabular">{r.stock} left</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

export function PosScreen() {
  const lines = [
    { name: "Cola 1.5L", qty: 2, price: 75 },
    { name: "Pancit Canton", qty: 6, price: 17 },
    { name: "Tide Powder 1kg", qty: 1, price: 189 },
  ]
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  return (
    <Screen title="Point of Sale">
      {lines.map(l => (
        <div key={l.name} className="list-row text-sm">
          <span className="flex-1 text-white">{l.name}</span>
          <span className="faint tabular">
            {l.qty} × {currency(l.price)}
          </span>
          <span className="w-20 text-right text-white tabular">{currency(l.qty * l.price)}</span>
        </div>
      ))}
      <div className="flex items-end justify-between mt-4">
        <span className="stat-label">Total</span>
        <span className="display text-4xl text-white">{currency(total)}</span>
      </div>
      <div className="flex items-center justify-between mt-2 text-sm text-good font-semibold">
        <span>Change from {currency(500)}</span>
        <span className="display text-2xl">{currency(500 - total)}</span>
      </div>
    </Screen>
  )
}

export function TimeClockScreen() {
  return (
    <Screen title="Time Clock">
      <p className="display text-white text-center leading-none" style={{ fontSize: "3.5rem" }}>
        7:58 AM
      </p>
      <div
        className="mt-4 rounded-xl border-2 px-4 py-5 text-center"
        style={{ borderColor: "var(--app-success)", background: "color-mix(in srgb, var(--app-success) 12%, transparent)" }}
      >
        <p className="display text-3xl text-good">Good morning, Maria!</p>
        <p className="text-sm text-white mt-1">Clocked IN at 7:58 AM</p>
      </div>
      <div className="mt-4 text-xs faint flex justify-between">
        <span>Pedro: in since 7:41 AM</span>
        <span>Jun: out at 5:02 PM</span>
      </div>
    </Screen>
  )
}

export function FleetScreen() {
  return (
    <Screen title="Fleet · Vehicles">
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--app-border)", borderTop: "3px solid var(--app-success)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="display text-2xl text-white">Truck 1</p>
            <p className="text-xs faint">ABC 1234</p>
          </div>
          <span className="pill" data-tone="good">
            On trip
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="stat-label">Odometer</p>
            <p className="display text-3xl text-white">182,340</p>
          </div>
          <div>
            <p className="stat-label">This month</p>
            <p className="display text-3xl text-white">1,840 km</p>
          </div>
        </div>
        <p className="text-xs muted mt-2">Pedro · Delivery to the north branch · since 10:50 AM</p>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        {[
          ["Fuel", "212 L"],
          ["km / L", "8.7"],
          ["Trips", "26"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg py-2" style={{ background: "var(--app-surface-2)" }}>
            <p className="stat-label">{label}</p>
            <p className="display text-xl text-white">{value}</p>
          </div>
        ))}
      </div>
    </Screen>
  )
}
