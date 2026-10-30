# Business Suite

_(Placeholder name. Change it with `NEXT_PUBLIC_APP_NAME`.)_

An online suite for small businesses, built around a cheap USB/Bluetooth barcode scanner. Businesses sign up on their own,
get a 14-day free trial, and pay to keep going.

| Module | What it does |
| --- | --- |
| **Inventory** | Products with barcodes, scan to find, **Quick Scan** (every scan adds or removes stock), **Stock In** for deliveries, corrections, a full **Stock Log**, Excel export, printable barcode labels. |
| **Sales & POS** | Checkout where you scan items into the cart, with cash and change, receipts for 80mm thermal printers, pending orders and sales history. |
| **Attendance** | Printable ID badges, a **Time Clock** kiosk (scan in, scan out), today's board, **Timesheets** with payroll cut-offs, and fixes for missed punches. |
| **Fleet** | Vehicle tags, trips with odometer readings, fuel logs, km per month, km per liter and cost per km. |

## How it works

- **One app, one database, many businesses.** Every row is tagged with its business, and row-level security in the database
  guarantees a login only ever sees its own business's data. See [`supabase/schema.sql`](supabase/schema.sql).
- **Sign up** (`/signup`): business name, owner email and password. This creates the business and its owner login, starting
  a 14-day trial.
- **Staff** log in with a username at their business's link, `/s/<business>`. The owner creates staff logins in Settings.
- **Paywall**: when the trial or paid time runs out, every page sends people to **Billing** (`/billing`), which shows your
  payment details. The owner pays you, e.g. by GCash, and sends the reference number.
- **You approve payments** at `/platform`. Each approval adds a month or a year, on top of any time still left. You can also
  extend trials and see every business there.

Payments are manual for now. Stripe doesn't accept Philippine businesses; PayMongo (GCash, Maya, cards) is the natural next
step.

## Set up

1. **Use a Supabase project** at [supabase.com](https://supabase.com). For a new one, pick the **Singapore** region, closest
   to the Philippines. An existing project from the older one-business version works too (see below).
2. **Create or upgrade the database.** Back up first with `node --env-file=.env scripts/backup.mjs`. Then open SQL Editor →
   New query, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click Run. Run it again after every update;
   it's safe to repeat.
3. **Turn off public sign-ups in Supabase** (Authentication → Sign In / Providers → "Allow new users to sign up"). The app
   creates logins itself through `/signup`, so this blocks anyone from skipping it.
4. **Set the environment variables** from [`.env.example`](.env.example). Set `PLATFORM_ADMIN_EMAILS` to your own email.
5. **Deploy** (e.g. Vercel). Set the function region to Singapore too, so database calls stay fast.
6. **Sign up with your own email.** You get a business to try things with, and the **Platform admin** link in the menu.

## Upgrading a database from the one-business version

`schema.sql` notices the older layout and converts it in place, all or nothing:

- Its data (products, sales, employees, trucks) becomes the first business, named from its old settings, with a year of
  paid access to start (change it on `/platform`).
- Existing logins keep their passwords. The earliest admin becomes the owner; other admins stay admins and everyone else is
  staff. They log in at the business's staff link (`/s/<link>`) with their old username.
- Old sale numbers stay the same, and new sales continue after them.
- The old `settings` and `profiles` tables are kept as an archive but closed to the app.

Rename the business and its staff link in Settings afterwards.

## Roles

- **Owner**: the person who signed up. Everything, including billing.
- **Admin**: everything except the owner's account and billing details.
- **Staff**: sell, receive and correct stock, clock people in and out, log trips and fuel.

The database enforces these rules, not just the interface.

## Develop

```bash
cp .env.example .env.local   # point it at a test Supabase project
npm install
npm run dev
```

| Where | What |
| --- | --- |
| `lib/config.ts` | App-wide settings: name, price, modules, currency, time zone |
| `lib/auth.ts` | Sessions, roles, the trial/paid gate, platform admin |
| `app/page.tsx`, `app/signup`, `app/login`, `app/s/[slug]` | Public pages |
| `app/(protected)/` | The suite (side menu) |
| `app/(standalone)/` | Time clock kiosk and print pages |
| `app/billing`, `app/platform` | Paywall and your admin page |
| `supabase/schema.sql` | Tables, permissions, and the functions that keep stock and sales consistent |
