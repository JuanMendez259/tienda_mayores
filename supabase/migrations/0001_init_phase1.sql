-- ============================================================
-- POS Abarrotes — FASE 1: Base
-- Migración 0001: esquema inicial (Supabase / PostgreSQL)
-- Reglas [Requisito]:
--   * Dinero en CENTAVOS como enteros (integer).
--   * Peso en GRAMOS y volumen en MILILITROS como enteros.
--   * Fechas en UTC (timestamptz).
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- búsqueda por nombre (F-103)

-- ------------------------------------------------------------
-- Tipos enumerados
-- ------------------------------------------------------------
create type public.user_role          as enum ('owner', 'manager', 'cashier');
create type public.sale_unit          as enum ('piece', 'weight', 'volume');
create type public.sale_status        as enum ('open', 'held', 'paid', 'cancelled');
create type public.stock_movement_type as enum ('sale', 'purchase', 'adjustment', 'waste', 'return');
create type public.payment_method     as enum ('cash', 'card_clip', 'mercadopago_qr', 'mercadopago_terminal');
create type public.cash_movement_type as enum ('withdrawal', 'deposit');

-- ------------------------------------------------------------
-- Trigger reutilizable: updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- store
-- ------------------------------------------------------------
create table public.store (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  logo_url      text,
  timezone      text        not null default 'America/Mexico_City',
  ticket_footer text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- app_user  ("user" es reservado en PostgreSQL)
-- PIN: se guarda SOLO el hash (bcrypt vía pgcrypto), nunca en claro.
-- failed_attempts / locked_until: límite de intentos (Opción A).
-- ------------------------------------------------------------
create table public.app_user (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid        not null references public.store(id) on delete cascade,
  name            text        not null,
  photo_url       text,
  role            public.user_role not null default 'cashier',
  pin_hash        text        not null,
  active          boolean     not null default true,
  failed_attempts integer     not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index app_user_store_idx on public.app_user (store_id, active);

-- ------------------------------------------------------------
-- category
-- ------------------------------------------------------------
create table public.category (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid        not null references public.store(id) on delete cascade,
  name       text        not null,
  image_url  text,
  sort_order integer     not null default 0,
  color      text,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index category_store_idx on public.category (store_id, active, sort_order);

-- ------------------------------------------------------------
-- product
-- price_cents: por pieza, por kg o por litro según sale_unit.
-- stock_qty: unidades base -> piezas / gramos / mililitros (entero).
-- ------------------------------------------------------------
create table public.product (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid        not null references public.store(id) on delete cascade,
  category_id          uuid        references public.category(id) on delete set null,
  name                 text        not null,
  image_url            text,
  sale_unit            public.sale_unit not null default 'piece',
  price_cents          integer     not null check (price_cents >= 0),
  cost_cents           integer     not null default 0 check (cost_cents >= 0),
  barcode              text,
  is_generated_barcode boolean     not null default false,
  track_stock          boolean     not null default true,
  stock_qty            integer     not null default 0,
  low_stock_threshold  integer     not null default 0 check (low_stock_threshold >= 0),
  active               boolean     not null default true,
  created_by           uuid        references public.app_user(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index product_store_idx    on public.product (store_id, active);
create index product_category_idx on public.product (category_id);
create unique index product_barcode_uidx
  on public.product (store_id, barcode) where barcode is not null;
create index product_name_trgm_idx on public.product using gin (name gin_trgm_ops);

-- ------------------------------------------------------------
-- stock_movement
-- qty: delta CON SIGNO en unidades base (negativo = salida).
-- lot_id: se agrega en Fase 3 (control de caducidades por lote).
-- ------------------------------------------------------------
create table public.stock_movement (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid        not null references public.store(id) on delete cascade,
  product_id uuid        not null references public.product(id) on delete restrict,
  type       public.stock_movement_type not null,
  qty        integer     not null,
  reason     text,
  user_id    uuid        references public.app_user(id) on delete set null,
  sale_id    uuid,        -- FK a sale(id) definida abajo (orden de creación)
  created_at timestamptz not null default now()
);
create index stock_movement_product_idx on public.stock_movement (product_id, created_at desc);
create index stock_movement_store_idx   on public.stock_movement (store_id, created_at desc);

-- ------------------------------------------------------------
-- sale
-- number: consecutivo asignado por el servidor.
-- client_uuid: idempotencia de ventas offline (Fase 3).
-- ------------------------------------------------------------
create table public.sale (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid        not null references public.store(id) on delete cascade,
  number         bigint      generated always as identity unique,
  user_id        uuid        not null references public.app_user(id) on delete restrict,
  status         public.sale_status not null default 'open',
  subtotal_cents integer     not null default 0 check (subtotal_cents >= 0),
  discount_cents integer     not null default 0 check (discount_cents >= 0),
  total_cents    integer     not null default 0 check (total_cents >= 0),
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  synced_at      timestamptz,
  client_uuid    uuid        not null default gen_random_uuid()
);
create unique index sale_client_uuid_uidx on public.sale (client_uuid);
create index sale_store_created_idx on public.sale (store_id, created_at desc);
create index sale_user_idx          on public.sale (user_id);
create index sale_status_idx        on public.sale (store_id, status);

alter table public.stock_movement
  add constraint stock_movement_sale_fk
  foreign key (sale_id) references public.sale(id) on delete set null;

-- ------------------------------------------------------------
-- sale_item
-- weight_grams: gramos (weight) o mililitros (volume); NULL en 'piece'.
-- ------------------------------------------------------------
create table public.sale_item (
  id               uuid primary key default gen_random_uuid(),
  sale_id          uuid    not null references public.sale(id) on delete cascade,
  product_id       uuid    not null references public.product(id) on delete restrict,
  qty              integer not null default 1 check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  weight_grams     integer check (weight_grams is null or weight_grams > 0)
);
create index sale_item_sale_idx    on public.sale_item (sale_id);
create index sale_item_product_idx on public.sale_item (product_id);

-- ------------------------------------------------------------
-- payment
-- ------------------------------------------------------------
create table public.payment (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid    not null references public.sale(id) on delete cascade,
  method       public.payment_method not null,
  amount_cents integer not null check (amount_cents >= 0),
  reference    text,
  created_at   timestamptz not null default now()
);
create index payment_sale_idx on public.payment (sale_id);

-- ------------------------------------------------------------
-- cash_session  (una sola caja abierta por tienda)
-- ------------------------------------------------------------
create table public.cash_session (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid    not null references public.store(id) on delete cascade,
  user_id          uuid    not null references public.app_user(id) on delete restrict,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  opening_cents    integer not null default 0 check (opening_cents >= 0),
  expected_cents   integer check (expected_cents is null or expected_cents >= 0),
  counted_cents    integer check (counted_cents is null or counted_cents >= 0),
  difference_cents integer
);
create unique index cash_session_open_uidx
  on public.cash_session (store_id) where closed_at is null;
create index cash_session_store_idx on public.cash_session (store_id, opened_at desc);

-- ------------------------------------------------------------
-- cash_movement
-- ------------------------------------------------------------
create table public.cash_movement (
  id              uuid primary key default gen_random_uuid(),
  cash_session_id uuid    not null references public.cash_session(id) on delete cascade,
  type            public.cash_movement_type not null,
  amount_cents    integer not null check (amount_cents >= 0),
  note            text,
  created_at      timestamptz not null default now()
);
create index cash_movement_session_idx on public.cash_movement (cash_session_id, created_at desc);

-- ------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid        references public.store(id) on delete set null,
  user_id    uuid        references public.app_user(id) on delete set null,
  entity     text        not null,
  entity_id  uuid,
  action     text        not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_store_idx  on public.audit_log (store_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

-- ------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------
create trigger store_set_updated_at    before update on public.store    for each row execute function public.set_updated_at();
create trigger app_user_set_updated_at before update on public.app_user for each row execute function public.set_updated_at();
create trigger category_set_updated_at before update on public.category for each row execute function public.set_updated_at();
create trigger product_set_updated_at  before update on public.product  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Autenticación por PIN (Opción A: valida el backend/Edge Function)
-- Se guarda solo el hash. `verify_pin` centraliza la verificación y el
-- límite de intentos (5 fallos -> bloqueo 5 min). Exclusiva del servidor.
-- ------------------------------------------------------------
create or replace function public.verify_pin(p_user_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash   text;
  v_locked timestamptz;
  v_active boolean;
begin
  select pin_hash, locked_until, active
    into v_hash, v_locked, v_active
    from public.app_user
   where id = p_user_id;

  if not found or not v_active then
    return false;
  end if;

  if v_locked is not null and v_locked > now() then
    return false;  -- bloqueado temporalmente
  end if;

  if v_hash = crypt(p_pin, v_hash) then
    update public.app_user
       set failed_attempts = 0, locked_until = null
     where id = p_user_id;
    return true;
  end if;

  update public.app_user
     set failed_attempts = failed_attempts + 1,
         locked_until = case
           when failed_attempts + 1 >= 5 then now() + interval '5 minutes'
           else locked_until
         end
   where id = p_user_id;

  return false;
end;
$$;

-- Solo el backend (service_role) puede verificar PINs.
revoke all on function public.verify_pin(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Row Level Security — Opción A
-- El cliente NO accede a las tablas directamente: habla con el backend
-- (Edge Function) que usa la service_role tras validar PIN y rol.
-- RLS habilitado sin políticas -> anon/authenticated sin acceso (seguro).
-- ------------------------------------------------------------
alter table public.store          enable row level security;
alter table public.app_user       enable row level security;
alter table public.category       enable row level security;
alter table public.product        enable row level security;
alter table public.stock_movement enable row level security;
alter table public.sale           enable row level security;
alter table public.sale_item      enable row level security;
alter table public.payment        enable row level security;
alter table public.cash_session   enable row level security;
alter table public.cash_movement  enable row level security;
alter table public.audit_log      enable row level security;
