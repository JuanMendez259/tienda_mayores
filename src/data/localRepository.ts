import type {
  AppUser,
  AuditLog,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  Customer,
  CustomerPayment,
  CustomerUpdate,
  Payment,
  PaymentMethod,
  Product,
  ProductUpdate,
  ProductLot,
  Promotion,
  Purchase,
  PurchaseItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  StockMovement,
  Store,
  StoreUpdate,
  Supplier,
  SupplierExchange,
  SupplierExchangeItem,
  SupplierSchedule,
  SupplierUpdate,
  SupplierVisit,
} from '../types/database';
import { uid } from '../lib/uid';
import type {
  CashSummary,
  CheckoutInput,
  CreatePurchaseInput,
  CreatePurchaseOrderInput,
  CreateSupplierExchangeInput,
  CustomerPaymentInput,
  CustomerStatement,
  HeldSaleInput,
  InternalUseInput,
  NewCustomerInput,
  NewProductInput,
  NewSupplierInput,
  OpenCashInput,
  PromotionInput,
  PurchaseOrderWithItems,
  ReportRange,
  Repository,
  SaleWithItems,
  StockAdjustmentInput,
  StockMovementFilter,
  SupplierScheduleInput,
  SupplierVisitInput,
} from './repository';
import {
  DEMO_STORE_ID,
  seedCategories,
  seedPins,
  seedProducts,
  seedStore,
  seedUsers,
} from './seed';

const nowIso = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);

/**
 * Repositorio local en memoria (demostración/pruebas sin backend).
 * Mantiene las mismas reglas que la base de datos: centavos enteros,
 * gramos/ml enteros y descuento automático de inventario.
 */
