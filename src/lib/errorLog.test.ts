import { beforeEach, describe, expect, it } from 'vitest';
import { clearErrors, listErrors, logError } from './errorLog';

beforeEach(() => {
  clearErrors();
});

describe('registro de errores (F-706)', () => {
  it('guarda el mensaje y el contexto, más recientes primero', () => {
    logError(new Error('falló algo'), 'checkout');
    logError('texto simple');
    const entries = listErrors();
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe('texto simple');
    expect(entries[1].message).toBe('falló algo');
    expect(entries[1].context).toBe('checkout');
  });

  it('limita la cantidad de errores guardados', () => {
    for (let i = 0; i < 60; i += 1) logError(`error ${i}`);
    expect(listErrors()).toHaveLength(50);
  });

  it('limpia el registro', () => {
    logError('x');
    clearErrors();
    expect(listErrors()).toHaveLength(0);
  });
});
