/**
 * Impresora térmica por la ventana de impresión del navegador (F-301, F-406,
 * sección 8.3). Se usa una hoja de estilos para papel de 58 mm u 80 mm.
 *
 * La impresión directa ESC/POS por WebUSB o Web Serial queda como mejora futura;
 * aquí se encapsula detrás de `TicketPrinter` para no rehacer la arquitectura.
 */
import QRCode from 'qrcode';
import type { Store } from '../types/database';
import { formatMXN } from '../lib/money';

export interface PrintableLine {
  name: string;
  detail: string;
  importeCents: number;
  /** Descuento aplicado al renglón, si lo hay. */
  discountCents?: number;
}

export interface PrintableTicket {
  storeName: string;
  storeFooter: string | null;
  number: number;
  /** Venta guardada sin conexión (F-704). */
  pending?: boolean;
  dateIso: string;
  lines: PrintableLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  /** Métodos de pago con importe, ya formateados (F-204). */
  paymentsLabel?: string;
  receivedCents: number;
  changeCents: number;
}

export interface PriceLabel {
  name: string;
  code: string;
  priceLabel: string;
}

export interface TicketPrinter {
  id: string;
  label: string;
  isAvailable(): boolean;
  printTicket(ticket: PrintableTicket, widthMm: number): void;
  printTest(store: Store): void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Envuelve el contenido en una hoja con el ancho de papel configurado. */
function receiptHtml(widthMm: number, title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body {
    width: ${widthMm - 4}mm;
    margin: 0;
    font-family: "Courier New", monospace;
    color: #000;
    font-size: ${widthMm <= 58 ? '11px' : '12px'};
    line-height: 1.35;
  }
  h1 { font-size: 1.15em; text-align: center; margin: 0 0 4px; }
  .center { text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row .right { text-align: right; white-space: nowrap; }
  .small { font-size: 0.9em; }
  .total { font-size: 1.25em; font-weight: 700; }
  .labels { display: flex; flex-wrap: wrap; gap: 3mm; }
  .label {
    width: 38mm; border: 1px solid #000; padding: 3px; text-align: center;
    page-break-inside: avoid;
  }
  .label img { width: 26mm; height: 26mm; }
  .label .name { font-weight: 700; }
</style></head><body>${body}
<script>window.onload = () => { window.print(); };</script>
</body></html>`;
}

/** Abre una ventana nueva y dispara la impresión. */
function openPrintWindow(html: string): void {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

const browserPrinter: TicketPrinter = {
  id: 'browser',
  label: 'Impresora del sistema (navegador)',
  isAvailable: () => typeof window !== 'undefined',
  printTicket(ticket, widthMm) {
    const rows = ticket.lines
      .map((line) => {
        const discount =
          line.discountCents && line.discountCents > 0
            ? `<div class="row small"><span>Descuento</span><span class="right">−${formatMXN(line.discountCents)}</span></div>`
            : '';
        return `<div class="row"><span>${escapeHtml(line.name)}</span><span class="right">${formatMXN(line.importeCents)}</span></div>
          <div class="small">${escapeHtml(line.detail)}</div>${discount}`;
      })
      .join('');
    const discountRow =
      ticket.discountCents > 0
        ? `<div class="row"><span>Descuento</span><span class="right">−${formatMXN(ticket.discountCents)}</span></div>`
        : '';
    const fecha = new Date(ticket.dateIso).toLocaleString('es-MX');
    const body = `
      <h1>${escapeHtml(ticket.storeName)}</h1>
      <div class="center small">${ticket.pending ? 'Venta sin conexión' : `Ticket #${ticket.number}`}</div>
      <div class="center small">${escapeHtml(fecha)}</div>
      <div class="sep"></div>
      ${rows}
      <div class="sep"></div>
      <div class="row"><span>Subtotal</span><span class="right">${formatMXN(ticket.subtotalCents)}</span></div>
      ${discountRow}
      <div class="row total"><span>TOTAL</span><span class="right">${formatMXN(ticket.totalCents)}</span></div>
      ${ticket.paymentsLabel ? `<div class="row"><span>Pago</span><span class="right">${escapeHtml(ticket.paymentsLabel)}</span></div>` : ''}
      <div class="row"><span>Recibí</span><span class="right">${formatMXN(ticket.receivedCents)}</span></div>
      <div class="row"><span>Cambio</span><span class="right">${formatMXN(ticket.changeCents)}</span></div>
      <div class="sep"></div>
      <div class="center small">${escapeHtml(ticket.storeFooter ?? '¡Gracias por su compra!')}</div>`;
    openPrintWindow(receiptHtml(widthMm, 'Ticket', body));
  },
  printTest(store) {
    const body = `
      <h1>${escapeHtml(store.name)}</h1>
      <div class="center">Prueba de impresión</div>
      <div class="center small">${escapeHtml(new Date().toLocaleString('es-MX'))}</div>
      <div class="sep"></div>
      <div class="row"><span>Papel</span><span class="right">${store.ticket_width_mm} mm</span></div>
      <div class="row total"><span>TOTAL</span><span class="right">${formatMXN(12345)}</span></div>
      <div class="sep"></div>
      <div class="center small">Si ves este texto, la impresora funciona.</div>`;
    openPrintWindow(receiptHtml(store.ticket_width_mm, 'Prueba de impresión', body));
  },
};

export const ticketPrinter: TicketPrinter = browserPrinter;

/** Imprime etiquetas con nombre, precio, código y QR (F-406). */
export async function printLabels(
  labels: PriceLabel[],
  storeName: string,
  widthMm: number,
): Promise<void> {
  if (labels.length === 0) return;

  const cards = await Promise.all(
    labels.map(async (label) => {
      let qr: string;
      try {
        qr = await QRCode.toDataURL(label.code, { margin: 0, width: 240 });
      } catch {
        qr = '';
      }
      return `<div class="label">
        ${qr ? `<img src="${qr}" alt="">` : ''}
        <div class="name">${escapeHtml(label.name)}</div>
        <div class="small">${escapeHtml(label.code)}</div>
        <div class="total">${escapeHtml(label.priceLabel)}</div>
      </div>`;
    }),
  );

  const body = `<h1>${escapeHtml(storeName)}</h1><div class="labels">${cards.join('')}</div>`;
  // Las etiquetas necesitan al menos 80 mm de ancho para caber de a dos.
  openPrintWindow(receiptHtml(Math.max(widthMm, 80), 'Etiquetas', body));
}

/** Imprime texto plano (por ejemplo, un estado de cuenta) en el ancho configurado (F-B04). */
export function printPlainText(title: string, text: string, widthMm: number): void {
  const body = `<h1>${escapeHtml(title)}</h1><pre style="white-space:pre-wrap;font-family:inherit;font-size:0.95em;margin:0">${escapeHtml(
    text,
  )}</pre>`;
  openPrintWindow(receiptHtml(widthMm, title, body));
}
