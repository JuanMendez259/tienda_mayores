import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalRepository } from './localRepository';
import type { Repository } from './repository';

let repo: Repository;

beforeEach(() => {
  repo = createLocalRepository();
});

describe('flujo de caja y venta (repositorio local)', () => {
  it('abre caja, cobra por pieza y por peso, descuenta inventario y calcula el corte', async () => {
    const store = await repo.getStore();
    const users = await repo.listUsers();
    const maria = users.find((u) => u.role === 'owner')!;

    // PIN correcto e incorrecto
    expect(await repo.verifyPin(maria.id, '0000')).toBe(false);
    expect(await repo.verifyPin(maria.id, '1234')).toBe(true);

    const session = await repo.openCashSession({
      store_id: store.id,
      user_id: maria.id,
      opening_cents: 50000,
    });
    expect(session.opening_cents).toBe(50000);

    const products = await repo.listProducts();
    const arroz = products.find((p) => p.id === 'prd-arroz')!;
    const jitomate = products.find((p) => p.id === 'prd-jitomate')!;
    const stockArroz = arroz.stock_qty;
    const stockJitomate = jitomate.stock_qty;

    const result = await repo.checkout({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'test-uuid-1',
      subtotal_cents: 10013,
      discount_cents: 0,
      total_cents: 10013,
      lines: [
        {
          product_id: arroz.id,
          name: arroz.name,
          sale_unit: 'piece',
          qty: 2,
          unit_price_cents: 3200,
          line_total_cents: 6400,
          discount_cents: 0,
          weight_grams: null,
        },
        {
          product_id: jitomate.id,
          name: jitomate.name,
          sale_unit: 'weight',
          qty: 1,
          unit_price_cents: 2890,
          line_total_cents: 3613,
          discount_cents: 0,
          weight_grams: 1250,
        },
      ],
      payments: [{ method: 'cash', amount_cents: 10013, reference: null }],
    });

    expect(result.sale.status).toBe('paid');
    expect(result.items).toHaveLength(2);

    const after = await repo.listProducts();
    expect(after.find((p) => p.id === arroz.id)!.stock_qty).toBe(stockArroz - 2);
    expect(after.find((p) => p.id === jitomate.id)!.stock_qty).toBe(stockJitomate - 1250);

    const summary = await repo.getCashSummary(session.id);
    expect(summary.cash_sales_cents).toBe(10013);
    expect(summary.expected_cents).toBe(60013);

    const closed = await repo.closeCashSession(session.id, 60000);
    expect(closed.expected_cents).toBe(60013);
    expect(closed.difference_cents).toBe(-13);
  });

  it('guarda ventas en espera sin descontar inventario y permite cancelarlas', async () => {
    const store = await repo.getStore();
    const users = await repo.listUsers();
    const maria = users[0];
    const products = await repo.listProducts();
    const agua = products.find((p) => p.id === 'prd-agua')!;
    const stockAntes = agua.stock_qty;

    const held = await repo.holdSale({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'test-uuid-2',
      subtotal_cents: 1800,
      total_cents: 1800,
      lines: [
        {
          product_id: agua.id,
          name: agua.name,
          sale_unit: 'piece',
          qty: 1,
          unit_price_cents: 1800,
          line_total_cents: 1800,
          discount_cents: 0,
          weight_grams: null,
        },
      ],
    });
    expect(held.sale.status).toBe('held');

    const stillSame = (await repo.listProducts()).find((p) => p.id === agua.id)!.stock_qty;
    expect(stillSame).toBe(stockAntes);

    const list = await repo.listHeldSales(store.id);
    expect(list.some((entry) => entry.sale.id === held.sale.id)).toBe(true);

    await repo.cancelSale(held.sale.id, maria.id, 'Prueba');
    const afterCancel = await repo.listHeldSales(store.id);
    expect(afterCancel.some((entry) => entry.sale.id === held.sale.id)).toBe(false);
  });
});

