"use client"

import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

/** Renders a scannable barcode. 13-digit codes print as EAN-13, everything else as Code 128. */
export function Barcode({
  value,
  height = 48,
  width = 2,
  showText = true,
  fontSize = 13,
}: {
  value: string
  height?: number
  width?: number
  showText?: boolean
  fontSize?: number
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    const options = { height, width, displayValue: showText, fontSize, margin: 0, background: "transparent", lineColor: "#000" }
    try {
      JsBarcode(ref.current, value, { ...options, format: /^\d{13}$/.test(value) ? "EAN13" : "CODE128" })
    } catch {
      try {
        JsBarcode(ref.current, value, { ...options, format: "CODE128" })
      } catch {
        // unprintable value; leave blank
      }
    }
  }, [value, height, width, showText, fontSize])

  return <svg ref={ref} style={{ maxWidth: "100%" }} />
}

/** An in-store EAN-13 code (prefix 2 is reserved for internal use, so it won't clash with real products). */
export function generateProductBarcode() {
  const digits = [2, ...Array.from({ length: 11 }, () => Math.floor(Math.random() * 10))]
  const sum = digits.reduce((total, d, i) => total + d * (i % 2 === 0 ? 1 : 3), 0)
  return digits.join("") + ((10 - (sum % 10)) % 10)
}

export function generateCode(prefix: string) {
  return `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`
}
