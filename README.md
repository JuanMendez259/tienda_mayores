# POS Abarrotes — Punto de venta (Fases 1 a 4)

Aplicación web de punto de venta para una tienda de abarrotes en México, con UX pensada para
personas de la tercera edad. Stack: **React + Vite + TypeScript + Tailwind CSS v4 + Supabase**.

> Estado: **Fases 1 (Base), 2 (Operación), 3 (Control) y 4 (Integraciones y hardware)
> implementadas.** Las integraciones Clip/Mercado Pago y la impresora usan **flujos manuales**
> documentados detrás de interfaces, para sustituirlos por las APIs reales cuando haya
> credenciales y modelos de terminal.

## Novedades de la Fase 4 (Integraciones y hardware)

- **F-102 / 8.5 — Escáner USB:** el sistema escucha el teclado y distingue un escaneo de un
  tecleo humano por la velocidad; al leer un código agrega el producto o abre **Nuevo producto**
  con el código ya lleno. No roba el foco de los campos de texto.
- **F-301 / 8.3 — Impresora térmica:** botón **🖨 Imprimir ticket** en el ticket, con hoja de
  impresión para papel de **58 mm u 80 mm** (configurable en **Menú → Configuración**). En
  **Diagnóstico** hay **Imprimir prueba**.
- **F-406 — Etiquetas:** botón **🖨 Etiquetas** en **Menú → Productos**, imprime nombre, precio y
  **QR** de los productos filtrados.
- **F-202 / 8.1 — Clip:** flujo manual (**PaymentProvider**): se cobra en la terminal y se
  registra una **referencia** opcional (folio o últimos 4 dígitos).
- **F-203 / 8.2 — Mercado Pago:** flujo manual por **QR** con confirmación y referencia.
- **F-204 — Pagos combinados:** el cobro acepta **efectivo + Clip + Mercado Pago** en la misma
  venta; el efectivo calcula el cambio y el servidor valida que la suma de los pagos iguale el
  total.
- **F-302 / 8.4 — Ticket por WhatsApp:** botón para enviar el ticket como texto por `wa.me`; se
  asume el **código de país** de la tienda (`+52`) si no se escribe.
- **F-403 / 8.7 — Cámara:** botón **📸 Usar cámara** en el alta de producto (`getUserMedia`),
  además de elegir archivo.
- **F-704 (hardware):** **Menú → Diagnóstico → Dispositivos** muestra el último código del
  escáner, prueba de impresora y prueba de cámara.

## Vista reducida (F-113)

- **Quinto botón Vista** en la cabecera para alternar **Vista reducida** / **Vista normal** sin
  menús y sin vaciar el ticket. La preferencia se guarda por tienda/dispositivo.
- La entrada es un buscador por **nombre o código** con **📷 Escanear código** y
  **🗂️ Ver catálogo**; no hay detalle de entrada: se llega buscando, escaneando o desde el
  catálogo secundario. El detalle muestra el
  producto en grande, existencias y **Cantidad a agregar** antes de **Agregar N al ticket**; peso
  y volumen abren el mismo `WeightModal` con **⚖️ Pesar y agregar** o **🧪 Medir y agregar**.
- **🗂️ Ver catálogo** abre la cuadrícula como superficie secundaria: tocar un producto abre su
  detalle y **no** lo agrega. En tablet el ticket sigue visible; en teléfono se llega con
  **🧾 Ver ticket** y se regresa con el botón **←** (**Volver a la venta**).

## Novedades de la Fase 3 (Control)

- **F-407:** **promociones** por producto (2×1 o descuento por cantidad) en **Menú → Promociones**;
  se aplican solas al vender.
- **F-504:** **alerta de stock bajo** visible en la pantalla de venta y en **Menú → Inventario**.
- **F-505:** **caducidades por lote** en **Menú → Caducidades**; las compras con caducidad generan
  lotes y las ventas consumen primero lo más próximo a caducar (**FEFO**).
