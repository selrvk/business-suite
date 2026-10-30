"use client"

import { useState } from "react"
import { useScanGuard } from "@/hooks/use-scan-guard"

/**
 * A quantity box that's safe next to a barcode scanner. If someone scans while
 * the cursor is in it, the code is handed to onScan instead of becoming a
 * quantity of 4,800,016.
 */
export function QtyInput({
  value,
  onCommit,
  onScan,
  min = 1,
  max = 99999,
  className = "",
  label = "Quantity",
}: {
  value: number
  onCommit: (qty: number) => void
  onScan?: (code: string) => void
  min?: number
  max?: number
  className?: string
  label?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const guard = useScanGuard(onScan)

  function commit() {
    if (draft === null) return
    const qty = Math.trunc(Number(draft))
    if (Number.isFinite(qty) && draft.trim() !== "") onCommit(Math.min(max, Math.max(min, qty)))
    setDraft(null)
  }

  return (
    <input
      className={`input text-right tabular ${className}`}
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value)}
      onFocus={e => e.target.select()}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (guard(e, () => setDraft(null))) return
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

/**
 * A normal text box that hands barcode scans to onScan instead of keeping them,
 * e.g. a customer-name field next to a POS scan box.
 */
export function ScanSafeInput({
  value,
  onChange,
  onScan,
  onEnter,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
  onScan: (code: string) => void
  onEnter?: () => void
}) {
  const guard = useScanGuard(onScan)
  return (
    <input
      {...rest}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (guard(e, onChange)) return
        if (e.key === "Enter" && onEnter) {
          e.preventDefault()
          onEnter()
        }
      }}
    />
  )
}
