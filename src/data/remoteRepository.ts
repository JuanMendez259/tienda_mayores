import type {
  AppUser,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  Product,
  ProductUpdate,
  ProductLot,
  Promotion,
  StockMovement,
  Store,
  StoreUpdate,
  Supplier,
  SupplierUpdate,
} from '../types/database';
import { supabase } from './client';
import type {
  CashSummary,
  CheckoutInput,
  CreatePurchaseInput,
  HeldSaleInput,
  NewProductInput,
  NewSupplierInput,
  OpenCashInput,
  PromotionInput,
  PurchaseWithItems,
  ReportData,
  ReportRange,
  Repository,
  SaleWithItems,
  StockAdjustmentInput,
  StockMovementFilter,
} from './repository';

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado');
  const { data, error } = await supabase.functions.invoke('pos', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || 'No se pudo conectar con el servidor');
  return data as T;
}

/** Repositorio remoto (Opción A). Todo pasa por la Edge Function `pos`. */
export const remoteRepository: Repository = {
  getStore: () => call<Store>('getStore'),
  listUsers: () => call<AppUser[]>('listUsers'),
  verifyPin: (userId, pin) => call<boolean>('verifyPin', { userId, pin }),

  listCategories: () => call<Category[]>('listCategories'),
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
