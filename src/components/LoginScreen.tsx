import { useEffect, useState } from 'react';
import type { AppUser, Store } from '../types/database';
import { repository } from '../data';
import {
  MAX_PIN_ATTEMPTS,
  PIN_LOCK_MS,
  formatLockRemaining,
  isPinLocked,
  pinAttemptsLeft,
} from '../lib/auth';
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
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  /** Estado por usuario para que las tarjetas reflejen el bloqueo sin recargar. */
  const [pinStatus, setPinStatus] = useState<
    Record<string, { attemptsLeft: number; lockedUntil: string | null }>
  >({});
  const [now, setNow] = useState(() => Date.now());

  // El bloqueo se cuenta en segundos; las tarjetas se refrescan más despacio.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), lockedUntil ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const lockActive = Boolean(lockedUntil && new Date(lockedUntil).getTime() > now);
  // Al vencer el bloqueo el contador vuelve a empezar.
  const shownAttempts = lockActive
    ? 0
    : attemptsLeft !== null && attemptsLeft > 0
      ? attemptsLeft
      : MAX_PIN_ATTEMPTS;
  const step = PIN_STEPS[mode];
  const canConfirm =
    !checking && !lockActive && (step.exact ? pin.length === step.maxLength : pin.length >= 1);
  const dots = step.exact ? step.maxLength : Math.max(4, pin.length);

  function selectUser(user: AppUser) {
    const saved = pinStatus[user.id];
    const storedLock = saved?.lockedUntil ?? user.locked_until;
    setSelected(user);
    setMode(user.pin_reset_required ? 'current' : 'login');
    setPin('');
    setOldPin('');
    setNewPin('');
    setError(null);
    setAttemptsLeft(saved?.attemptsLeft ?? pinAttemptsLeft(user));
    setLockedUntil(
      isPinLocked({ failed_attempts: 0, locked_until: storedLock }) ? storedLock : null,
    );
  }

  function resetToUser() {
    setSelected(null);
    setMode('login');
    setPin('');
    setOldPin('');
    setNewPin('');
    setError(null);
    setAttemptsLeft(null);
    setLockedUntil(null);
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
        setAttemptsLeft(MAX_PIN_ATTEMPTS);
        setLockedUntil(null);
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
      // El repositorio es la autoridad; si no responde, se usa el conteo local.
      let left = Math.max(0, (attemptsLeft ?? MAX_PIN_ATTEMPTS) - 1);
      let until: string | null = null;
      try {
        const fresh = (await repository.listUsers()).find((user) => user.id === selected.id);
        if (fresh) {
          left = pinAttemptsLeft(fresh);
          until = isPinLocked(fresh) ? fresh.locked_until : null;
        }
      } catch {
        // Sin conexión no se puede confirmar el estado; se conserva el conteo local.
      }
      if (!until && left <= 0) {
        until = new Date(Date.now() + PIN_LOCK_MS).toISOString();
      }
      setAttemptsLeft(left);
      setNow(Date.now());
      setPinStatus((current) => ({
        ...current,
        [selected.id]: { attemptsLeft: left, lockedUntil: until },
      }));
      if (until) {
        setLockedUntil(until);
        setError(null);
      } else {
        setError(
          left === 1
            ? 'PIN incorrecto. Te queda 1 intento antes del bloqueo.'
            : `PIN incorrecto. Te quedan ${left} intentos.`,
        );
      }
    } catch (cause) {
      setPin('');
      setError(connectionError(cause));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 p-4">
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
          {users.map((user) => {
            const saved = pinStatus[user.id];
            const locked = isPinLocked(
              {
                failed_attempts: 0,
                locked_until: saved?.lockedUntil ?? user.locked_until,
              },
              now,
            );
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => selectUser(user)}
                className={`card flex flex-col items-center gap-2 p-5 hover:border-green-500 ${
                  locked ? 'border-amber-300 bg-amber-50' : ''
                }`}
              >
                {user.photo_url && (
                  <img src={user.photo_url} alt="" className="h-28 w-28 rounded-full" />
                )}
                <span className="text-2xl font-bold">{user.name}</span>
                <span className="text-lg text-slate-500">{roleLabel[user.role]}</span>
                {locked && (
                  <span className="rounded-xl bg-amber-200 px-3 py-1 text-base font-black text-amber-950">
                    🔒 Bloqueado
                  </span>
                )}
              </button>
            );
          })}
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

          <h2 className="mb-1 text-xl font-bold">
            {lockActive ? 'Acceso bloqueado' : step.title}
          </h2>
          <p className="mb-2 text-base text-slate-500">
            {lockActive ? 'Espera a que termine el bloqueo.' : step.hint}
          </p>

          {mode === 'login' && !lockActive && shownAttempts < MAX_PIN_ATTEMPTS && (
            <p
              role="status"
              className="mb-2 rounded-xl bg-amber-100 p-2 text-center text-base font-bold text-amber-950"
            >
              {shownAttempts === 1
                ? 'Te queda 1 intento antes del bloqueo.'
                : `Te quedan ${shownAttempts} intentos antes del bloqueo.`}
            </p>
          )}

          {lockActive && lockedUntil ? (
            <div
              role="alert"
              className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center"
            >
              <p className="text-4xl" aria-hidden="true">
                🔒
              </p>
              <p className="mt-1 text-xl font-black text-amber-950">
                Acceso bloqueado por intentos fallidos
              </p>
              <p className="mt-1 text-lg font-semibold text-amber-900">
                Vuelve a intentar en{' '}
                <strong className="tabular-nums">{formatLockRemaining(lockedUntil, now)}</strong>.
              </p>
              <p className="mt-2 text-base text-amber-900">
                Si no recuerdas tu PIN, avisa al encargado.
              </p>
            </div>
          ) : (
            <>
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
                <p
                  role="alert"
                  className="mb-3 rounded-xl bg-red-100 p-3 text-center text-lg font-semibold text-red-800"
                >
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
            </>
          )}
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
