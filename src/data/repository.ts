import type {
  AppUser,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  Customer,
  CustomerPayment,
  CustomerUpdate,
  PaymentMethod,
  Product,
  ProductUpdate,
  ProductLot,
  Promotion,
  PromotionType,
  Purchase,
  PurchaseItem,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Sale,
  SaleItem,
  SaleUnit,
  StockMovement,
  StockMovementType,
  Store,
  StoreUpdate,
  Supplier,
  SupplierSchedule,
  SupplierUpdate,
  SupplierExchange,
  SupplierType,
  SupplierVisit,
  SupplierVisitStatus,
} from '../types/database';

export interface SaleLineInput {
  product_id: string;
  name: string;
  sale_unit: SaleUnit;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  discount_cents: number;
  weight_grams: number | null;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount_cents: number;
  reference: string | null;
}

export interface CheckoutInput {
  store_id: string;
  user_id: string;
  client_uuid: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  lines: SaleLineInput[];
  payments: PaymentInput[];
  /** Cliente del fiado (F-B02); null en ventas normales. */
  customer_id?: string | null;
}

export interface HeldSaleInput {
  store_id: string;
  user_id: string;
  client_uuid: string;
  subtotal_cents: number;
  discount_cents?: number;
  total_cents: number;
  lines: SaleLineInput[];
}

export interface SaleWithItems {
  sale: Sale;
  items: SaleItem[];
}

export interface NewProductInput {
  store_id: string;
  category_id: string | null;
  name: string;
  image_url: string | null;
  sale_unit: SaleUnit;
  price_cents: number;
  cost_cents: number;
  barcode: string | null;
  is_generated_barcode: boolean;
  track_stock: boolean;
  stock_qty: number;
  low_stock_threshold: number;
  created_by: string | null;
  /** Proveedor habitual (F-A01) y marca (F-A09); opcionales. */
  supplier_id?: string | null;
  brand?: string | null;
}

export interface NewSupplierInput {
  store_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  /** local | regional | national (F-A01); por defecto local. */
  type?: SupplierType;
}

export interface PurchaseLineInput {
  product_id: string;
  /** Unidades base: piezas / gramos / mililitros. */
  qty: number;
  unit_cost_cents: number;
  expires_on: string | null;
}

export interface CreatePurchaseInput {
  store_id: string;
  supplier_id: string | null;
  user_id: string | null;
  invoice_ref: string | null;
  invoice_file_url: string | null;
  items: PurchaseLineInput[];
}

export interface StockAdjustmentInput {
  store_id: string;
  product_id: string;
  /** Delta con signo en unidades base (mermas y ajustes). */
  delta: number;
  type: Extract<StockMovementType, 'adjustment' | 'waste'>;
  reason: string;
  user_id: string;
}

export interface StockMovementFilter {
  productId?: string;
  type?: StockMovementType;
  userId?: string;
  from?: string;
  to?: string;
}

export interface PurchaseWithItems {
  purchase: Purchase;
  items: PurchaseItem[];
}

export interface PromotionInput {
  store_id: string;
  product_id: string;
  type: PromotionType;
  min_qty: number;
  discount_cents: number;
  active: boolean;
}

export interface ReportRange {
  from: string;
  to: string;
}

export interface ReportData {
  from: string;
  to: string;
  salesCount: number;
  totalSalesCents: number;
  profitCents: number;
  byDay: { date: string; totalCents: number; count: number }[];
  byPaymentMethod: { method: PaymentMethod; totalCents: number; count: number }[];
  topProducts: { productId: string; name: string; qty: number; totalCents: number }[];
  lowRotation: { productId: string; name: string; qty: number }[];
}

// ------------------------------------------------------------
// v2 · Proveedores: agenda de visitas (F-A02) y hora límite (F-A07)
// ------------------------------------------------------------
export interface SupplierScheduleInput {
  id?: string;
  store_id: string;
  supplier_id: string;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** Hora límite para pedir (HH:MM). */
  order_cutoff_time: string;
  notes: string | null;
}

export interface SupplierVisitInput {
  store_id: string;
  supplier_id: string;
  visit_date: string;
  status: SupplierVisitStatus;
  notes: string | null;
}

// ------------------------------------------------------------
// v2 · Órdenes de compra (F-A06)
// ------------------------------------------------------------
export interface PurchaseOrderLineInput {
  product_id: string;
  qty: number;
  unit_cost_cents: number;
}

export interface CreatePurchaseOrderInput {
  store_id: string;
  supplier_id: string | null;
  user_id: string | null;
  expected_on: string | null;
  notes: string | null;
  items: PurchaseOrderLineInput[];
}

export interface PurchaseOrderWithItems {
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
}

// ------------------------------------------------------------
// v2 · Cambios con proveedor sin costo (F-A04)
// ------------------------------------------------------------
export type SupplierExchangeReason = 'expired' | 'near_expiry';

export interface SupplierExchangeLineInput {
  product_id: string;
  lot_id: string | null;
  qty_returned: number;
  qty_received: number;
  new_expires_on: string | null;
  reason: SupplierExchangeReason;
}

export interface CreateSupplierExchangeInput {
  store_id: string;
  supplier_id: string | null;
  user_id: string;
  notes: string | null;
  items: SupplierExchangeLineInput[];
}

