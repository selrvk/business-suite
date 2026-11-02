import Link from "next/link"
import {
  ArrowRight,
  BadgePercent,
  CalendarRange,
  Check,
  Download,
  HandCoins,
  Laptop,
  LockKeyhole,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { AppLogoMark } from "@/components/app-logo"
import { getSession, isPlatformLogin } from "@/lib/auth"
import { MODULE_INFO, config, hasModule, type ModuleKey } from "@/lib/config"
import { BUSINESS_TYPES } from "@/lib/features"
import { price } from "@/lib/format"
import {
  ClosingScreen,
  CounterScreen,
  DeliveryScreen,
  NumbersScreen,
  OpeningScreen,
  RoadScreen,
  SummaryEmail,
  UtangScreen,
} from "./landing-parts"
import { LandingMotion, TodayBoard } from "./landing-motion"
import "./landing.css"

// The showcase site. Its idea: one business day, open to close. The page
// follows an owner's day; a line down the side fills as you scroll and a
// clock shows the time of the part you're reading.

type Chapter = {
  id: string
  time: string
  label: string
  module: ModuleKey
  title: string
  line: string
  points: string[]
  screen: React.ReactNode
}

const CHAPTERS: Chapter[] = [
  {
    id: "opening",
    time: "7:58 AM",
    label: "Opening",
    module: "attendance",
    title: "Your team clocks in",
    line: "Everyone gets their own login, and can only do what you allow.",
    points: [
      "Print ID badges: scan once to clock in, again to clock out",
      "Choose per person who can give discounts, see costs, sell on credit or void sales",
      "Timesheets with 1st–15th and 16th–end cut-offs, with missed punches flagged",
      "An activity log of who did what, and when",
    ],
    screen: <OpeningScreen />,
  },
  {
    id: "delivery",
    time: "9:15 AM",
    label: "A delivery arrives",
    module: "inventory",
    title: "Stock that tells you what to reorder",
    line: "Record deliveries as they come in, and always know what's on the shelf.",
    points: [
      "Stock In: check a delivery item by item, save once",
      "Expiry dates per delivery, sold soonest first, with warnings before they expire",
      "A reorder list grouped by supplier, ready to text or copy",
      "Every stock change in one log, with who made it",
      "Bring in your product list from Excel",
    ],
    screen: <DeliveryScreen />,
  },
  {
    id: "counter",
    time: "12:30 PM",
    label: "Lunch rush",
    module: "sales",
    title: "A checkout that keeps your count right",
    line: "Every sale takes the items off your stock the moment it's made.",
    points: [
      "Search, tap or scan items into the cart; change is worked out for you",
      "Cash, GCash, Maya, card or bank transfer, with reference numbers",
      "Senior Citizen and PWD discounts per item: 20% on medicine and meals, 5% on basic goods",
      "Receipts for 80mm thermal printers, and pending orders for phone orders",
    ],
    screen: <CounterScreen />,
  },
  {
    id: "road",
    time: "2:00 PM",
    label: "Out on deliveries",
    module: "fleet",
    title: "Every trip and liter, without the logbook",
    line: "Know where the trucks are and what they cost you to run.",
    points: [
      "Start and end trips with odometer readings",
      "Fuel logs with cost",
      "Kilometers per month, km per liter and cost per km",
      "Copy in trips from an old paper logbook",
    ],
    screen: <RoadScreen />,
  },
  {
    id: "utang",
    time: "4:00 PM",
    label: "Collecting utang",
    module: "sales",
    title: "Know exactly who owes you",
    line: "No more guessing from a notebook who paid and who didn't.",
    points: [
      "Put a sale on a customer's tab, in full or in part",
      "Set a credit limit per customer, so no one goes over",
      "Record payments as they come in; balances update at once",
      "Each customer's full history of credit and payments",
    ],
    screen: <UtangScreen />,
  },
  {
    id: "closing",
    time: "6:00 PM",
    label: "Closing",
    module: "sales",
    title: "Close the day in two minutes",
    line: "Count the drawer and see straight away if it's short or over.",
    points: [
      "The day's sales by payment method, credit given and collected",
      "The cash you should have, next to what you counted",
      "Discounts and voided sales for the day, in one place",
      "The owner gets an email when the day is closed",
    ],
    screen: <ClosingScreen />,
  },
  {
    id: "numbers",
    time: "8:30 PM",
    label: "At home",
    module: "sales",
    title: "See what you actually made",
    line: "Profit worked out from what each item cost you, not just what came in.",
    points: [
      "Profit by day or month, with your margin",
      "Best sellers by profit, units or sales",
      "Products sold below cost or at a thin margin",
      "Slow movers: stock that hasn't sold in 30, 60 or 90 days",
      "Export any of it to Excel",
    ],
    screen: <NumbersScreen />,
  },
  {
    id: "monday",
    time: "Monday",
    label: "9:00 AM",
    module: "sales",
    title: "Last week, in your inbox",
    line: "A short summary every Monday, so you know how the week went without opening the app.",
    points: [
      "Sales, profit and best sellers for the week",
      "What's low on stock, what's expiring, and who owes you",
      "Every Monday, every morning, or off: your choice",
    ],
    screen: <SummaryEmail />,
  },
]

const LOCAL: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BadgePercent, title: "Senior Citizen & PWD", text: "20% on medicine and meals, 5% on basic goods with the weekly limit, worked out item by item." },
  { icon: Wallet, title: "GCash, Maya and bank", text: "Every payment method, with its reference number on the receipt." },
  { icon: HandCoins, title: "Utang, with limits", text: "Customers' tabs, payments and balances, without the notebook." },
  { icon: CalendarRange, title: "Payroll cut-offs", text: "Timesheets for the 1st–15th and the 16th to the end of the month." },
]

