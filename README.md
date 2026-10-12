# POS Abarrotes — Punto de venta (Fases 1 y 2)

Aplicación web de punto de venta para una tienda de abarrotes en México, con UX pensada para
personas de la tercera edad. Stack: **React + Vite + TypeScript + Tailwind CSS v4 + Supabase**.

> Estado: **Fase 1 (Base)** y **Fase 2 (Operación)** implementadas. Las integraciones y hardware
> (sección 8 del SPEC) y la sincronización offline quedan para la Fase 4.

## Novedades de la Fase 2 (Operación)

- **F-401/F-402:** edición y baja del catálogo desde **Menú → Productos**.
- **F-404:** carga de fotos desde el celular. En **Menú → Configuración → Fotos desde el celular**
  se muestra un **código QR**; al escanearlo se abre la pantalla de alta rápida (`?captura=1`) con
  cámara, nombre, precio y categoría.
- **F-408:** importación de productos por **CSV** con plantilla descargable y reporte de errores.
- **F-502/F-606:** **proveedores** (alta/edición/baja) y **registro de compras** con folio, foto de
  factura, caducidad y actualización automática de existencias.
- **F-503:** **ajustes de inventario y mermas** con motivo obligatorio y alertas de poco stock.
- **F-506:** **historial de movimientos** filtrable por producto, tipo y usuario.
- **F-112:** **descuentos** por renglón o sobre el total, por monto o porcentaje, con registro en el
  ticket; el dueño puede exigir autorización de encargado.
- **F-702/F-703:** **configuración de tienda** (nombre, pie del ticket, tamaño de letra, color
  principal) y **activación/ocultamiento de módulos**.

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
ver el ticket → **Caja** para el corte. Con un usuario **Dueño** o **Encargado** aparece el botón
**Menú** con catálogo, inventario, compras, proveedores, movimientos y configuración.

### Con Supabase (Opción A)

1. Crea un proyecto en Supabase y aplica las migraciones
   `supabase/migrations/0001_init_phase1.sql` y `0002_init_phase2.sql` (SQL Editor o `supabase db push`).
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
  migrations/   0001_init_phase1.sql, 0002_init_phase2.sql
  functions/    pos/index.ts (Edge Function, Opción A)
docs/           SPEC-punto-de-venta.md, DISENO-base-datos-fase1.md y DISENO-base-datos-fase2.md
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

## Requisitos de la Fase 2 cubiertos

F-112, F-404, F-408, F-502, F-503, F-506, F-606, F-702 y F-703. Ver
`docs/DISENO-base-datos-fase2.md`.

## Supuestos (documentados según SPEC §12)

1. Una sola tienda y una sola caja; el modelo ya incluye `store_id`.
2. Los precios incluyen IVA; no se desglosa en esta versión.
3. Moneda MXN (`$1,234.50`), fechas `DD/MM/AAAA`.
4. En modo demostración las fotos se guardan como imagen local (data URL) generada desde el
   dispositivo; en Supabase se usará Storage.
5. El corte calcula el efectivo esperado desde las ventas en efectivo y los movimientos de caja.
6. El costo de compra se captura por **unidad de venta** (pieza / kg / L); la cantidad se guarda en
   unidades base (piezas / gramos / mililitros) para el inventario.
7. Las existencias por **lote/caducidad** y las promociones automáticas (F-407, F-406) son Fase 3;
   en la Fase 2 la caducidad se registra como dato informativo en la compra.
8. Los reportes y la impresión/WhatsApp del ticket son Fase 4.
