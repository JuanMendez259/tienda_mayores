import { useEffect, useState } from 'react';
import type { CashSession } from '../types/database';
import { repository } from '../data';
import type { CashSummary } from '../data';
import { formatMXN, parseAmountToCents } from '../lib/money';
import { ConfirmDialog } from './ConfirmDialog';
import { NumericKeypad } from './NumericKeypad';

interface CashPanelProps {
  session: CashSession;
  onClose: () => void;
  onClosed: () => void;
  /** Tras el corte, lleva a la pantalla de selección de usuario (C-02). */
  onProfiles?: () => void;
}

/** Corte de caja (F-603) y retiros/depósitos de efectivo (F-602). */
export function CashPanel({ session, onClose, onClosed, onProfiles }: CashPanelProps) {
  const [view, setView] = useState<'summary' | 'move' | 'result'>('summary');
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [counted, setCounted] = useState('');
  const [moveType, setMoveType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [result, setResult] = useState<CashSession | null>(null);
  const [askClose, setAskClose] = useState(false);

  const reload = () => {
    void repository.getCashSummary(session.id).then(setSummary);
  };

  useEffect(() => {
    let active = true;
    void repository.getCashSummary(session.id).then((value) => {
      if (active) setSummary(value);
    });
    return () => {
      active = false;
    };
  }, [session.id]);

  async function saveMovement() {
    const cents = parseAmountToCents(moveAmount);
    if (cents <= 0) return;
    await repository.addCashMovement(session.id, moveType, cents, moveNote.trim());
    setMoveAmount('');
    setMoveNote('');
    setView('summary');
    reload();
  }

  async function closeSession() {
    const closed = await repository.closeCashSession(session.id, parseAmountToCents(counted));
    setResult(closed);
    setView('result');
    setAskClose(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true">
        {view === 'summary' && (
          <>
            <h2 className="title mb-4 text-3xl">Caja</h2>
            {summary && (
              <dl className="mb-6 space-y-2 text-lg">
                <Row label="Fondo inicial" value={formatMXN(summary.opening_cents)} />
                <Row label="Ventas en efectivo" value={formatMXN(summary.cash_sales_cents)} />
                <Row label="Retiros y depósitos" value={formatMXN(summary.movements_cents)} />
                <div className="flex justify-between border-t border-slate-300 pt-2 text-2xl font-extrabold">
                  <span>Debería haber</span>
                  <span>{formatMXN(summary.expected_cents)}</span>
                </div>
              </dl>
            )}

            <h3 className="mb-2 text-xl font-bold">Contar el efectivo</h3>
            <div className="mb-3 flex h-16 items-center justify-center rounded-2xl bg-slate-900">
              <span className="text-3xl font-extrabold text-white">
                {formatMXN(parseAmountToCents(counted))}
              </span>
            </div>
            <NumericKeypad value={counted} onChange={setCounted} />

            <button
              type="button"
              onClick={() => setView('move')}
              className="btn btn-warning mt-4 w-full py-4 text-xl"
            >
              Retirar o meter dinero
            </button>
            <button
              type="button"
              onClick={() => setAskClose(true)}
              className="btn btn-primary mt-3 w-full py-5 text-2xl text-white"
            >
              Cerrar caja (corte)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-neutral mt-3 w-full py-4 text-xl"
            >
              Regresar a vender
            </button>
          </>
        )}

        {view === 'move' && (
          <>
            <h2 className="title mb-4 text-3xl">Retirar o meter dinero</h2>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMoveType('withdrawal')}
                className={`btn py-4 text-xl ${moveType === 'withdrawal' ? 'btn-danger text-white' : 'btn-neutral'}`}
              >
                Retirar
              </button>
              <button
                type="button"
                onClick={() => setMoveType('deposit')}
                className={`btn py-4 text-xl ${moveType === 'deposit' ? 'btn-primary text-white' : 'btn-neutral'}`}
              >
                Meter
              </button>
            </div>
            <label className="mb-1 block text-lg font-semibold" htmlFor="move-note">
              Motivo (opcional)
            </label>
            <input
              id="move-note"
              value={moveNote}
              onChange={(event) => setMoveNote(event.target.value)}
              placeholder="Pago a proveedor, etc."
              className="mb-4 w-full rounded-2xl border-2 border-slate-300 p-4 text-xl"
            />
            <div className="mb-3 flex h-16 items-center justify-center rounded-2xl bg-slate-900">
              <span className="text-3xl font-extrabold text-white">
                {formatMXN(parseAmountToCents(moveAmount))}
              </span>
            </div>
            <NumericKeypad value={moveAmount} onChange={setMoveAmount} />
            <button
              type="button"
              onClick={saveMovement}
              className="btn btn-primary mt-4 w-full py-5 text-2xl text-white"
            >
              Guardar movimiento
            </button>
            <button
              type="button"
              onClick={() => setView('summary')}
              className="btn btn-neutral mt-3 w-full py-4 text-xl"
            >
              Regresar
            </button>
          </>
        )}

        {view === 'result' && result && (
          <>
            <h2 className="title mb-4 text-3xl">Corte terminado</h2>
            <dl className="mb-6 space-y-2 text-lg">
              <Row label="Debería haber" value={formatMXN(result.expected_cents ?? 0)} />
              <Row label="Contado" value={formatMXN(result.counted_cents ?? 0)} />
              <div className="flex justify-between border-t border-slate-300 pt-2 text-2xl font-extrabold">
                <span>Diferencia</span>
                <span className={(result.difference_cents ?? 0) === 0 ? 'text-green-700' : 'text-red-700'}>
                  {formatMXN(result.difference_cents ?? 0)}
                </span>
              </div>
            </dl>
            <button
              type="button"
              onClick={onClosed}
              className="btn btn-primary w-full py-5 text-2xl text-white"
            >
              Terminar
            </button>
            {onProfiles && (
              <button
                type="button"
                onClick={onProfiles}
                className="btn btn-neutral mt-3 w-full py-4 text-xl"
              >
                👤 Ver perfiles
              </button>
            )}
          </>
        )}

        <ConfirmDialog
          open={askClose}
          title="¿Cerrar la caja?"
          message="Ya no podrás vender hasta abrir la caja otra vez."
          confirmLabel="Sí, cerrar caja"
          onConfirm={closeSession}
          onCancel={() => setAskClose(false)}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