const YOURS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Download, title: "Your records are yours", text: "Download everything to Excel any time. We never sell your data or show you ads." },
  { icon: LockKeyhole, title: "Kept apart", text: "The database itself keeps each business separate from every other." },
  { icon: ShieldCheck, title: "Staff see what you allow", text: "Owner, admin and staff roles, with permissions per person." },
  { icon: Smartphone, title: "Phone, tablet or computer", text: "Nothing to install. Add it to your home screen to open it like an app." },
  { icon: ScanBarcode, title: "Scanner optional", text: "Search and tap on any device, or plug in a barcode scanner for speed. Print labels for products without one." },
  { icon: Laptop, title: "Set up in minutes", text: "Sign up, pick your kind of business, then add your products or bring them in from Excel." },
]

const FAQ: [string, React.ReactNode][] = [
  [
    "Will it work for my kind of business?",
    "It's made for small businesses: stores and sari-sari stores, pharmacies, food businesses, hardware, and distributors with delivery trucks. Pick your kind of business when you sign up and the right features are switched on. You can turn any of them on or off later in Settings.",
  ],
  [
    "Do I need a barcode scanner?",
    "No. You can search for products and tap them on any phone, tablet or computer. A USB or Bluetooth scanner makes checkout faster, and you can print barcode labels for products that don't have one.",
  ],
  [
    "Can my staff use it without seeing everything?",
    "Yes. Everyone gets their own username. You decide per person whether they can see costs and profit, give discounts, sell on credit, correct stock, or void sales, and the activity log shows who did what.",
  ],
  [
    "Does it print official receipts?",
    "No. Its receipts are not BIR official receipts, and they say so. If your business has to issue official receipts, keep using your registered booklet or system for those.",
  ],
  ["Do I need internet?", "Yes, it saves everything online so you can check it from anywhere. Mobile data or a pocket WiFi is enough."],
  [
    "Is my data safe, and is it mine?",
    "Every business's records are kept apart by the database itself. Your data is yours: download all of it to Excel any time, from Settings or Billing. We never sell it.",
  ],
  [
    "How do I pay?",
    `After your free trial, pay ${price(config.price.monthly)} a month${config.price.yearly ? " (or yearly)" : ""} by GCash or bank transfer and send the reference number from your Billing page. Your suite stays open as soon as it's confirmed.`,
  ],
  [
    "What happens if I stop paying?",
    "Your suite locks, but nothing is deleted, and you can still download all your records. Pay again and you pick up exactly where you left off.",
  ],
]

