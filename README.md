# POS Abarrotes — Punto de venta (Fase 1: Base)

Aplicación web de punto de venta para una tienda de abarrotes en México, con UX pensada para
personas de la tercera edad. Stack: **React + Vite + TypeScript + Tailwind CSS v4 + Supabase**.

> Estado: **Fase 1 (Base)** implementada. Las integraciones y hardware (sección 8 del SPEC)
> quedan para la Fase 4.

## Cómo ejecutar

```bash
cd pos-abarrotes
npm install
npm run dev        # desarrollo (http://localhost:5173)
npm run build      # compila TypeScript + build de producción
npm run test       # pruebas de dinero, peso, carrito, inventario y flujo de caja
npm run lint
```

### Modo demostración (por defecto)

Sin variables de entorno, la app usa un **repositorio local en memoria** con catálogo, usuarios
y una caja. Sirve para probar todo el flujo sin backend.

Usuarios de demostración (selección por foto + PIN):

| Usuario    | Rol       | PIN  |
|------------|-----------|------|
| Doña María | Dueño     | 1234 |
| Don José   | Cajero    | 1111 |
| Ana        | Encargado | 2222 |

Flujo: elegir usuario → PIN → **Abrir caja** (fondo inicial) → vender → **Cobrar** en efectivo →
ver el ticket → **Caja** para el corte.

### Con Supabase (Opción A)

1. Crea un proyecto en Supabase y aplica la migración
   `supabase/migrations/0001_init_phase1.sql` (SQL Editor o `supabase db push`).
2. Genera un PIN para cada usuario con `crypt('1234', gen_salt('bf'))` en la columna `pin_hash`.
3. Copia `.env.example` a `.env.local` y define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Despliega la Edge Function: `supabase functions deploy pos`.

En la Opción A el cliente **nunca** accede a las tablas (RLS sin políticas). Usa la llave
`anon` solo para invocar la Edge Function `pos`, que con `service_role` valida el PIN
(`verify_pin`, con límite de intentos) y aplica los permisos por rol.

## Estructura

```
src/
  lib/          dinero, peso, carrito, inventario, imagen, sonido (+ pruebas)
  data/         contrato Repository, semilla, repositorio local y remoto (Supabase)
  components/   pantallas y piezas de UI (login, venta, carrito, cobros, caja…)
  types/        types/database.ts (espejo del esquema)
supabase/
  migrations/   0001_init_phase1.sql
  functions/    pos/index.ts (Edge Function, Opción A)
docs/           SPEC-punto-de-venta.md y DISENO-base-datos-fase1.md
```

## Reglas de datos [Requisito]

- Dinero en **centavos enteros** (`integer`). Nunca decimales flotantes.
- Peso en **gramos** y volumen en **mililitros** enteros.
- Fechas en **UTC**; se muestran en la zona de la tienda (`America/Mexico_City`).

## UX tercera edad [Requisito]

Texto base ≥ 18 px (raíz de 18 px), precios y títulos ≥ 24 px, botones ≥ 56×56 px con
separación de 8 px, colores con texto además del color, confirmación solo en acciones
destructivas y botón **Deshacer** siempre disponible durante la venta.

## Requisitos de la Fase 1 cubiertos

F-101, F-103–F-111, F-201, F-205, F-303 (ticket en pantalla), F-401–F-403 (foto desde archivo),
F-405, F-501, F-601–F-603 y F-701. Ver `docs/DISENO-base-datos-fase1.md`.

## Supuestos (documentados según SPEC §12)

1. Una sola tienda y una sola caja; el modelo ya incluye `store_id`.
2. Los precios incluyen IVA; no se desglosa en esta versión.
3. Moneda MXN (`$1,234.50`), fechas `DD/MM/AAAA`.
4. En modo demostración las fotos se guardan como imagen local (data URL) generada desde el
   dispositivo; en Supabase se usará Storage.
5. El corte calcula el efectivo esperado desde las ventas en efectivo y los movimientos de caja.
6. Promociones, importación CSV, caducidades por lote y reportes son Fase 2/3.
