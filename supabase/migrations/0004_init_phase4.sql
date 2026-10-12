-- ============================================================
-- POS Abarrotes — FASE 4: Integraciones y hardware
-- Migración 0004: configuración de ticket (impresora térmica) y WhatsApp.
--
-- La Fase 4 es de integración: el esquema ya soporta los pagos con Clip y
-- Mercado Pago (enum payment_method), los pagos combinados (varios `payment`
-- por venta) y la referencia de cada pago (`payment.reference`). Solo se
-- agrega configuración de tienda.
-- ============================================================

-- ------------------------------------------------------------
-- Ancho del papel de la impresora térmica (8.3, F-301, F-702).
-- 58 mm o 80 mm, configurables por el dueño.
-- ------------------------------------------------------------
alter table public.store
  add column ticket_width_mm integer not null default 80
    check (ticket_width_mm in (58, 80));

-- ------------------------------------------------------------
-- Prefijo de país para el enlace de WhatsApp (8.4, F-302).
-- Se usa cuando el cajero escribe el número sin código de país.
-- ------------------------------------------------------------
alter table public.store
  add column whatsapp_country_code text not null default '+52';
