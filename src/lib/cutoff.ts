import type { SupplierSchedule } from '../types/database';

export interface CutoffAlert {
  id: string;
  name: string;
  time: string;
}

/**
 * Proveedores cuya hora límite de pedido cae hoy dentro de las próximas
 * `windowMinutes` (F-A07). `supplierName` resuelve el nombre del proveedor.
 */
export function computeCutoffAlerts(
  schedules: SupplierSchedule[],
  supplierName: (supplierId: string) => string | undefined,
  now: Date = new Date(),
  windowMinutes = 180,
): CutoffAlert[] {
  const weekday = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return schedules
    .filter((schedule) => schedule.weekday === weekday)
    .map((schedule) => {
      const [hours, minutes] = schedule.order_cutoff_time.split(':').map(Number);
      return { schedule, mins: hours * 60 + (minutes || 0) };
    })
    .filter((item) => item.mins >= nowMins && item.mins - nowMins <= windowMinutes)
    .map((item) => ({
      id: item.schedule.id,
      name: supplierName(item.schedule.supplier_id) ?? 'Proveedor',
      time: item.schedule.order_cutoff_time,
    }));
}
