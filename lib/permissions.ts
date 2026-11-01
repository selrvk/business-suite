// What a staff login may do beyond the basics (selling, Stock In, the time
// clock). Owners and admins can always do everything. A login saved with no
// permissions list (from before permissions existed) can also do everything.
// The database checks the same list (has_permission() in supabase/schema.sql).

export type Permission = "edit_products" | "see_costs" | "cancel_sales" | "discounts" | "adjust_stock" | "credit"

export const ALL_PERMISSIONS: Permission[] = ["edit_products", "see_costs", "adjust_stock", "discounts", "credit", "cancel_sales"]

export const PERMISSION_INFO: Record<Permission, { label: string; description: string }> = {
  edit_products: { label: "Add and edit products", description: "Names, prices, barcodes and other product details" },
  see_costs: { label: "See costs and profit", description: "What you pay for products, and stock value at cost" },
  adjust_stock: { label: "Correct stock", description: "Quick Scan, stock corrections, and removing expired batches" },
  discounts: { label: "Give discounts", description: "Peso or percent off. Senior Citizen/PWD discounts are always allowed" },
  credit: { label: "Sell on credit", description: "Put sales on a customer's tab and record their payments" },
  cancel_sales: { label: "Cancel and void sales", description: "Cancel pending orders and void completed sales" },
}

/** What a new staff login starts with: a cashier. */
export const CASHIER: Permission[] = []

/** Whether someone can do something, given their role and saved permissions. */
export function allowed(role: string, permissions: readonly string[] | null | undefined, permission: Permission) {
  return role === "owner" || role === "admin" || permissions == null || permissions.includes(permission)
}

/** Everything someone can do, as a list (for the browser). */
export function effectivePermissions(role: string, permissions: readonly string[] | null | undefined): Permission[] {
  return ALL_PERMISSIONS.filter(p => allowed(role, permissions, p))
}
