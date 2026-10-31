"use client"

import { useState } from "react"
import { Mail } from "lucide-react"
import { requestPasswordReset } from "./actions"

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    const result = await requestPasswordReset(String(new FormData(e.currentTarget).get("email")))
    setBusy(false)
    setStatus(result.ok ? { ok: true, text: result.data } : { ok: false, text: result.error })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
      <label>
        <span className="label">Email</span>
        <input className="input" name="email" type="email" placeholder="you@example.com" required autoComplete="email" autoFocus />
      </label>
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
        <Mail size={16} /> {busy ? "Sending…" : "Send me a link"}
      </button>
    </form>
  )
}
