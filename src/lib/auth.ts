import type { AppUser } from '../types/database';

/** Intentos fallidos antes de bloquear el acceso (C-03). */
export const MAX_PIN_ATTEMPTS = 5;
/** Duración del bloqueo tras agotar los intentos. */
export const PIN_LOCK_MS = 5 * 60 * 1000;

type PinStatusUser = Pick<AppUser, 'failed_attempts' | 'locked_until'>;

/** ¿El usuario sigue bloqueado por intentos fallidos? */
export function isPinLocked(user: PinStatusUser, now = Date.now()): boolean {
  if (!user.locked_until) return false;
  const until = new Date(user.locked_until).getTime();
  return Number.isFinite(until) && until > now;
}

/** Intentos que le quedan antes del bloqueo. */
export function pinAttemptsLeft(user: Pick<AppUser, 'failed_attempts'>): number {
  return Math.max(0, MAX_PIN_ATTEMPTS - user.failed_attempts);
}

/** "4 min 05 s" o "35 s" para el aviso de bloqueo. */
export function formatLockRemaining(lockedUntil: string, now = Date.now()): string {
  const until = new Date(lockedUntil).getTime();
  const ms = Number.isFinite(until) ? Math.max(0, until - now) : 0;
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} s`;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}
