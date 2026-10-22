/**
 * Días que faltan para una fecha `YYYY-MM-DD` (negativo si ya pasó).
 * Se compara contra la fecha local de la tablet, sin horas.
 */
export function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