// ------------------------------------------------------------
// v2 · Consumo interno (F-C01)
// ------------------------------------------------------------
export interface InternalUseInput {
  store_id: string;
  product_id: string;
  /** Unidades base a descontar (siempre positivo). */
  qty: number;
  /** Nota obligatoria. */
  reason: string;
  user_id: string;
}

// ------------------------------------------------------------
// v2 · Fiado (F-B01 a F-B06)
// ------------------------------------------------------------
export interface NewCustomerInput {
  store_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  credit_limit_cents: number | null;
}

export interface CustomerPaymentInput {
  store_id: string;
  customer_id: string;
  amount_cents: number;
  method: PaymentMethod;
  cash_session_id: string | null;
  user_id: string | null;
}

/** Venta a crédito con su saldo pendiente (F-B03). */
export interface CreditSale {
  sale: Sale;
  paid_cents: number;
  balance_cents: number;
}

/** Estado de cuenta legible de un cliente (F-B05). */
export interface CustomerStatement {
  customer: Customer;
  sales: CreditSale[];
  payments: CustomerPayment[];
  balance_cents: number;
  /** Saldo con más de 30 días sin abonar (F-B06). */
  overdue_cents: number;
}

export interface OpenCashInput {
  store_id: string;
  user_id: string;
  opening_cents: number;
}

export interface CashSummary {
  opening_cents: number;
  cash_sales_cents: number;
  movements_cents: number;
  expected_cents: number;
}

/**
 * Contrato de acceso a datos de la Fase 1.
 * Implementaciones: local (demostración sin backend) y Supabase (Opción A).
 */
export interface Repository {
  getStore(): Promise<Store>;
  listUsers(): Promise<AppUser[]>;
  verifyPin(userId: string, pin: string): Promise<boolean>;
  /** Establece un PIN nuevo de 4 dígitos validando el PIN actual (C-03). */
  setPin(userId: string, oldPin: string, newPin: string): Promise<boolean>;

  listCategories(): Promise<Category[]>;
  listProducts(): Promise<Product[]>;
  createProduct(input: NewProductInput): Promise<Product>;
  updateProduct(id: string, patch: ProductUpdate): Promise<Product>;
  deactivateProduct(id: string): Promise<void>;

  listSuppliers(): Promise<Supplier[]>;
  createSupplier(input: NewSupplierInput): Promise<Supplier>;
  updateSupplier(id: string, patch: SupplierUpdate): Promise<Supplier>;
  createPurchase(input: CreatePurchaseInput): Promise<PurchaseWithItems>;
  listPurchases(): Promise<PurchaseWithItems[]>;

  adjustStock(input: StockAdjustmentInput): Promise<StockMovement>;
  listStockMovements(filter?: StockMovementFilter): Promise<StockMovement[]>;

  listPromotions(): Promise<Promotion[]>;
  savePromotion(input: PromotionInput): Promise<Promotion>;
  deletePromotion(id: string): Promise<void>;

  listExpiringLots(days: number): Promise<ProductLot[]>;

  getReport(range: ReportRange): Promise<ReportData>;

  updateStore(patch: StoreUpdate): Promise<Store>;

  checkout(input: CheckoutInput): Promise<SaleWithItems>;
  holdSale(input: HeldSaleInput): Promise<SaleWithItems>;
  listHeldSales(storeId: string): Promise<SaleWithItems[]>;
  cancelSale(saleId: string, userId: string, reason: string): Promise<void>;

  // v2 · Agenda de surtidores y visitas (F-A02, F-A07, F-A08)
  listSchedules(storeId: string): Promise<SupplierSchedule[]>;
  saveSchedule(input: SupplierScheduleInput): Promise<SupplierSchedule>;
  deleteSchedule(id: string): Promise<void>;
  listVisits(storeId: string, from: string, to: string): Promise<SupplierVisit[]>;
  markVisit(input: SupplierVisitInput): Promise<SupplierVisit>;

  // v2 · Órdenes de compra (F-A06)
  listPurchaseOrders(storeId: string): Promise<PurchaseOrderWithItems[]>;
  createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithItems>;
  setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder>;

  // v2 · Cambios con proveedor sin costo (F-A04)
  createSupplierExchange(input: CreateSupplierExchangeInput): Promise<SupplierExchange>;

  // v2 · Consumo interno con nota obligatoria (F-C01)
  recordInternalUse(input: InternalUseInput): Promise<StockMovement>;

  // v2 · Fiado (F-B01 a F-B06)
  listCustomers(storeId: string): Promise<Customer[]>;
  createCustomer(input: NewCustomerInput): Promise<Customer>;
  updateCustomer(id: string, patch: CustomerUpdate): Promise<Customer>;
  listCustomerPayments(customerId: string): Promise<CustomerPayment[]>;
  createCustomerPayment(input: CustomerPaymentInput): Promise<CustomerPayment>;
  getCustomerStatement(customerId: string): Promise<CustomerStatement>;

  getOpenCashSession(storeId: string): Promise<CashSession | null>;
  openCashSession(input: OpenCashInput): Promise<CashSession>;
  closeCashSession(sessionId: string, countedCents: number): Promise<CashSession>;
  getCashSummary(sessionId: string): Promise<CashSummary>;
  addCashMovement(
    sessionId: string,
    type: CashMovementType,
    amountCents: number,
    note: string,
  ): Promise<CashMovement>;
  listCashMovements(sessionId: string): Promise<CashMovement[]>;
}
