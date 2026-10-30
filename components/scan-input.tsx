"use client"

import { ScanBarcode } from "lucide-react"

/**
 * A big text box a barcode scanner can type into. Enter (which scanners send
 * after every code) calls onEnter instead of submitting any surrounding form.
 */
export function ScanInput({
  value,
  onChange,
  onEnter,
  placeholder = "Scan a barcode…",
  autoFocus = true,
  inputRef,
  className = "",
}: {
  value: string
  onChange: (value: string) => void
  onEnter: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  className?: string
}) {
  return (
    <div className={`scan-field ${className}`}>
      <ScanBarcode size={20} />
      <input
        ref={inputRef}
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key !== "Enter") return
          e.preventDefault()
          if (value.trim()) onEnter(value.trim())
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
      />
    </div>
  )
}

/** Stops a scanner's trailing Enter from submitting the form a code field is in. */
export function blockEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.preventDefault()
}

/** Props for a barcode/badge/tag code field: a fresh scan replaces the old code. */
export const codeFieldProps = {
  onKeyDown: blockEnter,
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.target.select(),
  autoComplete: "off",
  spellCheck: false,
}
