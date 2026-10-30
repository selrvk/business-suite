"use client"

import { useEffect } from "react"
import { Printer } from "lucide-react"

export function PrintButton({ auto = false, label = "Print" }: { auto?: boolean; label?: string }) {
  useEffect(() => {
    if (!auto) return
    const timer = setTimeout(() => window.print(), 400) // let barcodes/fonts render first
    return () => clearTimeout(timer)
  }, [auto])

  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
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
