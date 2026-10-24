import { describe, expect, it } from 'vitest';
import {
  MAX_PIN_ATTEMPTS,
  PIN_LOCK_MS,
  formatLockRemaining,
  isPinLocked,
  pinAttemptsLeft,
} from './auth';

const NOW = new Date('2026-10-23T12:00:00Z').getTime();

describe('intentos y bloqueo de PIN (C-03)', () => {
  it('marca bloqueado solo mientras corre el plazo', () => {
    const future = new Date(NOW + 60_000).toISOString();
    const past = new Date(NOW - 1).toISOString();
    expect(isPinLocked({ failed_attempts: 0, locked_until: future }, NOW)).toBe(true);
    expect(isPinLocked({ failed_attempts: 0, locked_until: past }, NOW)).toBe(false);
    expect(isPinLocked({ failed_attempts: 0, locked_until: null }, NOW)).toBe(false);
  });

  it('cuenta los intentos que quedan y no baja de cero', () => {
    expect(pinAttemptsLeft({ failed_attempts: 0 })).toBe(MAX_PIN_ATTEMPTS);
    expect(pinAttemptsLeft({ failed_attempts: 3 })).toBe(MAX_PIN_ATTEMPTS - 3);
    expect(pinAttemptsLeft({ failed_attempts: 99 })).toBe(0);
  });

  it('formatea la cuenta regresiva en minutos y segundos', () => {
    const until = new Date(NOW + PIN_LOCK_MS).toISOString();
    expect(formatLockRemaining(until, NOW)).toBe('5 min 00 s');
    expect(formatLockRemaining(new Date(NOW + 65_000).toISOString(), NOW)).toBe('1 min 05 s');
    expect(formatLockRemaining(new Date(NOW + 9_000).toISOString(), NOW)).toBe('9 s');
    expect(formatLockRemaining(new Date(NOW - 1_000).toISOString(), NOW)).toBe('0 s');
  });
});
