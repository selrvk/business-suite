import { DatabaseZap } from "lucide-react"
import { dbMessage, isMissingSchema } from "@/lib/db"

/** Shown when a page's data fails to load. Explains the fix when the schema is missing. */
export function DbError({ error }: { error: { message: string; code?: string } | null }) {
  const missing = isMissingSchema(error)
  return (
    <div className="card card-body flex items-start gap-3 max-w-2xl">
      <DatabaseZap size={20} className="text-bad shrink-0 mt-0.5" />
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-white">{missing ? "Database not set up yet" : "Couldn't load this page"}</p>
        <p className="muted">{dbMessage(error)}</p>
        {missing && (
          <ol className="list-decimal pl-5 muted space-y-1">
            <li>Open your project in the Supabase dashboard → SQL Editor → New query.</li>
            <li>
              Paste in the contents of <span className="mono text-white">supabase/schema.sql</span> and press Run.
            </li>
            <li>Reload this page.</li>
          </ol>
        )}
      </div>
    </div>
  )
}
