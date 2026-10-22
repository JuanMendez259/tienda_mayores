import { useState } from 'react';
import type { AppUser, CashSession, Store } from '../types/database';
import { repository } from '../data';
import { formatMXN, parseAmountToCents } from '../lib/money';
import { NumericKeypad } from './NumericKeypad';

interface OpenCashScreenProps {
  store: Store;
  user: AppUser;
  onOpened: (session: CashSession) => void;
}

const QUICK_BILLS = [100, 200, 500, 1000];

/** Apertura de caja: fondo inicial obligatorio para vender (F-601). */
export function OpenCashScreen({ store, user, onOpened }: OpenCashScreenProps) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const cents = parseAmountToCents(amount);

  async function open() {
    if (saving) return;
    setSaving(true);
    const session = await repository.openCashSession({
      store_id: store.id,
      user_id: user.id,
      opening_cents: cents,
    });
    setSaving(false);
    onOpened(session);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 p-6">
      <div className="card w-full max-w-lg p-6">
        <h1 className="title text-3xl">Abrir caja</h1>
        <p className="mb-6 text-lg text-slate-600">
          {user.name}, escribe cuánto dinero hay en la caja para empezar.
        </p>

        <div className="mb-4 flex h-20 items-center justify-center rounded-2xl bg-slate-900">
          <span className="text-4xl font-extrabold text-white">{formatMXN(cents)}</span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          {QUICK_BILLS.map((bill) => (
            <button
              key={bill}
              type="button"
              onClick={() => setAmount(String(bill))}
              className="btn btn-neutral py-4 text-2xl"
            >
              ${bill}
            </button>
          ))}
        </div>

        <NumericKeypad value={amount} onChange={setAmount} />

        <button
          type="button"
          onClick={() => setAmount('')}
          className="btn btn-neutral mt-3 w-full py-4 text-xl"
        >
          Borrar
        </button>

        <button
          type="button"
          onClick={open}
          disabled={saving}
          className="btn btn-primary mt-4 w-full py-5 text-2xl text-white"
        >
          {saving ? 'Abriendo…' : 'Abrir caja y vender'}
        </button>
      </div>
    </div>
  );
}
