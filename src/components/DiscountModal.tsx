import { useId, useState } from 'react';
import { cartTotalCents, type CartItem } from '../lib/cart';
import { discountAmount, formatMXN, parseAmountToCents, type DiscountMode } from '../lib/money';
import { useModalA11y } from '../lib/useModalA11y';

interface DiscountModalProps {
  cart: CartItem[];
  orderDiscountCents: number;
  onApplyLine: (key: string, discountCents: number) => void;
  onApplyOrder: (discountCents: number) => void;
  onClose: () => void;
}

/**
 * Descuento por renglón o sobre el total, por monto o porcentaje (F-112).
 * El descuento es acumulable y queda registrado en la venta.
 */
export function DiscountModal({
  cart,
  orderDiscountCents,
  onApplyLine,
  onApplyOrder,
  onClose,
}: DiscountModalProps) {
  const [scope, setScope] = useState<string>('order');
  const [mode, setMode] = useState<DiscountMode>('amount');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const panelRef = useModalA11y(onClose);

  const line = cart.find((item) => item.key === scope) ?? null;
  const base = line ? line.lineTotalCents : cartTotalCents(cart);
  const numeric = mode === 'amount' ? parseAmountToCents(value) : Math.round(Number(value) || 0);
  const preview = discountAmount(base, mode, numeric);

  const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
  const label = 'mb-1 block text-lg font-semibold';

  function apply() {
    if (preview <= 0) return setError('El descuento debe ser mayor a cero.');
    if (line) {
      onApplyLine(line.key, preview);
    } else {
      onApplyOrder(preview);
    }
    onClose();
  }

  function clear() {
    if (line) {
      onApplyLine(line.key, 0);
    } else {
      onApplyOrder(0);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card max-h-[92dvh] w-full max-w-xl overflow-y-auto p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="title mb-4 text-3xl">
          Aplicar descuento
        </h2>

        <div className="mb-4">
          <label className={label} htmlFor="d-scope">¿A qué se aplica?</label>
          <select id="d-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={field}>
            <option value="order">Toda la venta · {formatMXN(cartTotalCents(cart))}</option>
            {cart.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name} · {formatMXN(item.lineTotalCents)}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="d-mode">Tipo</label>
            <select id="d-mode" value={mode} onChange={(e) => setMode(e.target.value as DiscountMode)} className={field}>
              <option value="amount">Monto ($)</option>
              <option value="percent">Porcentaje (%)</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="d-value">
              {mode === 'percent' ? 'Porcentaje' : 'Monto en pesos'}
            </label>
            <input
              id="d-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder={mode === 'percent' ? '10' : '0.00'}
              className={field}
            />
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-green-50 p-4 text-xl">
          <span className="text-slate-600">Descuento: </span>
          <span className="font-extrabold text-green-700">{formatMXN(preview)}</span>
          {scope === 'order' && orderDiscountCents > 0 && (
            <p className="mt-1 text-base text-slate-500">
              Descuento actual sobre el total: {formatMXN(orderDiscountCents)}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={clear} className="btn btn-neutral flex-1 py-4 text-xl">
            Quitar descuento
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={preview <= 0}
            className={`btn flex-1 py-4 text-xl text-white ${preview <= 0 ? 'cursor-not-allowed bg-slate-300' : 'btn-primary'}`}
          >
            Aplicar
          </button>
          <button type="button" onClick={onClose} className="btn w-full py-4 text-xl btn-neutral">
            Regresar
          </button>
        </div>
      </div>
    </div>
  );
}
