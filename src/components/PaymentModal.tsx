import { useState } from 'react';
import type { PaymentMethod } from '../types/database';
import type { PaymentInput } from '../data';
import { changeDue, formatMXN, parseAmountToCents } from '../lib/money';
import { PAYMENT_METHOD_LABELS, paymentProviders } from '../devices/payments';
import { NumericKeypad } from './NumericKeypad';

interface PaymentModalProps {
  totalCents: number;
  onCancel: () => void;
  onConfirm: (payments: PaymentInput[], receivedCents: number) => void;
}

const QUICK_BILLS = [50, 100, 200, 500, 1000];

type Mode = 'cash' | 'card_clip' | 'mercadopago_qr';

interface Entry {
  method: PaymentMethod;
  appliedCents: number;
  reference: string | null;
  /** Efectivo recibido (para calcular cambio); igual al aplicado en pagos digitales. */
  receivedCents: number;
}

const MODE_LABEL: Record<Mode, string> = {
  cash: '💵 Efectivo',
  card_clip: '💳 Clip',
  mercadopago_qr: '📱 M. Pago',
};

/**
 * Cobro en efectivo o combinado: efectivo + Clip + Mercado Pago (F-201 a F-204).
 * La suma de los pagos siempre iguala el total de la venta.
 */
export function PaymentModal({ totalCents, onCancel, onConfirm }: PaymentModalProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const paid = entries.reduce((acc, entry) => acc + entry.appliedCents, 0);
  const remaining = Math.max(0, totalCents - paid);
  const received = parseAmountToCents(amount);
  const cashEnough = received >= remaining;
  const cashChange = changeDue(remaining, received);

  function finish(next: Entry[]) {
    const changeTotal = next.reduce(
      (acc, entry) => acc + Math.max(0, entry.receivedCents - entry.appliedCents),
      0,
    );
    const payments: PaymentInput[] = next.map((entry) => ({
      method: entry.method,
      amount_cents: entry.appliedCents,
      reference: entry.reference,
    }));
    onConfirm(payments, totalCents + changeTotal);
  }

  function addCash() {
    if (remaining === 0 || received <= 0) return;
    const appliedCents = Math.min(remaining, received);
    const next: Entry[] = [
      ...entries,
      { method: 'cash', appliedCents, reference: null, receivedCents: received },
    ];
    if (appliedCents >= remaining) {
      finish(next);
      return;
    }
    setEntries(next);
    setAmount('');
  }

  async function addDigital() {
    if (remaining === 0 || busy) return;
    setBusy(true);
    const provider = paymentProviders.find((item) => item.method === mode);
    const result = provider
      ? await provider.charge({ totalCents: remaining, label: 'Venta' }, reference.trim() || null)
      : { method: mode, amountCents: remaining, reference: reference.trim() || null };
    setBusy(false);
    finish([
      ...entries,
      {
        method: result.method,
        appliedCents: result.amountCents,
        reference: result.reference,
        receivedCents: result.amountCents,
      },
    ]);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-lg overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-2 text-3xl">Cobrar</h2>

        <div className="mb-3 flex items-center justify-between rounded-2xl bg-green-600 px-5 py-3">
          <span className="text-xl font-bold text-white">Total</span>
          <span className="text-3xl font-extrabold text-white">{formatMXN(totalCents)}</span>
        </div>

        {entries.length > 0 && (
          <div className="mb-3 rounded-2xl bg-slate-100 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-semibold">Falta por cobrar</span>
              <span className="text-2xl font-extrabold">{formatMXN(remaining)}</span>
            </div>
            <ul className="space-y-1">
              {entries.map((entry, index) => (
                <li key={index} className="flex justify-between text-base text-slate-700">
                  <span>{PAYMENT_METHOD_LABELS[entry.method]}</span>
                  <span className="font-semibold">{formatMXN(entry.appliedCents)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setEntries((prev) => prev.slice(0, -1))}
              className="btn btn-neutral mt-2 w-full py-3 text-base"
            >
              ↶ Quitar último pago
            </button>
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-2">
          {(['cash', 'card_clip', 'mercadopago_qr'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`btn px-2 py-4 text-lg ${mode === value ? 'btn-primary text-white' : 'btn-neutral'}`}
            >
              {MODE_LABEL[value]}
            </button>
          ))}
        </div>

        {mode === 'cash' ? (
          <>
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-3">
              <span className="text-xl text-slate-300">Recibí</span>
              <span className="text-3xl font-extrabold text-white">{formatMXN(received)}</span>
            </div>
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-amber-100 px-5 py-3">
              <span className="text-xl font-bold text-amber-900">Cambio</span>
              <span className="text-3xl font-extrabold text-amber-900">{formatMXN(cashChange)}</span>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-3">
              {QUICK_BILLS.map((bill) => (
                <button
                  key={bill}
                  type="button"
                  onClick={() =>
                    setAmount((prev) => String((parseAmountToCents(prev) + bill * 100) / 100))
                  }
                  className="btn btn-neutral py-4 text-xl"
                >
                  +${bill}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount((remaining / 100).toFixed(2))}
                className="btn btn-warning py-4 text-xl"
              >
                Exacto
              </button>
            </div>

            <NumericKeypad value={amount} onChange={setAmount} />

            <div className="mt-4 flex gap-3">
              <button type="button" onClick={onCancel} className="btn btn-neutral flex-1 py-4 text-xl">
                Cancelar
              </button>
              {cashEnough ? (
                <button
                  type="button"
                  onClick={addCash}
                  className="btn flex-1 bg-green-600 py-4 text-xl text-white hover:bg-green-700"
                >
                  Cobrar {formatMXN(remaining)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={addCash}
                  disabled={received <= 0}
                  className={`btn flex-1 py-4 text-xl ${
                    received > 0 ? 'btn-primary text-white' : 'cursor-not-allowed bg-slate-100 text-slate-400'
                  }`}
                >
                  Agregar {formatMXN(received)} y seguir
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 rounded-2xl bg-slate-100 p-4 text-lg">
              {mode === 'card_clip'
                ? `Cobra ${formatMXN(remaining)} en la terminal Clip y confirma.`
                : `Muestra el QR de Mercado Pago por ${formatMXN(remaining)} y confirma al acreditarse.`}
            </p>
            <label className="mb-1 block text-lg font-semibold" htmlFor="pay-ref">
              Referencia (opcional)
            </label>
            <input
              id="pay-ref"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Folio o últimos 4 dígitos"
              className="mb-4 min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl"
            />
            <div className="flex gap-3">
              <button type="button" onClick={onCancel} className="btn btn-neutral flex-1 py-4 text-xl">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void addDigital()}
                disabled={busy || remaining === 0}
                className="btn btn-primary flex-1 py-4 text-xl text-white"
              >
                {busy ? 'Procesando…' : `Confirmar ${formatMXN(remaining)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