function createLocalRepository(): Repository {
  const store: Store = clone(seedStore);
  const users: AppUser[] = clone(seedUsers);
  const categories: Category[] = clone(seedCategories);
  const products = new Map<string, Product>(clone(seedProducts).map((p) => [p.id, p]));

  const sales = new Map<string, Sale>();
  const itemsBySale = new Map<string, SaleItem[]>();
  const paymentsBySale = new Map<string, Payment[]>();
  const cashSessions = new Map<string, CashSession>();
  const cashMovements = new Map<string, CashMovement[]>();
  const suppliers = new Map<string, Supplier>();
  const purchases = new Map<string, Purchase>();
  const purchaseItems = new Map<string, PurchaseItem[]>();
  const promotions = new Map<string, Promotion>(); // por product_id (único)
  const lots = new Map<string, ProductLot>();
  const schedules = new Map<string, SupplierSchedule>();
  const visits = new Map<string, SupplierVisit>();
  const purchaseOrders = new Map<string, PurchaseOrder>();
  const purchaseOrderItems = new Map<string, PurchaseOrderItem[]>();
  const exchanges = new Map<string, SupplierExchange>();
  const exchangeItems = new Map<string, SupplierExchangeItem[]>();
  const customers = new Map<string, Customer>();
  const customerPayments = new Map<string, CustomerPayment[]>();
  const auditLogs: AuditLog[] = [];
  const stockMovements: StockMovement[] = [];
  // C-05: el inventario inicial cuenta como movimiento para que
  // stock = suma de movimientos cuadre desde el arranque (demo).
  for (const product of products.values()) {
    if (product.track_stock && product.stock_qty !== 0) {
      stockMovements.push({
        id: `seed-baseline-${product.id}`,
        store_id: product.store_id,
        product_id: product.id,
        type: 'adjustment',
        qty: product.stock_qty,
        reason: 'Inventario inicial',
        user_id: null,
        sale_id: null,
        lot_id: null,
        created_at: '2026-01-01T00:00:00Z',
      });
    }
  }
  let saleCounter = 0;

  function stockDelta(item: SaleItem): number {
    return item.weight_grams != null ? -item.weight_grams : -item.qty;
  }

  /** Consume lotes en orden FEFO (primero en caducar) para una salida (F-505). */
  function consumeLotsFefo(productId: string, qtyBase: number): void {
    let remaining = qtyBase;
    const productLots = [...lots.values()]
      .filter((lot) => lot.product_id === productId && lot.qty > 0)
      .sort((a, b) => {
        const ae = a.expires_on ?? '9999-12-31';
        const be = b.expires_on ?? '9999-12-31';
        if (ae !== be) return ae < be ? -1 : 1;
        return a.received_at.localeCompare(b.received_at);
      });
    for (const lot of productLots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty, remaining);
      lots.set(lot.id, { ...lot, qty: lot.qty - take, updated_at: nowIso() });
      remaining -= take;
    }
  }

  function persistSale(
    base: Omit<Sale, 'id' | 'number' | 'created_at'>,
    input: SaleWithItems['items'],
    payments: Payment[],
  ): SaleWithItems {
    saleCounter += 1;
    const sale: Sale = {
      ...base,
      id: uid(),
      number: saleCounter,
      created_at: nowIso(),
    };
    sales.set(sale.id, sale);
    const items: SaleItem[] = input.map((item) => ({ ...item, id: uid(), sale_id: sale.id }));
    itemsBySale.set(sale.id, items);
    paymentsBySale.set(sale.id, payments.map((p) => ({ ...p, sale_id: sale.id })));

    if (sale.status === 'paid') {
      for (const item of items) {
        const product = products.get(item.product_id);
        if (product && product.track_stock) {
          product.stock_qty = Math.max(0, product.stock_qty + stockDelta(item));
        }
        consumeLotsFefo(item.product_id, Math.abs(stockDelta(item)));
        stockMovements.push({
          id: uid(),
          store_id: sale.store_id,
          product_id: item.product_id,
          type: 'sale',
          qty: stockDelta(item),
          reason: `Venta #${sale.number}`,
          user_id: sale.user_id,
          sale_id: sale.id,
          lot_id: null,
          created_at: nowIso(),
        });
      }
    }
    return { sale: clone(sale), items: clone(items) };
  }

  function buildItems(input: CheckoutInput | HeldSaleInput): SaleItem[] {
    return input.lines.map((line) => ({
      id: '',
      sale_id: '',
      product_id: line.product_id,
      qty: line.qty,
      unit_price_cents: line.unit_price_cents,
      line_total_cents: line.line_total_cents,
      discount_cents: line.discount_cents,
      weight_grams: line.weight_grams,
    }));
  }

  function findOpenSession(storeId: string): CashSession | null {
    const open = [...cashSessions.values()].find(
      (s) => s.store_id === storeId && s.closed_at === null,
    );
    return open ? clone(open) : null;
  }

  function cashSummary(sessionId: string): CashSummary {
    const session = cashSessions.get(sessionId);
    if (!session) throw new Error('Sesión de caja no encontrada');
    const cashSales = [...sales.values()]
      .filter(
        (s) =>
          s.store_id === session.store_id &&
          s.status === 'paid' &&
          s.paid_at !== null &&
          s.paid_at >= session.opened_at,
      )
      .flatMap((s) => paymentsBySale.get(s.id) ?? [])
      .filter((p) => p.method === 'cash')
      .reduce((acc, p) => acc + p.amount_cents, 0);
    // Abonos de fiado cobrados en efectivo dentro de esta sesión (F-B04).
    const creditCash = [...customerPayments.values()]
      .flat()
      .filter((p) => p.cash_session_id === sessionId && p.method === 'cash')
      .reduce((acc, p) => acc + p.amount_cents, 0);
    const totalCashSales = cashSales + creditCash;
    const movements = (cashMovements.get(sessionId) ?? []).reduce(
      (acc, m) => acc + (m.type === 'deposit' ? m.amount_cents : -m.amount_cents),
      0,
    );
    return {
      opening_cents: session.opening_cents,
      cash_sales_cents: totalCashSales,
      movements_cents: movements,
      expected_cents: session.opening_cents + totalCashSales + movements,
    };
  }

  /** Verifica el PIN y aplica el límite de intentos (5 fallos -> 5 min). */
  function checkPin(userId: string, pin: string): boolean {
    const user = users.find((u) => u.id === userId && u.active);
    if (!user) return false;
    if (user.locked_until && new Date(user.locked_until) > new Date()) return false;
    if (seedPins[userId] === pin) {
      user.failed_attempts = 0;
      user.locked_until = null;
      return true;
    }
    user.failed_attempts += 1;
    if (user.failed_attempts >= 5) {
      user.locked_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      user.failed_attempts = 0;
    }
    return false;
  }

  return {
    async getStore() {
      return clone(store);
    },
    async listUsers() {
      return clone(users.filter((u) => u.active));
    },
    async verifyPin(userId, pin) {
      return checkPin(userId, pin);
    },
    async setPin(userId, oldPin, newPin) {
      if (!/^\d{4}$/.test(newPin)) return false;
      if (!checkPin(userId, oldPin)) return false;
      const user = users.find((u) => u.id === userId);
      if (!user) return false;
      seedPins[userId] = newPin;
      user.pin_reset_required = false;
      user.updated_at = nowIso();
      return true;
    },

    async listCategories() {
      return clone(categories.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order));
    },
    async listProducts() {
      return clone([...products.values()].filter((p) => p.active));
    },
    async createProduct(input: NewProductInput) {
      const product: Product = {
        ...input,
        supplier_id: input.supplier_id ?? null,
        brand: input.brand ?? null,
        id: uid(),
        active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      products.set(product.id, product);
      // C-05: el inventario inicial queda como movimiento de ajuste.
      if (product.track_stock && product.stock_qty !== 0) {
        stockMovements.push({
          id: uid(),
          store_id: product.store_id,
          product_id: product.id,
          type: 'adjustment',
          qty: product.stock_qty,
          reason: 'Inventario inicial',
          user_id: input.created_by,
          sale_id: null,
          lot_id: null,
          created_at: nowIso(),
        });
      }
      return clone(product);
    },
    async updateProduct(id: string, patch: ProductUpdate) {
      const current = products.get(id);
      if (!current) throw new Error('Producto no encontrado');
      const updated: Product = { ...current, ...patch, updated_at: nowIso() };
      products.set(id, updated);
      // C-05: un cambio manual de existencias queda como movimiento de ajuste.
      if (patch.stock_qty !== undefined && patch.stock_qty !== current.stock_qty) {
        stockMovements.push({
          id: uid(),
          store_id: updated.store_id,
          product_id: id,
          type: 'adjustment',
          qty: patch.stock_qty - current.stock_qty,
          reason: 'Ajuste manual de inventario',
          user_id: null,
          sale_id: null,
          lot_id: null,
          created_at: nowIso(),
        });
      }
      return clone(updated);
    },
    async deactivateProduct(id: string) {
      const current = products.get(id);
      if (!current) return;
      products.set(id, { ...current, active: false, updated_at: nowIso() });
    },

    async listSuppliers() {
      return clone(
        [...suppliers.values()]
          .filter((s) => s.active)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    async createSupplier(input: NewSupplierInput) {
      const supplier: Supplier = {
        ...input,
        type: input.type ?? 'local',
        id: uid(),
        active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      suppliers.set(supplier.id, supplier);
      return clone(supplier);
    },
    async updateSupplier(id: string, patch: SupplierUpdate) {
      const current = suppliers.get(id);
      if (!current) throw new Error('Proveedor no encontrado');
      const updated: Supplier = { ...current, ...patch, updated_at: nowIso() };
      suppliers.set(id, updated);
      return clone(updated);
    },
    async createPurchase(input: CreatePurchaseInput) {
      const purchase: Purchase = {
        id: uid(),
        store_id: input.store_id,
        supplier_id: input.supplier_id,
        user_id: input.user_id,
        total_cents: 0,
        invoice_ref: input.invoice_ref,
        invoice_file_url: input.invoice_file_url,
        created_at: nowIso(),
      };
      const items: PurchaseItem[] = input.items.map((item) => ({
        id: uid(),
        purchase_id: purchase.id,
        product_id: item.product_id,
        qty: item.qty,
        unit_cost_cents: item.unit_cost_cents,
        expires_on: item.expires_on,
      }));
      // El costo es por unidad de venta (pieza / kg / L); el total usa la
      // cantidad de venta equivalente a la cantidad base capturada.
      purchase.total_cents = items.reduce((acc, item) => {
        const unit = products.get(item.product_id)?.sale_unit ?? 'piece';
        const saleQty = unit === 'piece' ? item.qty : item.qty / 1000;
        return acc + Math.round(item.unit_cost_cents * saleQty);
      }, 0);
      purchases.set(purchase.id, purchase);
      purchaseItems.set(purchase.id, items);
      for (const item of items) {
        const product = products.get(item.product_id);
        if (product) {
          products.set(item.product_id, {
            ...product,
            stock_qty: product.stock_qty + item.qty,
            cost_cents: item.unit_cost_cents || product.cost_cents,
            updated_at: nowIso(),
          });
        }
        const lot: ProductLot = {
          id: uid(),
          store_id: purchase.store_id,
          product_id: item.product_id,
          qty: item.qty,
          expires_on: item.expires_on,
          received_at: purchase.created_at,
          supplier_id: purchase.supplier_id,
          purchase_id: purchase.id,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        lots.set(lot.id, lot);
        stockMovements.push({
          id: uid(),
          store_id: purchase.store_id,
          product_id: item.product_id,
          type: 'purchase',
          qty: item.qty,
          reason: `Compra ${purchase.invoice_ref ?? purchase.id.slice(0, 8)}`,
          user_id: purchase.user_id,
          sale_id: null,
          lot_id: lot.id,
          created_at: nowIso(),
        });
      }
      return { purchase: clone(purchase), items: clone(items) };
    },
    async listPurchases() {
      return [...purchases.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((purchase) => ({
          purchase: clone(purchase),
          items: clone(purchaseItems.get(purchase.id) ?? []),
        }));
    },

    async adjustStock(input: StockAdjustmentInput) {
      const product = products.get(input.product_id);
      if (!product) throw new Error('Producto no encontrado');
      products.set(input.product_id, {
        ...product,
        stock_qty: Math.max(0, product.stock_qty + input.delta),
        updated_at: nowIso(),
      });
      const movement: StockMovement = {
        id: uid(),
        store_id: input.store_id,
        product_id: input.product_id,
        type: input.type,
        qty: input.delta,
        reason: input.reason,
        user_id: input.user_id,
        sale_id: null,
        lot_id: null,
        created_at: nowIso(),
      };
      stockMovements.push(movement);
      if (input.delta < 0) consumeLotsFefo(input.product_id, -input.delta);
      return clone(movement);
    },
    async listStockMovements(filter?: StockMovementFilter) {
      return clone(
        stockMovements
          .filter((movement) => {
            if (filter?.productId && movement.product_id !== filter.productId) return false;
            if (filter?.type && movement.type !== filter.type) return false;
            if (filter?.userId && movement.user_id !== filter.userId) return false;
            if (filter?.from && movement.created_at < filter.from) return false;
            if (filter?.to && movement.created_at > filter.to) return false;
            return true;
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    },

    async listPromotions() {
      return clone([...promotions.values()]);
    },
    async savePromotion(input: PromotionInput) {
      const current = promotions.get(input.product_id);
      const promotion: Promotion = {
        id: current?.id ?? uid(),
        store_id: input.store_id,
        product_id: input.product_id,
        type: input.type,
        min_qty: input.min_qty,
        discount_cents: input.discount_cents,
        active: input.active,
        created_at: current?.created_at ?? nowIso(),
        updated_at: nowIso(),
      };
      promotions.set(promotion.product_id, promotion);
      return clone(promotion);
    },
    async deletePromotion(id: string) {
      for (const [productId, promotion] of promotions) {
        if (promotion.id === id) promotions.delete(productId);
      }
    },

    async listExpiringLots(days: number) {
      const limit = new Date();
      limit.setDate(limit.getDate() + days);
      const limitIso = limit.toISOString().slice(0, 10);
      return clone(
        [...lots.values()]
          .filter((lot) => lot.qty > 0 && lot.expires_on !== null && lot.expires_on <= limitIso)
          .sort((a, b) => (a.expires_on ?? '').localeCompare(b.expires_on ?? '')),
      );
    },

    async getReport(range: ReportRange) {
      const paid = [...sales.values()].filter(
        (s) =>
          s.status === 'paid' &&
          s.created_at >= range.from &&
          s.created_at <= range.to,
      );
      const byDayMap = new Map<string, { totalCents: number; count: number }>();
      const byMethodMap = new Map<PaymentMethod, { totalCents: number; count: number }>();
      const byProduct = new Map<string, { qty: number; totalCents: number }>();
      let totalSalesCents = 0;
      let profitCents = 0;

      for (const sale of paid) {
        totalSalesCents += sale.total_cents;
        const day = sale.created_at.slice(0, 10);
        const dayEntry = byDayMap.get(day) ?? { totalCents: 0, count: 0 };
        dayEntry.totalCents += sale.total_cents;
        dayEntry.count += 1;
        byDayMap.set(day, dayEntry);

        for (const payment of paymentsBySale.get(sale.id) ?? []) {
          const methodEntry = byMethodMap.get(payment.method) ?? { totalCents: 0, count: 0 };
          methodEntry.totalCents += payment.amount_cents;
          methodEntry.count += 1;
          byMethodMap.set(payment.method, methodEntry);
        }

        for (const item of itemsBySale.get(sale.id) ?? []) {
          const product = products.get(item.product_id);
          const saleQty = item.weight_grams != null ? item.weight_grams / 1000 : item.qty;
          const entry = byProduct.get(item.product_id) ?? { qty: 0, totalCents: 0 };
          entry.qty += saleQty;
          entry.totalCents += item.line_total_cents - item.discount_cents;
          byProduct.set(item.product_id, entry);

          const cost = (product?.cost_cents ?? 0) * saleQty;
          profitCents += (item.line_total_cents - item.discount_cents) - cost;
        }
      }

      const productsSorted = [...byProduct.entries()]
        .map(([productId, value]) => ({
          productId,
          name: products.get(productId)?.name ?? 'Producto',
          qty: value.qty,
          totalCents: value.totalCents,
        }))
        .sort((a, b) => b.qty - a.qty);

      const soldIds = new Set(byProduct.keys());
      const notSold = [...products.values()]
        .filter((p) => p.active && !soldIds.has(p.id))
        .map((p) => ({ productId: p.id, name: p.name, qty: 0 }));
      const lowRotation = [
        ...productsSorted.slice(-10).reverse(),
        ...notSold,
      ].slice(0, 10);

      return {
        from: range.from,
        to: range.to,
        salesCount: paid.length,
        totalSalesCents,
        profitCents,
        byDay: [...byDayMap.entries()]
          .map(([date, value]) => ({ date, ...value }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        byPaymentMethod: [...byMethodMap.entries()].map(([method, value]) => ({ method, ...value })),
        topProducts: productsSorted.slice(0, 10),
        lowRotation,
      };
    },

    async updateStore(patch: StoreUpdate) {
      Object.assign(store, patch, { updated_at: nowIso() });
      return clone(store);
    },

    async checkout(input: CheckoutInput) {
      // Idempotencia de ventas offline: si ya existe el client_uuid, devolver la venta.
      const existing = [...sales.values()].find((s) => s.client_uuid === input.client_uuid);
      if (existing) {
        return { sale: clone(existing), items: clone(itemsBySale.get(existing.id) ?? []) };
      }
      // Pagos combinados (F-204): la suma de los pagos debe igualar el total.
      const paidCents = input.payments.reduce((acc, payment) => acc + payment.amount_cents, 0);
      if (paidCents !== input.total_cents) {
        throw new Error('La suma de los pagos no coincide con el total de la venta.');
      }
      const base: Omit<Sale, 'id' | 'number' | 'created_at'> = {
        store_id: input.store_id,
        user_id: input.user_id,
        status: 'paid',
        subtotal_cents: input.subtotal_cents,
        discount_cents: input.discount_cents,
        total_cents: input.total_cents,
        paid_at: nowIso(),
        synced_at: nowIso(),
        client_uuid: input.client_uuid,
        customer_id: input.customer_id ?? null,
      };
      const payments: Payment[] = input.payments.map((p) => ({
        id: uid(),
        sale_id: '',
        method: p.method,
        amount_cents: p.amount_cents,
        reference: p.reference,
        created_at: nowIso(),
      }));
      return persistSale(base, buildItems(input), payments);
    },

    async holdSale(input: HeldSaleInput) {
      const base: Omit<Sale, 'id' | 'number' | 'created_at'> = {
        store_id: input.store_id,
        user_id: input.user_id,
        status: 'held',
        subtotal_cents: input.subtotal_cents,
        discount_cents: input.discount_cents ?? 0,
        total_cents: input.total_cents,
        paid_at: null,
        synced_at: nowIso(),
        client_uuid: input.client_uuid,
        customer_id: null,
      };
      return persistSale(base, buildItems(input), []);
    },

    async listHeldSales(storeId: string) {
      return [...sales.values()]
        .filter((s) => s.store_id === storeId && s.status === 'held')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((sale) => ({ sale: clone(sale), items: clone(itemsBySale.get(sale.id) ?? []) }));
    },

    async cancelSale(saleId: string, userId: string, reason: string) {
      const sale = sales.get(saleId);
      if (!sale) return;
      const before = clone(sale);
      sale.status = 'cancelled';
      auditLogs.push({
        id: uid(),
        store_id: sale.store_id,
        user_id: userId,
        entity: 'sale',
        entity_id: sale.id,
        action: 'cancel',
        before: before as unknown as Record<string, unknown>,
        after: clone(sale) as unknown as Record<string, unknown>,
        created_at: nowIso(),
      });
      void reason;
    },

    async getOpenCashSession(storeId: string) {
      return findOpenSession(storeId);
    },
    async openCashSession(input: OpenCashInput) {
      const existing = findOpenSession(input.store_id);
      if (existing) return existing;
      const session: CashSession = {
        id: uid(),
        store_id: input.store_id,
        user_id: input.user_id,
        opened_at: nowIso(),
        closed_at: null,
        opening_cents: input.opening_cents,
        expected_cents: null,
        counted_cents: null,
        difference_cents: null,
      };
      cashSessions.set(session.id, session);
      cashMovements.set(session.id, []);
      return clone(session);
    },
    async getCashSummary(sessionId: string): Promise<CashSummary> {
      return cashSummary(sessionId);
    },
    async closeCashSession(sessionId: string, countedCents: number) {
      const session = cashSessions.get(sessionId);
      if (!session) throw new Error('Sesión de caja no encontrada');
      const summary = cashSummary(sessionId);
      session.expected_cents = summary.expected_cents;
      session.counted_cents = countedCents;
      session.difference_cents = countedCents - summary.expected_cents;
      session.closed_at = nowIso();
      return clone(session);
    },
    async addCashMovement(
      sessionId: string,
      type: CashMovementType,
      amountCents: number,
      note: string,
    ) {
      const movement: CashMovement = {
        id: uid(),
        cash_session_id: sessionId,
        type,
        amount_cents: amountCents,
        note,
        created_at: nowIso(),
      };
      cashMovements.set(sessionId, [...(cashMovements.get(sessionId) ?? []), movement]);
      return clone(movement);
    },
    async listCashMovements(sessionId: string) {
      return clone(cashMovements.get(sessionId) ?? []);
    },

    // ----------------------------------------------------------
    // v2 · Agenda de surtidores y visitas (F-A02, F-A07, F-A08)
    // ----------------------------------------------------------
    async listSchedules(storeId: string) {
      return clone([...schedules.values()].filter((s) => s.store_id === storeId));
    },
    async saveSchedule(input: SupplierScheduleInput) {
      const existing = input.id ? schedules.get(input.id) : undefined;
      const schedule: SupplierSchedule = {
        id: input.id ?? uid(),
        store_id: input.store_id,
        supplier_id: input.supplier_id,
        weekday: input.weekday,
        order_cutoff_time: input.order_cutoff_time,
        notes: input.notes,
        created_at: existing?.created_at ?? nowIso(),
      };
      schedules.set(schedule.id, schedule);
      return clone(schedule);
    },
    async deleteSchedule(id: string) {
      schedules.delete(id);
    },
    async listVisits(storeId: string, from: string, to: string) {
      return clone(
        [...visits.values()].filter(
          (v) => v.store_id === storeId && v.visit_date >= from && v.visit_date <= to,
        ),
      );
    },
    async markVisit(input: SupplierVisitInput) {
      const existing = [...visits.values()].find(
        (v) => v.supplier_id === input.supplier_id && v.visit_date === input.visit_date,
      );
      if (existing) {
        const updated: SupplierVisit = { ...existing, ...input };
        visits.set(updated.id, updated);
        return clone(updated);
      }
      const visit: SupplierVisit = { id: uid(), created_at: nowIso(), ...input };
      visits.set(visit.id, visit);
      return clone(visit);
    },

    // ----------------------------------------------------------
    // v2 · Órdenes de compra (F-A06)
    // ----------------------------------------------------------
    async listPurchaseOrders(storeId: string): Promise<PurchaseOrderWithItems[]> {
      return [...purchaseOrders.values()]
        .filter((order) => order.store_id === storeId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((order) => ({
          order: clone(order),
          items: clone(purchaseOrderItems.get(order.id) ?? []),
        }));
    },
    async createPurchaseOrder(input: CreatePurchaseOrderInput) {
      const order: PurchaseOrder = {
        id: uid(),
        store_id: input.store_id,
        supplier_id: input.supplier_id,
        status: 'draft',
        user_id: input.user_id,
        expected_on: input.expected_on,
        notes: input.notes,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const items: PurchaseOrderItem[] = input.items.map((item) => ({
        id: uid(),
        purchase_order_id: order.id,
        product_id: item.product_id,
        qty: item.qty,
        unit_cost_cents: item.unit_cost_cents,
      }));
      purchaseOrders.set(order.id, order);
      purchaseOrderItems.set(order.id, items);
      return { order: clone(order), items: clone(items) };
    },
    async setPurchaseOrderStatus(id: string, status) {
      const order = purchaseOrders.get(id);
      if (!order) throw new Error('Orden de compra no encontrada');
      const updated: PurchaseOrder = { ...order, status, updated_at: nowIso() };
      purchaseOrders.set(id, updated);
      return clone(updated);
    },

    // ----------------------------------------------------------
    // v2 · Cambios con proveedor sin costo (F-A04)
    // ----------------------------------------------------------
    async createSupplierExchange(input: CreateSupplierExchangeInput) {
      const exchange: SupplierExchange = {
        id: uid(),
        store_id: input.store_id,
        supplier_id: input.supplier_id,
        visit_id: null,
        user_id: input.user_id,
        notes: input.notes,
        created_at: nowIso(),
      };
      exchanges.set(exchange.id, exchange);
      const created: SupplierExchangeItem[] = [];
      for (const item of input.items) {
        const product = products.get(item.product_id);
        if (item.qty_returned > 0) {
          if (item.lot_id) {
            const lot = lots.get(item.lot_id);
            if (lot) {
              lots.set(lot.id, {
                ...lot,
                qty: Math.max(0, lot.qty - item.qty_returned),
                updated_at: nowIso(),
              });
            }
          }
          if (product?.track_stock) {
            product.stock_qty = Math.max(0, product.stock_qty - item.qty_returned);
          }
        }
        if (item.qty_received > 0 && product?.track_stock) {
          product.stock_qty += item.qty_received;
          const newLot: ProductLot = {
            id: uid(),
            store_id: input.store_id,
            product_id: item.product_id,
            qty: item.qty_received,
            expires_on: item.new_expires_on,
            received_at: nowIso(),
            supplier_id: input.supplier_id,
            purchase_id: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          };
          lots.set(newLot.id, newLot);
        }
        created.push({
          id: uid(),
          exchange_id: exchange.id,
          product_id: item.product_id,
          lot_id: item.lot_id,
          qty_returned: item.qty_returned,
          qty_received: item.qty_received,
          new_expires_on: item.new_expires_on,
          reason: item.reason,
        });
        if (item.qty_returned > 0) {
          stockMovements.push({
            id: uid(),
            store_id: input.store_id,
            product_id: item.product_id,
            type: 'supplier_exchange_out',
            qty: -item.qty_returned,
            reason: 'Cambio con proveedor (sale)',
            user_id: input.user_id,
            sale_id: null,
            lot_id: item.lot_id,
            created_at: nowIso(),
          });
        }
        if (item.qty_received > 0) {
          stockMovements.push({
            id: uid(),
            store_id: input.store_id,
            product_id: item.product_id,
            type: 'supplier_exchange_in',
            qty: item.qty_received,
            reason: 'Cambio con proveedor (entra)',
            user_id: input.user_id,
            sale_id: null,
            lot_id: null,
            created_at: nowIso(),
          });
        }
      }
      exchangeItems.set(exchange.id, created);
      return clone(exchange);
    },

    // ----------------------------------------------------------
    // v2 · Consumo interno (F-C01)
    // ----------------------------------------------------------
    async recordInternalUse(input: InternalUseInput) {
      if (!input.reason.trim()) {
        throw new Error('La nota es obligatoria para el consumo interno.');
      }
      const product = products.get(input.product_id);
      if (product?.track_stock) {
        product.stock_qty = Math.max(0, product.stock_qty - input.qty);
      }
      consumeLotsFefo(input.product_id, input.qty);
      const movement: StockMovement = {
        id: uid(),
        store_id: input.store_id,
        product_id: input.product_id,
        type: 'internal_use',
        qty: -input.qty,
        reason: input.reason,
        user_id: input.user_id,
        sale_id: null,
        lot_id: null,
        created_at: nowIso(),
      };
      stockMovements.push(movement);
      return clone(movement);
    },

    // ----------------------------------------------------------
    // v2 · Fiado (F-B01 a F-B06)
    // ----------------------------------------------------------
    async listCustomers(storeId: string) {
      return clone(
        [...customers.values()]
          .filter((c) => c.store_id === storeId && c.active)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    async createCustomer(input: NewCustomerInput) {
      const customer: Customer = {
        id: uid(),
        store_id: input.store_id,
        name: input.name,
        phone: input.phone,
        notes: input.notes,
        credit_limit_cents: input.credit_limit_cents,
        active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      customers.set(customer.id, customer);
      return clone(customer);
    },
    async updateCustomer(id: string, patch: CustomerUpdate) {
      const current = customers.get(id);
      if (!current) throw new Error('Cliente no encontrado');
      const updated: Customer = { ...current, ...patch, updated_at: nowIso() };
      customers.set(id, updated);
      return clone(updated);
    },
    async listCustomerPayments(customerId: string) {
      return clone(customerPayments.get(customerId) ?? []);
    },
    async createCustomerPayment(input: CustomerPaymentInput) {
      if (input.amount_cents <= 0) throw new Error('El abono debe ser mayor a cero.');
      const payment: CustomerPayment = {
        id: uid(),
        store_id: input.store_id,
        customer_id: input.customer_id,
        amount_cents: input.amount_cents,
        method: input.method,
        cash_session_id: input.cash_session_id,
        user_id: input.user_id,
        created_at: nowIso(),
      };
      customerPayments.set(input.customer_id, [
        ...(customerPayments.get(input.customer_id) ?? []),
        payment,
      ]);
      return clone(payment);
    },
    async getCustomerStatement(customerId: string): Promise<CustomerStatement> {
      const customer = customers.get(customerId);
      if (!customer) throw new Error('Cliente no encontrado');
      const creditSales = [...sales.values()]
        .filter((s) => s.customer_id === customerId && s.status === 'paid')
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const payments = customerPayments.get(customerId) ?? [];
      let remainingPaid = payments.reduce((acc, p) => acc + p.amount_cents, 0);
      const now = Date.now();
      let balance = 0;
      let overdue = 0;
      const withBalance: CustomerStatement['sales'] = creditSales.map((sale) => {
        const applied = Math.min(remainingPaid, sale.total_cents);
        remainingPaid -= applied;
        const saleBalance = sale.total_cents - applied;
        balance += saleBalance;
        const ageDays = (now - new Date(sale.created_at).getTime()) / 86400000;
        if (ageDays > 30 && saleBalance > 0) overdue += saleBalance;
        return {
          sale: clone(sale),
          paid_cents: applied,
          balance_cents: saleBalance,
          age_days: Math.floor(ageDays),
          items: clone(itemsBySale.get(sale.id) ?? []),
        };
      });
      return {
        customer: clone(customer),
        sales: withBalance,
        payments: clone(payments),
        balance_cents: balance,
        overdue_cents: overdue,
      };
    },
  };
}

export const localRepository: Repository = createLocalRepository();
export { DEMO_STORE_ID, createLocalRepository };
