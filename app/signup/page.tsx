import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthCard } from "@/components/auth-card"
import { getSession } from "@/lib/auth"
import { config } from "@/lib/config"
import { SignUpForm } from "./signup-form"

export const metadata = { title: "Start your free trial" }

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard")
  return (
    <AuthCard
      wide
      title="Start free"
      subtitle={`${config.trialDays} days free · no payment needed`}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-white underline decoration-dotted">
            Log in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  )
}
