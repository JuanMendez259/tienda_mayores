/**
 * Tipos de la base de datos — FASE 1: Base.
 * Reflejan 1:1 supabase/migrations/0001_init_phase1.sql (snake_case).
 *
 * REGLAS DE DATOS [Requisito]:
 *  - Todo monto es un ENTERO en centavos (ej. $10.50 -> 1050).
 *  - Peso en GRAMOS enteros; volumen en MILILITROS enteros.
 *  - Fechas: string ISO 8601 UTC (timestamptz de PostgreSQL).
 */

/** Entero en centavos de MXN. Nunca decimales flotantes. */
export type Cents = number;
/** Entero en gramos. */
export type Grams = number;
/** Entero en mililitros. */
export type Milliliters = number;

// ------------------------------------------------------------
// Enumeraciones (espejo de los tipos ENUM de PostgreSQL)
// ------------------------------------------------------------
export type UserRole = 'owner' | 'manager' | 'cashier';
export type SaleUnit = 'piece' | 'weight' | 'volume';
export type SaleStatus = 'open' | 'held' | 'paid' | 'cancelled';
export type StockMovementType = 'sale' | 'purchase' | 'adjustment' | 'waste' | 'return';
export type PaymentMethod = 'cash' | 'card_clip' | 'mercadopago_qr' | 'mercadopago_terminal';
export type CashMovementType = 'withdrawal' | 'deposit';
export type FontSize = 'normal' | 'grande' | 'muy_grande';
export type PromotionType = 'bogo' | 'qty_discount';

/** Secciones que el dueño puede mostrar u ocultar (F-703). */
export interface StoreModules {
  discounts: boolean;
  inventory: boolean;
  movements: boolean;
  photos: boolean;
  purchases: boolean;
  suppliers: boolean;
}

// ------------------------------------------------------------
// Filas (Row)
// ------------------------------------------------------------
export interface Store {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string; // default 'America/Mexico_City'
  ticket_footer: string | null;
  font_size: FontSize;
  primary_color: string;
  discount_requires_manager: boolean;
  modules: StoreModules;
  /** Días de aviso de caducidad: 7, 15 o 30 (F-505). */
  expiry_alert_days: number;
  /** Ancho del papel de la impresora térmica: 58 u 80 mm (F-301, 8.3). */
  ticket_width_mm: number;
  /** Prefijo de país para el enlace de WhatsApp (F-302, 8.4). */
  whatsapp_country_code: string;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  store_id: string;
  name: string;
  photo_url: string | null;
  role: UserRole;
  /** Hash del PIN (bcrypt vía pgcrypto). NUNCA el PIN en claro. */
  pin_hash: string;
  active: boolean;
  /** Intentos fallidos consecutivos de PIN (límite de intentos). */
  failed_attempts: number;
  /** Bloqueo temporal hasta esta fecha UTC, o null si no está bloqueado. */
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
  color: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  image_url: string | null;
  sale_unit: SaleUnit;
  /** Precio por pieza, por kg o por litro según sale_unit. */
  price_cents: Cents;
  cost_cents: Cents;
  barcode: string | null;
  is_generated_barcode: boolean;
  track_stock: boolean;
  /** Unidades base: piezas / gramos / mililitros (entero). */
  stock_qty: number;
  low_stock_threshold: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  store_id: string;
  product_id: string;
  type: StockMovementType;
  /** Delta CON SIGNO en unidades base (negativo = salida). */
  qty: number;
  reason: string | null;
  user_id: string | null;
  sale_id: string | null;
  /** Lote afectado (F-505), o null. */
  lot_id: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  store_id: string;
  number: number;
  user_id: string;
  status: SaleStatus;
  subtotal_cents: Cents;
  discount_cents: Cents;
  total_cents: Cents;
  created_at: string;
  paid_at: string | null;
  synced_at: string | null;
  /** Idempotencia de ventas offline (Fase 3). */
  client_uuid: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  unit_price_cents: Cents;
  line_total_cents: Cents;
  /** Descuento aplicado a este renglón (F-112). */
  discount_cents: Cents;
  /** Gramos (weight) o mililitros (volume); null en 'piece'. */
  weight_grams: Grams | Milliliters | null;
}

export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount_cents: Cents;
  reference: string | null;
  created_at: string;
}

export interface CashSession {
  id: string;
  store_id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cents: Cents;
  expected_cents: Cents | null;
  counted_cents: Cents | null;
  difference_cents: Cents | null;
}

export interface CashMovement {
  id: string;
  cash_session_id: string;
  type: CashMovementType;
  amount_cents: Cents;
  note: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  store_id: string | null;
  user_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  store_id: string;
  supplier_id: string | null;
  user_id: string | null;
  total_cents: Cents;
  invoice_ref: string | null;
  invoice_file_url: string | null;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  /** Unidades base: piezas / gramos / mililitros. */
  qty: number;
  unit_cost_cents: Cents;
  /** Caducidad opcional en formato YYYY-MM-DD. */
  expires_on: string | null;
}

