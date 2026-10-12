import { beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutInput } from '../data/repository';
import {
  clearPendingSales,
  enqueueSale,
  listPendingSales,
  pendingCount,
  removePendingSale,
} from './offlineQueue';

function input(uuid: string): CheckoutInput {
  return {
    store_id: 's1',
    user_id: 'u1',
    client_uuid: uuid,
    subtotal_cents: 1000,
    discount_cents: 0,
    total_cents: 1000,
    lines: [],
    payments: [],
  };
}

beforeEach(async () => {
  await clearPendingSales();
});

describe('cola de ventas sin conexión (F-704)', () => {
  it('guarda, lista y cuenta ventas pendientes', async () => {
    await enqueueSale(input('a'));
    await enqueueSale(input('b'));
    expect(await pendingCount()).toBe(2);
    const list = await listPendingSales();
    expect(list.map((e) => e.client_uuid)).toEqual(['a', 'b']);
  });

  it('no duplica el mismo client_uuid', async () => {
    await enqueueSale(input('a'));
    await enqueueSale(input('a'));
    expect(await pendingCount()).toBe(1);
  });

  it('quita una venta ya sincronizada', async () => {
    await enqueueSale(input('a'));
    await removePendingSale('a');
    expect(await pendingCount()).toBe(0);
  });
});
