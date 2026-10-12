import type {
  AppUser,
  CashMovement,
  CashMovementType,
  CashSession,
  Category,
  Product,
  ProductUpdate,
  Store,
} from '../types/database';
import { supabase } from './client';
import type {
  CashSummary,
  CheckoutInput,
  HeldSaleInput,
  NewProductInput,
  OpenCashInput,
  Repository,
  SaleWithItems,
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