export interface Promotion {
  id: string;
  store_id: string;
  product_id: string;
  type: PromotionType;
  min_qty: number;
  discount_cents: Cents;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductLot {
  id: string;
  store_id: string;
  product_id: string;
  qty: number;
  /** Caducidad en formato YYYY-MM-DD, o null si no caduca. */
  expires_on: string | null;
  received_at: string;
  supplier_id: string | null;
  purchase_id: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------
// Tipos Insert / Update
// Columnas con default o generadas por la BD son opcionales al insertar.
// ------------------------------------------------------------
type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;
type Update<T> = Partial<T>;

export type StoreInsert = Insert<Store, 'id' | 'timezone' | 'created_at' | 'updated_at' | 'logo_url' | 'ticket_footer' | 'font_size' | 'primary_color' | 'discount_requires_manager' | 'modules' | 'expiry_alert_days' | 'ticket_width_mm' | 'whatsapp_country_code'>;
export type StoreUpdate = Update<Store>;

export type AppUserInsert = Insert<
  AppUser,
  'id' | 'role' | 'active' | 'created_at' | 'updated_at' | 'photo_url' | 'failed_attempts' | 'locked_until'
>;
export type AppUserUpdate = Update<AppUser>;

export type CategoryInsert = Insert<Category, 'id' | 'sort_order' | 'active' | 'created_at' | 'updated_at' | 'image_url' | 'color'>;
export type CategoryUpdate = Update<Category>;

export type ProductInsert = Insert<
  Product,
  | 'id' | 'sale_unit' | 'cost_cents' | 'barcode' | 'is_generated_barcode' | 'track_stock'
  | 'stock_qty' | 'low_stock_threshold' | 'active' | 'created_by' | 'created_at' | 'updated_at'
  | 'image_url' | 'category_id'
>;
export type ProductUpdate = Update<Product>;

export type StockMovementInsert = Insert<StockMovement, 'id' | 'created_at' | 'reason' | 'user_id' | 'sale_id'>;
export type StockMovementUpdate = Update<StockMovement>;

export type SaleInsert = Insert<
  Sale,
  | 'id' | 'number' | 'status' | 'subtotal_cents' | 'discount_cents' | 'total_cents'
  | 'created_at' | 'paid_at' | 'synced_at' | 'client_uuid'
>;
export type SaleUpdate = Update<Sale>;

export type SaleItemInsert = Insert<SaleItem, 'id' | 'qty' | 'discount_cents' | 'weight_grams'>;
export type SaleItemUpdate = Update<SaleItem>;

export type PaymentInsert = Insert<Payment, 'id' | 'created_at' | 'reference'>;
export type PaymentUpdate = Update<Payment>;

export type CashSessionInsert = Insert<
  CashSession,
  'id' | 'opened_at' | 'closed_at' | 'opening_cents' | 'expected_cents' | 'counted_cents' | 'difference_cents'
>;
export type CashSessionUpdate = Update<CashSession>;

export type CashMovementInsert = Insert<CashMovement, 'id' | 'created_at' | 'note'>;
export type CashMovementUpdate = Update<CashMovement>;

export type AuditLogInsert = Insert<AuditLog, 'id' | 'created_at' | 'store_id' | 'user_id' | 'entity_id' | 'before' | 'after'>;
export type AuditLogUpdate = Update<AuditLog>;

export type SupplierInsert = Insert<Supplier, 'id' | 'active' | 'created_at' | 'updated_at' | 'phone' | 'notes'>;
export type SupplierUpdate = Update<Supplier>;

export type PurchaseInsert = Insert<Purchase, 'id' | 'user_id' | 'total_cents' | 'invoice_ref' | 'invoice_file_url' | 'created_at' | 'supplier_id'>;
export type PurchaseUpdate = Update<Purchase>;

export type PurchaseItemInsert = Insert<PurchaseItem, 'id' | 'unit_cost_cents' | 'expires_on'>;
export type PurchaseItemUpdate = Update<PurchaseItem>;

export type PromotionInsert = Insert<Promotion, 'id' | 'min_qty' | 'discount_cents' | 'active' | 'created_at' | 'updated_at'>;
export type PromotionUpdate = Update<Promotion>;

export type ProductLotInsert = Insert<ProductLot, 'id' | 'qty' | 'expires_on' | 'received_at' | 'supplier_id' | 'purchase_id' | 'created_at' | 'updated_at'>;
export type ProductLotUpdate = Update<ProductLot>;

/** Mapa de tablas -> Row/Insert/Update (para tipar el cliente de Supabase). */
export interface Database {
  public: {
    Tables: {
      store:          { Row: Store;         Insert: StoreInsert;         Update: StoreUpdate };
      app_user:       { Row: AppUser;       Insert: AppUserInsert;       Update: AppUserUpdate };
      category:       { Row: Category;      Insert: CategoryInsert;      Update: CategoryUpdate };
      product:        { Row: Product;       Insert: ProductInsert;       Update: ProductUpdate };
      stock_movement: { Row: StockMovement; Insert: StockMovementInsert; Update: StockMovementUpdate };
      sale:           { Row: Sale;          Insert: SaleInsert;          Update: SaleUpdate };
      sale_item:      { Row: SaleItem;      Insert: SaleItemInsert;      Update: SaleItemUpdate };
      payment:        { Row: Payment;       Insert: PaymentInsert;       Update: PaymentUpdate };
      cash_session:   { Row: CashSession;   Insert: CashSessionInsert;   Update: CashSessionUpdate };
      cash_movement:  { Row: CashMovement;  Insert: CashMovementInsert;  Update: CashMovementUpdate };
      audit_log:      { Row: AuditLog;      Insert: AuditLogInsert;      Update: AuditLogUpdate };
      supplier:       { Row: Supplier;      Insert: SupplierInsert;      Update: SupplierUpdate };
      purchase:       { Row: Purchase;      Insert: PurchaseInsert;      Update: PurchaseUpdate };
      purchase_item:  { Row: PurchaseItem;  Insert: PurchaseItemInsert;  Update: PurchaseItemUpdate };
      promotion:      { Row: Promotion;     Insert: PromotionInsert;     Update: PromotionUpdate };
      product_lot:    { Row: ProductLot;    Insert: ProductLotInsert;    Update: ProductLotUpdate };
    };
    Functions: {
      /** Valida el PIN y aplica el límite de intentos. Solo backend. */
      verify_pin: { Args: { p_user_id: string; p_pin: string }; Returns: boolean };
    };
  };
}
