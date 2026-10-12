import type {
  AppUser,
  AuditLog,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  Payment,
  Product,
  ProductUpdate,
  Sale,
  SaleItem,
  StockMovement,
  Store,
} from '../types/database';
import { uid } from '../lib/uid';
import type {
  CashSummary,
  CheckoutInput,
  HeldSaleInput,
  NewProductInput,
  OpenCashInput,
  Repository,
  SaleWithItems,
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
  const auditLogs: AuditLog[] = [];
  const stockMovements: StockMovement[] = [];
  let saleCounter = 0;

  function stockDelta(item: SaleItem): number {
    return item.weight_grams != null ? -item.weight_grams : -item.qty;
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
        stockMovements.push({
          id: uid(),
          store_id: sale.store_id,
          product_id: item.product_id,
          type: 'sale',
          qty: stockDelta(item),
          reason: `Venta #${sale.number}`,
          user_id: sale.user_id,
          sale_id: sale.id,
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
    const movements = (cashMovements.get(sessionId) ?? []).reduce(
      (acc, m) => acc + (m.type === 'deposit' ? m.amount_cents : -m.amount_cents),
      0,
    );
    return {
      opening_cents: session.opening_cents,
      cash_sales_cents: cashSales,
      movements_cents: movements,
      expected_cents: session.opening_cents + cashSales + movements,
    };
  }

  return {
    async getStore() {
      return clone(store);
    },
    async listUsers() {
      return clone(users.filter((u) => u.active));
    },
    async verifyPin(userId, pin) {
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
        id: uid(),
        active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      products.set(product.id, product);
      return clone(product);
    },
    async updateProduct(id: string, patch: ProductUpdate) {
      const current = products.get(id);
      if (!current) throw new Error('Producto no encontrado');
      const updated: Product = { ...current, ...patch, updated_at: nowIso() };
      products.set(id, updated);
      return clone(updated);
    },

    async checkout(input: CheckoutInput) {
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
        discount_cents: 0,
        total_cents: input.total_cents,
        paid_at: null,
        synced_at: nowIso(),
        client_uuid: input.client_uuid,
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
  };
}

export const localRepository: Repository = createLocalRepository();
export { DEMO_STORE_ID, createLocalRepository };
