-- ============================================================
-- POS Abarrotes — FASE 2: Operación
-- Migración 0002: proveedores, compras, descuentos y configuración.
-- ============================================================

-- ------------------------------------------------------------
-- Configuración de tienda (F-702, F-703)
-- ------------------------------------------------------------
alter table public.store
  add column font_size text not null default 'normal'
    check (font_size in ('normal', 'grande', 'muy_grande')),
  add column primary_color text not null default '#16a34a',
  add column discount_requires_manager boolean not null default true,
  add column modules jsonb not null default
    '{"discounts": true, "inventory": true, "movements": true, "photos": true, "purchases": true, "suppliers": true}'::jsonb;

-- ------------------------------------------------------------
-- Descuento por renglón (F-112). El descuento de la venta ya existe
-- en sale.discount_cents; aquí se guarda el de cada línea.
-- ------------------------------------------------------------
alter table public.sale_item
  add column discount_cents integer not null default 0 check (discount_cents >= 0);

-- ------------------------------------------------------------
-- supplier (F-606)
-- ------------------------------------------------------------
create table public.supplier (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid        not null references public.store(id) on delete cascade,
  name       text        not null,
  phone      text,
  notes      text,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplier_store_idx on public.supplier (store_id, active);

-- ------------------------------------------------------------
-- purchase (F-502, F-606)
-- ------------------------------------------------------------
create table public.purchase (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid        not null references public.store(id) on delete cascade,
  supplier_id      uuid        references public.supplier(id) on delete set null,
  user_id          uuid        references public.app_user(id) on delete set null,
  total_cents      integer     not null default 0 check (total_cents >= 0),
  invoice_ref      text,
  invoice_file_url text,
  created_at       timestamptz not null default now()
);
create index purchase_store_idx    on public.purchase (store_id, created_at desc);
create index purchase_supplier_idx on public.purchase (supplier_id);

-- ------------------------------------------------------------
-- purchase_item (F-502)
-- qty en unidades base (piezas / gramos / mililitros).
-- ------------------------------------------------------------
create table public.purchase_item (
  id              uuid primary key default gen_random_uuid(),
  purchase_id     uuid    not null references public.purchase(id) on delete cascade,
  product_id      uuid    not null references public.product(id) on delete restrict,
  qty             integer not null check (qty > 0),
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  expires_on      date
);
create index purchase_item_purchase_idx on public.purchase_item (purchase_id);
create index purchase_item_product_idx  on public.purchase_item (product_id);

-- ------------------------------------------------------------
-- Triggers updated_at
-- ------------------------------------------------------------
create trigger supplier_set_updated_at before update on public.supplier for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security (Opción A: solo el backend con service_role)
-- ------------------------------------------------------------
alter table public.supplier      enable row level security;
alter table public.purchase      enable row level security;
alter table public.purchase_item enable row level security;
