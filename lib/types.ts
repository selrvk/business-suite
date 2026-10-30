export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

export type Business = {
  id: string
  name: string
  slug: string
  address: string | null
  contact: string | null
  logo_url: string | null
  receipt_footer: string | null
  low_stock_threshold: number
  trial_ends_at: string
  paid_until: string | null
  created_at: string
}

export type Role = "owner" | "admin" | "staff"

export type Item = {
  id: number
  barcode: string | null
  name: string
  brand: string | null
  unit: string
  current_stock: number
  price_buy: number
  price_sell: number
}

export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED"

export type Order = {
  id: number
  number: number
  customer_name: string | null
  status: OrderStatus
  total_price: number
  date_created: string
  date_completed: string | null
  date_cancelled: string | null
  payment_method: string | null
  amount_tendered: number | null
  created_by: string | null
}

export type OrderLine = {
  id: number
  order_id: number
  item_id: number | null
  item_name: string | null
  quantity: number
  price_at_time: number
  items: { name: string; unit: string } | null
}

export type StockReason = "initial" | "receive" | "sale" | "adjust" | "return" | "out"

export type Employee = {
  id: number
  name: string
  code: string
  position: string | null
  phone: string | null
  active: boolean
}

export type AttendanceRecord = {
  id: number
  employee_id: number
  clock_in: string
  clock_out: string | null
  note: string | null
}

export type ClockResult = {
  action: "in" | "out" | "ignored"
  employee_id: number
  name: string
  at: string
  clock_in?: string
}

export type Vehicle = {
  id: number
  name: string
  plate_number: string | null
  code: string
  odometer: number
  active: boolean
  notes: string | null
}

export type Trip = {
  id: number
  vehicle_id: number
  driver_id: number | null
  purpose: string | null
  start_odometer: number
  end_odometer: number | null
  started_at: string
  ended_at: string | null
  notes: string | null
}

export type FuelLog = {
  id: number
  vehicle_id: number
  odometer: number | null
  liters: number
  cost: number
  station: string | null
  filled_at: string
}