- **F-604/F-605:** **reportes** de ventas por día, formas de pago, más vendidos, menor rotación y
  ganancia estimada, con exportación **CSV** e impresión/**PDF**.
- **F-705:** **ayuda visual** paso a paso desde el botón **❓ Ayuda** de la venta.
- **F-706:** **registro de errores** del cliente para soporte.
- **F-707:** **exportación de datos** (catálogo y ventas) en **Menú → Diagnóstico**.
- **F-704 / sección 9:** **modo offline** con cola en IndexedDB; al volver la conexión las ventas
  se envían sin duplicarse (`client_uuid`). El panel **Diagnóstico** muestra conexión, ventas
  pendientes y botón **Sincronizar ahora**.

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
   `supabase/migrations/0001_init_phase1.sql`, `0002_init_phase2.sql`, `0003_init_phase3.sql` y
   `0004_init_phase4.sql` (SQL Editor o `supabase db push`).
2. Genera un PIN para cada usuario con `crypt('1234', gen_salt('bf'))` en la columna `pin_hash`.
3. Copia `.env.example` a `.env.local` y define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Despliega la Edge Function: `supabase functions deploy pos`.

En la Opción A el cliente **nunca** accede a las tablas (RLS sin políticas). Usa la llave
`anon` solo para invocar la Edge Function `pos`, que con `service_role` valida el PIN
(`verify_pin`, con límite de intentos) y aplica los permisos por rol.

## Estructura

```
src/
  lib/          dinero, peso, carrito, inventario, imagen, sonido, cola offline, errores,
                exportación de reportes, ticket de WhatsApp (+ pruebas)
  data/         contrato Repository, semilla, repositorio local y remoto (Supabase)
  devices/      escáner USB, impresora térmica/etiquetas, pagos (Clip/Mercado Pago)
  components/   pantallas y piezas de UI (login, venta, carrito, cobros, caja, cámara, ayuda…)
  types/        database.ts (espejo del esquema)
supabase/
  migrations/   0001_init_phase1.sql … 0004_init_phase4.sql
  functions/    pos/index.ts (Edge Function, Opción A)
docs/           SPEC-punto-de-venta.md y DISENO-base-datos-fase1/2/3/4.md
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

## Requisitos de la Fase 3 cubiertos

F-407, F-504, F-505, F-604, F-605, F-705, F-706, F-707 y la parte de internet/sincronización de
F-704, junto con la sección 9 (modo offline). Ver `docs/DISENO-base-datos-fase3.md`.

## Requisitos de la Fase 4 cubiertos

F-102, F-202, F-203, F-204, F-301, F-302, F-403, F-406 y la parte de hardware (escáner,
impresora y cámara) de F-704, junto con la sección 8. Clip y Mercado Pago se resuelven con
**flujos manuales** detrás de `PaymentProvider`; la impresión usa el diálogo del navegador detrás
de `TicketPrinter`; el escáner se lee como teclado vía `BarcodeInput`. Ver
`docs/DISENO-base-datos-fase4.md`.

## Supuestos (documentados según SPEC §12)

1. Una sola tienda y una sola caja; el modelo ya incluye `store_id`.
2. Los precios incluyen IVA; no se desglosa en esta versión.
3. Moneda MXN (`$1,234.50`), fechas `DD/MM/AAAA`.
4. En modo demostración las fotos se guardan como imagen local (data URL) generada desde el
   dispositivo; en Supabase se usará Storage.
5. El corte calcula el efectivo esperado desde las ventas en efectivo y los movimientos de caja.
6. El costo de compra se captura por **unidad de venta** (pieza / kg / L); la cantidad se guarda en
   unidades base (piezas / gramos / mililitros) para el inventario.
7. Las existencias por **lote/caducidad** y las promociones automáticas (F-407) se implementan en
   la Fase 3; en la Fase 2 la caducidad se registraba como dato informativo en la compra.
8. La impresión térmica usa el diálogo del navegador (58/80 mm); la impresión directa ESC/POS
   queda como mejora futura. Clip y Mercado Pago usan flujo manual con referencia detrás de
   `PaymentProvider`, listos para la API real cuando haya credenciales y modelo de terminal.
9. Las promociones (F-407) aplican solo a productos por **pieza**; el descuento se refleja en
   `sale_item.discount_cents`.
