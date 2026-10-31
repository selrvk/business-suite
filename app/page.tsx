import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { AppLogoMark } from "@/components/app-logo"
import { getSession, isPlatformLogin } from "@/lib/auth"
import { MODULE_INFO, config, hasModule, type ModuleKey } from "@/lib/config"
import { price } from "@/lib/format"
import { BarcodeDivider, FleetScreen, PaperBarcode, PosScreen, QuickScanScreen, TimeClockScreen } from "./landing-parts"
import "./landing.css"

const MODULES: {
  key: ModuleKey
  scan: string
  title: string
  line: string
  points: string[]
  screen: React.ReactNode
}[] = [
  {
    key: "inventory",
    scan: "Scan a product",
    title: "Inventory",
    line: "Know what's on the shelf without counting it by hand.",
    points: [
      "Quick Scan: every scan adds or removes stock on the spot",
      "Stock In: scan a delivery item by item, save once",
      "Low-stock alerts and a log of every change and who made it",
      "No barcode? Generate one and print labels",
    ],
    screen: <QuickScanScreen />,
  },
  {
    key: "sales",
    scan: "Scan at the counter",
    title: "Point of Sale",
    line: "A checkout that keeps your stock count honest.",
    points: [
      "Scan items into the cart; change is worked out for you",
      "Receipts for 80mm thermal printers",
      "Pending orders for phone orders and deliveries",
      "Sales by day, month and payment method",
    ],
    screen: <PosScreen />,
  },
  {
    key: "attendance",
    scan: "Scan an ID badge",
    title: "Attendance",
    line: "A time clock nobody can fill in later from memory.",
    points: [
      "Print ID badges with barcodes",
      "Scan once to clock in, again to clock out",
      "Timesheets with 1st–15th and 16th–end cut-offs",
      "Missed clock-outs are flagged for you to fix",
    ],
    screen: <TimeClockScreen />,
  },
  {
    key: "fleet",
    scan: "Scan the truck's tag",
    title: "Fleet",
    line: "Every trip, kilometer and liter, without the logbook.",
    points: [
      "Start and end trips with odometer readings",
      "Fuel logs with cost",
      "Kilometers per month, km per liter, cost per km",
      "Copy in trips from an old paper logbook",
    ],
    screen: <FleetScreen />,
  },
]

const FAQ: [string, React.ReactNode][] = [
  [
    "Do I need special hardware?",
    "No. Any USB or Bluetooth barcode scanner that types like a keyboard works, which is most of them. You can also type codes in by hand, and everything works on a phone, tablet or computer.",
  ],
  ["My products don't have barcodes. Can I still use it?", "Yes. Generate a barcode for any product in one click and print labels on regular paper."],
  [
    "Can my staff use it without seeing everything?",
    "Yes. Give each person their own username. Staff can sell, receive stock, clock in and log trips; only owners and admins can delete records, change settings or manage people.",
  ],
  ["Is my data kept separate from other businesses?", "Yes. Every business's records are kept apart by the database itself, so no other business can see or change them."],
  [
    "How do I pay?",
    `After your free trial, pay ${price(config.price.monthly)} a month${config.price.yearly ? " (or yearly)" : ""} by GCash or bank transfer and send the reference number from your Billing page. Your suite stays unlocked as soon as it's confirmed.`,
  ],
  ["What happens if I stop paying?", "Your suite locks, but nothing is deleted. Pay again and you pick up exactly where you left off."],
]

