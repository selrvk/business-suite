"use client"

import { useEffect } from "react"
import { Printer } from "lucide-react"

export function PrintButton({ auto = false, label = "Print", className = "btn btn-primary" }: { auto?: boolean; label?: string; className?: string }) {
  useEffect(() => {
    if (!auto) return
    const timer = setTimeout(() => window.print(), 400) // let barcodes/fonts render first
    return () => clearTimeout(timer)
  }, [auto])

  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Printer size={15} /> {label}
    </button>
  )
}

export function CloseButton() {
  return (
    <button className="btn btn-secondary" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>
      Close
    </button>
  )
}
