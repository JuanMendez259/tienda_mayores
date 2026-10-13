import { useState } from 'react';
import type { AppUser, Store } from '../types/database';
import { repository } from '../data';
import { NumericKeypad } from './NumericKeypad';

interface LoginScreenProps {
  store: Store;
  users: AppUser[];
  onLogin: (user: AppUser) => void;
}

const roleLabel: Record<AppUser['role'], string> = {
  owner: 'Dueño',
  manager: 'Encargado',
  cashier: 'Cajero',
};

/** Selección de usuario por foto + PIN numérico (Sección 3). */
export function LoginScreen({ store, users, onLogin }: LoginScreenProps) {
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit() {
    if (!selected || pin.length < 4 || checking) return;
    setChecking(true);
    setError(null);
    try {
      const ok = await repository.verifyPin(selected.id, pin);
      if (ok) {
        onLogin(selected);
        return;
      }
      setPin('');
      setError('PIN incorrecto. Vuelve a intentarlo.');
    } catch (cause) {
      setPin('');
      setError(
        cause instanceof Error && cause.message
          ? `No se pudo verificar el PIN: ${cause.message}`
          : 'No se pudo conectar con el servidor. Revisa la red e intenta de nuevo.',
      );
    } finally {
      // Pase lo que pase, el botón vuelve a estar disponible.
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6">
      <header className="mb-8 flex flex-col items-center">
        {store.logo_url && (
          <img src={store.logo_url} alt="" className="mb-2 h-20 w-20 rounded-2xl" />
        )}
        <h1 className="title text-center text-3xl">{store.name}</h1>
        <p className="text-lg text-slate-600">
          {selected ? 'Escribe tu PIN y toca Entrar' : 'Selecciona tu nombre'}
        </p>
      </header>

      {!selected ? (
        <div className="grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                setSelected(user);
                setPin('');
                setError(null);
              }}
              className="card flex flex-col items-center gap-2 p-5 hover:border-green-500"
            >
              {user.photo_url && (
                <img src={user.photo_url} alt="" className="h-28 w-28 rounded-full" />
              )}
              <span className="text-2xl font-bold">{user.name}</span>
              <span className="text-lg text-slate-500">{roleLabel[user.role]}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card w-full max-w-md p-6">
          <div className="mb-6 flex items-center gap-4">
            {selected.photo_url && (
              <img src={selected.photo_url} alt="" className="h-20 w-20 rounded-full" />
            )}
            <div>
              <p className="text-2xl font-bold">{selected.name}</p>
              <p className="text-lg text-slate-500">{roleLabel[selected.role]}</p>
            </div>
          </div>

          <div
            className="mb-4 flex h-16 items-center justify-center gap-3 rounded-2xl bg-slate-100"
            aria-label="PIN"
          >
            {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
              <span
                key={index}
                className={`h-5 w-5 rounded-full ${index < pin.length ? 'bg-slate-900' : 'bg-slate-300'}`}
              />
            ))}
          </div>

          {error && (
            <p className="mb-4 rounded-xl bg-red-100 p-3 text-center text-lg font-semibold text-red-800">
              {error}
            </p>
          )}

          <NumericKeypad
            value={pin}
            onChange={setPin}
            allowDecimal={false}
            maxLength={6}
            onConfirm={submit}
            confirmLabel={checking ? 'Revisando…' : 'Entrar'}
            confirmDisabled={pin.length < 4 || checking}
          />

          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPin('');
              setError(null);
            }}
            className="btn btn-neutral mt-4 w-full py-4 text-xl"
          >
            ← Cambiar usuario
          </button>
        </div>
      )}
    </div>
  );
}
