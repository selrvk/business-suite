"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * Which location's numbers a page shows: one location, or all of them.
 * Works through the URL (?at=), keeping the page's other filters.
 */
export function LocationFilter({
  path,
  value,
  locations,
  keep = {},
}: {
  path: string
  /** A location id, or "all". */
  value: number | "all"
  locations: { id: number; name: string }[]
  /** Other search params to keep. */
  keep?: Record<string, string | undefined>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const kept = Object.entries(keep).filter((entry): entry is [string, string] => !!entry[1] && entry[0] !== "at")

  return (
    <label className="no-print inline-flex items-center gap-2">
      <span className="sr-only">Location</span>
      <select
        className="input input-sm w-auto max-w-[14rem]"
        value={String(value)}
        disabled={pending}
        onChange={e => {
          const at = e.target.value
          start(() => router.push(`${path}?${new URLSearchParams([...kept, ["at", at]])}`))
        }}
      >
        <option value="all">All locations</option>
        {locations.map(l => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
