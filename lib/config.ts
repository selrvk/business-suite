// App-wide configuration. Everything here is set per deployment (per customer)
// through environment variables. See .env.example.
//
// The business's own details (name, address, logo, receipt footer) are NOT here:
// the owner edits those in Settings and they live in the database.

export type ModuleKey = "inventory" | "sales" | "attendance" | "fleet"

export const ALL_MODULES: ModuleKey[] = ["inventory", "sales", "attendance", "fleet"]

export const MODULE_INFO: Record<ModuleKey, { label: string; description: string }> = {
  inventory: { label: "Inventory", description: "Products, stock in, stock log" },
  sales: { label: "Sales & POS", description: "Checkout, orders, sales history, receipts" },
  attendance: { label: "Attendance", description: "Badge time clock, hours, employees" },
  fleet: { label: "Fleet", description: "Vehicles, trip mileage, fuel" },
}

function parseModules(raw: string | undefined): ModuleKey[] {
  if (!raw || !raw.trim()) return [...ALL_MODULES]
  const wanted = raw.split(",").map(s => s.trim().toLowerCase())
  const modules = ALL_MODULES.filter(m => wanted.includes(m))
  // Selling needs products.
  if (modules.includes("sales") && !modules.includes("inventory")) modules.unshift("inventory")
  return modules
}

function parseColor(raw: string | undefined, fallback: string) {
  return raw && /^#[0-9a-fA-F]{3,8}$/.test(raw.trim()) ? raw.trim() : fallback
}

export const config = {
  /** Product name — a placeholder. Change it here or with NEXT_PUBLIC_APP_NAME. */
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Business Suite",
  accentColor: parseColor(process.env.NEXT_PUBLIC_ACCENT_COLOR, "#4c7dff"),
  currency: process.env.NEXT_PUBLIC_CURRENCY || "PHP",
  locale: process.env.NEXT_PUBLIC_LOCALE || "en-PH",
  timeZone: process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Manila",
  /** Which modules every business gets (one plan, everything included). */
  modules: parseModules(process.env.NEXT_PUBLIC_MODULES),
  /** The one plan's price, in pesos. */
  price: {
    monthly: Number(process.env.NEXT_PUBLIC_PRICE_MONTHLY) || 499,
    /** Optional. Leave NEXT_PUBLIC_PRICE_YEARLY unset to offer monthly only. */
    yearly: Number(process.env.NEXT_PUBLIC_PRICE_YEARLY) || null,
  },
  /** Who runs the service, named in the Terms of Service and Privacy Policy. */
  provider: process.env.NEXT_PUBLIC_PROVIDER_NAME || "Archtech",
  /** Shown on the website for questions. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "archtechbtg@gmail.com",
  trialDays: 14,
  /**
   * Staff log in with a username, not an email. Supabase needs an email, so
   * each staff login is stored as username@<business-slug>.<this domain>.
   * Pick once and never change it, or staff logins stop working.
   */
  staffEmailDomain: process.env.NEXT_PUBLIC_STAFF_EMAIL_DOMAIN || "staff.local",
}

export function hasModule(module: ModuleKey) {
  return config.modules.includes(module)
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/

export function staffEmail(username: string, businessSlug: string) {
  return `${username.trim().toLowerCase()}@${businessSlug}.${config.staffEmailDomain}`
}

/** "Santos Trading Co." → "santos-trading-co" */
export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "business"
  )
}
