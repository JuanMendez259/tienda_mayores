/**
 * Exportación de reportes y datos (F-605 y F-707).
 *
 * - CSV: se genera en el cliente y se descarga como archivo.
 * - PDF: se usa el diálogo de impresión del navegador ("Guardar como PDF"),
 *   que no requiere dependencias adicionales.
 */
import type { Category, Product, Store } from '../types/database';
import type { ReportData } from '../data/repository';
import { PAYMENT_METHOD_LABELS } from '../devices/payments';

function cents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvField(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\n');
}

/** Reporte de ventas en CSV (F-605). */
export function reportToCsv(report: ReportData): string {
  const lines: string[][] = [['Reporte de ventas']];
  lines.push(['Desde', report.from]);
  lines.push(['Hasta', report.to]);
  lines.push([]);
  lines.push(['Total de ventas', cents(report.totalSalesCents)]);
  lines.push(['Número de ventas', String(report.salesCount)]);
  lines.push(['Ganancia estimada', cents(report.profitCents)]);
  lines.push([]);
  lines.push(['Ventas por día']);
  lines.push(['Fecha', 'Ventas (MXN)', 'Cantidad']);
  for (const day of report.byDay) {
    lines.push([day.date, cents(day.totalCents), String(day.count)]);
  }
  lines.push([]);
  lines.push(['Formas de pago']);
  lines.push(['Método', 'Importe (MXN)', 'Cantidad']);
  for (const method of report.byPaymentMethod) {
    lines.push([PAYMENT_METHOD_LABELS[method.method], cents(method.totalCents), String(method.count)]);
  }
  lines.push([]);
  lines.push(['Productos más vendidos']);
  lines.push(['Producto', 'Cantidad', 'Importe (MXN)']);
  for (const product of report.topProducts) {
    lines.push([product.name, String(product.qty), cents(product.totalCents)]);
  }
  lines.push([]);
  lines.push(['Menor rotación']);
  lines.push(['Producto', 'Cantidad']);
  for (const product of report.lowRotation) {
    lines.push([product.name, String(product.qty)]);
  }
  return csvRows(lines);
}

/** Catálogo completo en CSV para respaldo del dueño (F-707). */
export function catalogToCsv(products: Product[], categories: Category[]): string {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const rows: (string | number | null | undefined)[][] = [
    ['nombre', 'categoria', 'unidad', 'precio', 'costo', 'codigo_barras', 'stock', 'stock_minimo', 'activo'],
  ];
  for (const product of products) {
    rows.push([
      product.name,
      categoryById.get(product.category_id ?? '') ?? '',
      product.sale_unit === 'piece' ? 'pieza' : product.sale_unit === 'weight' ? 'peso' : 'volumen',
      cents(product.price_cents),
      cents(product.cost_cents),
      product.barcode ?? '',
      product.stock_qty,
      product.low_stock_threshold,
      product.active ? 'sí' : 'no',
    ]);
  }
  return csvRows(rows);
}

/** Descarga un texto como archivo (CSV) en el navegador. */
export function downloadText(filename: string, text: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([`\ufeff${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Abre una vista imprimible; el usuario elige "Guardar como PDF" (F-605).
 */
export function printReport(store: Store, report: ReportData): void {
  if (typeof window === 'undefined') return;
  const rows = report.byDay
    .map((day) => `<tr><td>${day.date}</td><td>$${cents(day.totalCents)}</td><td>${day.count}</td></tr>`)
    .join('');
  const methods = report.byPaymentMethod
    .map(
      (m) =>
        `<tr><td>${PAYMENT_METHOD_LABELS[m.method]}</td><td>$${cents(m.totalCents)}</td><td>${m.count}</td></tr>`,
    )
    .join('');
  const top = report.topProducts
    .map((p) => `<tr><td>${p.name}</td><td>${p.qty}</td><td>$${cents(p.totalCents)}</td></tr>`)
    .join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reporte de ventas</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
  h1 { margin: 0 0 4px; } h2 { margin-top: 24px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  .metric { font-size: 20px; font-weight: 700; }
</style></head><body>
  <h1>${store.name}</h1>
  <p>Reporte de ventas del ${report.from.slice(0, 10)} al ${report.to.slice(0, 10)}</p>
  <p class="metric">Total: $${cents(report.totalSalesCents)} · ${report.salesCount} ventas</p>
  <p class="metric">Ganancia estimada: $${cents(report.profitCents)}</p>
  <h2>Ventas por día</h2>
  <table><thead><tr><th>Fecha</th><th>Ventas</th><th>Cantidad</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Formas de pago</h2>
  <table><thead><tr><th>Método</th><th>Importe</th><th>Cantidad</th></tr></thead><tbody>${methods}</tbody></table>
  <h2>Productos más vendidos</h2>
  <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Importe</th></tr></thead><tbody>${top}</tbody></table>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