/** Delay steps for blocks that appear one after another. */
const step = (i: number) => ({ ["--i" as string]: i }) as React.CSSProperties

export default async function HomePage() {
  const [session, platform] = await Promise.all([getSession(), isPlatformLogin()])
  const chapters = CHAPTERS.filter(c => hasModule(c.module))
  const yearly = config.price.yearly
  const yearlySaving = yearly ? Math.round((1 - yearly / (config.price.monthly * 12)) * 100) : 0

  const primary = session ? (
    <Link href="/dashboard" className="btn btn-primary btn-lg lp-cta">
      Open {session.business.name} <ArrowRight size={16} />
    </Link>
  ) : (
    <Link href="/signup" className="btn btn-primary btn-lg lp-cta">
      Start your {config.trialDays}-day free trial <ArrowRight size={16} />
    </Link>
  )

  return (
    <div className="lp min-h-screen">
      {/* Hide blocks that animate in before they're painted. Undone after 4s if the page's script never runs. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var r=document.documentElement;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;r.classList.add('lp-anim');setTimeout(function(){if(!r.classList.contains('lp-ready'))r.classList.remove('lp-anim')},4000)})()",
        }}
      />
      <LandingMotion />
      <div className="lp-sky lp-sky-morning" aria-hidden />
      <div className="lp-sky lp-sky-evening" aria-hidden />

      {/* Header */}
      <header className="lp-header">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <AppLogoMark size={34} />
            <span className="display text-lg sm:text-2xl text-white truncate">{config.appName}</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
            <a href="#day" className="btn btn-ghost hidden md:inline-flex">
              How it works
            </a>
            <a href="#pricing" className="btn btn-ghost hidden sm:inline-flex">
              Pricing
            </a>
            {session ? (
              <Link href="/dashboard" className="btn btn-primary lp-cta">
                Open app
              </Link>
            ) : platform ? (
              <Link href="/platform" className="btn btn-primary lp-cta">
                Platform admin
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost max-sm:px-2.5">
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary lp-cta max-sm:px-3">
                  Start free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 md:pt-20 md:pb-24 grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
        <div className="flex flex-col gap-6 lp-reveal" data-reveal>
          <span className="lp-chip self-start lp-stagger" style={step(0)}>
            For small businesses in the Philippines
          </span>
          <h1 className="page-title lp-stagger" style={{ fontSize: "clamp(3rem, 7.5vw, 5.5rem)", ...step(1) }}>
            Run your whole business from one place.
          </h1>
          <p className="text-lg muted max-w-xl leading-relaxed lp-stagger" style={step(2)}>
            Stock, sales, utang, staff and trucks in one app. At the end of every day you know what sold, who owes you, and how
            much you actually made.
          </p>
          <div className="flex flex-wrap gap-3 lp-stagger" style={step(3)}>
            {primary}
            {!session && (
              <Link href="/login" className="btn btn-secondary btn-lg">
                Log in
              </Link>
            )}
          </div>
          <p className="text-sm muted lp-stagger" style={step(4)}>
            {config.trialDays} days free, no payment needed · then {price(config.price.monthly)}/month, everything included
          </p>
        </div>
        <div className="lp-reveal lp-reveal-late" data-reveal>
          <TodayBoard />
        </div>
      </section>

      {/* The day at a glance: each part of the business, linking to its part of the day */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <div className="lp-reveal" data-reveal>
          <p className="eyebrow">Everything in one place</p>
          <h2 className="page-title mb-8" style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}>
            The whole day, kept track of.
          </h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lp-reveal" data-reveal>
          {chapters.map((c, i) => (
            <li key={c.id} className="lp-stagger" style={step(i)}>
              <a href={`#${c.id}`} className="lp-card card card-body flex flex-col gap-1.5 h-full">
                <span className="lp-time">
                  {c.time}
                  {c.id === "monday" && `, ${c.label}`}
                </span>
                <span className="display text-xl text-white leading-tight">{c.title}</span>
                <span className="text-xs muted leading-relaxed">{c.line}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* The day, open to close */}
      <section id="day" className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 md:pt-24 scroll-mt-16">
        <div className="lp-reveal max-w-2xl mb-14" data-reveal>
          <p className="eyebrow">A day with {config.appName}</p>
          <h2 className="page-title" style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}>
            From opening to closing.
          </h2>
          <p className="text-lg muted leading-relaxed mt-4">
            Here&apos;s what a day looks like when the notebook is gone. Use only the parts you need.
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[150px_1fr] lg:gap-8">
          <aside className="hidden lg:block" aria-hidden>
            <div className="lp-clock">
              <p data-clock>{chapters[0]?.time}</p>
              <p data-clock-label>{chapters[0]?.label}</p>
            </div>
          </aside>

          <div className="lp-timeline" data-timeline>
            {chapters.map((c, i) => (
              <article key={c.id} id={c.id} className="lp-chapter scroll-mt-24" data-chapter data-time={c.time} data-label={c.label}>
                <p className="lp-stamp">
                  <span className="lp-node" aria-hidden />
                  <time>{c.time}</time>
                  <span className="faint">·</span>
                  <span>{c.label}</span>
                </p>
                <div className="grid gap-8 lg:grid-cols-2 items-center">
                  <div className={`flex flex-col gap-4 lp-reveal ${i % 2 ? "lg:order-2" : ""}`} data-reveal>
                    <h3 className="page-title" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
                      {c.title}
                    </h3>
                    <p className="text-lg muted leading-relaxed">{c.line}</p>
                    <ul className="flex flex-col gap-2.5">
                      {c.points.map((p, j) => (
                        <li key={p} className="flex items-start gap-2.5 text-sm text-white lp-stagger" style={step(j + 1)}>
                          <Check size={16} className="text-good shrink-0 mt-0.5" /> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`lp-reveal lp-reveal-late ${i % 2 ? "lg:order-1" : ""}`} data-reveal>
                    {c.screen}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Made here */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <div className="lp-reveal max-w-2xl" data-reveal>
          <p className="eyebrow">Made for how business works here</p>
          <h2 className="page-title" style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}>
            Built for Philippine businesses.
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-10 lp-reveal" data-reveal>
          {LOCAL.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="lp-card card card-body lp-stagger" style={step(i)}>
              <Icon size={20} className="text-brand" />
              <p className="display text-xl text-white mt-3">{title}</p>
              <p className="text-sm muted mt-1 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.4fr] items-start">
          <div className="lp-reveal" data-reveal>
            <h3 className="display text-3xl text-white">Set up for your kind of business</h3>
            <p className="muted mt-3 leading-relaxed">
              Pick what you do when you sign up and the right features switch on: expiry dates for pharmacies, shelf locations for
              hardware, trucks for distributors. Change it any time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lp-reveal" data-reveal>
            {BUSINESS_TYPES.filter(t => t.key !== "other").map((t, i) => (
              <span key={t.key} className="lp-type lp-stagger" style={step(i)}>
                <span className="text-white font-semibold">{t.label}</span>
                <span className="faint text-xs">{t.hint}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Yours to keep */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 md:pb-28">
        <div className="lp-reveal max-w-2xl" data-reveal>
          <p className="eyebrow">Peace of mind</p>
          <h2 className="page-title" style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}>
            Your business, your data.
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-10 lp-reveal" data-reveal>
          {YOURS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="lp-card card card-body flex gap-4 lp-stagger" style={step(i)}>
              <Icon size={20} className="text-brand shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="text-sm muted mt-1 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing, printed on a receipt */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid gap-10 lg:grid-cols-[1fr_420px] items-center scroll-mt-20">
        <div className="flex flex-col gap-4 lp-reveal" data-reveal>
          <p className="eyebrow">Pricing</p>
          <h2 className="page-title" style={{ fontSize: "clamp(2.4rem, 5vw, 3.75rem)" }}>
            One plan. Everything in it.
          </h2>
          <p className="text-lg muted leading-relaxed max-w-lg">
            No add-ons and no per-user fees. Try it free for {config.trialDays} days, then {price(config.price.monthly)} a month
            {yearly ? " or save with a year" : ""}.
          </p>
        </div>

        <div className="lp-reveal lp-reveal-late" data-reveal>
          <div className="lp-receipt px-7 pt-9 pb-11 text-[0.85rem] shadow-2xl mx-auto w-full max-w-[420px]">
            <p className="text-center font-bold tracking-[0.2em] text-base">{config.appName.toUpperCase()}</p>
            <p className="text-center text-xs" style={{ color: "var(--ink-soft)" }}>
              ONE PLAN · EVERYTHING INCLUDED
            </p>
            <hr className="lp-perf my-4" />
            {config.modules.map((m, i) => (
              <div key={m} className="lp-row lp-stagger" style={step(i)}>
                <span>{MODULE_INFO[m].label}</span>
                <span className="lp-dots" />
                <span>✓</span>
              </div>
            ))}
            {[
              ["Reports & summaries", "✓"],
              ["Staff logins", "unlimited"],
              ["Products", "unlimited"],
            ].map(([label, value], i) => (
              <div key={label} className="lp-row lp-stagger" style={step(config.modules.length + i)}>
                <span>{label}</span>
                <span className="lp-dots" />
                <span>{value}</span>
              </div>
            ))}
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
                <Link href="/dashboard" className="btn btn-primary btn-lg btn-block lp-cta">
                  Open {session.business.name}
                </Link>
              ) : (
                <Link href="/signup" className="btn btn-primary btn-lg btn-block lp-cta">
                  Start free trial <ArrowRight size={16} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Questions */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20 scroll-mt-16">
        <h2 className="page-title mb-8 lp-reveal" data-reveal style={{ fontSize: "clamp(2.2rem, 5vw, 3.25rem)" }}>
          Questions
        </h2>
        <div className="flex flex-col gap-2 lp-reveal" data-reveal>
          {FAQ.map(([q, a], i) => (
            <details key={q} className="lp-faq card lp-stagger" style={step(i)}>
              <summary className="card-body font-semibold text-white">{q}</summary>
              <p className="px-5 pb-5 -mt-2 text-sm muted leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Last call */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 text-center flex flex-col items-center gap-5 lp-reveal" data-reveal>
        <h2 className="page-title" style={{ fontSize: "clamp(2.4rem, 6vw, 4.25rem)" }}>
          Start tomorrow with everything in order.
        </h2>
        <p className="muted">Setting up takes a few minutes. Your first {config.trialDays} days are free.</p>
        {primary}
      </section>

      {/* Footer: the end-of-day slip */}
      <footer className="lp-torn" style={{ background: "var(--paper)", color: "var(--ink)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10 flex flex-col gap-6 font-mono text-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-3 font-bold tracking-[0.2em]">
              <AppLogoMark size={28} /> CLOSED FOR THE DAY · SALAMAT!
            </p>
            <nav className="flex flex-wrap gap-x-4 gap-y-2">
              <a href="#day" className="underline">
                How it works
              </a>
              <a href="#pricing" className="underline">
                Pricing
              </a>
              <Link href="/signup" className="underline">
                Start free
              </Link>
              <Link href="/login" className="underline">
                Log in
              </Link>
              <Link href="/terms" className="underline">
                Terms
              </Link>
              <Link href="/privacy" className="underline">
                Privacy
              </Link>
              <a href={`mailto:${config.contactEmail}`} className="underline">
                {config.contactEmail}
              </a>
            </nav>
          </div>
          <hr className="lp-perf" />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            © {new Date().getFullYear()} {config.appName} · by {config.provider}
          </p>
        </div>
      </footer>
    </div>
  )
}
