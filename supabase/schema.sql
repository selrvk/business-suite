-- =============================================================================
-- Database schema (many businesses, one database)
--
-- Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Works on a new project, and safely upgrades a database from the older
-- one-business version (its data becomes the first business). Back up first:
--   node --env-file=.env scripts/backup.mjs
-- Safe to run again after updates.
--
-- Every business's rows carry its business_id, and row-level security makes
-- sure a signed-in user only ever sees and changes their own business's data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Businesses and their people
-- -----------------------------------------------------------------------------

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), -- staff login link: /s/<slug>
  address text,
  contact text,
  logo_url text,
  receipt_footer text default 'Thank you for your purchase!',
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  paid_until timestamptz,
  order_seq integer not null default 0, -- last sale number used
  created_at timestamptz not null default now()
);

-- What kind of business it is and which parts of the suite it uses. Chosen at
-- sign-up, changed in Settings → Features. modules null = every module.
alter table public.businesses add column if not exists business_type text
  check (business_type in ('store', 'pharmacy', 'food', 'hardware', 'wholesale', 'other'));
alter table public.businesses add column if not exists modules text[]
  check (modules <@ array['inventory', 'sales', 'attendance', 'fleet']);
-- Optional product details the business turned on.
alter table public.businesses add column if not exists options text[] not null default '{}'
  check (options <@ array['suppliers', 'categories', 'locations', 'expiry']);
-- Up to 5 product fields the business names itself: [{ "id": "f1", "label": "Generic name", "type": "text" }].
alter table public.businesses add column if not exists custom_fields jsonb not null default '[]'
  check (jsonb_typeof(custom_fields) = 'array' and jsonb_array_length(custom_fields) <= 5);
-- Printed at the bottom of receipts. Official receipts need a BIR-registered system.
alter table public.businesses add column if not exists receipt_note text default 'This is not an official receipt.';
-- VAT-registered businesses also drop the 12% VAT on Senior Citizen/PWD sales.
alter table public.businesses add column if not exists vat_registered boolean not null default false;
-- Email summary for the owners: 'weekly' (Mondays), 'daily', or 'off'.
alter table public.businesses add column if not exists digest text not null default 'weekly'
  check (digest in ('off', 'daily', 'weekly'));
-- Senior Citizen/PWD discount for products that don't set their own: 20 (medicine,
-- meals: 20% off and VAT-exempt), 5 (basic necessities and prime commodities:
-- 5% off, VAT stays, at most PHP125 a week), or 0 (none required).
alter table public.businesses add column if not exists senior_default smallint not null default 5
  check (senior_default in (0, 5, 20));
-- BMBE-registered businesses and cooperatives don't have to give the 5% on basic goods.
alter table public.businesses add column if not exists senior_basic_exempt boolean not null default false;

-- Who can log in to which business. One business per login.
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._-]{2,32}$'),
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, username)
);
create index if not exists members_business_idx on public.members (business_id);
-- What a staff login may do beyond selling, Stock In and the time clock.
-- null = everything (logins from before permissions existed); owners and admins always can.
alter table public.members add column if not exists permissions text[]
  check (permissions <@ array['edit_products', 'see_costs', 'cancel_sales', 'discounts', 'adjust_stock', 'credit']);

-- The signed-in user's business, used by every permission rule below.
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.members where user_id = auth.uid();
$$;

-- Whether the signed-in user may do something that needs a permission (see members.permissions).
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'admin') or permissions is null or p_permission = any (permissions) from public.members where user_id = auth.uid()),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('owner', 'admin') from public.members where user_id = auth.uid()), false);
$$;

drop function if exists public.next_order_number(); -- replaced by the orders_assign_number trigger


-- -----------------------------------------------------------------------------
-- Upgrade from the old one-business layout (runs once, only when needed)
--
-- Older versions kept one business per database. If this is one of those, its
-- data becomes the first business here: products, sales, people and trucks.
-- Logins keep their passwords. All or nothing: if anything fails, nothing changes.
-- -----------------------------------------------------------------------------

do $$
declare
  v_biz uuid;
  v_name text := 'My Business';
  v_address text;
  v_contact text;
  v_logo text;
  v_footer text := 'Thank you for your purchase!';
  v_low integer := 10;
  v_slug text;
  v_owner uuid;
  v_username text;
  v_try text;
  v_n integer;
  t text;
  r record;
