"use client"

import { useState, useSyncExternalStore } from "react"
import { MonitorDown, Share, SquarePlus } from "lucide-react"
import { config } from "@/lib/config"
import { Modal } from "./modal"

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

// Chrome, Edge and Android offer installing with an event that can fire before
// the menu has rendered, so it's caught as soon as this file loads.
let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault()
    deferred = e as InstallPrompt
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    notify()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** iPhone and iPad have no install prompt; people add the site to the Home Screen themselves. */
function needsIosSteps() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
  const apple = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  return apple && !standalone
}
const never = () => () => {}

/** "Install app" in the menu: the browser's own install prompt, or steps for iPhone and iPad. */
export function InstallAppButton() {
  const prompt = useSyncExternalStore(subscribe, () => deferred, () => null)
  const ios = useSyncExternalStore(never, needsIosSteps, () => false)
  const [showSteps, setShowSteps] = useState(false)

  if (!prompt && !ios) return null

  async function install() {
    if (!prompt) return setShowSteps(true)
    await prompt.prompt()
    await prompt.userChoice
    deferred = null
    notify()
  }

  return (
    <>
      <button
        onClick={install}
        className="flex w-full items-center gap-2.5 px-5 py-2 text-[0.8rem] font-medium border-l-2 border-transparent text-left transition-colors hover:text-white"
        style={{ color: "var(--app-muted)" }}
      >
        <MonitorDown size={15} />
        Install app
      </button>
      <Modal open={showSteps} onClose={() => setShowSteps(false)} title="Add to your Home Screen" width={380}>
        <ol className="flex flex-col gap-3 text-sm muted">
          <li className="flex gap-3 items-start">
            <Share size={18} className="shrink-0 text-white" />
            <span>
              In Safari, tap the <span className="text-white font-semibold">Share</span> button.
            </span>
          </li>
          <li className="flex gap-3 items-start">
            <SquarePlus size={18} className="shrink-0 text-white" />
            <span>
              Scroll down and tap <span className="text-white font-semibold">Add to Home Screen</span>, then{" "}
              <span className="text-white font-semibold">Add</span>.
            </span>
          </li>
        </ol>
        <p className="text-xs faint mt-4">{config.appName} then opens from your Home Screen in its own window, like an app.</p>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={() => setShowSteps(false)}>
            Got it
          </button>
        </div>
      </Modal>
    </>
  )
}
