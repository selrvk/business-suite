// Pieces of the showcase site. The "screens" mirror the real app's layouts with sample data.

import { money as currency } from "@/lib/format"

/** The frame around a sample app screen. */
export function Screen({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`lp-window overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <span className="ml-2 text-[0.7rem] faint uppercase tracking-[0.18em] truncate">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

/** Rows that appear one after another when the screen scrolls into view. */
function Rows({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="flex flex-col">
      {children.map((child, i) => (
        <div key={i} className="lp-stagger" style={{ ["--i" as string]: i }}>
          {child}
        </div>
      ))}
    </div>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "info" | "brand" }) {
  return (
    <span className="pill" data-tone={tone}>
      {children}
    </span>
  )
}

/** 7:58 AM: staff clock in, each with only the access the owner gave them. */
export function OpeningScreen() {
  const staff = [
    { name: "Maria", time: "7:58 AM", role: "Cashier", tags: ["Discounts"] },
    { name: "Jun", time: "8:02 AM", role: "Stock", tags: ["Correct stock", "Products"] },
    { name: "Pedro", time: "8:15 AM", role: "Driver", tags: ["Trips"] },
  ]
  return (
    <Screen title="Attendance · Who's in">
      <div className="rounded-xl px-4 py-4 mb-4 text-center lp-stagger" style={{ border: "2px solid var(--app-success)", background: "color-mix(in srgb, var(--app-success) 10%, transparent)" }}>
        <p className="display text-3xl text-good">Good morning, Maria!</p>
        <p className="text-sm text-white mt-1">Clocked in at 7:58 AM</p>
      </div>
      <Rows>
        {staff.map(s => (
          <div key={s.name} className="list-row text-sm">
            <span className="flex-1 min-w-0">
              <span className="block text-white">{s.name}</span>
              <span className="block text-xs faint">
                {s.role} · in since {s.time}
              </span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {s.tags.map(t => (
                <Tag key={t}>{t}</Tag>
              ))}
            </span>
          </div>
        ))}
      </Rows>
    </Screen>
  )
}

/** 9:15 AM: a delivery is checked in, with expiry dates; the reorder list updates. */
export function DeliveryScreen() {
  const lines = [
    { name: "Cooking oil 1L", qty: 24, exp: "Aug 2027" },
    { name: "Evaporated milk 370ml", qty: 48, exp: "Mar 2027" },
    { name: "Instant noodles (box)", qty: 10, exp: "Jan 2027" },
    { name: "Rice 25kg", qty: 8, exp: null },
  ]
  return (
    <Screen title="Stock In · Santos Trading">
      <Rows>
        {lines.map(l => (
          <div key={l.name} className="list-row text-sm">
            <span className="flex-1 min-w-0">
              <span className="block text-white truncate">{l.name}</span>
              <span className="block text-xs faint">{l.exp ? `Expires ${l.exp}` : "No expiry"}</span>
            </span>
            <span className="font-semibold tabular text-good">+{l.qty}</span>
          </div>
        ))}
      </Rows>
      <div className="mt-4 rounded-lg px-3 py-3 flex items-center justify-between gap-3 text-sm lp-stagger" style={{ background: "var(--app-surface-2)", ["--i" as string]: 5 }}>
        <span className="min-w-0">
          <span className="block text-white">Reorder list</span>
          <span className="block text-xs faint">3 products low · grouped by supplier</span>
        </span>
        <Tag tone="warn">Text the order</Tag>
      </div>
    </Screen>
  )
}

/** 12:30 PM: the lunch rush at the counter: a Senior Citizen buying medicine, paid by GCash. */
export function CounterScreen() {
  const lines = [
    { name: "Paracetamol 500mg", qty: 2, price: 45 },
    { name: "Vitamin C (30s)", qty: 1, price: 210 },
    { name: "Cough syrup 60ml", qty: 1, price: 128 },
  ]
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const discount = Math.round(subtotal * 0.2 * 100) / 100
  return (
    <Screen title="Point of Sale">
      <Rows>
        {lines.map(l => (
          <div key={l.name} className="list-row text-sm">
            <span className="flex-1 min-w-0">
              <span className="block text-white truncate">{l.name}</span>
              <span className="block text-xs faint tabular">
                {l.qty} × {currency(l.price)}
              </span>
            </span>
            <span className="text-right text-white tabular">{currency(l.qty * l.price)}</span>
          </div>
        ))}
      </Rows>
      <div className="flex items-center justify-between text-sm mt-3 lp-stagger" style={{ ["--i" as string]: 4 }}>
        <span className="text-good">Senior Citizen 20%</span>
        <span className="text-good tabular">−{currency(discount)}</span>
      </div>
      <div className="flex items-end justify-between mt-3">
        <span className="stat-label">Total</span>
        <span className="display text-4xl text-white">{currency(subtotal - discount)}</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Tag tone="brand">GCash · ref 7012 448 391</Tag>
        <Tag>Receipt printed</Tag>
      </div>
    </Screen>
  )
}

/** 2:00 PM: the truck is out on a delivery. */
export function RoadScreen() {
  return (
    <Screen title="Fleet · Vehicles">
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--app-border)", borderTop: "3px solid var(--app-success)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="display text-2xl text-white">Truck 1</p>
            <p className="text-xs faint">Pedro · Delivery to the north branch</p>
          </div>
          <Tag tone="good">On a trip</Tag>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="stat-label">Left at</p>
            <p className="display text-3xl text-white">1:52 PM</p>
          </div>
          <div>
            <p className="stat-label">This month</p>
            <p className="display text-3xl text-white">1,840 km</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        {[
          ["Fuel", "212 L"],
          ["km per L", "8.7"],
          ["Cost per km", "₱7.10"],
        ].map(([label, value], i) => (
          <div key={label} className="rounded-lg py-2 lp-stagger" style={{ background: "var(--app-surface-2)", ["--i" as string]: i }}>
            <p className="stat-label">{label}</p>
            <p className="display text-xl text-white">{value}</p>
          </div>
        ))}
      </div>
    </Screen>
  )
}

/** 4:00 PM: customers who buy on credit, with limits, and a payment coming in. */
export function UtangScreen() {
  const customers = [
    { name: "Aling Nena", owes: 750, limit: 2000, note: "Paid ₱500 today" },
    { name: "Mang Ramon", owes: 1840, limit: 2000, note: "Near the limit" },
    { name: "Carinderia ni Lita", owes: 1660, limit: 5000, note: "Last paid Oct 28" },
  ]
  return (
    <Screen title="Customers · Utang">
      <Rows>
        {customers.map(c => (
          <div key={c.name} className="list-row text-sm">
            <span className="flex-1 min-w-0">
              <span className="block text-white truncate">{c.name}</span>
              <span className={`block text-xs ${c.owes / c.limit > 0.9 ? "text-warn" : "faint"}`}>{c.note}</span>
            </span>
            <span className="text-right">
              <span className="block text-white font-semibold tabular">{currency(c.owes)}</span>
              <span className="block text-[0.7rem] faint">of {currency(c.limit)}</span>
            </span>
          </div>
        ))}
      </Rows>
      <div className="flex items-end justify-between mt-4">
        <span className="stat-label">Total owed to you</span>
        <span className="display text-3xl text-warn">{currency(4250)}</span>
      </div>
    </Screen>
  )
}

/** 6:00 PM: closing, with the cash drawer counted against what the system expects. */
export function ClosingScreen() {
  const methods = [
    ["Cash", 9860],
    ["GCash", 2215],
    ["Maya", 405],
    ["On credit", 640],
  ] as const
  return (
    <Screen title="End of Day · Monday">
      <Rows>
        {methods.map(([method, amount]) => (
          <div key={method} className="list-row text-sm">
            <span className="flex-1 text-white">{method}</span>
            <span className="tabular text-white">{currency(amount)}</span>
          </div>
        ))}
      </Rows>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--app-surface-2)" }}>
          <p className="stat-label">Expected cash</p>
          <p className="display text-2xl text-white">{currency(10860)}</p>
        </div>
        <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--app-surface-2)" }}>
          <p className="stat-label">Counted</p>
          <p className="display text-2xl text-white">{currency(10860)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Tag tone="good">Drawer matched</Tag>
        <Tag>Owner emailed</Tag>
      </div>
    </Screen>
  )
}

/** 8:30 PM: the profit report for the month so far. */
export function NumbersScreen() {
  const days = [62, 48, 71, 55, 80, 92, 66, 58, 74, 88, 61, 95]
  const best = [
    ["Rice 25kg", "₱6,120"],
    ["Cooking oil 1L", "₱2,940"],
    ["Instant noodles", "₱2,310"],
  ]
  return (
    <Screen title="Profit Report · This month">
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          ["Sales", "₱170,268"],
          ["Profit", "₱50,082"],
          ["Margin", "29%"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="stat-label">{label}</p>
            <p className={`display text-2xl ${label === "Profit" ? "text-good" : "text-white"}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5 h-20 lp-bars lp-bars-split" aria-hidden>
        {days.map((h, i) => (
          <span key={i} style={{ height: `${h}%`, ["--i" as string]: i }} />
        ))}
      </div>
      <p className="text-[0.65rem] faint mt-3 mb-1 uppercase tracking-[0.16em]">Most profit</p>
      <Rows>
        {best.map(([name, profit]) => (
          <div key={name} className="list-row text-sm">
            <span className="flex-1 text-white">{name}</span>
            <span className="text-good tabular">{profit}</span>
          </div>
        ))}
      </Rows>
    </Screen>
  )
}

/** Monday, 9:00 AM: the weekly summary email. */
export function SummaryEmail() {
  const rows = [
    ["Sales", "₱38,410"],
    ["Profit", "₱10,920"],
    ["Low on stock", "6 products"],
    ["Customers owe you", "₱4,250"],
  ]
  return (
    <div className="lp-email lp-window overflow-hidden">
      <div className="px-5 pt-5 pb-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em]" style={{ color: "#8a8d94" }}>
          Monday, 9:00 AM · to the owner
        </p>
        <p className="text-lg font-bold mt-2" style={{ color: "#0b0e14" }}>
          Your week, Oct 26 – Nov 1
        </p>
        <p className="text-sm mt-1" style={{ color: "#33363d" }}>
          212 sales for ₱38,410, 8% more than the week before.
        </p>
      </div>
      <div className="px-5 pb-5">
        {rows.map(([label, value], i) => (
          <div key={label} className="flex justify-between gap-3 py-2 text-sm lp-stagger" style={{ borderTop: "1px solid #eeece6", ["--i" as string]: i }}>
            <span style={{ color: "#5d6068" }}>{label}</span>
            <span className="font-semibold" style={{ color: "#0b0e14" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
