import { useState } from 'react';
import type { AppUser } from '../types/database';
import { repository } from '../data';
import { NumericKeypad } from './NumericKeypad';

interface ManagerAuthModalProps {
  /** Explica por qué se pide la autorización (p. ej., supera el límite de fiado). */
  message: string;
  /** Usuarios de la tienda; solo se ofrecen dueño y encargado. */
  users: AppUser[];
  onAuthorized: () => void;
  onCancel: () => void;
}

/**
 * Autorización de dueño o encargado con su PIN (F-B06): un cajero necesita que
 * un encargado apruebe una acción, como una venta de fiado sobre el límite.
 */
export function ManagerAuthModal({ message, users, onAuthorized, onCancel }: ManagerAuthModalProps) {
  const managers = users.filter((user) => user.role !== 'cashier');
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit() {
    if (!selected || pin.length !== 4 || checking) return;
    setChecking(true);
    setError(null);
    try {
      const ok = await repository.verifyPin(selected.id, pin);
      if (ok) {
        onAuthorized();
        return;
      }
      setPin('');
      setError('PIN incorrecto. Inténtalo otra vez.');
    } catch (cause) {
      setPin('');
      setError(
        cause instanceof Error ? cause.message : 'No se pudo verificar el PIN. Revisa la red.',
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="card max-h-[92dvh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-2 text-2xl">🔐 Autorización de encargado</h2>
        <p className="mb-4 rounded-2xl bg-amber-100 p-3 text-lg font-semibold text-amber-900">
          {message}
        </p>

        {!selected ? (
          managers.length === 0 ? (
            <p className="text-lg text-slate-500">
              No hay dueño ni encargado registrados para autorizar.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-lg text-slate-600">¿Quién autoriza?</p>
              {managers.map((manager) => (
                <button
                  key={manager.id}
                  type="button"
                  onClick={() => {
                    setSelected(manager);
                    setPin('');
                    setError(null);
                  }}
                  className="card flex w-full items-center justify-between gap-3 p-4 text-left hover:border-green-500"
                >
                  <span className="text-xl font-bold">{manager.name}</span>
                  <span className="text-base text-slate-500">
                    {manager.role === 'owner' ? 'Dueño' : 'Encargado'}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {selected.photo_url && (
                  <img src={selected.photo_url} alt="" className="h-12 w-12 rounded-full" />
                )}
                <p className="truncate text-xl font-bold">{selected.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPin('');
                  setError(null);
                }}
                className="btn btn-neutral px-3 py-2 text-base"
              >
                Cambiar
              </button>
            </div>
            <p className="mb-3 text-lg text-slate-600">Escribe su PIN de 4 dígitos.</p>

            <div className="mb-3 flex h-14 items-center justify-center gap-3 rounded-2xl bg-slate-100">
              {Array.from({ length: 4 }).map((_, index) => (
                <span
                  key={index}
                  className={`h-5 w-5 rounded-full ${index < pin.length ? 'bg-slate-900' : 'bg-slate-300'}`}
                />
              ))}
            </div>

            {error && (
              <p className="mb-3 rounded-xl bg-red-100 p-3 text-center text-lg font-semibold text-red-800">
                {error}
              </p>
            )}

            <NumericKeypad
              value={pin}
              onChange={setPin}
              allowDecimal={false}
              maxLength={4}
              onConfirm={submit}
              confirmLabel={checking ? 'Revisando…' : 'Autorizar'}
              confirmDisabled={checking || pin.length !== 4}
            />
          </>
        )}

        <button type="button" onClick={onCancel} className="btn btn-neutral mt-3 w-full py-4 text-xl">
          Cancelar venta
        </button>
      </div>
    </div>
  );
}
