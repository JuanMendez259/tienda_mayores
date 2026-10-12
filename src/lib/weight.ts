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
