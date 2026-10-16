-- ============================================================
-- 0007 · v2 (cierre de flujo): pasos por visita (F-A02)
-- ============================================================
-- ESTRICTAMENTE ADITIVO: solo se agrega una columna con valor por defecto.

alter table public.supplier_visit
  add column if not exists steps jsonb not null default '{}'::jsonb;
