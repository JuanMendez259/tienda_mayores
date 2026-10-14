-- ============================================================
-- 0006 · v2: cambios ADITIVOS (corrección C-03 y base de la versión 2)
-- ============================================================
-- ESTRICTAMENTE ADITIVO: se agregan tablas, columnas con valor por defecto,
-- valores de enum y funciones. No se borra ni renombra ningún dato existente.
--
-- Nota: el pedido original indicaba "0005_init_v2_changes.sql", pero la
-- migración 0005 ya existe (arreglo de search_path de verify_pin); por eso
-- esta es la 0006 para no sobrescribirla.

-- ------------------------------------------------------------
-- C-03 · PIN exactamente de 4 dígitos + reseteo obligatorio
-- ------------------------------------------------------------
alter table public.app_user
  add column if not exists pin_reset_required boolean not null default false;

-- Los usuarios que ya existían deben definir un PIN nuevo de 4 dígitos en su
-- siguiente acceso (no se puede saber la longitud del hash bcrypt anterior).
update public.app_user set pin_reset_required = true where pin_reset_required = false;

-- Establece un PIN nuevo de 4 dígitos. Solo backend (service_role).
create or replace function public.set_pin(p_user_id uuid, p_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_new_pin !~ '^[0-9]{4}$' then
    return false;
  end if;
  update public.app_user
     set pin_hash = crypt(p_new_pin, gen_salt('bf')),
         pin_reset_required = false,
         failed_attempts = 0,
         locked_until = null
   where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.set_pin(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Tipos enumerados nuevos / ampliados
-- ------------------------------------------------------------
alter type public.stock_movement_type add value if not exists 'supplier_exchange_out';
alter type public.stock_movement_type add value if not exists 'supplier_exchange_in';
alter type public.stock_movement_type add value if not exists 'internal_use';
alter type public.payment_method add value if not exists 'credit';

create type public.supplier_type         as enum ('local', 'regional', 'national');
create type public.purchase_order_status as enum ('draft', 'sent', 'received', 'cancelled');
create type public.supplier_visit_status as enum ('scheduled', 'done', 'skipped');

-- ------------------------------------------------------------
-- Proveedores (F-A01), marca del producto (F-A09) y agenda (F-A02)
-- ------------------------------------------------------------
alter table public.supplier
  add column if not exists type public.supplier_type not null default 'local';

alter table public.product
  add column if not exists supplier_id uuid references public.supplier(id) on delete set null,
  add column if not exists brand text;

create index if not exists product_supplier_idx on public.product (supplier_id);
create index if not exists product_brand_idx    on public.product (store_id, brand);

create table public.supplier_schedule (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid    not null references public.store(id) on delete cascade,
  supplier_id       uuid    not null references public.supplier(id) on delete cascade,
  weekday           integer not null check (weekday between 0 and 6), -- 0=domingo
  order_cutoff_time time    not null default '16:00',
  notes             text,
  created_at        timestamptz not null default now()
);
create index supplier_schedule_store_idx on public.supplier_schedule (store_id, weekday);

create table public.supplier_visit (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid    not null references public.store(id) on delete cascade,
  supplier_id uuid    not null references public.supplier(id) on delete cascade,
  visit_date  date    not null default current_date,
  status      public.supplier_visit_status not null default 'scheduled',
  notes       text,
  created_at  timestamptz not null default now()
);
create index supplier_visit_store_idx on public.supplier_visit (store_id, visit_date desc);

-- ------------------------------------------------------------
-- Órdenes de compra (F-A06)
-- ------------------------------------------------------------
create table public.purchase_order (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid    not null references public.store(id) on delete cascade,
  supplier_id uuid    references public.supplier(id) on delete set null,
  status      public.purchase_order_status not null default 'draft',
  user_id     uuid    references public.app_user(id) on delete set null,
  expected_on date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index purchase_order_store_idx on public.purchase_order (store_id, created_at desc);

create table public.purchase_order_item (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid    not null references public.purchase_order(id) on delete cascade,
  product_id        uuid    not null references public.product(id) on delete restrict,
  qty               integer not null default 0,
  unit_cost_cents   integer not null default 0 check (unit_cost_cents >= 0)
);
create index purchase_order_item_order_idx on public.purchase_order_item (purchase_order_id);

-- ------------------------------------------------------------
-- Cambios con proveedor sin costo (F-A04)
-- ------------------------------------------------------------
create table public.supplier_exchange (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid    not null references public.store(id) on delete cascade,
  supplier_id uuid    references public.supplier(id) on delete set null,
  visit_id    uuid    references public.supplier_visit(id) on delete set null,
  user_id     uuid    references public.app_user(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);
create index supplier_exchange_store_idx on public.supplier_exchange (store_id, created_at desc);

create table public.supplier_exchange_item (
  id             uuid primary key default gen_random_uuid(),
  exchange_id    uuid    not null references public.supplier_exchange(id) on delete cascade,
  product_id     uuid    not null references public.product(id) on delete restrict,
  lot_id         uuid    references public.product_lot(id) on delete set null,
  qty_returned   integer not null default 0 check (qty_returned >= 0),
  qty_received   integer not null default 0 check (qty_received >= 0),
  new_expires_on date,
  reason         text    not null default 'expired'  -- 'expired' | 'near_expiry'
);
create index supplier_exchange_item_exchange_idx on public.supplier_exchange_item (exchange_id);

-- ------------------------------------------------------------
-- Fiado: clientes, venta a crédito y abonos (F-B01 a F-B06)
-- ------------------------------------------------------------
create table public.customer (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid    not null references public.store(id) on delete cascade,
  name               text    not null,
  phone              text,
  notes              text,
  credit_limit_cents integer check (credit_limit_cents is null or credit_limit_cents >= 0),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index customer_store_idx on public.customer (store_id, active);

alter table public.sale
  add column if not exists customer_id uuid references public.customer(id) on delete set null;
create index if not exists sale_customer_idx on public.sale (customer_id);

create table public.customer_payment (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid    not null references public.store(id) on delete cascade,
  customer_id     uuid    not null references public.customer(id) on delete cascade,
  amount_cents    integer not null check (amount_cents > 0),
  method          public.payment_method not null default 'cash',
  cash_session_id uuid    references public.cash_session(id) on delete set null,
  user_id         uuid    references public.app_user(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index customer_payment_customer_idx on public.customer_payment (customer_id, created_at desc);
create index customer_payment_store_idx    on public.customer_payment (store_id, created_at desc);

-- ------------------------------------------------------------
-- Permisos configurables (sección 5) 
-- ------------------------------------------------------------
alter table public.store
  add column if not exists credit_cashier_allowed       boolean not null default false,
  add column if not exists internal_use_cashier_allowed boolean not null default false;

-- ------------------------------------------------------------
-- Triggers updated_at de las tablas nuevas
-- ------------------------------------------------------------
create trigger purchase_order_set_updated_at before update on public.purchase_order for each row execute function public.set_updated_at();
create trigger customer_set_updated_at       before update on public.customer       for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS (Opción A): habilitado sin políticas -> solo service_role accede.
-- ------------------------------------------------------------
alter table public.supplier_schedule      enable row level security;
alter table public.supplier_visit         enable row level security;
alter table public.purchase_order         enable row level security;
alter table public.purchase_order_item    enable row level security;
alter table public.supplier_exchange      enable row level security;
alter table public.supplier_exchange_item enable row level security;
alter table public.customer               enable row level security;
alter table public.customer_payment       enable row level security;
