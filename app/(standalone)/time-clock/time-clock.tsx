"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Maximize, Minimize } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { ScanInput } from "@/components/scan-input"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { config } from "@/lib/config"
import { formatDuration, formatLongDate, formatTime } from "@/lib/format"
import { clockByCode } from "@/app/(protected)/attendance/actions"

type Feedback = { tone: "in" | "out" | "warn" | "error"; title: string; detail: string }
type LogEntry = { key: number; name: string; action: "in" | "out"; at: string }

const hourFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: config.timeZone })

function greeting(at: Date) {
  const hour = Number(hourFormat.format(at))
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
}

export function TimeClock({ businessName, logoUrl }: { businessName: string; logoUrl: string | null }) {
  const [now, setNow] = useState<Date | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [fullscreen, setFullscreen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onFs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
      document.removeEventListener("fullscreenchange", onFs)
    }
  }, [])

  function show(next: Feedback) {
    setFeedback(next)
    clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => setFeedback(null), 6000)
  }

  async function scan(raw: string) {
    const value = raw.trim()
    if (!value || busy) return
    setBusy(true)
    setCode("")
    const result = await clockByCode(value)
    setBusy(false)
    inputRef.current?.focus()

    if (!result.ok) {
      beep("error")
      return show({ tone: "error", title: "Not recognized", detail: result.error })
    }
    const r = result.data
    const first = r.name.split(" ")[0]
    if (r.action === "ignored") {
      beep("error")
      return show({ tone: "warn", title: `Already recorded, ${first}`, detail: `Your last scan was at ${formatTime(r.at)}. No need to scan again.` })
    }
    setLog(prev => [{ key: Date.now(), name: r.name, action: r.action as "in" | "out", at: r.at }, ...prev].slice(0, 8))
    if (r.action === "in") {
      beep("ok")
      show({ tone: "in", title: `${greeting(new Date(r.at))}, ${first}!`, detail: `Clocked IN at ${formatTime(r.at)}` })
    } else {
      beep("out")
      const worked = r.clock_in ? ` · worked ${formatDuration(new Date(r.at).getTime() - new Date(r.clock_in).getTime())}` : ""
      show({ tone: "out", title: `See you, ${first}!`, detail: `Clocked OUT at ${formatTime(r.at)}${worked}` })
    }
  }

  useScanner(scan, { enabled: !busy })

  const colors: Record<Feedback["tone"], string> = {
    in: "var(--app-success)",
    out: "var(--app-info)",
    warn: "var(--app-warning)",
    error: "var(--app-danger)",
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <BrandMark name={businessName} logoUrl={logoUrl} size={38} />
          <p className="display text-2xl text-white">{businessName}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          >
            {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
          {!fullscreen && (
            <Link href="/attendance" className="btn btn-ghost btn-sm">
              <ArrowLeft size={14} /> Back
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_320px] gap-6 px-6 pb-8">
        <section className="flex flex-col items-center justify-center text-center gap-6">
          <div>
            <p className="display text-white leading-none" style={{ fontSize: "clamp(4rem, 14vw, 10rem)" }} suppressHydrationWarning>
              {now ? formatTime(now) : " "}
            </p>
            <p className="muted text-lg mt-2">{now ? formatLongDate(now) : " "}</p>
          </div>

          <div
            className="w-full max-w-xl rounded-2xl border-2 px-6 py-8 transition-colors"
            style={{
              borderColor: feedback ? colors[feedback.tone] : "var(--app-border-strong)",
              background: feedback ? `color-mix(in srgb, ${colors[feedback.tone]} 12%, transparent)` : "var(--app-surface)",
            }}
            aria-live="assertive"
          >
            {busy ? (
              <p className="display text-4xl text-white">Checking…</p>
            ) : feedback ? (
              <>
                <p className="display text-4xl md:text-5xl" style={{ color: colors[feedback.tone] }}>
                  {feedback.title}
                </p>
                <p className="text-lg text-white mt-3">{feedback.detail}</p>
              </>
            ) : (
              <>
                <p className="display text-4xl md:text-5xl text-white">Scan your ID badge</p>
                <p className="muted mt-3">Scan once when you arrive, and again when you leave.</p>
              </>
            )}
          </div>

          <ScanInput
            inputRef={inputRef}
            value={code}
            onChange={setCode}
            onEnter={scan}
            placeholder="Or type your badge code and press Enter"
            className="w-full max-w-sm opacity-70 focus-within:opacity-100"
          />
        </section>

        <aside className="card self-start w-full">
          <div className="card-header">
            <p className="section-title text-lg">Just now</p>
          </div>
          {log.length === 0 ? (
            <p className="empty">No scans yet.</p>
          ) : (
            <ul className="px-4">
              {log.map(entry => (
                <li key={entry.key} className="list-row text-sm">
                  <span className="pill" data-tone={entry.action === "in" ? "good" : "info"}>
                    {entry.action}
                  </span>
                  <span className="flex-1 text-white truncate">{entry.name}</span>
                  <span className="faint">{formatTime(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  )
}
