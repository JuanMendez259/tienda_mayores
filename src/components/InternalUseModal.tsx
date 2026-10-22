import { useMemo, useState } from 'react';
import type { AppUser, Product, Store } from '../types/database';
import { repository } from '../data';
import { formatStock } from '../lib/weight';

interface InternalUseModalProps {
  store: Store;
  user: AppUser;
  products: Product[];
  onClose: () => void;
  onDone: (message: string) => void;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';

/**
 * Consumo interno (F-C01): descuenta inventario con la nota OBLIGATORIA y lo
 * registra como movimiento `internal_use` para el reporte de mermas internas.
 */
export function InternalUseModal({ store, user, products, onClose, onDone }: InternalUseModalProps) {
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId) ?? null;
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = products.filter((p) => p.track_stock);
    if (!term) return list.slice(0, 8);
    return list.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 8);
  }, [products, search]);

  const qtyBase = Math.max(0, Math.round(Number(qty) || 0));

  async function confirm() {
    if (!product || busy) return;
    if (qtyBase <= 0) {
      setError('Indica cuánto se consumió.');
      return;
    }
    if (!reason.trim()) {
      setError('La nota es obligatoria para el consumo interno.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await repository.recordInternalUse({
        store_id: store.id,
        product_id: product.id,
        qty: qtyBase,
        reason: reason.trim(),
        user_id: user.id,
      });
      onDone(`Consumo interno registrado: ${product.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el consumo.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92dvh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-2 text-3xl">🧾 Consumo interno</h2>
        <p className="mb-4 text-lg text-slate-600">
          Para productos que se usan en la tienda (no se venden). Requiere una nota.
        </p>

        {!product ? (
          <>
            <label className="mb-1 block text-lg font-semibold" htmlFor="iu-search">
              Busca el producto
            </label>
            <input
              id="iu-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre del producto"
              className={`${field} mb-3`}
            />
            <ul className="space-y-2">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProductId(item.id);
                      setError(null);
                    }}
                    className="card flex w-full items-center justify-between gap-3 p-4 text-left hover:border-green-500"
                  >
                    <span className="text-lg font-semibold">{item.name}</span>
                    <span className="text-base text-slate-500">
                      {formatStock(item.stock_qty, item.sale_unit)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="mb-3 rounded-2xl bg-slate-100 p-4">
              <p className="text-xl font-bold">{product.name}</p>
              <p className="text-base text-slate-600">
                Disponible: {formatStock(product.stock_qty, product.sale_unit)}
              </p>
              <button
                type="button"
                onClick={() => setProductId(null)}
                className="btn btn-neutral mt-2 py-2 text-base"
              >
                Cambiar producto
              </button>
            </div>

            <label className="mb-1 block text-lg font-semibold" htmlFor="iu-qty">
              Cantidad {product.sale_unit === 'piece' ? '(piezas)' : '(gramos o ml)'}
            </label>
            <input
              id="iu-qty"
              value={qty}
              inputMode="numeric"
              onChange={(event) => setQty(event.target.value.replace(/[^0-9]/g, ''))}
              className={`${field} mb-3`}
            />

            <label className="mb-1 block text-lg font-semibold" htmlFor="iu-reason">
              Nota (obligatoria)
            </label>
            <input
              id="iu-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej. consumo del personal"
              className={`${field} mb-3`}
            />
          </>
        )}

        {error && (
          <p className="mb-3 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-neutral flex-1 py-4 text-xl">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !product}
            className={`btn flex-1 py-4 text-xl ${
              product ? 'btn-primary text-white' : 'cursor-not-allowed bg-slate-100 text-slate-400'
            }`}
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