describe('control de la Fase 3 (lotes, promociones, reportes)', () => {
  it('crea un lote al comprar y lo consume en FEFO al vender', async () => {
    const store = await repo.getStore();
    const users = await repo.listUsers();
    const maria = users[0];
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;

    await repo.createPurchase({
      store_id: store.id,
      supplier_id: null,
      user_id: maria.id,
      invoice_ref: 'F-001',
      invoice_file_url: null,
      items: [{ product_id: arroz.id, qty: 5, unit_cost_cents: 2000, expires_on: '2030-01-01' }],
    });

    const lots = await repo.listExpiringLots(3650);
    const lot = lots.find((l) => l.product_id === arroz.id)!;
    expect(lot.qty).toBe(5);
    expect(lot.expires_on).toBe('2030-01-01');

    await repo.checkout({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'uuid-fefo',
      subtotal_cents: 6400,
      discount_cents: 0,
      total_cents: 6400,
      lines: [
        {
          product_id: arroz.id,
          name: arroz.name,
          sale_unit: 'piece',
          qty: 2,
          unit_price_cents: 3200,
          line_total_cents: 6400,
          discount_cents: 0,
          weight_grams: null,
        },
      ],
      payments: [{ method: 'cash', amount_cents: 6400, reference: null }],
    });

    const afterLot = (await repo.listExpiringLots(3650)).find((l) => l.product_id === arroz.id)!;
    expect(afterLot.qty).toBe(3);
  });

  it('no duplica la venta al reenviar el mismo client_uuid', async () => {
    const store = await repo.getStore();
    const users = await repo.listUsers();
    const maria = users[0];
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;
    const stockAntes = arroz.stock_qty;

    const input = {
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'uuid-idempotente',
      subtotal_cents: 3200,
      discount_cents: 0,
      total_cents: 3200,
      lines: [
        {
          product_id: arroz.id,
          name: arroz.name,
          sale_unit: 'piece' as const,
          qty: 1,
          unit_price_cents: 3200,
          line_total_cents: 3200,
          discount_cents: 0,
          weight_grams: null,
        },
      ],
      payments: [{ method: 'cash' as const, amount_cents: 3200, reference: null }],
    };

    const first = await repo.checkout(input);
    const second = await repo.checkout(input);
    expect(second.sale.id).toBe(first.sale.id);

    const stockDespues = (await repo.listProducts()).find((p) => p.id === arroz.id)!.stock_qty;
    expect(stockDespues).toBe(stockAntes - 1);
  });

  it('guarda y lista promociones, y calcula el reporte del periodo', async () => {
    const store = await repo.getStore();
    const users = await repo.listUsers();
    const maria = users[0];
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;

    const promo = await repo.savePromotion({
      store_id: store.id,
      product_id: arroz.id,
      type: 'bogo',
      min_qty: 2,
      discount_cents: 0,
      active: true,
    });
    expect((await repo.listPromotions())).toHaveLength(1);

    await repo.checkout({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'uuid-reporte',
      subtotal_cents: 3200,
      discount_cents: 0,
      total_cents: 3200,
      lines: [
        {
          product_id: arroz.id,
          name: arroz.name,
          sale_unit: 'piece',
          qty: 1,
          unit_price_cents: 3200,
          line_total_cents: 3200,
          discount_cents: 0,
          weight_grams: null,
        },
      ],
      payments: [{ method: 'cash', amount_cents: 3200, reference: null }],
    });

    const report = await repo.getReport({
      from: '2000-01-01T00:00:00Z',
      to: '2100-01-01T00:00:00Z',
    });
    expect(report.salesCount).toBe(1);
    expect(report.totalSalesCents).toBe(3200);
    expect(report.topProducts[0].name).toBe(arroz.name);
    expect(report.byPaymentMethod[0].method).toBe('cash');

    await repo.deletePromotion(promo.id);
    expect(await repo.listPromotions()).toHaveLength(0);
  });
});

describe('C-03 · PIN de 4 dígitos con cambio obligatorio', () => {
  it('cambia el PIN validando el actual y exige exactamente 4 dígitos', async () => {
    const users = await repo.listUsers();
    const maria = users.find((u) => u.role === 'owner')!;

    // PIN actual incorrecto -> no cambia.
    expect(await repo.setPin(maria.id, '0000', '5678')).toBe(false);
    // El nuevo PIN debe tener exactamente 4 dígitos.
    expect(await repo.setPin(maria.id, '1234', '123')).toBe(false);
    expect(await repo.setPin(maria.id, '1234', '12345')).toBe(false);
    // Cambio correcto.
    expect(await repo.setPin(maria.id, '1234', '5678')).toBe(true);
    expect(await repo.verifyPin(maria.id, '1234')).toBe(false);
    expect(await repo.verifyPin(maria.id, '5678')).toBe(true);
  });
});