export default async function HomePage() {
  const [session, platform] = await Promise.all([getSession(), isPlatformLogin()])
  const modules = MODULES.filter(m => hasModule(m.key))
  const yearly = config.price.yearly
  const yearlySaving = yearly ? Math.round((1 - yearly / (config.price.monthly * 12)) * 100) : 0

  const primary = session ? (
    <Link href="/dashboard" className="btn btn-primary btn-lg lp-scan-btn">
      Open {session.business.name} <ArrowRight size={16} />
    </Link>
  ) : (
    <Link href="/signup" className="btn btn-primary btn-lg lp-scan-btn">
      Start your {config.trialDays}-day free trial <ArrowRight size={16} />
    </Link>
  )

  return (
    <div className="lp min-h-screen">
      <div className="lp-progress" aria-hidden />

      {/* 1 · Header */}
      <header className="lp-header">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <AppLogoMark size={34} />
            <span className="display text-lg sm:text-2xl text-white truncate">{config.appName}</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
            <a href="#pricing" className="btn btn-ghost hidden sm:inline-flex">
              Pricing
            </a>
            {session ? (
              <Link href="/dashboard" className="btn btn-primary lp-scan-btn">
                Open app
              </Link>
            ) : platform ? (
              <Link href="/platform" className="btn btn-primary lp-scan-btn">
                Platform admin
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost max-sm:px-2.5">
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary lp-scan-btn max-sm:px-3">
                  Start free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* 2 · Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center">
        <div className="flex flex-col gap-6">
          <span className="lp-chip self-start">The business suite for small businesses</span>
          <h1 className="page-title" style={{ fontSize: "clamp(3rem, 8vw, 5.75rem)" }}>
            Stock, sales, staff and trucks. One scanner.
          </h1>
          <p className="text-lg muted max-w-xl leading-relaxed">
            Plug in a barcode scanner and every product, sale, clock-in and trip is recorded the moment you scan it. No more
            notebooks to add up at the end of the day.
          </p>
          <div className="flex flex-wrap gap-3">
            {primary}
            {!session && (
              <Link href="/login" className="btn btn-secondary btn-lg">
                Log in
              </Link>
            )}
          </div>
          <p className="text-sm muted">
            {config.trialDays} days free, no payment needed · then {price(config.price.monthly)}/month, everything included
          </p>
        </div>

        {/* The scanner window: a barcode under the laser, and what it records. */}
        <div className="lp-window p-4 sm:p-5" aria-label="A barcode being scanned and recorded">
          <div className="lp-scanzone">
            <PaperBarcode seed="4800016644504" height={70} />
            <p className="text-center font-mono text-[0.8rem] tracking-[0.3em] text-[#222] mt-2">4 800016 644504</p>
            <span className="lp-scanline" aria-hidden />
          </div>
          <hr className="lp-perf my-4 text-white" />
          <div className="flex flex-col gap-2 text-sm">
            {[
              ["Sale #128 · Cola 1.5L × 2", "−2 stock", "text-warn"],
              ["Maria clocked in", "7:58 AM", "text-good"],
              ["Truck 1 trip ended", "+186 km", "text-brand"],
            ].map(([what, result, tone]) => (
              <div key={what} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5" style={{ background: "var(--app-surface-2)" }}>
                <span className="flex items-center gap-2 text-white min-w-0">
                  <Check size={14} className="text-good shrink-0" /> <span className="truncate">{what}</span>
                </span>
                <span className={`font-semibold tabular shrink-0 ${tone}`}>{result}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BarcodeDivider seed="how-it-works" />

      {/* 3 · How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <p className="eyebrow">How it works</p>
        <h2 className="page-title mb-10" style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}>
          Plug in. Scan. It&apos;s recorded.
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            ["Plug in any barcode scanner", "USB or Bluetooth, the kind sold everywhere. It works like a keyboard, so there's nothing to install."],
            ["Scan", "Products at the counter, deliveries at the door, ID badges at the time clock, tags on the truck keys."],
            ["It's recorded", "Stock goes down, sales add up, hours and kilometers are counted. Check it all from any phone or computer."],
          ].map(([title, text], i) => (
            <li key={title} className="card card-body flex flex-col gap-3">
              <span className="display text-5xl" style={{ color: "var(--laser)" }}>
                0{i + 1}
              </span>
              <p className="display text-2xl text-white">{title}</p>
              <p className="text-sm muted leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4 · Modules */}
      {modules.map((m, i) => (
        <div key={m.key}>
          <BarcodeDivider seed={m.key} />
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 grid gap-10 lg:grid-cols-2 items-center">
            <div className={`flex flex-col gap-5 ${i % 2 ? "lg:order-2" : ""}`}>
              <span className="lp-chip self-start">{m.scan}</span>
              <h2 className="page-title" style={{ fontSize: "clamp(2.4rem, 5vw, 3.75rem)" }}>
                {m.title}
              </h2>
              <p className="text-lg muted leading-relaxed">{m.line}</p>
              <ul className="flex flex-col gap-2.5">
                {m.points.map(p => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-white">
                    <Check size={16} className="text-good shrink-0 mt-0.5" /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={i % 2 ? "lg:order-1" : ""}>{m.screen}</div>
          </section>
        </div>
      ))}

      <BarcodeDivider seed="included" />

      {/* Also included */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="section-title mb-6">Also in every plan</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Excel export", "Products, sales, timesheets, trips and fuel."],
            ["Staff logins", "Usernames for everyone, with owner, admin and staff roles."],
            ["Any device", "Phones, tablets and computers. Nothing to install."],
            ["Your own data", "Kept separate from every other business."],
          ].map(([title, text]) => (
            <div key={title} className="card card-body">
              <p className="display text-xl text-white">{title}</p>
              <p className="text-sm muted mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <BarcodeDivider seed="pricing" />

      {/* 6 · Pricing, printed on a receipt */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid gap-10 lg:grid-cols-[1fr_420px] items-center scroll-mt-20">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Pricing</p>
          <h2 className="page-title" style={{ fontSize: "clamp(2.4rem, 5vw, 3.75rem)" }}>
            One plan. Everything in it.
          </h2>
          <p className="text-lg muted leading-relaxed max-w-lg">
            No add-ons and no per-user fees. Try it free for {config.trialDays} days, then {price(config.price.monthly)} a month
            {yearly ? " or save with a year" : ""}.
          </p>
        </div>

        <div className="lp-receipt px-7 pt-9 pb-11 text-[0.85rem] shadow-2xl mx-auto w-full max-w-[420px]">
          <p className="text-center font-bold tracking-[0.2em] text-base">{config.appName.toUpperCase()}</p>
          <p className="text-center text-xs" style={{ color: "var(--ink-soft)" }}>
            ONE PLAN · EVERYTHING INCLUDED
          </p>
          <hr className="lp-perf my-4" />
          {modules.map(m => (
            <div key={m.key} className="lp-row">
              <span>{MODULE_INFO[m.key].label}</span>
              <span className="lp-dots" />
              <span>✓</span>
            </div>
          ))}
          <div className="lp-row">
            <span>Staff logins</span>
            <span className="lp-dots" />
            <span>unlimited</span>
          </div>
          <div className="lp-row">
            <span>Products</span>
            <span className="lp-dots" />
            <span>unlimited</span>
          </div>
          <hr className="lp-perf my-4" />
          <div className="lp-row text-lg font-bold">
            <span>MONTHLY</span>
            <span>{price(config.price.monthly)}</span>
          </div>
          {yearly && (
            <div className="lp-row font-bold">
              <span>YEARLY</span>
              <span>{price(yearly)}</span>
            </div>
          )}
          {yearlySaving > 0 && (
            <p className="text-right text-xs" style={{ color: "var(--ink-soft)" }}>
              save {yearlySaving}% with a year
            </p>
          )}
          <hr className="lp-perf my-4" />
          <div className="lp-row font-bold">
            <span>FIRST {config.trialDays} DAYS</span>
            <span>FREE</span>
          </div>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            No payment needed to start. Pay by GCash or bank transfer when you&apos;re ready.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {session ? (
              <Link href="/dashboard" className="btn btn-primary btn-lg btn-block lp-scan-btn">
                Open {session.business.name}
              </Link>
            ) : (
              <Link href="/signup" className="btn btn-primary btn-lg btn-block lp-scan-btn">
                Start free trial
              </Link>
            )}
          </div>
          <div className="mt-6">
            <PaperBarcode seed="receipt-total" height={36} />
          </div>
        </div>
      </section>

      <BarcodeDivider seed="faq" />

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <h2 className="page-title mb-8" style={{ fontSize: "clamp(2.2rem, 5vw, 3.25rem)" }}>
          Questions
        </h2>
        <div className="flex flex-col gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="lp-faq card">
              <summary className="card-body font-semibold text-white">{q}</summary>
              <p className="px-5 pb-5 -mt-2 text-sm muted leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 text-center flex flex-col items-center gap-5">
        <h2 className="page-title" style={{ fontSize: "clamp(2.4rem, 6vw, 4.25rem)" }}>
          Put the notebook down.
        </h2>
        <p className="muted">Set up takes a few minutes. Your first {config.trialDays} days are free.</p>
        {primary}
      </section>

      {/* 7 · Footer: the torn-off end of the receipt */}
      <footer className="lp-torn" style={{ background: "var(--paper)", color: "var(--ink)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8 flex flex-col gap-6 font-mono text-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-3 font-bold tracking-[0.2em]">
              <AppLogoMark size={28} /> THANK YOU FOR SCANNING
            </p>
            <nav className="flex flex-wrap gap-4">
              <Link href="/signup" className="underline">
                Start free
              </Link>
              <Link href="/login" className="underline">
                Log in
              </Link>
              <a href="#pricing" className="underline">
                Pricing
              </a>
              {config.contactEmail ? (
                <a href={`mailto:${config.contactEmail}`} className="underline">
                  {config.contactEmail}
                </a>
              ) : (
                <span className="lp-todo">TODO(owner): set NEXT_PUBLIC_CONTACT_EMAIL</span>
              )}
            </nav>
          </div>
          <PaperBarcode seed={config.appName} height={30} />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            © {new Date().getFullYear()} {config.appName}
          </p>
        </div>
      </footer>
    </div>
  )
}
