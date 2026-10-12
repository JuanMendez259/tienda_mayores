import type {
  AppUser,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  PaymentMethod,
  Product,
  ProductUpdate,
  Sale,
  SaleItem,
  SaleUnit,
  Store,
} from '../types/database';

export interface SaleLineInput {
  product_id: string;
  name: string;
  sale_unit: SaleUnit;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
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
