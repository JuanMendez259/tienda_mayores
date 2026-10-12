import { useState } from 'react';
import { changeDue, formatMXN, parseAmountToCents } from '../lib/money';
import { NumericKeypad } from './NumericKeypad';

interface PaymentModalProps {
  totalCents: number;
  onCancel: () => void;
  onConfirm: (receivedCents: number) => void;
}

const QUICK_BILLS = [50, 100, 200, 500, 1000];

/** Cobro en efectivo con botones rápidos y cálculo de cambio (F-201). */
export function PaymentModal({ totalCents, onCancel, onConfirm }: PaymentModalProps) {
  const [amount, setAmount] = useState('');
  const received = parseAmountToCents(amount);
  const change = changeDue(totalCents, received);
  const enough = received >= totalCents;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-lg overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-2 text-3xl">Cobrar en efectivo</h2>
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-green-600 px-5 py-3">
          <span className="text-xl font-bold text-white">Total a pagar</span>
          <span className="text-3xl font-extrabold text-white">{formatMXN(totalCents)}</span>
        </div>

        <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-3">
          <span className="text-xl text-slate-300">Recibí</span>
          <span className="text-3xl font-extrabold text-white">{formatMXN(received)}</span>
        </div>
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-amber-100 px-5 py-3">
          <span className="text-xl font-bold text-amber-900">Cambio</span>
          <span className="text-3xl font-extrabold text-amber-900">{formatMXN(change)}</span>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          {QUICK_BILLS.map((bill) => (
            <button
              key={bill}
              type="button"
              onClick={() => setAmount((prev) => String((parseAmountToCents(prev) + bill * 100) / 100))}
              className="btn btn-neutral py-4 text-xl"
            >
              +${bill}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAmount((totalCents / 100).toFixed(2))}
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
          <button
            type="button"
            onClick={() => onConfirm(received)}
            disabled={!enough}
            className={`btn flex-1 py-4 text-xl text-white ${
              enough ? 'bg-green-600 hover:bg-green-700' : 'cursor-not-allowed bg-slate-400'
            }`}
          >
            Cobrar {formatMXN(totalCents)}
          </button>
        </div>
      </div>
    </div>
  );
}
