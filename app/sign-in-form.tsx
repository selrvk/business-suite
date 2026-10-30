"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogIn, LogOut } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { staffSignIn } from "./s/[slug]/actions"
import { signIn } from "./login/actions"

/**
 * Owners log in with their email; staff log in with a username on their
 * business's staff page (/s/<slug>), which passes businessSlug.
 */
export function SignInForm({ mode, businessSlug }: { mode: "email" | "username"; businessSlug?: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const id = String(form.get("id")).trim().toLowerCase()
    const password = String(form.get("password"))
    let failed: string | null = null
    let to = "/dashboard"
    if (mode === "username" && businessSlug) {
      // Usernames are looked up on the server; an owner can also type their email here.
      const result = await staffSignIn(businessSlug, id, password)
      if (!result.ok) failed = result.error
    } else {
      const result = await signIn(id, password)
      if (!result.ok) failed = result.error
      else to = result.data.to
    }
    if (failed) {
      setLoading(false)
      setError(failed)
      return
    }
    router.push(to)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error text-center">{error}</p>}
      <label>
        <span className="label">{mode === "email" ? "Email or login" : "Username"}</span>
        <input
          className="input"
          name="id"
          type="text"
          inputMode="email"
          placeholder={mode === "email" ? "you@example.com or username@your-business" : "Your username (or the owner's email)"}
          required
          autoComplete={mode === "email" ? "email" : "username"}
          autoCapitalize="none"
        />
      </label>
      <label>
        <span className="label">Password</span>
        <input className="input" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
      </label>
      <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={loading}>
        <LogIn size={16} />
        {loading ? "Signing in…" : "Log in"}
      </button>
    </form>
  )
}

export function SignOutButton({ className = "btn btn-secondary btn-block" }: { className?: string }) {
  const router = useRouter()
  return (
    <button
      className={className}
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut()
        router.push("/login")
        router.refresh()
      }}
    >
      <LogOut size={14} /> Log out
    </button>
  )
}
