import { useMemo, useState } from 'react';
import type { AppUser, Product, ProductLot, Store } from '../types/database';
import { repository } from '../data';
import type { SupplierExchangeReason } from '../data';
import { formatStock } from '../lib/weight';

interface SupplierExchangeModalProps {
  store: Store;
  user: AppUser;
  product: Product;
  lot: ProductLot;
  onClose: () => void;
  onDone: (message: string) => void;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';

/**
 * Cambio con proveedor SIN costo (F-A04): se devuelve el producto vencido o por
 * vencer y se recibe uno nuevo. El stock baja por lo devuelto y sube por lo
 * recibido, con dos movimientos (`supplier_exchange_out` / `_in`). No toca dinero.
 */
export function SupplierExchangeModal({
  store,
  user,
  product,
  lot,
  onClose,
  onDone,
}: SupplierExchangeModalProps) {
  const [returned, setReturned] = useState(String(lot.qty));
  const [received, setReceived] = useState(String(lot.qty));
  const [newExpires, setNewExpires] = useState('');
  const [reason, setReason] = useState<SupplierExchangeReason>('expired');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnedQty = useMemo(() => Math.max(0, Math.round(Number(returned) || 0)), [returned]);
  const receivedQty = useMemo(() => Math.max(0, Math.round(Number(received) || 0)), [received]);

  async function confirm() {
    if (busy) return;
    if (returnedQty <= 0 && receivedQty <= 0) {
      setError('Indica cuánto se devuelve o se recibe.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await repository.createSupplierExchange({
        store_id: store.id,
        supplier_id: product.supplier_id ?? lot.supplier_id ?? null,
        user_id: user.id,
        notes: note.trim() || null,
        items: [
          {
            product_id: product.id,
            lot_id: lot.id,
            qty_returned: returnedQty,
            qty_received: receivedQty,
            new_expires_on: newExpires || null,
            reason,
          },
        ],
      });
      onDone(`Cambio registrado para ${product.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el cambio.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92dvh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-2 text-3xl">🔁 Cambio con proveedor</h2>
        <p className="mb-4 text-lg text-slate-600">
          {product.name} · lote {lot.expires_on ?? 'sin caducidad'} ·{' '}
          {formatStock(lot.qty, product.sale_unit)} disponibles. No afecta el dinero.
        </p>

        <label className="mb-1 block text-lg font-semibold" htmlFor="exch-returned">
          Devuelvo al proveedor
        </label>
        <div className="mb-3 flex items-center gap-2">
          <input
            id="exch-returned"
            value={returned}
            inputMode="numeric"
            onChange={(event) => setReturned(event.target.value.replace(/[^0-9]/g, ''))}
            className={field}
          />
          <button
            type="button"
            onClick={() => setReturned(String(lot.qty))}
            className="btn btn-neutral shrink-0 px-4 py-3 text-lg"
          >
            Todo
          </button>
        </div>

        <label className="mb-1 block text-lg font-semibold" htmlFor="exch-received">
          Recibo del proveedor
        </label>
        <input
          id="exch-received"
          value={received}
          inputMode="numeric"
          onChange={(event) => setReceived(event.target.value.replace(/[^0-9]/g, ''))}
          className={`${field} mb-3`}
        />

        <label className="mb-1 block text-lg font-semibold" htmlFor="exch-expires">
          Nueva caducidad (opcional)
        </label>
        <input
          id="exch-expires"
          type="date"
          value={newExpires}
          onChange={(event) => setNewExpires(event.target.value)}
          className={`${field} mb-3`}
        />

        <p className="mb-1 text-lg font-semibold">Motivo</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setReason('expired')}
            className={`btn py-3 text-lg ${reason === 'expired' ? 'btn-primary text-white' : 'btn-neutral'}`}
          >
            Ya venció
          </button>
          <button
            type="button"
            onClick={() => setReason('near_expiry')}
            className={`btn py-3 text-lg ${reason === 'near_expiry' ? 'btn-primary text-white' : 'btn-neutral'}`}
          >
            Por vencer
          </button>
        </div>

        <label className="mb-1 block text-lg font-semibold" htmlFor="exch-note">
          Nota (opcional)
        </label>
        <input
          id="exch-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${field} mb-3`}
        />

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
            disabled={busy}
            className="btn btn-primary flex-1 py-4 text-xl text-white"
          >
            {busy ? 'Guardando…' : 'Registrar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}
