"use client"

import { useRef } from "react"

/**
 * Notices when a barcode scanner "types" into an ordinary text box (a burst of
 * 6+ keys, each under 40ms apart, ending in Enter). Call `onKeyDown` from the
 * input's onKeyDown. If it was a scan, the box's text is put back the way it
 * was, `onScan` gets the code, and it returns true.
 */
export function useScanGuard(onScan?: (code: string) => void) {
  const burst = useRef({ text: "", at: 0, before: "" })

  return function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, restore: (previous: string) => void) {
    const now = performance.now()
    const b = burst.current
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (now - b.at > 40) {
        b.text = ""
        b.before = e.currentTarget.value
      }
      b.text += e.key
      b.at = now
      return false
    }
    if (e.key === "Enter" && onScan && b.text.length >= 6 && now - b.at < 100) {
      e.preventDefault()
      const code = b.text
      b.text = ""
      restore(b.before)
      onScan(code)
      return true
    }
    return false
  }
}
