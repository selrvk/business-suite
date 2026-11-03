// The tables in "Download all my data", one sheet each, in this order.
// Each query runs as the signed-in owner, so the database only returns their business's rows.

export const EXPORT_TABLES = [
  { table: "businesses", sheet: "Business", about: "Your business details and settings" },
  { table: "members", sheet: "Logins", select: "username, role, permissions, created_at", order: "created_at", about: "Who can log in (no passwords)" },
  { table: "items", sheet: "Products", select: "*, suppliers(name)", about: "Every product, with stock and prices" },
  { table: "suppliers", sheet: "Suppliers", about: "Your suppliers" },
  { table: "stock_batches", sheet: "Expiry batches", select: "*, items(name)", about: "Stock by expiry date and lot" },
  { table: "stock_movements", sheet: "Stock log", select: "*, items(name)", about: "Every change to stock" },
  { table: "orders", sheet: "Sales", about: "Every sale and order" },
  { table: "order_item", sheet: "Sale lines", select: "*, items(name)", about: "The products in each sale" },
  { table: "customers", sheet: "Customers", about: "Customers and what they owe" },
  { table: "customer_ledger", sheet: "Customer credit", select: "*, customers(name)", about: "Credit sales and payments, per customer" },
  { table: "day_closings", sheet: "End of day", about: "Daily closings and cash counts" },
  { table: "employees", sheet: "Employees", about: "Employees and badges" },
  { table: "attendance", sheet: "Attendance", select: "*, employees(name)", about: "Time clock records" },
  { table: "attendance_punches", sheet: "Scanner punches", select: "*, employees(name)", about: "Punches imported from a fingerprint or face scanner" },
  { table: "vehicles", sheet: "Vehicles", about: "Vehicles" },
  { table: "trips", sheet: "Trips", select: "*, vehicles(name), employees(name)", about: "Trips and mileage" },
  { table: "fuel_logs", sheet: "Fuel", select: "*, vehicles(name)", about: "Fuel purchases" },
  { table: "activity_log", sheet: "Activity log", about: "Who did what" },
  { table: "payment_requests", sheet: "Billing", select: "period, amount, reference, note, status, created_at, reviewed_at", order: "created_at", about: `Payments you reported to us` },
] as const satisfies readonly { table: string; sheet: string; select?: string; order?: string; about: string }[]

export type ExportTable = (typeof EXPORT_TABLES)[number]["table"]
