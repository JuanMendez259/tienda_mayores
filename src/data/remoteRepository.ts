import type {
  AppUser,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  CategoryUpdate,
  Customer,
  CustomerPayment,
  CustomerUpdate,
  Product,
  ProductUpdate,
  ProductLot,
  Promotion,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockMovement,
  Store,
  StoreUpdate,
  Supplier,
  SupplierExchange,
  SupplierSchedule,
  SupplierUpdate,
  SupplierVisit,
} from '../types/database';
import { supabase } from './client';
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
  NewCategoryInput,
  NewProductInput,
  NewSupplierInput,
  OpenCashInput,
  PromotionInput,
  PurchaseOrderWithItems,
  PurchaseWithItems,
  ReportData,
  ReportRange,
  Repository,
  SaleWithItems,
  StockAdjustmentInput,
  StockMovementFilter,
  SupplierExchangeWithItems,
  SupplierScheduleInput,
  SupplierVisitInput,
} from './repository';

/** Tiempo máximo por llamada al servidor antes de abortar (evita cuelgues). */
const REQUEST_TIMEOUT_MS = 15000;

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado');
  const { data, error } = await supabase.functions.invoke('pos', {
    body: { action, ...payload },
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (error) throw new Error(error.message || `No se pudo conectar con el servidor (${action})`);
  return data as T;
}

/** Repositorio remoto (Opción A). Todo pasa por la Edge Function `pos`. */
export const remoteRepository: Repository = {
  getStore: () => call<Store>('getStore'),
  listUsers: () => call<AppUser[]>('listUsers'),
  verifyPin: (userId, pin) => call<boolean>('verifyPin', { userId, pin }),
  setPin: (userId, oldPin, newPin) => call<boolean>('setPin', { userId, oldPin, newPin }),

  listCategories: () => call<Category[]>('listCategories'),
  createCategory: (input: NewCategoryInput) => call<Category>('createCategory', { input }),
  updateCategory: (id: string, patch: CategoryUpdate) =>
    call<Category>('updateCategory', { id, patch }),
  listProducts: () => call<Product[]>('listProducts'),
  createProduct: (input: NewProductInput) => call<Product>('createProduct', { input }),
  updateProduct: (id: string, patch: ProductUpdate) =>
    call<Product>('updateProduct', { id, patch }),
  deactivateProduct: (id: string) => call<void>('deactivateProduct', { id }),

  listSuppliers: () => call<Supplier[]>('listSuppliers'),
  createSupplier: (input: NewSupplierInput) => call<Supplier>('createSupplier', { input }),
  updateSupplier: (id: string, patch: SupplierUpdate) =>
    call<Supplier>('updateSupplier', { id, patch }),
  createPurchase: (input: CreatePurchaseInput) => call<PurchaseWithItems>('createPurchase', { input }),
  listPurchases: () => call<PurchaseWithItems[]>('listPurchases'),

  adjustStock: (input: StockAdjustmentInput) => call<StockMovement>('adjustStock', { input }),
  listStockMovements: (filter?: StockMovementFilter) =>
    call<StockMovement[]>('listStockMovements', { filter: filter ?? {} }),

  listPromotions: () => call<Promotion[]>('listPromotions'),
  savePromotion: (input: PromotionInput) => call<Promotion>('savePromotion', { input }),
  deletePromotion: (id: string) => call<void>('deletePromotion', { id }),
  listExpiringLots: (days: number) => call<ProductLot[]>('listExpiringLots', { days }),

  listSchedules: (storeId: string) => call<SupplierSchedule[]>('listSchedules', { storeId }),
  saveSchedule: (input: SupplierScheduleInput) => call<SupplierSchedule>('saveSchedule', { input }),
  deleteSchedule: (id: string) => call<void>('deleteSchedule', { id }),
  listVisits: (storeId: string, from: string, to: string) =>
    call<SupplierVisit[]>('listVisits', { storeId, from, to }),
  markVisit: (input: SupplierVisitInput) => call<SupplierVisit>('markVisit', { input }),

  listPurchaseOrders: (storeId: string) =>
    call<PurchaseOrderWithItems[]>('listPurchaseOrders', { storeId }),
  createPurchaseOrder: (input: CreatePurchaseOrderInput) =>
    call<PurchaseOrderWithItems>('createPurchaseOrder', { input }),
  setPurchaseOrderStatus: (id: string, status: PurchaseOrderStatus) =>
    call<PurchaseOrder>('setPurchaseOrderStatus', { id, status }),

  createSupplierExchange: (input: CreateSupplierExchangeInput) =>
    call<SupplierExchange>('createSupplierExchange', { input }),
  listSupplierExchanges: (storeId: string) =>
    call<SupplierExchangeWithItems[]>('listSupplierExchanges', { storeId }),

  recordInternalUse: (input: InternalUseInput) => call<StockMovement>('recordInternalUse', { input }),

  listCustomers: (storeId: string) => call<Customer[]>('listCustomers', { storeId }),
  createCustomer: (input: NewCustomerInput) => call<Customer>('createCustomer', { input }),
  updateCustomer: (id: string, patch: CustomerUpdate) =>
    call<Customer>('updateCustomer', { id, patch }),
  listCustomerPayments: (customerId: string) =>
    call<CustomerPayment[]>('listCustomerPayments', { customerId }),
  createCustomerPayment: (input: CustomerPaymentInput) =>
    call<CustomerPayment>('createCustomerPayment', { input }),
  getCustomerStatement: (customerId: string) =>
    call<CustomerStatement>('getCustomerStatement', { customerId }),

  getReport: (range: ReportRange) => call<ReportData>('getReport', { range }),

  updateStore: (patch: StoreUpdate) => call<Store>('updateStore', { patch }),

  checkout: (input: CheckoutInput) => call<SaleWithItems>('checkout', { input }),
  holdSale: (input: HeldSaleInput) => call<SaleWithItems>('holdSale', { input }),
  listHeldSales: (storeId: string) => call<SaleWithItems[]>('listHeldSales', { storeId }),
  cancelSale: (saleId: string, userId: string, reason: string) =>
    call<void>('cancelSale', { saleId, userId, reason }),

  getOpenCashSession: (storeId: string) => call<CashSession | null>('getOpenCashSession', { storeId }),
  openCashSession: (input: OpenCashInput) => call<CashSession>('openCashSession', { input }),
  closeCashSession: (sessionId: string, countedCents: number) =>
    call<CashSession>('closeCashSession', { sessionId, countedCents }),
  getCashSummary: (sessionId: string) => call<CashSummary>('getCashSummary', { sessionId }),
  addCashMovement: (sessionId: string, type: CashMovementType, amountCents: number, note: string) =>
    call<CashMovement>('addCashMovement', { sessionId, type, amountCents, note }),
  listCashMovements: (sessionId: string) =>
    call<CashMovement[]>('listCashMovements', { sessionId }),
};
