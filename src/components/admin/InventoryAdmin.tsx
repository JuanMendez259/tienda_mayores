import { useMemo, useState } from 'react';
import type { AppUser, Product, Store } from '../../types/database';
import { repository } from '../../data';
import { formatStock, parseStockInput, unitLabel } from '../../lib/weight';

interface InventoryAdminProps {
  store: Store;
  user: AppUser;
  products: Product[];
  onRefresh: () => void;
}

type Operation = 'add' | 'remove' | 'waste';

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

/** Ajustes de inventario y mermas (F-503), con motivo obligatorio y bitácora. */
export function InventoryAdmin({ store, user, products, onRefresh }: InventoryAdminProps) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [operation, setOperation] = useState<Operation>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => p.id === productId) ?? null;
  const lowStock = useMemo(
    () =>
      products
        .filter((p) => p.track_stock && p.stock_qty <= p.low_stock_threshold)
        .sort((a, b) => a.stock_qty - b.stock_qty),
    [products],
  );

  async function submit() {
    if (!product) return setError('Elige un producto.');
    const amount = parseStockInput(qty, product.sale_unit);
    if (amount <= 0) return setError('Escribe una cantidad mayor a cero.');
    if (!reason.trim()) return setError('El motivo es obligatorio.');

    const delta = operation === 'add' ? amount : -amount;
    setBusy(true);
    setError(null);
    await repository.adjustStock({
      store_id: store.id,
      product_id: product.id,
      delta,
      type: operation === 'waste' ? 'waste' : 'adjustment',
      reason: reason.trim(),
      user_id: user.id,
    });
    setBusy(false);
    setQty('');
    setReason('');
    setMessage(
      `${operation === 'waste' ? 'Merma' : 'Ajuste'} registrado: ${product.name} ${
        delta >= 0 ? '+' : '−'
      }${formatStock(Math.abs(delta), product.sale_unit)}`,
    );
    onRefresh();
  }

  const opLabel = operation === 'add' ? 'Entrada (+)' : operation === 'waste' ? 'Merma (−)' : 'Salida (−)';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Ajustar inventario o registrar merma</h3>

        <div className="mb-3">
          <label className={label} htmlFor="i-product">Producto</label>
          <select id="i-product" value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatStock(p.stock_qty, p.sale_unit)}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="i-op">Operación</label>
            <select id="i-op" value={operation} onChange={(e) => setOperation(e.target.value as Operation)} className={field}>
              <option value="add">Entrada (+)</option>
              <option value="remove">Salida (−)</option>
              <option value="waste">Merma (−)</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="i-qty">
              Cantidad ({product ? unitLabel(product.sale_unit) : ''})
            </label>
            <input
              id="i-qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={field}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className={label} htmlFor="i-reason">Motivo</label>
          <input
            id="i-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. producto caducado, conteo físico…"
            className={field}
          />
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>}
        {message && <p className="mb-4 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn btn-primary w-full py-4 text-xl text-white"
        >
          {busy ? 'Registrando…' : `Registrar ${opLabel}`}
        </button>
      </section>

      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Poco stock ({lowStock.length})</h3>
        {lowStock.length === 0 ? (
          <p className="text-lg text-slate-500">Todo el inventario está por encima del aviso.</p>
        ) : (
          <ul className="space-y-2">
            {lowStock.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3">
                <span className="text-lg font-semibold">{p.name}</span>
                <span className="text-lg font-bold text-amber-800">
                  {formatStock(p.stock_qty, p.sale_unit)} / mín {formatStock(p.low_stock_threshold, p.sale_unit)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
