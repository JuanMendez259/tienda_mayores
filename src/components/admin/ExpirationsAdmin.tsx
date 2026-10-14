import { useCallback, useEffect, useState } from 'react';
import type { AppUser, Product, ProductLot, Store } from '../../types/database';
import { repository } from '../../data';
import { formatStock } from '../../lib/weight';
import { SupplierExchangeModal } from '../SupplierExchangeModal';

interface ExpirationsAdminProps {
  store: Store;
  user: AppUser;
  products: Product[];
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Control de caducidades (F-A03, F-505): separa lo VENCIDO de lo POR VENCER
 * (con alerta crítica a ≤2 días) y permite el cambio con proveedor sin costo
 * con un toque (F-A04).
 */
export function ExpirationsAdmin({ store, user, products }: ExpirationsAdminProps) {
  const [lots, setLots] = useState<ProductLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [exchange, setExchange] = useState<{ lot: ProductLot; product: Product } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void repository.listExpiringLots(store.expiry_alert_days).then((result) => {
      setLots(result);
      setLoading(false);
    });
  }, [store.expiry_alert_days]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const productById = new Map(products.map((p) => [p.id, p]));

  const expired = lots.filter((l) => l.expires_on !== null && daysUntil(l.expires_on) < 0);
  const critical = lots.filter((l) => {
    if (!l.expires_on) return false;
    const days = daysUntil(l.expires_on);
    return days >= 0 && days <= 2;
  });
  const soon = lots.filter((l) => {
    if (!l.expires_on) return false;
    const days = daysUntil(l.expires_on);
    return days > 2 && days <= store.expiry_alert_days;
  });

  function renderLot(lot: ProductLot, tone: 'expired' | 'critical' | 'soon') {
    const product = productById.get(lot.product_id);
    const remaining = lot.expires_on ? daysUntil(lot.expires_on) : null;
    const styles =
      tone === 'expired'
        ? 'bg-red-50 border-red-200'
        : tone === 'critical'
          ? 'bg-amber-50 border-amber-200'
          : 'bg-yellow-50 border-yellow-200';
    return (
      <li key={lot.id} className={`space-y-2 rounded-xl border-2 p-3 ${styles}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{product?.name ?? 'Producto'}</p>
            <p className="text-base text-slate-600">
              Lote: {formatStock(lot.qty, product?.sale_unit ?? 'piece')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold">{lot.expires_on}</p>
            <p className="text-base text-slate-600">
              {remaining === 0
                ? 'Caduca hoy'
                : remaining !== null && remaining < 0
                  ? `Caducó hace ${Math.abs(remaining)} día(s)`
                  : `En ${remaining} día(s)`}
            </p>
          </div>
        </div>
        {product && (
          <button
            type="button"
            onClick={() => setExchange({ lot, product })}
            className="btn btn-primary w-full py-3 text-lg text-white"
          >
            🔁 Cambio con proveedor (sin costo)
          </button>
        )}
      </li>
    );
  }

  return (
    <section className="space-y-4">
      <div className="card p-4">
        <h3 className="title mb-2 text-2xl">Caducidades</h3>
        <p className="text-lg text-slate-600">
          Al vender se descuenta primero lo más próximo a caducar (FEFO). Alerta crítica a 2 días.
        </p>
      </div>

      {message && (
        <p className="rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>
      )}

      {loading ? (
        <p className="text-lg text-slate-500">Cargando…</p>
      ) : (
        <>
          <div className="card p-4">
            <h4 className="mb-3 text-xl font-bold text-red-800">
              🚫 Vencidos ({expired.length})
            </h4>
            {expired.length === 0 ? (
              <p className="text-lg text-slate-500">Nada vencido. ¡Muy bien!</p>
            ) : (
              <ul className="space-y-2">{expired.map((lot) => renderLot(lot, 'expired'))}</ul>
            )}
          </div>

          <div className="card p-4">
            <h4 className="mb-3 text-xl font-bold text-amber-800">
              ⏳ Por vencer ({critical.length + soon.length})
            </h4>
            {critical.length === 0 && soon.length === 0 ? (
              <p className="text-lg text-slate-500">
                Sin productos por vencer en {store.expiry_alert_days} días.
              </p>
            ) : (
              <ul className="space-y-2">
                {critical.map((lot) => renderLot(lot, 'critical'))}
                {soon.map((lot) => renderLot(lot, 'soon'))}
              </ul>
            )}
          </div>
        </>
      )}

      {exchange && (
        <SupplierExchangeModal
          store={store}
          user={user}
          product={exchange.product}
          lot={exchange.lot}
          onClose={() => setExchange(null)}
          onDone={(text) => {
            setExchange(null);
            setMessage(text);
            load();
          }}
        />
      )}
    </section>
  );
}
