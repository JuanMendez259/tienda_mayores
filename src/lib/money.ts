/** Utilidades de dinero. Todo monto es un ENTERO en centavos. */

/** Formatea centavos como pesos mexicanos: 123450 -> "$1,234.50" */
export function formatMXN(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const pesos = Math.floor(abs / 100);
  const centavos = abs % 100;
  return `${sign}$${pesos.toLocaleString('es-MX')}.${String(centavos).padStart(2, '0')}`;
}

/** Convierte texto ("12.5", "$1,234.50") a centavos enteros. */
export function parseAmountToCents(text: string): number {
  const clean = text.replace(/[^0-9.]/g, '');
  if (!clean) return 0;
  const [whole, ...rest] = clean.split('.');
  const decimals = (rest.join('') + '00').slice(0, 2);
  return parseInt(whole || '0', 10) * 100 + parseInt(decimals, 10);
}

/** Total de un renglón por pieza: precio unitario * cantidad. */
export function lineTotalByQuantity(unitPriceCents: number, qty: number): number {
  return Math.round(unitPriceCents * qty);
}

/** Total por peso/volumen: precio por kg/L * medida (gramos/ml) / 1000. */
export function lineTotalByMeasure(
  unitPriceCents: number,
  measure: number,
  unitsPerPrice = 1000,
): number {
  return Math.round((unitPriceCents * measure) / unitsPerPrice);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + Math.round(value), 0);
}

/** Cambio a entregar. Nunca negativo. */
export function changeDue(totalCents: number, receivedCents: number): number {
  return Math.max(0, Math.round(receivedCents) - Math.round(totalCents));
}
