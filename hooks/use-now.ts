"use client"

import { useEffect, useState } from "react"

/** The current time, refreshed every `intervalMs`, for "since 8:12 (2h 10m)" style displays. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