begin
  if to_regclass('public.items') is null or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'business_id'
  ) then
    return; -- a new database, or already upgraded
  end if;
  raise notice 'Upgrading the old one-business database.';

  -- 1. Columns the oldest versions lack; fixed lists and naive dates made flexible/exact.
  alter table public.items add column if not exists created_at timestamptz not null default now();
  alter table public.items alter column unit drop default;
  alter table public.items alter column unit type text using unit::text;
  update public.items set unit = 'pieces' where unit is null;
  alter table public.items alter column unit set default 'pieces';
  alter table public.items alter column unit set not null;

  alter table public.orders add column if not exists date_cancelled timestamptz;
  alter table public.orders add column if not exists payment_method text;
  alter table public.orders add column if not exists amount_tendered numeric(12, 2);
  alter table public.orders add column if not exists created_by uuid;
  alter table public.orders alter column status drop default;
  alter table public.orders alter column status type text using status::text;
  alter table public.orders alter column status set default 'PENDING';
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_status_check') then
    alter table public.orders add constraint orders_status_check check (status in ('PENDING', 'COMPLETED', 'CANCELLED'));
  end if;
  for t in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and data_type = 'timestamp without time zone'
  loop
    -- These were always written in UTC.
    execute format('alter table public.orders alter column %I type timestamptz using %I at time zone ''UTC''', t, t);
  end loop;

  alter table public.order_item add column if not exists item_name text;
  update public.order_item oi set item_name = i.name from public.items i where oi.item_id = i.id and oi.item_name is null;
  alter table public.order_item alter column item_id drop not null;

  -- 2. The business itself, from the old settings when there are any.
  if to_regclass('public.settings') is not null then
    select coalesce(nullif(trim(business_name), ''), v_name), business_address, business_contact, logo_url,
           coalesce(receipt_footer, v_footer), coalesce(low_stock_threshold, v_low)
    into v_name, v_address, v_contact, v_logo, v_footer, v_low
    from public.settings order by id limit 1;
    v_name := coalesce(v_name, 'My Business');
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'business'; end if;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  -- An existing customer: a year of access to start with (change it on /platform).
  insert into public.businesses (name, slug, address, contact, logo_url, receipt_footer, low_stock_threshold, trial_ends_at, paid_until)
  values (left(v_name, 80), v_slug, v_address, v_contact, v_logo, v_footer, v_low, now(), now() + interval '1 year')
  returning id into v_biz;

  -- 3. App logins become members. The earliest admin owns the business.
  if to_regclass('public.profiles') is not null then
    select p.id into v_owner
    from public.profiles p join auth.users u on u.id = p.id
    order by p.is_admin desc nulls last, p.created_at
    limit 1;
    for r in
      select p.id, p.username, p.is_admin
      from public.profiles p join auth.users u on u.id = p.id
      order by p.created_at
    loop
      v_username := left(regexp_replace(lower(coalesce(r.username, '')), '[^a-z0-9._-]', '', 'g'), 32);
      if length(v_username) < 2 then v_username := 'user'; end if;
      v_try := v_username;
      v_n := 1;
      while exists (select 1 from public.members where business_id = v_biz and username = v_try) loop
        v_n := v_n + 1;
        v_try := left(v_username, 28) || v_n;
      end loop;
      insert into public.members (user_id, business_id, username, role)
      values (r.id, v_biz, v_try, case when r.id = v_owner then 'owner' when r.is_admin then 'admin' else 'staff' end)
      on conflict (user_id) do nothing;
    end loop;
  end if;

  -- 4. Tag every row with the business, and drop old links between tables
  --    (business-safe ones that include business_id are added below).
  foreach t in array array['items', 'stock_movements', 'orders', 'order_item', 'employees', 'attendance', 'vehicles', 'trips', 'fuel_logs'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('alter table public.%I add column business_id uuid', t);
    execute format('update public.%I set business_id = %L', t, v_biz);
    execute format('alter table public.%I alter column business_id set not null', t);
    execute format('alter table public.%I alter column business_id set default public.current_business_id()', t);
    execute format('alter table public.%I add constraint %I foreign key (business_id) references public.businesses (id) on delete cascade', t, t || '_business_id_fkey');
    for r in
      select conname from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'f'
        and confrelid::regclass::text in ('items', 'orders', 'employees', 'vehicles', 'public.items', 'public.orders', 'public.employees', 'public.vehicles')
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
  end loop;

  -- 5. One-business "unique" rules become per-business ones.
  for r in
    select c.relname as tbl, i.indexrelid::regclass::text as idx, con.conname
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    left join pg_constraint con on con.conindid = i.indexrelid
    where c.relnamespace = 'public'::regnamespace and i.indisunique and i.indnatts = 1
      and ((c.relname = 'items' and a.attname = 'barcode') or (c.relname in ('employees', 'vehicles') and a.attname = 'code'))
  loop
    if r.conname is not null then
      execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    else
      execute format('drop index %s', r.idx);
    end if;
  end loop;

  alter table public.orders add column number integer;
  update public.orders set number = id; -- old sale numbers stay the same
  alter table public.orders alter column number set not null;
  update public.businesses set order_seq = coalesce((select max(number) from public.orders), 0) where id = v_biz;

  alter table public.items add constraint items_id_business_id_key unique (id, business_id);
  alter table public.items add constraint items_business_id_barcode_key unique (business_id, barcode);
  alter table public.orders add constraint orders_id_business_id_key unique (id, business_id);
  alter table public.orders add constraint orders_business_id_number_key unique (business_id, number);
  alter table public.order_item add constraint order_item_order_id_business_id_fkey
    foreign key (order_id, business_id) references public.orders (id, business_id) on delete cascade;
  alter table public.order_item add constraint order_item_item_id_business_id_fkey
    foreign key (item_id, business_id) references public.items (id, business_id) on delete set null (item_id);
  if to_regclass('public.stock_movements') is not null then
    alter table public.stock_movements add constraint stock_movements_item_id_business_id_fkey
      foreign key (item_id, business_id) references public.items (id, business_id) on delete cascade;
  end if;
  if to_regclass('public.employees') is not null then
    alter table public.employees add constraint employees_id_business_id_key unique (id, business_id);
    alter table public.employees add constraint employees_business_id_code_key unique (business_id, code);
  end if;
  if to_regclass('public.vehicles') is not null then
    alter table public.vehicles add constraint vehicles_id_business_id_key unique (id, business_id);
    alter table public.vehicles add constraint vehicles_business_id_code_key unique (business_id, code);
  end if;
  if to_regclass('public.attendance') is not null then
    alter table public.attendance add constraint attendance_employee_id_business_id_fkey
      foreign key (employee_id, business_id) references public.employees (id, business_id) on delete cascade;
  end if;
  if to_regclass('public.trips') is not null then
    alter table public.trips add constraint trips_vehicle_id_business_id_fkey
      foreign key (vehicle_id, business_id) references public.vehicles (id, business_id) on delete cascade;
    alter table public.trips add constraint trips_driver_id_business_id_fkey
      foreign key (driver_id, business_id) references public.employees (id, business_id) on delete set null (driver_id);
  end if;
  if to_regclass('public.fuel_logs') is not null then
    alter table public.fuel_logs add constraint fuel_logs_vehicle_id_business_id_fkey
      foreign key (vehicle_id, business_id) references public.vehicles (id, business_id) on delete cascade;
  end if;

  raise notice 'Upgrade done: business "%" (staff link /s/%).', v_name, v_slug;
end $$;


-- -----------------------------------------------------------------------------
-- Inventory
-- (business_id defaults to the signed-in user's business, so the app never
-- has to pass it. Cross-table links include business_id so a row can never
-- point at another business's data.)
-- -----------------------------------------------------------------------------

create table if not exists public.items (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  barcode text,
  name text not null,
  brand text,
  unit text not null default 'pieces',
  current_stock integer not null default 0,
  price_buy numeric(12, 2) not null default 0,
  price_sell numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, barcode)
);

-- Who a business buys from.
create table if not exists public.suppliers (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
create unique index if not exists suppliers_business_name_key on public.suppliers (business_id, lower(name));

-- Optional product details, shown only when the business turns them on.
alter table public.items add column if not exists supplier_id bigint;
alter table public.items add column if not exists category text;
alter table public.items add column if not exists location text; -- shelf or storage spot
alter table public.items add column if not exists reorder_level integer check (reorder_level >= 0); -- null: the business's low-stock level
alter table public.items add column if not exists extra jsonb not null default '{}'; -- custom field values, by field id
alter table public.items add column if not exists senior_discount smallint check (senior_discount in (0, 5, 20)); -- null: the business's default
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_supplier_fkey') then
    alter table public.items add constraint items_supplier_fkey foreign key (supplier_id, business_id)
      references public.suppliers (id, business_id) on delete set null (supplier_id);
  end if;
end $$;
create index if not exists items_supplier_idx on public.items (supplier_id);

create table if not exists public.stock_movements (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  item_id bigint not null,
  change integer not null,
  reason text not null check (reason in ('initial', 'receive', 'sale', 'adjust', 'return', 'out')),
  note text,
  order_id bigint,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (item_id, business_id) references public.items (id, business_id) on delete cascade
);
create index if not exists stock_movements_business_created_idx on public.stock_movements (business_id, created_at desc);
create index if not exists stock_movements_item_idx on public.stock_movements (item_id, created_at desc);

-- Deliveries record who they came from.
alter table public.stock_movements add column if not exists supplier_id bigint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_supplier_fkey') then
    alter table public.stock_movements add constraint stock_movements_supplier_fkey foreign key (supplier_id, business_id)
      references public.suppliers (id, business_id) on delete set null (supplier_id);
  end if;
end $$;

-- Expiry dates, tracked per delivery: a batch is stock that arrived together
-- with one expiry date (and lot number). A product's batches add up to at most
-- its stock; the rest has no date recorded. Stock taken out comes from the
-- batch that expires first (see take_from_batches).
create table if not exists public.stock_batches (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  item_id bigint not null,
  quantity integer not null check (quantity >= 0),
  expires_on date,
  lot text,
  supplier_id bigint,
  received_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (item_id, business_id) references public.items (id, business_id) on delete cascade,
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id) on delete set null (supplier_id)
);
create index if not exists stock_batches_item_idx on public.stock_batches (item_id) where quantity > 0;
create index if not exists stock_batches_expiry_idx on public.stock_batches (business_id, expires_on) where quantity > 0;


-- -----------------------------------------------------------------------------
-- Sales (POS + orders)
-- -----------------------------------------------------------------------------

create table if not exists public.orders (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  number integer not null, -- shown to people: #1, #2, … per business (see assign_order_number)
  customer_name text,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'CANCELLED')),
  total_price numeric(12, 2) not null default 0,
  payment_method text,
  amount_tendered numeric(12, 2),
  created_by uuid default auth.uid(),
  date_created timestamptz not null default now(),
  date_completed timestamptz,
  date_cancelled timestamptz,
  unique (id, business_id),
  unique (business_id, number)
);
create index if not exists orders_business_status_idx on public.orders (business_id, status, date_completed desc);

-- Each business numbers its own sales #1, #2, … (set here, never by the app).
create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update businesses set order_seq = order_seq + 1 where id = new.business_id returning order_seq into new.number;
  return new;
end;
$$;

drop trigger if exists orders_assign_number on public.orders;
create trigger orders_assign_number
  before insert on public.orders
  for each row execute function public.assign_order_number();

create table if not exists public.order_item (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  order_id bigint not null,
  item_id bigint,
  item_name text, -- kept so history survives product renames and deletes
  quantity integer not null check (quantity > 0),
  price_at_time numeric(12, 2) not null,
  foreign key (order_id, business_id) references public.orders (id, business_id) on delete cascade,
  foreign key (item_id, business_id) references public.items (id, business_id) on delete set null (item_id)
);
create index if not exists order_item_order_idx on public.order_item (order_id);

-- Regular customers, and what they owe ("utang"). balance > 0 means they owe the business.
create table if not exists public.customers (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text,
  address text,
  notes text,
  credit_limit numeric(12, 2) check (credit_limit >= 0), -- null = no limit
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
create unique index if not exists customers_business_name_key on public.customers (business_id, lower(name));

-- Every change to a customer's balance: credit sales (+), payments (-), voided sales (-).
create table if not exists public.customer_ledger (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  customer_id bigint not null,
  change numeric(12, 2) not null,
  kind text not null check (kind in ('sale', 'payment', 'void', 'adjust')),
  order_id bigint,
  method text,
  reference text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (customer_id, business_id) references public.customers (id, business_id) on delete cascade,
  foreign key (order_id, business_id) references public.orders (id, business_id) on delete set null (order_id)
);
create index if not exists customer_ledger_customer_idx on public.customer_ledger (customer_id, created_at desc);
create index if not exists customer_ledger_business_idx on public.customer_ledger (business_id, created_at desc);

-- Discounts, Senior/PWD details, credit and payment details on each sale.
alter table public.orders add column if not exists subtotal numeric(12, 2); -- before discounts; null on older sales
alter table public.orders add column if not exists discount_total numeric(12, 2) not null default 0;
alter table public.orders add column if not exists vat_exempt numeric(12, 2) not null default 0;
alter table public.orders add column if not exists discount_kind text check (discount_kind in ('senior', 'pwd', 'amount', 'percent'));
alter table public.orders add column if not exists discount_value numeric(12, 2);
alter table public.orders add column if not exists discount_person text; -- Senior/PWD's name
alter table public.orders add column if not exists discount_id_no text; -- Senior/PWD ID number
alter table public.orders add column if not exists customer_id bigint;
alter table public.orders add column if not exists paid_now numeric(12, 2);
alter table public.orders add column if not exists on_credit numeric(12, 2) not null default 0;
alter table public.orders add column if not exists payment_ref text;
alter table public.orders add column if not exists void_reason text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_customer_fkey') then
    alter table public.orders add constraint orders_customer_fkey foreign key (customer_id, business_id)
      references public.customers (id, business_id) on delete set null (customer_id);
  end if;
end $$;
-- A discount on one line of a sale (pesos, for the whole line).
alter table public.order_item add column if not exists discount numeric(12, 2) not null default 0;
-- What each item cost when it was sold, for profit reports. Older sales have none (reports estimate them).
alter table public.order_item add column if not exists cost_at_time numeric(12, 2);
-- The Senior/PWD rate a sold line got (20 or 5); its discount is in "discount". Null: none, or a promo instead.
alter table public.order_item add column if not exists senior_rate smallint check (senior_rate in (5, 20));
create index if not exists order_item_item_idx on public.order_item (item_id);

-- End-of-day closings: the day's numbers, and the cash counted in the drawer.
create table if not exists public.day_closings (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  day date not null,
  opening_cash numeric(12, 2) not null default 0,
  expected_cash numeric(12, 2) not null,
  counted_cash numeric(12, 2),
  difference numeric(12, 2),
  summary jsonb not null,
  note text,
  closed_by uuid default auth.uid(),
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, day)
);

