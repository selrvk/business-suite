"use client"

import { useEffect, useRef, useState } from "react"
import { config } from "@/lib/config"

// Motion for the showcase site. Everything here is skipped for people who ask
// their device for reduced motion: content simply shows in its final state.

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Reveals [data-reveal] blocks as they scroll into view, and drives the day
 * timeline: the line fills as you scroll and the clock shows the time of the
 * part of the day you're reading. Mounted once on the page.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("lp-ready")
    const blocks = [...document.querySelectorAll<HTMLElement>("[data-reveal]")]
    const timeline = document.querySelector<HTMLElement>("[data-timeline]")
    const chapters = [...document.querySelectorAll<HTMLElement>("[data-chapter]")]
    const clock = document.querySelector<HTMLElement>("[data-clock]")
    const clockLabel = document.querySelector<HTMLElement>("[data-clock-label]")

    if (reduced()) {
      blocks.forEach(b => b.setAttribute("data-shown", ""))
      chapters.forEach(c => c.setAttribute("data-reached", ""))
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute("data-shown", "")
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    )
    blocks.forEach(b => observer.observe(b))

    let frame = 0
    let current = -1
    const update = () => {
      frame = 0
      if (!timeline) return
      const middle = window.innerHeight * 0.55
      const rect = timeline.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, (middle - rect.top) / rect.height))
      root.style.setProperty("--day", progress.toFixed(4))
      let index = -1
      chapters.forEach((chapter, i) => {
        const reached = chapter.getBoundingClientRect().top < middle
        chapter.toggleAttribute("data-reached", reached)
        if (reached) index = i
      })
      if (index !== current && clock && clockLabel) {
        current = index
        const chapter = chapters[Math.max(0, index)]
        clock.textContent = chapter?.dataset.time ?? ""
        clockLabel.textContent = chapter?.dataset.label ?? ""
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return null
}

const pesos = new Intl.NumberFormat(config.locale, { style: "currency", currency: config.currency, maximumFractionDigits: 0 })
const plain = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 0 })

/** A number that counts up when it first scrolls into view, and glides to new values after that. */
export function CountUp({ value, money = false, className }: { value: number; money?: boolean; className?: string }) {
  const [shown, setShown] = useState(value)
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const seen = useRef(false)
  const format = money ? pesos : plain

  useEffect(() => {
    if (reduced()) return
    let frame = 0
    const run = () => {
      const start = performance.now()
      const begin = from.current
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / (seen.current ? 650 : 1300))
        const eased = 1 - Math.pow(1 - t, 3)
        const next = begin + (value - begin) * eased
        from.current = next
        setShown(next)
        if (t < 1) frame = requestAnimationFrame(step)
        else seen.current = true
      }
      frame = requestAnimationFrame(step)
    }
    if (seen.current) {
      run()
      return () => cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        run()
      },
      { threshold: 0.4 },
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value])

  return (
    <span ref={ref} className={className}>
      {format.format(Math.round(shown))}
    </span>
  )
}

type FeedItem = { id: number; text: string; detail: string; tone: "good" | "warn" | "brand" | "info"; sale?: number }

const EVENTS: Omit<FeedItem, "id">[] = [
  { text: "Sale #129", detail: "₱245 · GCash", tone: "good", sale: 245 },
  { text: "Aling Nena paid her utang", detail: "₱500", tone: "brand" },
  { text: "Cooking oil 1L is running low", detail: "4 left", tone: "warn" },
  { text: "Sale #130", detail: "₱1,120 · Cash", tone: "good", sale: 1120 },
  { text: "Pedro started a delivery", detail: "Truck 1", tone: "info" },
  { text: "Sale #131", detail: "₱318 · Cash", tone: "good", sale: 318 },
  { text: "Delivery from Santos Trading", detail: "6 products in", tone: "info" },
  { text: "Sale #132", detail: "₱86 · Maya", tone: "good", sale: 86 },
]

const START: FeedItem[] = [
  { id: -1, text: "Sale #128", detail: "₱412 · Cash", tone: "good" },
  { id: -2, text: "Maria clocked in", detail: "7:58 AM", tone: "info" },
  { id: -3, text: "Jun clocked in", detail: "8:02 AM", tone: "info" },
]

const HOURS = [22, 35, 48, 30, 64, 82, 58, 41, 53, 70, 46]

/** The hero's "Today" dashboard: numbers count up, then new activity keeps arriving. */
export function TodayBoard() {
  const [feed, setFeed] = useState(START)
  const [sales, setSales] = useState(12480)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduced()) return
    let next = 0
    let visible = false
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = () => {
      if (!visible || document.hidden) return
      const event = EVENTS[next % EVENTS.length]
      next++
      setFeed(f => [{ ...event, id: next }, ...f].slice(0, 5))
      if (event.sale) setSales(s => s + event.sale!)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    if (ref.current) observer.observe(ref.current)
    const delay = setTimeout(() => {
      timer = setInterval(tick, 2600)
    }, 2200)
    return () => {
      observer.disconnect()
      clearTimeout(delay)
      clearInterval(timer)
    }
  }, [])

  const profit = Math.round(sales * 0.25)

  return (
    <div ref={ref} className="lp-window lp-board" aria-label="Sample of the Today dashboard">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.2em] faint">Today</p>
          <p className="display text-xl text-white leading-none mt-0.5">Santos General Store</p>
        </div>
        <span className="lp-live">Open</span>
      </div>

      <div className="grid grid-cols-3 gap-px" style={{ background: "var(--app-border)" }}>
        {[
          { label: "Sales", node: <CountUp value={sales} money />, tone: "var(--app-text)" },
          { label: "Profit", node: <CountUp value={profit} money />, tone: "var(--app-success)" },
          { label: "Owed to you", node: <CountUp value={4250} money />, tone: "var(--app-warning)" },
        ].map(s => (
          <div key={s.label} className="px-3 sm:px-5 py-4" style={{ background: "var(--app-surface)" }}>
            <p className="text-[0.62rem] uppercase tracking-[0.16em] faint">{s.label}</p>
            <p className="display text-2xl sm:text-3xl mt-1 tabular" style={{ color: s.tone }}>
              {s.node}
            </p>
          </div>
        ))}
      </div>

      <div className="px-4 sm:px-5 pt-4">
        <div className="flex items-end gap-1.5 h-16 lp-bars" aria-hidden>
          {HOURS.map((h, i) => (
            <span key={i} style={{ height: `${h}%`, ["--i" as string]: i }} />
          ))}
        </div>
        <div className="flex justify-between text-[0.6rem] faint mt-1.5">
          <span>8 AM</span>
          <span>1 PM</span>
          <span>6 PM</span>
        </div>
      </div>

      <ul className="lp-feed px-4 sm:px-5 pt-4">
        {feed.map(item => (
          <li key={item.id} className="lp-feed-item flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm" style={{ background: "var(--app-surface-2)" }}>
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="lp-dot-sm" data-tone={item.tone} />
              <span className="text-white truncate">{item.text}</span>
            </span>
            <span className="muted tabular shrink-0 text-xs">{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
