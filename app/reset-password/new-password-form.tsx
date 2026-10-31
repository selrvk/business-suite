"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"
import { setNewPassword } from "./actions"

export function NewPasswordForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get("password"))
    if (password !== String(form.get("confirm"))) return setError("The two passwords don't match.")
    setBusy(true)
    setError(null)
    const result = await setNewPassword(password)
    if (!result.ok) {
      setBusy(false)
      return setError(result.error)
    }
    router.push(result.data.to)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <input className="input" name="password" type="password" minLength={8} required autoFocus placeholder="New password (8+ characters)" autoComplete="new-password" />
      <input className="input" name="confirm" type="password" minLength={8} required placeholder="Type it again" autoComplete="new-password" />
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
        <KeyRound size={16} /> {busy ? "Saving…" : "Save and log in"}
      </button>
      <p className="text-xs faint text-center">Any other devices using this login will be logged out.</p>
    </form>
  )
}
