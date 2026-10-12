import type {
  AppUser,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  PaymentMethod,
  Product,
  ProductUpdate,
  ProductLot,
  Promotion,
  PromotionType,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  SaleUnit,
  StockMovement,
  StockMovementType,
  Store,
  StoreUpdate,
  Supplier,
  SupplierUpdate,
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
}

export interface NewSupplierInput {
  store_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
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
