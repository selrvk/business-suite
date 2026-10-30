"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export default function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await createSupabaseBrowserClient().auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className="flex w-full items-center gap-2.5 px-5 py-2 text-[0.8rem] font-medium border-l-2 border-transparent text-left transition-colors hover:text-[var(--app-danger)]"
      style={{ color: "var(--app-muted)" }}
    >
      <LogOut size={15} />
      Log out
    </button>
  )
}
