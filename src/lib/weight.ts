/** Utilidades de peso y volumen. Se guardan en GRAMOS / MILILITROS enteros. */

export function gramsToKilograms(grams: number): number {
  return grams / 1000;
}

/** 1250 -> "1.250 kg" */
export function formatKilograms(grams: number): string {
  return `${gramsToKilograms(Math.round(grams)).toFixed(3)} kg`;
}

/** 1500 -> "1.500 L" */
export function formatLiters(ml: number): string {
  return `${(Math.round(ml) / 1000).toFixed(3)} L`;
}

/** Formatea según la unidad de venta de la medida (gramos o mililitros). */
export function formatMeasure(measure: number, unit: 'weight' | 'volume'): string {
  return unit === 'volume' ? formatLiters(measure) : formatKilograms(measure);
}

/** Convierte texto en kg ("1.25") o gramos ("1250") a gramos enteros. */
export function parseKilogramsToGrams(text: string): number {
  const clean = text.replace(/[^0-9.]/g, '');
  if (!clean) return 0;
  const value = Number.parseFloat(clean);
  if (Number.isNaN(value)) return 0;
  // Si el usuario escribe "1250" (sin punto) se interpreta como gramos.
  return clean.includes('.') ? Math.round(value * 1000) : Math.round(value);
}

/** Convierte texto en litros ("1.25") o ml ("1250") a mililitros enteros. */
export function parseLitersToMilliliters(text: string): number {
  const clean = text.replace(/[^0-9.]/g, '');
  if (!clean) return 0;
  const value = Number.parseFloat(clean);
  if (Number.isNaN(value)) return 0;
  return clean.includes('.') ? Math.round(value * 1000) : Math.round(value);
}

/** Etiqueta corta de la unidad de venta. */
export function unitLabel(saleUnit: 'piece' | 'weight' | 'volume'): string {
  return saleUnit === 'weight' ? 'kg' : saleUnit === 'volume' ? 'L' : 'pza';
}

/** Formatea una existencia según la unidad de venta: 3 pza, 1.250 kg, 1.500 L. */
export function formatStock(qty: number, saleUnit: 'piece' | 'weight' | 'volume'): string {
  if (saleUnit === 'piece') return `${Math.round(qty)} pza`;
  return saleUnit === 'weight' ? formatKilograms(qty) : formatLiters(qty);
}

/** Convierte una cantidad capturada por el usuario a unidades base. */
export function parseStockInput(text: string, saleUnit: 'piece' | 'weight' | 'volume'): number {
  if (saleUnit === 'weight') return parseKilogramsToGrams(text);
  if (saleUnit === 'volume') return parseLitersToMilliliters(text);
  return Math.max(0, Math.round(Number(text) || 0));
}