-- Who did what: price changes, voids, discounts, deletions, permission changes...
-- Written by the app's server; owners and admins read it.
create table if not exists public.activity_log (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  user_id uuid default auth.uid(),
  username text,
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_log_business_idx on public.activity_log (business_id, created_at desc);

-- Fills in who did it from the login, so it can't be made up.
create or replace function public.activity_log_fill()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.username := (select username from members where user_id = auth.uid());
  return new;
end;
$$;
drop trigger if exists activity_log_fill on public.activity_log;
create trigger activity_log_fill
  before insert on public.activity_log
  for each row execute function public.activity_log_fill();

-- Stock changes from a sale point at it; deleting the sale keeps the stock history.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_order_fkey') then
    alter table public.stock_movements
      add constraint stock_movements_order_fkey foreign key (order_id, business_id)
      references public.orders (id, business_id) on delete set null (order_id);
  end if;
end $$;

-- Moves a PENDING order to COMPLETED and takes the items out of stock. All-or-nothing.
create or replace function public.complete_order(p_order_id bigint)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_stock integer;
  v_order record;
  r record;
begin
  select status into v_status from orders where id = p_order_id for update;
  if v_status is null then
    raise exception 'Order not found';
  end if;
  if v_status <> 'PENDING' then
    raise exception 'This order is already %', lower(v_status);
  end if;

  for r in
    select oi.item_id, sum(oi.quantity)::integer as quantity, max(coalesce(oi.item_name, i.name)) as name
    from order_item oi
    left join items i on i.id = oi.item_id
    where oi.order_id = p_order_id and oi.item_id is not null
    group by oi.item_id
  loop
    select current_stock into v_stock from items where id = r.item_id for update;
    if v_stock is null then
      continue;
    end if;
    if v_stock < r.quantity then
      raise exception 'Not enough stock for "%": % left, % needed', r.name, v_stock, r.quantity;
    end if;
    update items set current_stock = current_stock - r.quantity where id = r.item_id returning current_stock into v_stock;
    perform take_from_batches(r.item_id, r.quantity, v_stock);
    insert into stock_movements (item_id, change, reason, order_id) values (r.item_id, -r.quantity, 'sale', p_order_id);
  end loop;

  -- A credit sale goes on the customer's balance once it's completed.
  select number, customer_id, on_credit into v_order from orders where id = p_order_id;
  if v_order.on_credit > 0 and v_order.customer_id is not null then
    insert into customer_ledger (customer_id, change, kind, order_id, note)
    values (v_order.customer_id, v_order.on_credit, 'sale', p_order_id, 'Sale #' || v_order.number);
    update customers set balance = balance + v_order.on_credit where id = v_order.customer_id;
  end if;

  update orders set status = 'COMPLETED', date_completed = now() where id = p_order_id;
end;
$$;


-- Creates a sale from [{ "item_id": 1, "quantity": 2, "discount_type": "amount"|"percent", "discount_value": 10 }, ...]
-- at current shelf prices, with optional discounts and credit. If p_complete,
-- stock comes out right away; otherwise it's a PENDING order (see complete_order).
--   p_discount: { "kind": "senior"|"pwd", "person": "Juan Cruz", "id_no": "12345" }
--            or { "kind": "amount"|"percent", "value": 50 }
--     Senior/PWD: 20% off (no other discounts on top). VAT-registered
--     businesses also drop the 12% VAT first: total = price / 1.12 × 0.8.
--     Other discounts need the "discounts" permission.
--   p_customer_id + p_paid_now: a credit sale. What isn't paid now goes on the
--     customer's balance (needs the "credit" permission; respects their limit).
-- Returns { id, number, total, on_credit }.
drop function if exists public.create_sale(jsonb, text, boolean, text, numeric); -- older versions had fewer options
-- How much 5% Senior/PWD discount (basic goods) this ID got at this business
-- this week, Monday to Sunday, Philippine time. The law caps it at PHP125 a week.
create or replace function public.senior_week_used(p_kind text, p_id_no text)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(oi.discount), 0)
  from orders o
  join order_item oi on oi.order_id = o.id
  where o.business_id = current_business_id()
    and o.discount_kind = p_kind
    and o.status <> 'CANCELLED'
    and oi.senior_rate = 5
    and upper(regexp_replace(o.discount_id_no, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(coalesce(p_id_no, ''), '[^A-Za-z0-9]', '', 'g'))
    and o.date_created >= (date_trunc('week', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
$$;

create or replace function public.create_sale(
  p_items jsonb,
  p_customer_name text default null,
  p_complete boolean default true,
  p_payment_method text default null,
  p_amount_tendered numeric default null,
  p_discount jsonb default null,
  p_customer_id bigint default null,
  p_paid_now numeric default null,
  p_payment_ref text default null
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_number integer;
  v_subtotal numeric(12, 2) := 0;
  v_line_discounts numeric(12, 2) := 0;
  v_order_discount numeric(12, 2) := 0;
  v_vat_exempt numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_kind text := nullif(p_discount ->> 'kind', '');
  v_value numeric := (p_discount ->> 'value')::numeric;
  v_person text := nullif(trim(p_discount ->> 'person'), '');
  v_id_no text := nullif(trim(p_discount ->> 'id_no'), '');
  v_vat boolean;
  v_customer_name text;
  v_balance numeric(12, 2);
  v_limit numeric(12, 2);
  v_paid numeric(12, 2);
  v_credit numeric(12, 2) := 0;
  v_price numeric(12, 2);
  v_cost numeric(12, 2);
  v_name text;
  v_line numeric(12, 2);
  v_disc numeric(12, 2);
  v_senior boolean := coalesce(v_kind in ('senior', 'pwd'), false);
  v_default smallint;
  v_exempt boolean;
  v_item_rate smallint;
  v_rate smallint;
  v_line_rate smallint;
  v_room numeric(12, 2) := 0;
  v_sc numeric(12, 2);
  v_vx numeric(12, 2);
  v_promos numeric(12, 2) := 0;
  v_senior_total numeric(12, 2) := 0;
  e jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The sale has no items';
  end if;
  if current_business_id() is null then
    raise exception 'Not signed in to a business';
  end if;
  if v_kind is not null and v_kind not in ('senior', 'pwd', 'amount', 'percent') then
    raise exception 'Unknown discount';
  end if;
  if v_senior then
    if v_person is null or v_id_no is null then
      raise exception 'Enter the % name and ID number', case v_kind when 'senior' then 'Senior Citizen''s' else 'PWD''s' end;
    end if;
    select vat_registered, senior_default, senior_basic_exempt into v_vat, v_default, v_exempt
    from businesses where id = current_business_id();
    v_room := greatest(0, 125 - senior_week_used(v_kind, v_id_no));
  end if;

  insert into orders (customer_name, status, total_price) values (nullif(trim(p_customer_name), ''), 'PENDING', 0)
  returning id, number into v_order_id, v_number;

  for e in select value from jsonb_array_elements(p_items) loop
    if (e ->> 'quantity')::integer is null or (e ->> 'quantity')::integer <= 0 then
      raise exception 'Quantities must be at least 1';
    end if;
    select price_sell, price_buy, name, senior_discount into v_price, v_cost, v_name, v_item_rate
    from items where id = (e ->> 'item_id')::bigint;
    if not found then
      raise exception 'A product in this sale no longer exists';
    end if;
    v_line := v_price * (e ->> 'quantity')::integer;
    -- A promo on this line, if the cashier gave one.
    v_disc := case e ->> 'discount_type'
      when 'amount' then least(greatest(coalesce((e ->> 'discount_value')::numeric, 0), 0), v_line)
      when 'percent' then round(v_line * least(greatest(coalesce((e ->> 'discount_value')::numeric, 0), 0), 100) / 100, 2)
      else 0
    end;
    v_line_rate := null;
    -- Senior/PWD: each line gets its own rate, or its promo if that's bigger (never both).
    if v_senior then
      v_rate := coalesce(v_item_rate, v_default, 5);
      if v_rate = 5 and v_exempt then
        v_rate := 0;
      end if;
      if v_rate = 20 then
        v_vx := case when v_vat then v_line - round(v_line / 1.12, 2) else 0 end;
        v_sc := round((v_line - v_vx) * 0.20, 2);
        if v_disc <= v_sc + v_vx then
          v_disc := v_sc;
          v_vat_exempt := v_vat_exempt + v_vx;
          v_line_rate := 20;
        end if;
      elsif v_rate = 5 then
        v_sc := least(round(v_line * 0.05, 2), v_room);
        if v_sc > 0 and v_disc < v_sc then
          v_disc := v_sc;
          v_room := v_room - v_sc;
          v_line_rate := 5;
        end if;
      end if;
    end if;
    if v_line_rate is null then
      v_promos := v_promos + v_disc;
    else
      v_senior_total := v_senior_total + v_disc;
    end if;
    insert into order_item (order_id, item_id, item_name, quantity, price_at_time, discount, cost_at_time, senior_rate)
    values (v_order_id, (e ->> 'item_id')::bigint, v_name, (e ->> 'quantity')::integer, v_price, v_disc, v_cost, v_line_rate);
    v_subtotal := v_subtotal + v_line;
    v_line_discounts := v_line_discounts + v_disc;
  end loop;

  if v_kind in ('amount', 'percent') then
    if v_value is null or v_value < 0 or (v_kind = 'percent' and v_value > 100) then
      raise exception 'Enter a discount between 0 and %', case v_kind when 'percent' then '100%' else 'the total' end;
    end if;
    v_order_discount := case v_kind
      when 'amount' then least(v_value, v_subtotal - v_line_discounts)
      else round((v_subtotal - v_line_discounts) * v_value / 100, 2)
    end;
  end if;
  if (v_promos > 0 or (v_kind in ('amount', 'percent') and v_order_discount > 0)) and not has_permission('discounts') then
    raise exception 'You don''t have permission to give discounts';
  end if;
  v_total := v_subtotal - v_vat_exempt - v_line_discounts - v_order_discount;

  -- Customer and credit.
  if p_customer_id is not null then
    select name, balance, credit_limit into v_customer_name, v_balance, v_limit from customers where id = p_customer_id for update;
    if not found then
      raise exception 'That customer no longer exists';
    end if;
  end if;
  v_paid := v_total;
  if p_customer_id is not null and p_paid_now is not null then
    v_paid := least(greatest(p_paid_now, 0), v_total);
    v_credit := v_total - v_paid;
  end if;
  if v_credit > 0 then
    if not has_permission('credit') then
      raise exception 'You don''t have permission to sell on credit';
    end if;
    if v_limit is not null and v_balance + v_credit > v_limit then
      raise exception '% would owe %, over their credit limit of %', v_customer_name, v_balance + v_credit, v_limit;
    end if;
  end if;

  update orders
  set subtotal = v_subtotal,
      discount_total = v_line_discounts + v_order_discount,
      vat_exempt = v_vat_exempt,
      discount_kind = case when v_senior then case when v_senior_total > 0 or v_vat_exempt > 0 then v_kind end
                           when v_order_discount > 0 then v_kind end,
      discount_value = case when v_kind in ('amount', 'percent') then v_value end,
      discount_person = case when v_senior and (v_senior_total > 0 or v_vat_exempt > 0) then v_person end,
      discount_id_no = case when v_senior and (v_senior_total > 0 or v_vat_exempt > 0) then v_id_no end,
      total_price = v_total,
      customer_id = p_customer_id,
      customer_name = coalesce(nullif(trim(p_customer_name), ''), v_customer_name),
      paid_now = v_paid,
      on_credit = v_credit,
      payment_method = case when v_paid = 0 and v_credit > 0 then 'Credit' else p_payment_method end,
      payment_ref = nullif(trim(p_payment_ref), ''),
      amount_tendered = p_amount_tendered
  where id = v_order_id;

  if p_complete then
    perform complete_order(v_order_id);
  end if;

  return json_build_object('id', v_order_id, 'number', v_number, 'total', v_total, 'on_credit', v_credit);
end;
$$;

-- Voids a completed sale: its stock goes back, any credit comes off the
-- customer's balance, and the reason is kept. Needs "cancel_sales".
create or replace function public.void_sale(p_order_id bigint, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order record;
  r record;
begin
  if not has_permission('cancel_sales') then
    raise exception 'You don''t have permission to void sales';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Say why the sale is being voided';
  end if;
  select id, number, status, customer_id, on_credit into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Sale not found';
  end if;
  if v_order.status <> 'COMPLETED' then
    raise exception 'Only completed sales can be voided';
  end if;

  for r in select item_id, sum(quantity)::integer as quantity from order_item where order_id = p_order_id and item_id is not null group by item_id loop
    perform adjust_stock(r.item_id, r.quantity, 'return', 'Sale #' || v_order.number || ' voided');
  end loop;
  if v_order.on_credit > 0 and v_order.customer_id is not null then
    insert into customer_ledger (customer_id, change, kind, order_id, note)
    values (v_order.customer_id, -v_order.on_credit, 'void', p_order_id, 'Sale #' || v_order.number || ' voided');
    update customers set balance = balance - v_order.on_credit where id = v_order.customer_id;
  end if;
  update orders set status = 'CANCELLED', date_cancelled = now(), void_reason = trim(p_reason) where id = p_order_id;
end;
$$;

-- A customer pays some or all of what they owe. Returns their new balance.
create or replace function public.record_payment(
  p_customer_id bigint,
  p_amount numeric,
  p_method text default 'Cash',
  p_reference text default null,
  p_note text default null
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_balance numeric(12, 2);
begin
  if not has_permission('credit') then
    raise exception 'You don''t have permission to record payments';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter how much they paid';
  end if;
  update customers set balance = balance - p_amount where id = p_customer_id returning balance into v_balance;
  if not found then
    raise exception 'Customer not found';
  end if;
  insert into customer_ledger (customer_id, change, kind, method, reference, note)
  values (p_customer_id, -p_amount, 'payment', coalesce(nullif(trim(p_method), ''), 'Cash'), nullif(trim(p_reference), ''), nullif(trim(p_note), ''));
  return v_balance;
end;
$$;

-- The numbers for a period (usually a day): sales, discounts, payments by
-- method, credit given and collected, voids, and the cash that should be in
-- the drawer. Used by the end-of-day closing.
create or replace function public.day_summary(p_from timestamptz, p_to timestamptz)
returns json
language sql
stable
set search_path = public
as $$
  with sales as (
    select * from orders where status = 'COMPLETED' and date_completed >= p_from and date_completed < p_to
  ),
  voids as (
    select * from orders where status = 'CANCELLED' and void_reason is not null and date_cancelled >= p_from and date_cancelled < p_to
  ),
  paid as (
    select coalesce(payment_method, 'Not recorded') as method, coalesce(paid_now, total_price) as amount from sales
    where coalesce(paid_now, total_price) > 0
  ),
  collected as (
    select coalesce(method, 'Cash') as method, -change as amount from customer_ledger
    where kind = 'payment' and created_at >= p_from and created_at < p_to
  )
  select json_build_object(
    'sales', (select count(*) from sales),
    'gross', (select coalesce(sum(coalesce(subtotal, total_price)), 0) from sales),
    'discounts', (select coalesce(sum(discount_total), 0) from sales),
    'senior_pwd', (select count(*) from sales where discount_kind in ('senior', 'pwd')),
    'vat_exempt', (select coalesce(sum(vat_exempt), 0) from sales),
    'net', (select coalesce(sum(total_price), 0) from sales),
    'credit_given', (select coalesce(sum(on_credit), 0) from sales),
    'by_method', (select coalesce(json_object_agg(method, total), '{}') from (select method, sum(amount) as total from paid group by method) m),
    'collected', (select coalesce(json_object_agg(method, total), '{}') from (select method, sum(amount) as total from collected group by method) c),
    'cash_in', (select coalesce(sum(amount), 0) from paid where method = 'Cash') + (select coalesce(sum(amount), 0) from collected where method = 'Cash'),
    'voids', (select count(*) from voids),
    'voided_total', (select coalesce(sum(total_price), 0) from voids),
    'items_sold', (select coalesce(sum(oi.quantity), 0) from order_item oi join sales s on s.id = oi.order_id),
    'top_items', (
      select coalesce(json_agg(t), '[]') from (
        select oi.item_name as name, sum(oi.quantity) as quantity, sum(oi.quantity * oi.price_at_time - oi.discount) as amount
        from order_item oi join sales s on s.id = oi.order_id
        group by oi.item_name order by sum(oi.quantity) desc limit 10
      ) t
    )
  );
$$;

-- Profit for a period: revenue (after every discount), cost, and profit, by
-- day, product and category, plus slow movers (in stock, no sales in
-- p_slow_days). Each sale's discounts are shared across its lines by value.
-- Cost is what the item cost when sold, or today's cost for older sales
-- ("estimated_lines"). Needs "see_costs". The server (no login) passes
-- p_business_id for the owners' email digest.
create or replace function public.profit_report(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'Asia/Manila',
  p_slow_days integer default 60,
  p_business_id uuid default null
)
returns json
language plpgsql
stable
set search_path = public
as $$
declare
  v_biz uuid := case when auth.uid() is null then p_business_id end;
begin
  if v_biz is null then
    v_biz := current_business_id();
    if not has_permission('see_costs') then
      raise exception 'You don''t have permission to see costs and profit';
    end if;
  end if;
  if v_biz is null then
    raise exception 'Not signed in to a business';
  end if;

  return (
    with sales as (
      select id, total_price, discount_total, date_completed from orders
      where business_id = v_biz and status = 'COMPLETED' and date_completed >= p_from and date_completed < p_to
    ),
    lines as (
      select oi.order_id, oi.item_id, coalesce(oi.item_name, i.name) as name, i.category, oi.quantity,
             oi.quantity * oi.price_at_time - oi.discount as line_net,
             oi.quantity * coalesce(oi.cost_at_time, i.price_buy, 0) as cost,
             oi.cost_at_time is null as estimated
      from order_item oi join sales s on s.id = oi.order_id left join items i on i.id = oi.item_id
    ),
    factors as (
      select s.id, s.date_completed, case when sum(l.line_net) > 0 then s.total_price / sum(l.line_net) else 0 end as f
      from sales s join lines l on l.order_id = s.id
      group by s.id, s.total_price, s.date_completed
    ),
    rev as (
      select l.*, l.line_net * f.f as revenue, f.date_completed from lines l join factors f on f.id = l.order_id
    )
    select json_build_object(
      'sales', (select count(*) from sales),
      'revenue', (select round(coalesce(sum(revenue), 0), 2) from rev),
      'cost', (select round(coalesce(sum(cost), 0), 2) from rev),
      'discounts', (select coalesce(sum(discount_total), 0) from sales),
      'items_sold', (select coalesce(sum(quantity), 0) from rev),
      'estimated_lines', (select count(*) from rev where estimated),
      'by_day', (
        select coalesce(json_agg(d order by d.day), '[]') from (
          select (date_completed at time zone p_tz)::date as day, round(sum(revenue), 2) as revenue, round(sum(cost), 2) as cost
          from rev group by 1
        ) d
      ),
      'by_product', (
        select coalesce(json_agg(p order by p.profit desc), '[]') from (
          select item_id, name, category, sum(quantity) as quantity, round(sum(revenue), 2) as revenue,
                 round(sum(cost), 2) as cost, round(sum(revenue - cost), 2) as profit
          from rev group by item_id, name, category
        ) p
      ),
      'by_category', (
        select coalesce(json_agg(c order by c.revenue desc), '[]') from (
          select coalesce(category, '') as category, sum(quantity) as quantity, round(sum(revenue), 2) as revenue, round(sum(cost), 2) as cost
          from rev group by 1
        ) c
      ),
      'slow_movers', (
        select coalesce(json_agg(x), '[]') from (
          select i.id, i.name, i.unit, i.current_stock, round(i.current_stock * i.price_buy, 2) as value, last.last_sold
          from items i
          left join lateral (
            select max(o.date_completed) as last_sold from order_item oi join orders o on o.id = oi.order_id
            where oi.item_id = i.id and o.status = 'COMPLETED'
          ) last on true
          where i.business_id = v_biz and i.current_stock > 0
            and (last.last_sold is null or last.last_sold < now() - make_interval(days => p_slow_days))
          order by i.current_stock * i.price_buy desc
          limit 100
        ) x
      )
    )
  );
end;
$$;

-- Closes a day: saves its numbers and the cash count (closing again replaces
-- it). Expected cash = starting cash + cash taken in that day.
create or replace function public.close_day(
  p_day date,
  p_from timestamptz,
  p_to timestamptz,
  p_opening_cash numeric,
  p_counted_cash numeric,
  p_note text default null
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_summary json := day_summary(p_from, p_to);
  v_expected numeric(12, 2) := coalesce(p_opening_cash, 0) + (v_summary ->> 'cash_in')::numeric;
  v_row record;
begin
  if p_opening_cash < 0 or p_counted_cash < 0 then
    raise exception 'Cash amounts can''t be negative';
  end if;
  insert into day_closings (day, opening_cash, expected_cash, counted_cash, difference, summary, note, username)
  values (p_day, coalesce(p_opening_cash, 0), v_expected, p_counted_cash, p_counted_cash - v_expected, v_summary::jsonb, nullif(trim(p_note), ''),
          (select username from members where user_id = auth.uid()))
  on conflict (business_id, day) do update
    set opening_cash = excluded.opening_cash, expected_cash = excluded.expected_cash, counted_cash = excluded.counted_cash,
        difference = excluded.difference, summary = excluded.summary, note = excluded.note,
        closed_by = auth.uid(), username = excluded.username, updated_at = now()
  returning id, expected_cash, difference into v_row;
  return json_build_object('id', v_row.id, 'expected', v_row.expected_cash, 'difference', v_row.difference);
end;
$$;

-- After a product's stock went down by p_quantity (to p_stock_after), takes
-- the same amount out of its expiry batches: first batches that haven't
-- expired, soonest first; then stock with no date recorded; then expired
-- batches. Does nothing for products without batches.
create or replace function public.take_from_batches(p_item_id bigint, p_quantity integer, p_stock_after integer)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_left integer := p_quantity;
  v_batched integer;
  v_take integer;
  b record;
begin
  if p_quantity <= 0 then
    return;
  end if;
  select coalesce(sum(quantity), 0) into v_batched from stock_batches where item_id = p_item_id and quantity > 0;
  if v_batched = 0 then
    return;
  end if;

  for b in
    select id, quantity from stock_batches
    where item_id = p_item_id and quantity > 0 and (expires_on is null or expires_on >= current_date)
    order by expires_on nulls last, id
    for update
  loop
    exit when v_left = 0;
    v_take := least(b.quantity, v_left);
    update stock_batches set quantity = quantity - v_take where id = b.id;
    v_left := v_left - v_take;
  end loop;

  -- Stock without a date (stock before the change, minus what's in batches).
  v_left := v_left - least(v_left, greatest(p_stock_after + p_quantity - v_batched, 0));

  for b in
    select id, quantity from stock_batches
    where item_id = p_item_id and quantity > 0 and expires_on < current_date
    order by expires_on, id
    for update
  loop
    exit when v_left = 0;
    v_take := least(b.quantity, v_left);
    update stock_batches set quantity = quantity - v_take where id = b.id;
    v_left := v_left - v_take;
  end loop;
end;
$$;

-- Adds (positive) or removes (negative) stock and logs why.
drop function if exists public.adjust_stock(bigint, integer, text, text); -- now also takes a supplier
create or replace function public.adjust_stock(
  p_item_id bigint,
  p_change integer,
  p_reason text default 'adjust',
  p_note text default null,
  p_supplier_id bigint default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_stock integer;
begin
  if p_change = 0 then
    select current_stock into v_stock from items where id = p_item_id;
    return v_stock;
  end if;
  update items set current_stock = current_stock + p_change where id = p_item_id returning current_stock into v_stock;
  if not found then
    raise exception 'Product not found';
  end if;
  if v_stock < 0 then
    raise exception 'Stock cannot go below zero';
  end if;
  if p_change < 0 then
    perform take_from_batches(p_item_id, -p_change, v_stock);
  end if;
  insert into stock_movements (item_id, change, reason, note, supplier_id)
  values (p_item_id, p_change, p_reason, nullif(trim(p_note), ''), p_supplier_id);
  return v_stock;
end;
$$;

-- Receives a delivery: [{ "item_id": 1, "quantity": 24, "expires_on": "2027-06-30", "lot": "A12" }, ...]
-- (expiry and lot optional). Lines with an expiry date or lot become batches.
-- Products without a supplier yet get this delivery's supplier. All-or-nothing.
drop function if exists public.receive_stock(jsonb, text); -- now also takes a supplier
create or replace function public.receive_stock(p_items jsonb, p_note text default null, p_supplier_id bigint default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to receive';
  end if;
  for r in
    select (e ->> 'item_id')::bigint as item_id,
           nullif(e ->> 'expires_on', '')::date as expires_on,
           nullif(trim(e ->> 'lot'), '') as lot,
           sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1, 2, 3
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantities must be at least 1';
    end if;
    perform adjust_stock(r.item_id, r.quantity, 'receive', p_note, p_supplier_id);
    if r.expires_on is not null or r.lot is not null then
      insert into stock_batches (item_id, quantity, expires_on, lot, supplier_id)
      values (r.item_id, r.quantity, r.expires_on, r.lot, p_supplier_id);
    end if;
    if p_supplier_id is not null then
      update items set supplier_id = p_supplier_id where id = r.item_id and supplier_id is null;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Records an expiry date (and lot) for stock already on hand that has no date
-- yet, e.g. right after turning expiry dates on. Doesn't change the stock.
create or replace function public.record_batch(p_item_id bigint, p_quantity integer, p_expires_on date, p_lot text default null)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_item record;
  v_batched integer;
  v_id bigint;
begin
  select name, unit, current_stock into v_item from items where id = p_item_id for update;
  if not found then
    raise exception 'Product not found';
  end if;
  select coalesce(sum(quantity), 0) into v_batched from stock_batches where item_id = p_item_id;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter how many';
  end if;
  if p_quantity > v_item.current_stock - v_batched then
    raise exception 'Only % % of "%" have no expiry date yet', greatest(v_item.current_stock - v_batched, 0), v_item.unit, v_item.name;
  end if;
  if p_expires_on is null and nullif(trim(p_lot), '') is null then
    raise exception 'Enter an expiry date or lot number';
  end if;
  insert into stock_batches (item_id, quantity, expires_on, lot)
  values (p_item_id, p_quantity, p_expires_on, nullif(trim(p_lot), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Takes a whole batch out of stock (expired, damaged, returned to the supplier)
-- and logs it. Returns the product's new stock.
create or replace function public.remove_batch(p_batch_id bigint, p_note text default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_batch record;
  v_take integer;
  v_stock integer;
begin
  select b.item_id, b.quantity, b.expires_on, b.lot, i.current_stock
  into v_batch
  from stock_batches b join items i on i.id = b.item_id
  where b.id = p_batch_id
  for update of b, i;
  if not found or v_batch.quantity = 0 then
    raise exception 'That batch is already empty';
  end if;
  v_take := least(v_batch.quantity, v_batch.current_stock);
  update stock_batches set quantity = 0 where id = p_batch_id;
  update items set current_stock = current_stock - v_take where id = v_batch.item_id returning current_stock into v_stock;
  if v_take > 0 then
    insert into stock_movements (item_id, change, reason, note)
    values (v_batch.item_id, -v_take, 'out', concat_ws(' · ',
      coalesce(nullif(trim(p_note), ''), 'Removed batch'),
      case when v_batch.lot is not null then 'lot ' || v_batch.lot end,
      case when v_batch.expires_on is not null then 'expires ' || to_char(v_batch.expires_on, 'YYYY-MM-DD') end));
  end if;
  return v_stock;
end;
$$;

-- Quick Scan: finds a product by barcode and changes its stock in one step.
create or replace function public.scan_stock(p_code text, p_change integer, p_reason text default null, p_note text default null)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_item items%rowtype;
  v_stock integer;
begin
  if p_change is null or p_change = 0 then
    raise exception 'Quantity per scan must not be zero';
  end if;
  select * into v_item from items where barcode = trim(p_code);
  if not found then
    return json_build_object('found', false, 'code', trim(p_code));
  end if;
  if v_item.current_stock + p_change < 0 then
    raise exception '"%" has only % % left', v_item.name, v_item.current_stock, v_item.unit;
  end if;
  v_stock := adjust_stock(v_item.id, p_change, coalesce(p_reason, case when p_change > 0 then 'receive' else 'out' end), p_note);
  return json_build_object('found', true, 'item_id', v_item.id, 'name', v_item.name, 'unit', v_item.unit, 'change', p_change, 'stock', v_stock);
end;
$$;

-- Imports products from a spreadsheet, all or nothing. The app checks the file
-- and shows a preview first (lib/product-import.ts uses the same rules). Rows:
--   [{ "barcode", "name", "brand", "unit", "price_buy", "price_sell", "stock",
--      "supplier", "category", "location", "reorder_level", "extra", "expires_on", "lot" }]
-- Anything but name may be null, meaning "leave the saved value alone".
-- "supplier" is a name; suppliers that don't exist yet are added. "extra" holds
-- custom field values ({ "f1": "Paracetamol" }) and is merged in. "expires_on"
-- and "lot" apply to a new product's opening stock.
-- A row matches a saved product by barcode. A row with a new barcode whose name
-- matches exactly one product without a barcode gives that product the barcode.
-- A row without a barcode matches by name, which must then be unique.
-- New products start with the row's stock (logged as opening stock); saved
-- products' stock only changes with p_set_stock (logged as an adjustment).
-- Returns { added, updated, unchanged }.
create or replace function public.import_items(p_rows jsonb, p_set_stock boolean default false)
returns json
language plpgsql
set search_path = public
as $$
declare
  r jsonb;
  v_id bigint;
  v_count integer;
  v_old integer;
  v_name text;
  v_barcode text;
  v_brand text;
  v_unit text;
  v_buy numeric;
  v_sell numeric;
  v_stock integer;
  v_supplier_name text;
  v_supplier bigint;
  v_category text;
  v_location text;
  v_reorder integer;
  v_senior smallint;
  v_extra jsonb;
  v_expires date;
  v_lot text;
  v_changed boolean;
  v_added integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Expected a list of products';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import up to 5,000 products at a time';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(r ->> 'name'), '');
    v_barcode := nullif(trim(r ->> 'barcode'), '');
    v_brand := nullif(trim(r ->> 'brand'), '');
    v_unit := nullif(lower(trim(r ->> 'unit')), '');
    v_buy := (r ->> 'price_buy')::numeric;
    v_sell := (r ->> 'price_sell')::numeric;
    v_stock := (r ->> 'stock')::integer;
    v_supplier_name := nullif(trim(r ->> 'supplier'), '');
    v_category := nullif(trim(r ->> 'category'), '');
    v_location := nullif(trim(r ->> 'location'), '');
    v_reorder := (r ->> 'reorder_level')::integer;
    v_senior := (r ->> 'senior_discount')::smallint;
    if v_senior is not null and v_senior not in (0, 5, 20) then
      raise exception '"%": the Senior/PWD discount must be 20, 5 or 0', r ->> 'name';
    end if;
    v_extra := case when jsonb_typeof(r -> 'extra') = 'object' then r -> 'extra' else '{}'::jsonb end;
    v_expires := nullif(r ->> 'expires_on', '')::date;
    v_lot := nullif(trim(r ->> 'lot'), '');
    if v_name is null then
      raise exception 'Every product needs a name';
    end if;
    if v_stock < 0 or v_buy < 0 or v_sell < 0 or v_reorder < 0 then
      raise exception '"%": stock, prices and low-stock levels can''t be negative', v_name;
    end if;

    v_supplier := null;
    if v_supplier_name is not null then
      select id into v_supplier from suppliers where lower(name) = lower(v_supplier_name);
      if v_supplier is null then
        insert into suppliers (name) values (v_supplier_name) returning id into v_supplier;
      end if;
    end if;

    v_id := null;
    if v_barcode is not null then
      select id into v_id from items where barcode = v_barcode;
      if v_id is null then
        select count(*), min(id) into v_count, v_id from items where barcode is null and lower(trim(name)) = lower(v_name);
        if v_count <> 1 then
          v_id := null;
        end if;
      end if;
    else
      select count(*), min(id) into v_count, v_id from items where lower(trim(name)) = lower(v_name);
      if v_count > 1 then
        raise exception 'More than one product is named "%". Add the barcode to say which one.', v_name;
      end if;
    end if;

    if v_id is null then
      insert into items (barcode, name, brand, unit, price_buy, price_sell, current_stock,
                         supplier_id, category, location, reorder_level, senior_discount, extra)
      values (v_barcode, v_name, v_brand, coalesce(v_unit, 'pieces'), coalesce(v_buy, 0), coalesce(v_sell, 0), 0,
              v_supplier, v_category, v_location, v_reorder, v_senior, v_extra)
      returning id into v_id;
      if coalesce(v_stock, 0) > 0 then
        perform adjust_stock(v_id, v_stock, 'initial', 'Imported');
        if v_expires is not null or v_lot is not null then
          insert into stock_batches (item_id, quantity, expires_on, lot, supplier_id)
          values (v_id, v_stock, v_expires, v_lot, v_supplier);
        end if;
      end if;
      v_added := v_added + 1;
    else
      select current_stock into v_old from items where id = v_id for update;
      update items
      set barcode = coalesce(v_barcode, barcode),
          name = v_name,
          brand = coalesce(v_brand, brand),
          unit = coalesce(v_unit, unit),
          price_buy = coalesce(v_buy, price_buy),
          price_sell = coalesce(v_sell, price_sell),
          supplier_id = coalesce(v_supplier, supplier_id),
          category = coalesce(v_category, category),
          location = coalesce(v_location, location),
          reorder_level = coalesce(v_reorder, reorder_level),
          senior_discount = coalesce(v_senior, senior_discount),
          extra = extra || v_extra
      where id = v_id
        and (barcode is distinct from coalesce(v_barcode, barcode)
          or name is distinct from v_name
          or brand is distinct from coalesce(v_brand, brand)
          or unit is distinct from coalesce(v_unit, unit)
          or price_buy is distinct from coalesce(v_buy, price_buy)
          or price_sell is distinct from coalesce(v_sell, price_sell)
          or supplier_id is distinct from coalesce(v_supplier, supplier_id)
          or category is distinct from coalesce(v_category, category)
          or location is distinct from coalesce(v_location, location)
          or reorder_level is distinct from coalesce(v_reorder, reorder_level)
          or senior_discount is distinct from coalesce(v_senior, senior_discount)
          or extra is distinct from extra || v_extra);
      v_changed := found;
      if p_set_stock and v_stock is not null and v_stock <> v_old then
        perform adjust_stock(v_id, v_stock - v_old, 'adjust', 'Imported');
        v_changed := true;
      end if;
      if v_changed then
        v_updated := v_updated + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
    end if;
  end loop;

  return json_build_object('added', v_added, 'updated', v_updated, 'unchanged', v_unchanged);
end;
$$;

create or replace function public.sales_summary(p_from timestamptz, p_to timestamptz)
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object('count', count(*), 'total', coalesce(sum(total_price), 0))
  from orders
  where status = 'COMPLETED' and date_completed >= p_from and date_completed < p_to;
$$;

create or replace function public.inventory_summary(p_low_stock integer default 10)
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'products', count(*),
    'units', coalesce(sum(greatest(current_stock, 0)), 0),
    'cost_value', coalesce(sum(greatest(current_stock, 0) * price_buy), 0),
    'sell_value', coalesce(sum(greatest(current_stock, 0) * price_sell), 0),
    'low_stock', count(*) filter (where current_stock > 0 and current_stock <= coalesce(reorder_level, p_low_stock)),
    'out_of_stock', count(*) filter (where current_stock <= 0)
  )
  from items;
$$;

-- Choices for the product form: suppliers, and categories and locations
-- already in use (so people pick the same spelling).
create or replace function public.product_choices()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'suppliers', coalesce((select json_agg(json_build_object('id', id, 'name', name) order by lower(name)) from suppliers), '[]'),
    'categories', coalesce((select json_agg(c order by lower(c)) from (select distinct category c from items where category is not null) x), '[]'),
    'locations', coalesce((select json_agg(l order by lower(l)) from (select distinct location l from items where location is not null) y), '[]')
  );
$$;

-- Products at or below their low-stock level (their own, or the business's
-- p_low_stock), emptiest first. For the dashboard and the reorder list.
create or replace function public.low_stock_items(p_low_stock integer default 10, p_limit integer default 500)
returns table (
  id bigint, name text, brand text, unit text, current_stock integer, reorder_level integer,
  supplier_id bigint, price_buy numeric, barcode text
)
language sql
stable
set search_path = public
as $$
  select id, name, brand, unit, current_stock, reorder_level, supplier_id, price_buy, barcode
  from items
  where current_stock <= coalesce(reorder_level, p_low_stock)
  order by current_stock, name
  limit p_limit;
$$;


-- -----------------------------------------------------------------------------
-- People & attendance
-- -----------------------------------------------------------------------------

create table if not exists public.employees (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  name text not null,
  code text not null, -- printed on their ID badge as a barcode
  position text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, code)
);

create table if not exists public.attendance (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  employee_id bigint not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text,
  created_by uuid default auth.uid(),
  constraint attendance_out_after_in check (clock_out is null or clock_out >= clock_in),
  foreign key (employee_id, business_id) references public.employees (id, business_id) on delete cascade
);
create unique index if not exists attendance_one_open_shift on public.attendance (employee_id) where clock_out is null;
create index if not exists attendance_business_clock_in_idx on public.attendance (business_id, clock_in desc);

-- Clocks an employee in, or out if already in. p_guard ignores a second scan
-- within a minute. A shift left open 16+ hours is closed as "Missed clock-out".
create or replace function public.clock_employee(p_employee_id bigint, p_guard boolean default true)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp employees%rowtype;
  v_open attendance%rowtype;
  v_last_out timestamptz;
  v_now timestamptz := now();
begin
  select * into v_emp from employees where id = p_employee_id and business_id = current_business_id();
  if not found then
    raise exception 'Employee not found';
  end if;
  if not v_emp.active then
    raise exception '% is marked inactive', v_emp.name;
  end if;

  select * into v_open from attendance where employee_id = v_emp.id and clock_out is null for update;
  if found then
    if p_guard and v_open.clock_in > v_now - interval '1 minute' then
      return json_build_object('action', 'ignored', 'employee_id', v_emp.id, 'name', v_emp.name, 'at', v_open.clock_in);
    end if;
    if v_open.clock_in > v_now - interval '16 hours' then
      update attendance set clock_out = v_now where id = v_open.id;
      return json_build_object('action', 'out', 'employee_id', v_emp.id, 'name', v_emp.name, 'at', v_now, 'clock_in', v_open.clock_in);
    end if;
    update attendance set clock_out = clock_in, note = concat_ws(' · ', nullif(note, ''), 'Missed clock-out') where id = v_open.id;
  elsif p_guard then
    select max(clock_out) into v_last_out from attendance where employee_id = v_emp.id;
    if v_last_out > v_now - interval '1 minute' then
      return json_build_object('action', 'ignored', 'employee_id', v_emp.id, 'name', v_emp.name, 'at', v_last_out);
    end if;
  end if;

  insert into attendance (business_id, employee_id, clock_in, created_by) values (v_emp.business_id, v_emp.id, v_now, auth.uid());
  return json_build_object('action', 'in', 'employee_id', v_emp.id, 'name', v_emp.name, 'at', v_now);
end;
$$;

create or replace function public.clock_by_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  select id into v_id from employees
  where business_id = current_business_id() and lower(code) = lower(trim(p_code));
  if v_id is null then
    raise exception 'No employee has the code "%"', trim(p_code);
  end if;
  return clock_employee(v_id, true);
end;
$$;


-- -----------------------------------------------------------------------------
-- Fleet: vehicles, trips (odometer log) and fuel
-- -----------------------------------------------------------------------------

create table if not exists public.vehicles (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  name text not null,
  plate_number text,
  code text not null, -- printed on a tag (key ring / dashboard) as a barcode
  odometer integer not null default 0 check (odometer >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, code)
);

create table if not exists public.trips (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  vehicle_id bigint not null,
  driver_id bigint,
  purpose text,
  start_odometer integer not null check (start_odometer >= 0),
  end_odometer integer,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_by uuid default auth.uid(),
  constraint trips_end_after_start check (end_odometer is null or end_odometer >= start_odometer),
  constraint trips_end_fields_together check ((end_odometer is null) = (ended_at is null)),
  foreign key (vehicle_id, business_id) references public.vehicles (id, business_id) on delete cascade,
  foreign key (driver_id, business_id) references public.employees (id, business_id) on delete set null (driver_id)
);
create unique index if not exists trips_one_open_per_vehicle on public.trips (vehicle_id) where ended_at is null;
create index if not exists trips_business_started_idx on public.trips (business_id, started_at desc);

create table if not exists public.fuel_logs (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  vehicle_id bigint not null,
  odometer integer check (odometer >= 0),
  liters numeric(10, 2) not null check (liters > 0),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  station text,
  filled_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (vehicle_id, business_id) references public.vehicles (id, business_id) on delete cascade
);
create index if not exists fuel_logs_business_filled_idx on public.fuel_logs (business_id, filled_at desc);

-- Keeps vehicles.odometer at the highest reading seen in trips and fuel logs.
create or replace function public.sync_vehicle_odometer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reading integer;
begin
  if tg_table_name = 'trips' then
    v_reading := coalesce(new.end_odometer, new.start_odometer);
  else
    v_reading := new.odometer;
  end if;
  if v_reading is not null then
    update vehicles set odometer = greatest(odometer, v_reading)
    where id = new.vehicle_id and business_id = new.business_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trips_sync_odometer on public.trips;
create trigger trips_sync_odometer
  after insert or update of start_odometer, end_odometer on public.trips
  for each row execute function public.sync_vehicle_odometer();

drop trigger if exists fuel_logs_sync_odometer on public.fuel_logs;
create trigger fuel_logs_sync_odometer
  after insert or update of odometer on public.fuel_logs
  for each row execute function public.sync_vehicle_odometer();


-- -----------------------------------------------------------------------------
-- Billing (manual payments: the business reports a payment, you approve it)
-- -----------------------------------------------------------------------------

create table if not exists public.payment_requests (
  id bigint generated by default as identity primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  period text not null check (period in ('month', 'year')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text not null check (char_length(reference) between 3 and 80),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists payment_requests_status_idx on public.payment_requests (status, created_at);


-- -----------------------------------------------------------------------------
-- Login lockout
--
-- Counts wrong passwords so nobody can keep guessing. The app's server checks
-- it before every login (lib/login.ts); nobody else can read or call it.
-- Keys are hashes, never raw logins or IP addresses.
-- -----------------------------------------------------------------------------

create table if not exists public.login_failures (
  key text primary key,
  failures int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

-- When the latest lock among these keys ends, or null if none is locked.
create or replace function public.login_locked(p_keys text[])
returns timestamptz
language sql
stable
set search_path = public
as $$
  select max(locked_until) from login_failures where key = any (p_keys) and locked_until > now();
$$;

-- Counts one wrong password against each key. A key that reaches its limit
-- within the window is locked for one window. Returns login_locked(p_keys).
create or replace function public.login_failed(p_keys text[], p_limits int[], p_window_minutes int)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_window interval := make_interval(mins => p_window_minutes);
begin
  delete from login_failures
  where window_start < now() - interval '1 day' and (locked_until is null or locked_until < now());

  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    insert into login_failures as f (key, failures, window_start)
    values (p_keys[i], 1, now())
    on conflict (key) do update
      set failures = case when f.window_start < now() - v_window then 1 else f.failures + 1 end,
          window_start = case when f.window_start < now() - v_window then now() else f.window_start end;

    update login_failures
    set locked_until = now() + v_window
    where key = p_keys[i] and failures >= p_limits[i] and (locked_until is null or locked_until <= now());
  end loop;

  return public.login_locked(p_keys);
end;
$$;

-- Emails already sent for something that should only be emailed once, like
-- "your trial ends in 3 days" for a given end date. Server only.
create table if not exists public.email_log (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (business_id, kind)
);

-- Settings for the whole site that you change on /platform, like the payment
-- details shown on Billing: key 'payment' = { "instructions": "...", "qr_url": "..." }. Server only.
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Clears one key after a right password.
create or replace function public.login_succeeded(p_key text)
returns void
language sql
set search_path = public
as $$
  delete from login_failures where key = p_key;
$$;


-- -----------------------------------------------------------------------------
-- Permissions
--
-- Nobody gets in without logging in, and everyone only sees their own
-- business. Staff do day-to-day work; owners/admins can also delete, manage
-- people/vehicles, fix timesheets and change settings. Creating businesses,
-- logins and approving payments happens on the server (service role).
-- -----------------------------------------------------------------------------

-- Start from a clean slate: remove every existing policy on the app's tables
-- (older versions and hand-made ones), then create the current set below.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'businesses', 'members', 'items', 'stock_movements', 'orders', 'order_item', 'employees',
      'attendance', 'vehicles', 'trips', 'fuel_logs', 'payment_requests', 'settings', 'profiles',
      'suppliers', 'stock_batches', 'customers', 'customer_ledger', 'day_closings', 'activity_log')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Businesses can edit their own details, but never their trial or payment dates.
revoke insert, update, delete on public.businesses from authenticated;
grant update (name, slug, address, contact, logo_url, receipt_footer, low_stock_threshold,
  business_type, modules, options, custom_fields, receipt_note, vat_registered, digest,
  senior_default, senior_basic_exempt) on public.businesses to authenticated;
revoke insert, update, delete on public.members from authenticated;
revoke update, delete on public.payment_requests from authenticated;

-- Tables from the one-business version, kept as an archive but closed to the app.
do $$
begin
  if to_regclass('public.settings') is not null then
    revoke all on public.settings from anon, authenticated;
  end if;
  if to_regclass('public.profiles') is not null then
    revoke all on public.profiles from anon, authenticated;
  end if;
end $$;

alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_item enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.vehicles enable row level security;
alter table public.trips enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.payment_requests enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_batches enable row level security;
alter table public.customers enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.day_closings enable row level security;
alter table public.activity_log enable row level security;

drop policy if exists "businesses: own" on public.businesses;
create policy "businesses: own" on public.businesses for select to authenticated
  using (id = (select public.current_business_id()));
drop policy if exists "businesses: admin update" on public.businesses;
create policy "businesses: admin update" on public.businesses for update to authenticated
  using (id = (select public.current_business_id()) and (select public.is_admin()))
  with check (id = (select public.current_business_id()));

drop policy if exists "members: same business" on public.members;
create policy "members: same business" on public.members for select to authenticated
  using (business_id = (select public.current_business_id()));

-- Tables where staff read and write, and only admins delete.
do $$
declare
  t text;
begin
  foreach t in array array['items', 'orders', 'trips', 'suppliers', 'stock_batches', 'customers', 'day_closings'] loop
    execute format('drop policy if exists "%1$s: read" on public.%1$I', t);
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (business_id = (select public.current_business_id()))', t);
    execute format('drop policy if exists "%1$s: insert" on public.%1$I', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (business_id = (select public.current_business_id()))', t);
    execute format('drop policy if exists "%1$s: update" on public.%1$I', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using (business_id = (select public.current_business_id())) with check (business_id = (select public.current_business_id()))', t);
    execute format('drop policy if exists "%1$s: admin delete" on public.%1$I', t);
    execute format('create policy "%1$s: admin delete" on public.%1$I for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_admin()))', t);
  end loop;

  -- Append-style tables: staff read and add; only admins change or remove.
  foreach t in array array['stock_movements', 'order_item', 'fuel_logs', 'customer_ledger'] loop
    execute format('drop policy if exists "%1$s: read" on public.%1$I', t);
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (business_id = (select public.current_business_id()))', t);
    execute format('drop policy if exists "%1$s: insert" on public.%1$I', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check (business_id = (select public.current_business_id()))', t);
    execute format('drop policy if exists "%1$s: admin manage" on public.%1$I', t);
    execute format('create policy "%1$s: admin manage" on public.%1$I for all to authenticated using (business_id = (select public.current_business_id()) and (select public.is_admin())) with check (business_id = (select public.current_business_id()) and (select public.is_admin()))', t);
  end loop;

  -- Admin-managed tables: everyone reads; only admins write. (Staff clock in
  -- through clock_employee(); trips update odometers through a trigger.)
  foreach t in array array['employees', 'attendance', 'vehicles'] loop
    execute format('drop policy if exists "%1$s: read" on public.%1$I', t);
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (business_id = (select public.current_business_id()))', t);
    execute format('drop policy if exists "%1$s: admin manage" on public.%1$I', t);
    execute format('create policy "%1$s: admin manage" on public.%1$I for all to authenticated using (business_id = (select public.current_business_id()) and (select public.is_admin())) with check (business_id = (select public.current_business_id()) and (select public.is_admin()))', t);
  end loop;
end $$;

-- Activity log: anyone in the business adds entries (as themselves, see
-- activity_log_fill); only owners/admins read it; nobody edits or deletes it.
drop policy if exists "activity_log: admin read" on public.activity_log;
create policy "activity_log: admin read" on public.activity_log for select to authenticated
  using (business_id = (select public.current_business_id()) and (select public.is_admin()));
drop policy if exists "activity_log: insert" on public.activity_log;
create policy "activity_log: insert" on public.activity_log for insert to authenticated
  with check (business_id = (select public.current_business_id()));
revoke update, delete on public.activity_log from authenticated;

-- Staff can't change their own permissions (members aren't writable at all; see above).

-- Payment reports: owners/admins file them as pending; only you (the platform,
-- via the service role) approve or reject them.
drop policy if exists "payment_requests: read" on public.payment_requests;
create policy "payment_requests: read" on public.payment_requests for select to authenticated
  using (business_id = (select public.current_business_id()));
drop policy if exists "payment_requests: insert" on public.payment_requests;
create policy "payment_requests: insert" on public.payment_requests for insert to authenticated
  with check (business_id = (select public.current_business_id()) and (select public.is_admin()) and status = 'pending');

-- Functions: logged-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- The login lockout is for the app's server (service role) only.
alter table public.login_failures enable row level security;
revoke all on public.login_failures from anon, authenticated;
grant select, insert, update, delete on public.login_failures to service_role;
revoke execute on function public.login_locked(text[]), public.login_failed(text[], int[], int), public.login_succeeded(text)
  from public, anon, authenticated;
grant execute on function public.login_locked(text[]), public.login_failed(text[], int[], int), public.login_succeeded(text)
  to service_role;

-- The daily digest asks for each business's profit report as the server.
grant execute on function public.profit_report(timestamptz, timestamptz, text, integer, uuid) to service_role;

-- So is the record of emails sent.
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;
grant select, insert, delete on public.email_log to service_role;

-- And the site-wide settings.
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select, insert, update, delete on public.platform_settings to service_role;


-- -----------------------------------------------------------------------------
-- Logo uploads (Supabase Storage)
--
-- Public "branding" bucket. Each business's files live in a folder named after
-- its id; only that business's owners/admins can add or remove them.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage not found; skipping the logo bucket.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "branding: read" on storage.objects';
  execute $p$create policy "branding: read" on storage.objects for select to authenticated
    using (bucket_id = 'branding')$p$;
  execute 'drop policy if exists "branding: admin upload" on storage.objects';
  execute $p$create policy "branding: admin upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'branding' and public.is_admin()
      and (storage.foldername(name))[1] = public.current_business_id()::text)$p$;
  execute 'drop policy if exists "branding: admin delete" on storage.objects';
  execute $p$create policy "branding: admin delete" on storage.objects for delete to authenticated
    using (bucket_id = 'branding' and public.is_admin()
      and (storage.foldername(name))[1] = public.current_business_id()::text)$p$;
end $$;

-- Make the API pick up the new tables and functions right away.
notify pgrst, 'reload schema';
