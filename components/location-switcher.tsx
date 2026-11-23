"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, MapPin, Warehouse } from "lucide-react"
import { switchLocation } from "@/app/(protected)/settings/location-actions"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./ui/dropdown-menu"

export type Place = {
  here: { id: number; name: string; kind: "branch" | "warehouse" }
  open: { id: number; name: string; kind: "branch" | "warehouse" }[]
  canSwitch: boolean
}

/** Where this login is working. Owners and admins can switch; staff stay at their branch. */
export function LocationSwitcher({ place }: { place: Place }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const Icon = place.here.kind === "warehouse" ? Warehouse : MapPin

  const body = (
    <>
      <Icon size={14} className="text-brand shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">
        <span className="block text-[0.62rem] uppercase tracking-[0.14em] faint leading-tight">Working at</span>
        <span className="block text-[0.82rem] font-semibold text-white truncate">{pending ? "Switching…" : place.here.name}</span>
      </span>
    </>
  )
  const boxStyle = { background: "var(--app-bg)", borderColor: "var(--app-border)" }

  if (!place.canSwitch)
    return (
      <div
        className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
        style={boxStyle}
        title="Your branch is set by an owner or admin"
      >
        {body}
      </div>
    )

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:border-[var(--brand-line)]"
            style={boxStyle}
            aria-label={`Working at ${place.here.name}. Switch location`}
            disabled={pending}
          >
            {body}
            <ChevronDown size={14} className="faint shrink-0" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Switch to</DropdownMenuLabel>
          {place.open.map(l => (
            <DropdownMenuItem
              key={l.id}
              onSelect={() => {
                if (l.id === place.here.id) return
                setError(null)
                start(async () => {
                  const result = await switchLocation(l.id)
                  if (!result.ok) setError(result.error)
                  else router.refresh()
                })
              }}
            >
              {l.kind === "warehouse" ? <Warehouse /> : <MapPin />}
              <span className="flex-1 truncate">{l.name}</span>
              {l.id === place.here.id && <Check />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="text-xs text-bad mt-1.5">{error}</p>}
    </div>
  )
}
