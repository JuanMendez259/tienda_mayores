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

describe('v2 · fiado, consumo interno, cambios y órdenes', () => {
  async function base() {
    const store = await repo.getStore();
    const users = await repo.listUsers();
    const maria = users.find((u) => u.role === 'owner')!;
    return { store, maria };
  }

  it('registra fiado, abonos y el estado de cuenta (F-B03, F-B04, F-B05)', async () => {
    const { store, maria } = await base();
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;
    const session = await repo.openCashSession({
      store_id: store.id,
      user_id: maria.id,
      opening_cents: 0,
    });

    const customer = await repo.createCustomer({
      store_id: store.id,
      name: 'Doña Juanita',
      phone: '5555555555',
      notes: null,
      credit_limit_cents: 10000,
    });

    await repo.checkout({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'uuid-fiado',
      subtotal_cents: 3200,
      discount_cents: 0,
      total_cents: 3200,
      customer_id: customer.id,
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
      payments: [{ method: 'credit', amount_cents: 3200, reference: null }],
    });

    let statement = await repo.getCustomerStatement(customer.id);
    expect(statement.balance_cents).toBe(3200);
    expect(statement.sales).toHaveLength(1);

    await repo.createCustomerPayment({
      store_id: store.id,
      customer_id: customer.id,
      amount_cents: 1200,
      method: 'cash',
      cash_session_id: session.id,
      user_id: maria.id,
    });

    statement = await repo.getCustomerStatement(customer.id);
    expect(statement.balance_cents).toBe(2000);
    expect(statement.payments).toHaveLength(1);

    // El abono en efectivo entra al corte de caja.
    const summary = await repo.getCashSummary(session.id);
    expect(summary.cash_sales_cents).toBe(1200);

    await expect(
      repo.createCustomerPayment({
        store_id: store.id,
        customer_id: customer.id,
        amount_cents: 0,
        method: 'cash',
        cash_session_id: null,
        user_id: maria.id,
      }),
    ).rejects.toThrow();
  });

  it('bloquea el fiado que supera el límite y lo permite con autorización (F-B06)', async () => {
    const { store, maria } = await base();
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;
    const customer = await repo.createCustomer({
      store_id: store.id,
      name: 'Don Beto',
      phone: null,
      notes: null,
      credit_limit_cents: 5000,
    });
    const line = (qty: number, unit: number) => ({
      product_id: arroz.id,
      name: arroz.name,
      sale_unit: 'piece' as const,
      qty,
      unit_price_cents: unit,
      line_total_cents: qty * unit,
      discount_cents: 0,
      weight_grams: null,
    });

    // Dentro del límite: la venta a fiado pasa.
    await repo.checkout({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'uuid-fb06-1',
      subtotal_cents: 4000,
      discount_cents: 0,
      total_cents: 4000,
      customer_id: customer.id,
      lines: [line(2, 2000)],
      payments: [{ method: 'credit', amount_cents: 4000, reference: null }],
    });
    expect((await repo.getCustomerStatement(customer.id)).balance_cents).toBe(4000);

    // Supera el límite: se rechaza sin autorización.
    await expect(
      repo.checkout({
        store_id: store.id,
        user_id: maria.id,
        client_uuid: 'uuid-fb06-2',
        subtotal_cents: 2000,
        discount_cents: 0,
        total_cents: 2000,
        customer_id: customer.id,
        lines: [line(1, 2000)],
        payments: [{ method: 'credit', amount_cents: 2000, reference: null }],
      }),
    ).rejects.toThrow();

    // Con autorización de dueño/encargado: pasa.
    await repo.checkout({
      store_id: store.id,
      user_id: maria.id,
      client_uuid: 'uuid-fb06-3',
      subtotal_cents: 2000,
      discount_cents: 0,
      total_cents: 2000,
      customer_id: customer.id,
      credit_override: true,
      lines: [line(1, 2000)],
      payments: [{ method: 'credit', amount_cents: 2000, reference: null }],
    });
    expect((await repo.getCustomerStatement(customer.id)).balance_cents).toBe(6000);
  });

  it('registra consumo interno con nota obligatoria (F-C01)', async () => {
    const { store, maria } = await base();
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;
    const stockAntes = arroz.stock_qty;

    await repo.recordInternalUse({
      store_id: store.id,
      product_id: arroz.id,
      qty: 2,
      reason: 'Consumo del personal',
      user_id: maria.id,
    });

    const despues = (await repo.listProducts()).find((p) => p.id === arroz.id)!;
    expect(despues.stock_qty).toBe(stockAntes - 2);

    await expect(
      repo.recordInternalUse({
        store_id: store.id,
        product_id: arroz.id,
        qty: 1,
        reason: '   ',
        user_id: maria.id,
      }),
    ).rejects.toThrow();
  });

  it('registra un cambio con proveedor sin costo (F-A04)', async () => {
    const { store, maria } = await base();
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;

    await repo.createPurchase({
      store_id: store.id,
      supplier_id: null,
      user_id: maria.id,
      invoice_ref: null,
      invoice_file_url: null,
      items: [{ product_id: arroz.id, qty: 6, unit_cost_cents: 2000, expires_on: '2030-01-01' }],
    });
    const lot = (await repo.listExpiringLots(3650)).find((l) => l.product_id === arroz.id)!;

    await repo.createSupplierExchange({
      store_id: store.id,
      supplier_id: null,
      user_id: maria.id,
      notes: 'Producto vencido',
      items: [
        {
          product_id: arroz.id,
          lot_id: lot.id,
          qty_returned: 6,
          qty_received: 6,
          new_expires_on: '2032-01-01',
          reason: 'expired',
        },
      ],
    });

    const lots = (await repo.listExpiringLots(3650)).filter((l) => l.product_id === arroz.id);
    expect(lots.some((l) => l.expires_on === '2032-01-01' && l.qty === 6)).toBe(true);
  });

  it('crea órdenes de compra y cambia su estado (F-A06)', async () => {
    const { store, maria } = await base();
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;

    const created = await repo.createPurchaseOrder({
      store_id: store.id,
      supplier_id: null,
      user_id: maria.id,
      expected_on: null,
      notes: null,
      items: [{ product_id: arroz.id, qty: 10, unit_cost_cents: 2000 }],
    });
    expect(created.order.status).toBe('draft');
    expect(created.items).toHaveLength(1);

    const listed = await repo.listPurchaseOrders(store.id);
    expect(listed).toHaveLength(1);

    const sent = await repo.setPurchaseOrderStatus(created.order.id, 'sent');
    expect(sent.status).toBe('sent');
  });

  it('guarda la agenda de proveedores y sus visitas (F-A02, F-A08)', async () => {
    const { store, maria } = await base();
    const supplier = await repo.createSupplier({
      store_id: store.id,
      name: 'Distribuidora Norte',
      phone: '5551234567',
      notes: null,
      type: 'regional',
    });

    const schedule = await repo.saveSchedule({
      store_id: store.id,
      supplier_id: supplier.id,
      weekday: 1,
      order_cutoff_time: '11:00',
      notes: null,
    });
    expect((await repo.listSchedules(store.id))).toHaveLength(1);

    await repo.deleteSchedule(schedule.id);
    expect((await repo.listSchedules(store.id))).toHaveLength(0);

    await repo.markVisit({
      store_id: store.id,
      supplier_id: supplier.id,
      visit_date: '2026-05-04',
      status: 'done',
      notes: null,
    });
    const visits = await repo.listVisits(store.id, '2026-05-04', '2026-05-04');
    expect(visits).toHaveLength(1);
    expect(visits[0].status).toBe('done');
    expect(visits[0].steps).toEqual({});

    // Pasos de la visita (F-A02): se marcan y se conservan.
    await repo.markVisit({
      store_id: store.id,
      supplier_id: supplier.id,
      visit_date: '2026-05-04',
      status: 'done',
      notes: null,
      steps: { inventory: true, order: true },
    });
    const withSteps = await repo.listVisits(store.id, '2026-05-04', '2026-05-04');
    expect(withSteps).toHaveLength(1);
    expect(withSteps[0].steps).toEqual({ inventory: true, order: true });
    void maria;
  });

  it('lista los cambios con proveedor para el historial (F-A08)', async () => {
    const { store, maria } = await base();
    const arroz = (await repo.listProducts()).find((p) => p.id === 'prd-arroz')!;
    const supplier = await repo.createSupplier({
      store_id: store.id,
      name: 'Distribuidora Sur',
      phone: null,
      notes: null,
      type: 'local',
    });

    await repo.createPurchase({
      store_id: store.id,
      supplier_id: supplier.id,
      user_id: maria.id,
      invoice_ref: null,
      invoice_file_url: null,
      items: [{ product_id: arroz.id, qty: 4, unit_cost_cents: 2000, expires_on: '2030-01-01' }],
    });
    const lot = (await repo.listExpiringLots(3650)).find((l) => l.product_id === arroz.id)!;

    await repo.createSupplierExchange({
      store_id: store.id,
      supplier_id: supplier.id,
      user_id: maria.id,
      notes: 'Producto vencido',
      items: [
        {
          product_id: arroz.id,
          lot_id: lot.id,
          qty_returned: 4,
          qty_received: 4,
          new_expires_on: '2032-01-01',
          reason: 'expired',
        },
      ],
    });

    const list = await repo.listSupplierExchanges(store.id);
    expect(list).toHaveLength(1);
    expect(list[0].exchange.supplier_id).toBe(supplier.id);
    expect(list[0].items).toHaveLength(1);
  });
});

describe('F-401 · categorías del catálogo', () => {
  it('crea, lista, edita y da de baja categorías', async () => {
    const store = await repo.getStore();
    const before = await repo.listCategories();

    const created = await repo.createCategory({
      store_id: store.id,
      name: 'Botanas',
      color: '#ffedd5',
    });
    expect(created.name).toBe('Botanas');
    expect(created.active).toBe(true);

    const listed = await repo.listCategories();
    expect(listed).toHaveLength(before.length + 1);
    // Se ordenan por sort_order.
    expect(listed[listed.length - 1].id).toBe(created.id);

    const renamed = await repo.updateCategory(created.id, { name: 'Botanas y dulces' });
    expect(renamed.name).toBe('Botanas y dulces');

    await repo.updateCategory(created.id, { active: false });
    const after = await repo.listCategories();
    expect(after.some((c) => c.id === created.id)).toBe(false);
  });

  it('rechaza editar una categoría inexistente', async () => {
    await expect(repo.updateCategory('no-existe', { name: 'X' })).rejects.toThrow();
  });
});
