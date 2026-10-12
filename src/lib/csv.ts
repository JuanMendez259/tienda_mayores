import type { SaleUnit } from '../types/database';
import { parseAmountToCents } from './money';

export interface ProductCsvRow {
  name: string;
  category: string | null;
  saleUnit: SaleUnit;
  priceCents: number;
  costCents: number;
  barcode: string | null;
  stockQty: number;
  lowStockThreshold: number;
  imageUrl: string | null;
}

export interface ParsedProductsCsv {
  rows: ProductCsvRow[];
  errors: string[];
}

const HEADER_MARKERS = ['nombre', 'name', 'producto'];

/** Divide una línea CSV respetando comillas dobles. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseUnit(value: string): SaleUnit {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'peso' || normalized === 'kg' || normalized === 'weight') return 'weight';
  if (normalized === 'volumen' || normalized === 'litro' || normalized === 'l' || normalized === 'volume') {
    return 'volume';
  }
  return 'piece';
}

function parseQty(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Convierte el contenido de un CSV en filas de productos (F-408).
 * Columnas: nombre, categoria, unidad, precio, costo, codigo_barras, stock, stock_minimo, foto_url.
 * El precio y el costo se capturan en pesos y se convierten a centavos enteros.
 */
export function parseProductsCsv(text: string): ParsedProductsCsv {
  const rows: ProductCsvRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const cells = splitCsvLine(line);
    const isHeader =
      index === 0 && HEADER_MARKERS.includes((cells[0] ?? '').trim().toLowerCase());
    if (isHeader) return;

    const name = (cells[0] ?? '').trim();
    if (!name) {
      errors.push(`Línea ${lineNumber}: falta el nombre del producto.`);
      return;
    }
    const priceCents = parseAmountToCents(cells[3] ?? '');
    if (priceCents <= 0) {
      errors.push(`Línea ${lineNumber}: el precio de "${name}" debe ser mayor a cero.`);
      return;
    }
    const costCents = parseAmountToCents(cells[4] ?? '');
    rows.push({
      name,
      category: (cells[1] ?? '').trim() || null,
      saleUnit: parseUnit(cells[2] ?? ''),
      priceCents,
      costCents: Math.max(0, costCents),
      barcode: (cells[5] ?? '').trim() || null,
      stockQty: parseQty(cells[6]),
      lowStockThreshold: parseQty(cells[7]),
      imageUrl: (cells[8] ?? '').trim() || null,
    });
  });

  return { rows, errors };
}

/** Plantilla descargable para la importación de productos. */
export function productsCsvTemplate(): string {
  return [
    'nombre,categoria,unidad,precio,costo,codigo_barras,stock,stock_minimo,foto_url',
    'Refresco 600 ml,Bebidas,pieza,18.50,12.00,7501055300123,24,6,',
    'Jitomate,Básicos,peso,28.90,18.00,,50,10,',
    'Leche 1 L,Lácteos,volumen,24.00,18.00,7501020500123,12,3,',
  ].join('\n');
}

/** Genera un código de barras interno (F-403) cuando el producto no trae uno. */
export function generateBarcode(): string {
  const base = `200${Date.now().toString().slice(-9)}`;
  const digits = base.split('').map(Number);
  const sum = digits.reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}
