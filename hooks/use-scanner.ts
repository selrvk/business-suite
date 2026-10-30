"use client"

import { useEffect, useEffectEvent } from "react"

/**
 * Listens for a USB/Bluetooth barcode scanner anywhere on the page.
 *
 * Scanners act like a keyboard that types very fast and presses Enter. When
 * the cursor is in a text box the scan simply lands there (handled by that
 * input). Otherwise this hook catches the burst of keys and calls onScan.
 */
export function useScanner(onScan: (code: string) => void, { enabled = true, minLength = 3 } = {}) {
  const handleScan = useEffectEvent(onScan)

  useEffect(() => {
    if (!enabled) return
    let buffer = ""
    let lastKeyAt = 0

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const now = performance.now()
      if (now - lastKeyAt > 80) buffer = "" // people type slower than this; scanners don't
      lastKeyAt = now

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          e.preventDefault() // don't "click" whatever button has focus
          handleScan(buffer)
        }
        buffer = ""
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled, minLength])
}
