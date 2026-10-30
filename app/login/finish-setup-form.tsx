"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Rocket } from "lucide-react"
import { finishSetup } from "./actions"

export function FinishSetupForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await finishSetup(String(new FormData(e.currentTarget).get("businessName")))
    if (!result.ok) {
      setBusy(false)
      return setError(result.error)
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Business name</span>
        <input className="input" name="businessName" required minLength={2} maxLength={80} placeholder="e.g. Santos Trading" autoFocus />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy}>
        <Rocket size={15} /> {busy ? "Setting up…" : "Finish setting up"}
      </button>
    </form>
  )
}
