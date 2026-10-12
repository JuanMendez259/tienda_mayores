-- ============================================================
-- POS Abarrotes — FASE 3: Control
-- Migración 0003: lotes/caducidades, promociones y alertas.
-- ============================================================

-- ------------------------------------------------------------
-- Configuración: días de aviso de caducidad (F-505, F-702)
-- ------------------------------------------------------------
alter table public.store
  add column expiry_alert_days integer not null default 15
    check (expiry_alert_days in (7, 15, 30));

-- ------------------------------------------------------------
-- Tipos nuevos
-- ------------------------------------------------------------
create type public.promotion_type as enum ('bogo', 'qty_discount');

-- ------------------------------------------------------------
-- promotion (F-407): 2x1 o descuento por cantidad, por producto.
-- ------------------------------------------------------------
create table public.promotion (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid        not null references public.store(id) on delete cascade,
  product_id     uuid        not null references public.product(id) on delete cascade,
  type           public.promotion_type not null,
  min_qty        integer     not null default 2 check (min_qty >= 1),
  discount_cents integer     not null default 0 check (discount_cents >= 0),
  active         boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index promotion_product_uidx on public.promotion (product_id);
create index promotion_store_idx on public.promotion (store_id, active);

-- ------------------------------------------------------------
-- product_lot (F-505): existencia por lote con caducidad.
-- ------------------------------------------------------------
create table public.product_lot (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid        not null references public.store(id) on delete cascade,
  product_id  uuid        not null references public.product(id) on delete cascade,
  qty         integer     not null default 0 check (qty >= 0),
  expires_on  date,
  received_at timestamptz not null default now(),
  supplier_id uuid        references public.supplier(id) on delete set null,
  purchase_id uuid        references public.purchase(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index product_lot_product_idx on public.product_lot (product_id, expires_on);
create index product_lot_expiry_idx  on public.product_lot (store_id, expires_on);

-- ------------------------------------------------------------
-- stock_movement.lot_id (F-505): lote afectado por el movimiento.
-- ------------------------------------------------------------
alter table public.stock_movement
  add column lot_id uuid references public.product_lot(id) on delete set null;

-- ------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------
create trigger promotion_set_updated_at before update on public.promotion for each row execute function public.set_updated_at();
create trigger product_lot_set_updated_at before update on public.product_lot for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security (Opción A: solo el backend con service_role)
-- ------------------------------------------------------------
alter table public.promotion   enable row level security;
alter table public.product_lot enable row level security;
