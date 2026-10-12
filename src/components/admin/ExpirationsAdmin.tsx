import { useEffect, useState } from 'react';
import type { Product, ProductLot, Store } from '../../types/database';
import { repository } from '../../data';
import { formatStock } from '../../lib/weight';

interface ExpirationsAdminProps {
  store: Store;
  products: Product[];
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Control de caducidades por lote con criterio FEFO (F-505). */
export function ExpirationsAdmin({ store, products }: ExpirationsAdminProps) {
  const [lots, setLots] = useState<ProductLot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void repository.listExpiringLots(store.expiry_alert_days).then((result) => {
      if (active) {
        setLots(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [store.expiry_alert_days]);

  const productById = new Map(products.map((p) => [p.id, p]));

  return (
    <section className="card p-4">
      <h3 className="title mb-2 text-2xl">Próximos a caducar ({lots.length})</h3>
      <p className="mb-4 text-lg text-slate-600">
        Productos por lote que caducan en los próximos {store.expiry_alert_days} días. Al vender se
        descuenta primero lo más próximo a caducar (FEFO).
      </p>

      {loading ? (
        <p className="text-lg text-slate-500">Cargando…</p>
      ) : lots.length === 0 ? (
        <p className="text-lg text-slate-500">No hay lotes por caducar en este periodo.</p>
      ) : (
        <ul className="space-y-2">
          {lots.map((lot) => {
            const product = productById.get(lot.product_id);
            const remaining = lot.expires_on ? daysUntil(lot.expires_on) : null;
            const urgent = remaining !== null && remaining <= 7;
            return (
              <li
                key={lot.id}
                className={`flex items-center justify-between gap-3 rounded-xl p-3 ${
                  urgent ? 'bg-red-50' : 'bg-amber-50'
                }`}
              >
                <div>
                  <p className="text-lg font-semibold">{product?.name ?? 'Producto'}</p>
                  <p className="text-base text-slate-600">
                    Lote: {formatStock(lot.qty, product?.sale_unit ?? 'piece')}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${urgent ? 'text-red-700' : 'text-amber-800'}`}>
                    {lot.expires_on}
                  </p>
                  <p className="text-base text-slate-600">
                    {remaining === 0
                      ? 'Caduca hoy'
                      : remaining !== null && remaining < 0
                        ? `Caducó hace ${Math.abs(remaining)} día(s)`
                        : `En ${remaining} día(s)`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
