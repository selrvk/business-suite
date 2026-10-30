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
    update items set current_stock = current_stock - r.quantity where id = r.item_id;
    insert into stock_movements (item_id, change, reason, order_id) values (r.item_id, -r.quantity, 'sale', p_order_id);
  end loop;

  update orders set status = 'COMPLETED', date_completed = now() where id = p_order_id;
end;
$$;

drop function if exists public.create_sale(jsonb, text, boolean, text, numeric); -- older versions returned a different type

-- Creates an order from [{ "item_id": 1, "quantity": 2 }, ...] at current shelf
-- prices. With p_complete (a POS sale) it is completed right away.
-- Returns { id, number, total }.
create or replace function public.create_sale(
  p_items jsonb,
  p_customer_name text default null,
  p_complete boolean default true,
  p_payment_method text default null,
  p_amount_tendered numeric default null
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_number integer;
  v_total numeric(12, 2);
  r record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The sale has no items';
  end if;

  if current_business_id() is null then
    raise exception 'Not signed in to a business';
  end if;

  insert into orders (customer_name, status, total_price, payment_method, amount_tendered)
  values (nullif(trim(p_customer_name), ''), 'PENDING', 0, p_payment_method, p_amount_tendered)
  returning id, number into v_order_id, v_number;

  for r in
    select (e ->> 'item_id')::bigint as item_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantities must be at least 1';
    end if;
    insert into order_item (order_id, item_id, item_name, quantity, price_at_time)
    select v_order_id, i.id, i.name, r.quantity, i.price_sell from items i where i.id = r.item_id;
    if not found then
      raise exception 'A product in this sale no longer exists';
    end if;
  end loop;

  select coalesce(sum(quantity * price_at_time), 0) into v_total from order_item where order_id = v_order_id;
  update orders set total_price = v_total where id = v_order_id;

  if p_complete then
    perform complete_order(v_order_id);
  end if;

  return json_build_object('id', v_order_id, 'number', v_number, 'total', v_total);
end;
$$;

-- Adds (positive) or removes (negative) stock and logs why.
create or replace function public.adjust_stock(p_item_id bigint, p_change integer, p_reason text default 'adjust', p_note text default null)
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
  insert into stock_movements (item_id, change, reason, note) values (p_item_id, p_change, p_reason, nullif(trim(p_note), ''));
  return v_stock;
end;
$$;

-- Receives a delivery: [{ "item_id": 1, "quantity": 24 }, ...]. All-or-nothing.
create or replace function public.receive_stock(p_items jsonb, p_note text default null)
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
    select (e ->> 'item_id')::bigint as item_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) e
    group by 1
  loop
    if r.quantity is null or r.quantity <= 0 then
      raise exception 'Quantities must be at least 1';
    end if;
    perform adjust_stock(r.item_id, r.quantity, 'receive', p_note);
    v_count := v_count + 1;
  end loop;
  return v_count;
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
    'low_stock', count(*) filter (where current_stock > 0 and current_stock <= p_low_stock),
    'out_of_stock', count(*) filter (where current_stock <= 0)
  )
  from items;
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
      'attendance', 'vehicles', 'trips', 'fuel_logs', 'payment_requests', 'settings', 'profiles')
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
grant update (name, slug, address, contact, logo_url, receipt_footer, low_stock_threshold) on public.businesses to authenticated;
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
  foreach t in array array['items', 'orders', 'trips'] loop
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
  foreach t in array array['stock_movements', 'order_item', 'fuel_logs'] loop
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
