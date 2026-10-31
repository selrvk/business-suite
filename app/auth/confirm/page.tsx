import { AuthCard } from "@/components/auth-card"
import { EmailLinkButton } from "./email-link-button"

export const metadata = { title: "Continue" }

/**
 * Where emailed links land. Nothing happens until the button is pressed:
 * some email apps open every link to scan it, and that would use up the link.
 */
export default async function EmailLinkPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash = "", type = "" } = await searchParams
  const reset = type === "recovery"
  return (
    <AuthCard
      title={reset ? "Reset your password" : "Confirm your email"}
      subtitle={reset ? "Continue to choose a new password." : "Continue to confirm your email and open your business suite."}
    >
      <EmailLinkButton tokenHash={token_hash} type={type} label={reset ? "Choose a new password" : "Confirm and continue"} />
    </AuthCard>
  )
}
