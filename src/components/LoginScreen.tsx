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

/** Pasos del acceso. `login` es el normal; el resto es el cambio de PIN (C-03). */
type PinMode = 'login' | 'current' | 'new' | 'confirm';

const PIN_STEPS: Record<
  PinMode,
  { title: string; hint: string; maxLength: number; confirm: string; exact: boolean }
> = {
  login: { title: 'Escribe tu PIN', hint: 'Son 4 números', maxLength: 4, confirm: 'Entrar', exact: true },
  current: { title: 'Escribe tu PIN actual', hint: 'El que usabas antes', maxLength: 8, confirm: 'Continuar', exact: false },
  new: { title: 'Elige tu nuevo PIN', hint: '4 números, fáciles de recordar', maxLength: 4, confirm: 'Continuar', exact: true },
  confirm: { title: 'Repite tu nuevo PIN', hint: 'Otra vez los mismos 4', maxLength: 4, confirm: 'Guardar', exact: true },
};

function connectionError(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? `No se pudo verificar el PIN: ${cause.message}`
    : 'No se pudo conectar con el servidor. Revisa la red e intenta de nuevo.';
}

/** Selección de usuario por foto + PIN numérico de 4 dígitos (Sección 3, C-03). */
export function LoginScreen({ store, users, onLogin }: LoginScreenProps) {
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [mode, setMode] = useState<PinMode>('login');
  const [pin, setPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const step = PIN_STEPS[mode];
  const canConfirm = !checking && (step.exact ? pin.length === step.maxLength : pin.length >= 1);
  const dots = step.exact ? step.maxLength : Math.max(4, pin.length);

  function selectUser(user: AppUser) {
    setSelected(user);
    setMode(user.pin_reset_required ? 'current' : 'login');
    setPin('');
    setOldPin('');
    setNewPin('');
    setError(null);
  }

  function resetToUser() {
    setSelected(null);
    setMode('login');
    setPin('');
    setOldPin('');
    setNewPin('');
    setError(null);
  }

  async function submit() {
    if (!selected || !canConfirm) return;
    setError(null);

    // Los pasos 'new' y 'confirm' solo comparan y guardan: no llaman al servidor.
    if (mode === 'new') {
      setNewPin(pin);
      setPin('');
      setMode('confirm');
      return;
    }
    if (mode === 'confirm') {
      if (pin !== newPin) {
        setPin('');
        setError('Los PIN no coinciden. Escríbelo otra vez.');
        setMode('new');
        return;
      }
      setChecking(true);
      try {
        const ok = await repository.setPin(selected.id, oldPin, newPin);
        if (ok) {
          onLogin({ ...selected, pin_reset_required: false });
          return;
        }
        setError('No se pudo cambiar el PIN. Intenta de nuevo.');
      } catch (cause) {
        setError(connectionError(cause));
      } finally {
        setChecking(false);
      }
      return;
    }

    // 'login' y 'current': se verifica el PIN escrito.
    setChecking(true);
    try {
      const ok = await repository.verifyPin(selected.id, pin);
      if (ok) {
        if (mode === 'current') {
          setOldPin(pin);
          setPin('');
          setMode('new');
          return;
        }
        onLogin(selected);
        return;
      }
      setPin('');
      setError('PIN incorrecto. Vuelve a intentarlo.');
    } catch (cause) {
      setPin('');
      setError(connectionError(cause));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
      <header className="mb-2 flex flex-col items-center">
        {store.logo_url && (
          <img src={store.logo_url} alt="" className="mb-1 h-14 w-14 rounded-2xl" />
        )}
        <h1 className="title text-center text-2xl">{store.name}</h1>
        <p className="text-lg text-slate-600">
          {!selected
            ? 'Selecciona tu nombre'
            : mode === 'login'
              ? 'Escribe tu PIN y toca Entrar'
              : 'Vamos a poner un PIN nuevo de 4 dígitos'}
        </p>
      </header>

      {!selected ? (
        <div className="grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => selectUser(user)}
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
        <div className="card mx-auto w-full max-w-md p-4 py-3 sm:p-6">
          <div className="mb-2 flex items-center gap-3">
            {selected.photo_url && (
              <img src={selected.photo_url} alt="" className="h-14 w-14 rounded-full" />
            )}
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold">{selected.name}</p>
              <p className="text-lg text-slate-500">{roleLabel[selected.role]}</p>
            </div>
          </div>

          {mode !== 'login' && (
            <p className="mb-2 rounded-xl bg-blue-50 p-2 text-center text-base font-semibold text-blue-800">
              🔒 Por seguridad, elige un PIN nuevo de 4 números.
            </p>
          )}

          <h2 className="mb-1 text-xl font-bold">{step.title}</h2>
          <p className="mb-2 text-base text-slate-500">{step.hint}</p>

          <div
            className="mb-3 flex h-14 items-center justify-center gap-3 rounded-2xl bg-slate-100"
            aria-label="PIN"
          >
            {Array.from({ length: dots }).map((_, index) => (
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
            maxLength={step.maxLength}
            onConfirm={submit}
            confirmLabel={checking ? 'Revisando…' : step.confirm}
            confirmDisabled={!canConfirm}
          />

          <button
            type="button"
            onClick={resetToUser}
            className="btn btn-neutral mt-2 w-full py-3 text-xl"
          >
            ← Cambiar usuario
          </button>
        </div>
      )}
    </div>
  );
}
