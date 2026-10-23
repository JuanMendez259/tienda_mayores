import { useEffect, useMemo, useState } from 'react';
import type {
  AppUser,
  CashSession,
  Category,
  Customer,
  Product,
  Promotion,
  SaleItem,
  Store,
  Supplier,
  SupplierSchedule,
} from '../types/database';
import { repository, isRemoteConfigured } from '../data';
import type { PaymentInput, SaleWithItems } from '../data';
import {
  addMeasure,
  addPiece,
  applyAutoPromotions,
  cartDiscountCents,
  cartItemCount,
  cartPromoDiscountCents,
  cartSubtotalCents,
  cartTotalCents,
  changeQty,
  removeItem,
  setLineDiscount,
  setMeasure,
  type CartItem,
} from '../lib/cart';
import { changeDue, formatMXN } from '../lib/money';
import { formatMeasure } from '../lib/weight';
import { uid } from '../lib/uid';
import { computeCutoffAlerts } from '../lib/cutoff';
import { beep } from '../lib/sound';
import { enqueueSale } from '../lib/offlineQueue';
import { logError } from '../lib/errorLog';
import { useBarcodeScanner } from '../devices/barcode';
import { PAYMENT_METHOD_LABELS } from '../devices/payments';
import { ProductGrid } from './ProductGrid';
import { Cart } from './Cart';
import { WeightModal } from './WeightModal';
import { PaymentModal } from './PaymentModal';
import { TicketModal, type TicketData } from './TicketModal';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductFormModal } from './ProductFormModal';
import { DiscountModal } from './DiscountModal';
import { HelpModal } from './HelpModal';
import { InternalUseModal } from './InternalUseModal';
import { ManagerAuthModal } from './ManagerAuthModal';

interface SaleScreenProps {
  store: Store;
  user: AppUser;
  /** Todos los usuarios, para la autorización de encargado (F-B06). */
  users: AppUser[];
  cashSession: CashSession;
  products: Product[];
  categories: Category[];
  /** Cambia cuando se actualizan promociones, para recargarlas (F-407). */
  promotionsKey: number;
  onRefreshProducts: () => void;
  onOpenCash: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export function SaleScreen({
  store,
  user,
  users,
  cashSession,
  products,
  categories,
  promotionsKey,
  onRefreshProducts,
  onOpenCash,
  onOpenAdmin,
  onLogout,
}: SaleScreenProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<CartItem[][]>([]);
  const [weightFor, setWeightFor] = useState<{ product: Product; key?: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [orderDiscountCents, setOrderDiscountCents] = useState(0);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [held, setHeld] = useState<SaleWithItems[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  /** En móvil/tablet se alterna catálogo/carrito; en lg se ven ambos a la vez. */
  const [view, setView] = useState<'catalog' | 'cart'>('catalog');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [schedules, setSchedules] = useState<SupplierSchedule[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bestSellers, setBestSellers] = useState<string[]>([]);
  const [internalUseOpen, setInternalUseOpen] = useState(false);
  // Autorización de fiado sobre el límite (F-B06).
  const [creditOverride, setCreditOverride] = useState<{
    name: string;
    projected: number;
    limit: number;
    customerId: string;
    payments: PaymentInput[];
    received: number;
  } | null>(null);
  const [askSelfAuthorize, setAskSelfAuthorize] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  // Los descuentos por promoción se calculan al vuelo (F-407).
  const pricedCart = useMemo(() => applyAutoPromotions(cart, promotions), [cart, promotions]);

  const subtotal = cartSubtotalCents(pricedCart);
  const lineDiscount = cartDiscountCents(pricedCart);
  const promoDiscount = cartPromoDiscountCents(pricedCart);
  const discountTotal = lineDiscount + orderDiscountCents;
  const total = Math.max(0, cartTotalCents(pricedCart) - orderDiscountCents);
  const count = cartItemCount(pricedCart);
  const canManage = user.role !== 'cashier';
  const canUseInternalUse = canManage || store.internal_use_cashier_allowed;
  const allowCredit = canManage || store.credit_cashier_allowed;
  const lowStock = products.filter((p) => p.track_stock && p.stock_qty <= p.low_stock_threshold);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  // Aviso de hora límite de pedido de hoy, en los próximos 3 horas (F-A07).
  const cutoffAlerts = useMemo(
    () => computeCutoffAlerts(schedules, (id) => supplierById.get(id)?.name),
    [schedules, supplierById],
  );

  useEffect(() => {
    let active = true;
    void repository.listPromotions().then((result) => {
      if (active) setPromotions(result);
    });
    return () => {
      active = false;
    };
  }, [promotionsKey]);

  // Clientes de fiado y agenda de proveedores para el cobro y los avisos (F-B03, F-A07).
  useEffect(() => {
    let active = true;
    void Promise.all([
      repository.listCustomers(store.id),
      repository.listSchedules(store.id),
      repository.listSuppliers(),
    ]).then(([customerList, scheduleList, supplierList]) => {
      if (active) {
        setCustomers(customerList);
        setSchedules(scheduleList);
        setSuppliers(supplierList);
      }
    });
    return () => {
      active = false;
    };
  }, [store.id]);

  // "Más vendidos" (F-A09): top de productos de los últimos 30 días.
  useEffect(() => {
    let active = true;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    void repository
      .getReport({ from: from.toISOString(), to: to.toISOString() })
      .then((report) => {
        if (active) setBestSellers(report.topProducts.map((item) => item.productId));
      });
    return () => {
      active = false;
    };
  }, [store.id, products.length]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 1800);
    return () => clearTimeout(timer);
  }, [message]);

  // Escáner USB activo solo cuando no hay otro modal abierto (F-102).
  const scanningEnabled =
    !paymentOpen && !weightFor && !productFormOpen && !discountOpen && !heldOpen && !helpOpen && !askCancel && !askSelfAuthorize && !authOpen && ticket === null;
  useBarcodeScanner(handleScan, scanningEnabled);

  function mutate(next: CartItem[]) {
    setHistory((prev) => [...prev, cart]);
    setCart(next);
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      setCart(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  function pick(product: Product) {
    if (product.sale_unit === 'piece') {
      mutate(addPiece(cart, product));
    } else {
      setWeightFor({ product });
    }
    beep(880, 70);
  }

  /** Escáner USB (F-102): agrega el producto o abre el alta con el código. */
  function handleScan(code: string) {
    const product = products.find((item) => item.barcode === code);
    if (product) {
      pick(product);
      setMessage(`${product.name} agregado.`);
      return;
    }
    setNewBarcode(code);
    setProductFormOpen(true);
    setMessage('Código no registrado: captura el producto nuevo.');
  }

  function confirmWeight(measure: number) {
    if (!weightFor) return;
    if (weightFor.key) {
      mutate(setMeasure(cart, weightFor.key, measure));
    } else {
      mutate(addMeasure(cart, weightFor.product, measure));
    }
    setWeightFor(null);
    beep(880, 70);
  }

  function applyLineDiscount(key: string, cents: number) {
    mutate(setLineDiscount(cart, key, cents));
  }

  function cartItemFromSaleLine(item: SaleItem): CartItem | null {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) return null;
    return {
      key: uid(),
      productId: product.id,
      name: product.name,
      image_url: product.image_url,
      saleUnit: product.sale_unit,
      unitPriceCents: item.unit_price_cents,
      qty: item.qty,
      measure: item.weight_grams,
      lineTotalCents: item.line_total_cents,
      discountCents: item.discount_cents,
      promoDiscountCents: 0,
    };
  }

  function buildLines() {
    return pricedCart.map((item) => ({
      product_id: item.productId,
      name: item.name,
      sale_unit: item.saleUnit,
      qty: item.qty,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      discount_cents: item.discountCents + item.promoDiscountCents,
      weight_grams: item.measure,
    }));
  }

  function ticketFor(
    cents: number,
    received: number,
    number: number,
    paymentsLabel?: string,
    pending = false,
  ): TicketData {
    return {
      number,
      pending,
      dateIso: new Date().toISOString(),
      lines: pricedCart.map((item) => ({
        name: item.name,
        detail:
          item.saleUnit === 'piece'
            ? `${item.qty} × ${formatMXN(item.unitPriceCents)}`
            : `${formatMeasure(item.measure ?? 0, item.saleUnit)} × ${formatMXN(item.unitPriceCents)}`,
        importeCents: item.lineTotalCents,
        discountCents: item.discountCents + item.promoDiscountCents,
      })),
      subtotalCents: subtotal,
      discountCents: discountTotal,
      totalCents: cents,
      paymentsLabel,
      receivedCents: received,
      changeCents: changeDue(cents, received),
    };
  }

  /** Texto de las formas de pago usadas (F-204). */
  function paymentsLabelFor(payments: PaymentInput[]): string {
    return payments
      .map((payment) => `${PAYMENT_METHOD_LABELS[payment.method]} ${formatMXN(payment.amount_cents)}`)
      .join(' + ');
  }

  function finishSale(data: TicketData) {
    setTicket(data);
    setPaymentOpen(false);
    setCart([]);
    setHistory([]);
    setOrderDiscountCents(0);
    beep(1200, 150);
    onRefreshProducts();
  }

  async function holdSale() {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    await repository.holdSale({
      store_id: store.id,
      user_id: user.id,
      client_uuid: uid(),
      subtotal_cents: subtotal,
      discount_cents: discountTotal,
      total_cents: total,
      lines: buildLines(),
    });
    setBusy(false);
    setCart([]);
    setHistory([]);
    setOrderDiscountCents(0);
    setMessage('Venta guardada en espera.');
    setHeld(await repository.listHeldSales(store.id));
  }

  async function openHeld() {
    setHeld(await repository.listHeldSales(store.id));
    setHeldOpen(true);
  }

  function resumeHeld(entry: SaleWithItems) {
    const base = entry.items
      .map((item) => cartItemFromSaleLine(item))
      .filter((item): item is CartItem => item !== null);
    // El descuento guardado incluye promociones; se recalcula para no duplicar.
    const restored = applyAutoPromotions(base, promotions).map((item) => ({
      ...item,
      discountCents: Math.max(0, item.discountCents - item.promoDiscountCents),
    }));
    const restoredLineDiscount = restored.reduce(
      (acc, item) => acc + item.discountCents + item.promoDiscountCents,
      0,
    );
    setCart(restored);
    setOrderDiscountCents(Math.max(0, entry.sale.discount_cents - restoredLineDiscount));
    setHistory([]);
    setHeldOpen(false);
    setMessage('Venta retomada.');
  }

  async function cancelHeld(entry: SaleWithItems) {
    await repository.cancelSale(entry.sale.id, user.id, 'Cancelada por el cajero');
    setHeld(await repository.listHeldSales(store.id));
    setMessage('Venta cancelada.');
  }

  /** Valida el límite de fiado (F-B06) y, si hace falta, pide autorización. */
  async function checkout(payments: PaymentInput[], received: number, customerId?: string | null) {
    if (busy) return;
    const creditCents = payments
      .filter((payment) => payment.method === 'credit')
      .reduce((acc, payment) => acc + payment.amount_cents, 0);
    if (creditCents > 0 && customerId) {
      const customer = customers.find((entry) => entry.id === customerId) ?? null;
      const limit = customer?.credit_limit_cents ?? null;
      if (limit !== null) {
        let balance = 0;
        try {
          balance = (await repository.getCustomerStatement(customerId)).balance_cents;
        } catch (cause) {
          logError(cause, 'credit-limit');
        }
        const projected = balance + creditCents;
        if (projected > limit) {
          setPaymentOpen(false);
          setCreditOverride({
            name: customer?.name ?? 'El cliente',
            projected,
            limit,
            customerId,
            payments,
            received,
          });
          if (canManage) {
            setAskSelfAuthorize(true);
          } else {
            setAuthOpen(true);
          }
          return;
        }
      }
    }
    await finalizeSale(payments, received, customerId);
  }

  function authorizeCredit() {
    const pending = creditOverride;
    setAskSelfAuthorize(false);
    setAuthOpen(false);
    setCreditOverride(null);
    if (pending) {
      void finalizeSale(pending.payments, pending.received, pending.customerId, true);
    }
  }

  async function finalizeSale(
    payments: PaymentInput[],
    received: number,
    customerId?: string | null,
    override = false,
  ) {
    if (busy) return;
    setBusy(true);
    const paymentsLabel = paymentsLabelFor(payments);
    const input = {
      store_id: store.id,
      user_id: user.id,
      client_uuid: uid(),
      subtotal_cents: subtotal,
      discount_cents: discountTotal,
      total_cents: total,
      lines: buildLines(),
      payments,
      customer_id: customerId ?? null,
      credit_override: override || undefined,
    };

    // Sin conexión: guardar la venta y enviarla al reconectar (F-704 / sección 9).
    if (isRemoteConfigured && !navigator.onLine) {
      await enqueueSale(input);
      setBusy(false);
      finishSale(ticketFor(total, received, 0, paymentsLabel, true));
      setMessage('Venta guardada sin conexión; se enviará al reconectar.');
      return;
    }

    try {
      const result = await repository.checkout(input);
      setBusy(false);
      finishSale({
        ...ticketFor(total, received, result.sale.number, paymentsLabel),
        dateIso: result.sale.paid_at ?? result.sale.created_at,
      });
    } catch (cause) {
      setBusy(false);
      logError(cause, 'checkout');
      setMessage('No se pudo cobrar. Revisa la conexión e inténtalo de nuevo.');
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <header className="z-20 flex-none border-b-2 border-slate-200 bg-white px-5 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-emerald-500 bg-emerald-100 p-2.5 text-3xl shadow-sm">
              {store.logo_url ? (
                <img src={store.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">🏪</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="flex min-w-0 items-center gap-2 text-xl font-black leading-none tracking-tight text-slate-900 xl:text-2xl">
                <span className="truncate">{store.name}</span>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                  Modo Fácil
                </span>
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-slate-600">
                <span>
                  👤 Atiende: <strong className="text-slate-900">{user.name}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                  <span className="text-sm" aria-hidden="true">
                    💰
                  </span>{" "}
                  En caja:{" "}
                  <strong className="text-lg text-emerald-700">
                    {formatMXN(cashSession.opening_cents)}
                  </strong>
                </span>
              </p>
            </div>
          </div>

          <nav
            aria-label="Acciones rápidas del turno"
            className="flex flex-wrap items-center justify-end gap-2 xl:gap-3"
          >
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Pedir asistencia o instrucciones"
              className="flex items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-100 px-3 py-2 text-base font-black text-amber-900 shadow-sm transition hover:bg-amber-200 active:scale-95 xl:px-4 xl:py-2.5 xl:text-lg"
            >
              <span className="text-xl xl:text-2xl" aria-hidden="true">
                ❓
              </span>
              <span>
                Ayuda<span className="hidden xl:inline"> / SOS</span>
              </span>
            </button>
            <button
              type="button"
              onClick={openHeld}
              className="flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-base font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-200 active:scale-95 xl:px-4 xl:py-2.5 xl:text-lg"
            >
              <span className="text-xl xl:text-2xl" aria-hidden="true">
                ⏳
              </span>
              <span>En espera</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-base font-black text-red-700 shadow-sm transition hover:bg-red-100 active:scale-95 xl:px-4 xl:py-2.5 xl:text-lg"
            >
              <span className="text-xl xl:text-2xl" aria-hidden="true">
                🚪
              </span>
              <span>Salir</span>
            </button>
          </nav>

          {/* Acciones adicionales: caja para todos; interno y menú según permisos. */}
          <nav aria-label="Acciones adicionales" className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onOpenCash}
              className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-2 text-base font-extrabold text-emerald-800 shadow-sm transition hover:bg-emerald-100 active:scale-95"
            >
              <span className="text-xl" aria-hidden="true">
                💰
              </span>
              <span>Caja</span>
            </button>
            {canUseInternalUse && (
              <button
                type="button"
                onClick={() => setInternalUseOpen(true)}
                className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-base font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-200 active:scale-95"
              >
                <span className="text-xl" aria-hidden="true">
                  🧾
                </span>
                <span>Consumo interno</span>
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-slate-300 bg-slate-100 px-3 py-2 text-base font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-200 active:scale-95"
              >
                <span className="text-xl" aria-hidden="true">
                  📋
                </span>
                <span>Menú</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-lg font-semibold text-amber-900">
          <span aria-hidden="true">⚠️</span>
          {lowStock.length} {lowStock.length === 1 ? 'producto' : 'productos'} con poco stock. Revísalo en Menú → Inventario.
        </div>
      )}

      {cutoffAlerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-orange-100 px-4 py-2 text-lg font-semibold text-orange-900">
          <span aria-hidden="true">⏰</span>
          <span>
            Pedido a {cutoffAlerts.map((alert) => `${alert.name} antes de ${alert.time}`).join(' · ')}
          </span>
        </div>
      )}

      {/* En tablet horizontal se ven catálogo (63%) y ticket (37%) a la vez. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          aria-label="Catálogo de productos"
          className={`min-h-0 w-full flex-col overflow-hidden border-r-2 border-slate-200 bg-slate-50 md:flex md:w-[58%] lg:w-[63%] ${
            view === 'catalog' ? 'flex' : 'hidden'
          }`}
        >
          <ProductGrid
            products={products}
            categories={categories}
            bestSellers={bestSellers}
            onPick={pick}
            onNewProduct={() => {
              setNewBarcode('');
              setProductFormOpen(true);
            }}
          />
        </section>

        <aside
          aria-label="Ticket de venta"
          className={`min-h-0 w-full flex-col overflow-hidden bg-white shadow-xl md:flex md:w-[42%] lg:w-[37%] ${
            view === 'cart' ? 'flex' : 'hidden'
          }`}
        >
          <div className="flex flex-none items-center justify-between gap-2 border-b-2 border-slate-200 bg-slate-50 p-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-2xl" aria-hidden="true">
                🧾
              </span>
              <div>
                <h2 className="whitespace-nowrap text-base font-black leading-tight text-slate-900 lg:text-lg xl:text-xl">
                  Ticket de Venta
                </h2>
                <p className="whitespace-nowrap text-xs font-bold text-slate-500 lg:text-sm">
                  Mostrador Principal
                </p>
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800 lg:px-3 lg:text-sm xl:text-base">
              {count} producto{count === 1 ? '' : 's'}
            </span>
          </div>

          <Cart
            items={pricedCart}
            onInc={(key) => mutate(changeQty(cart, key, 1))}
            onDec={(key) => mutate(changeQty(cart, key, -1))}
            onRemove={(key) => mutate(removeItem(cart, key))}
            onEditMeasure={(item) => {
              const product = products.find((p) => p.id === item.productId);
              if (product) setWeightFor({ product, key: item.key });
            }}
          />

          <div className="flex-none space-y-2 border-t-2 border-slate-200 bg-slate-50 p-3">
            {promoDiscount > 0 && (
              <div className="flex items-center justify-between text-sm font-bold text-emerald-700">
                <span>🏷️ Promociones</span>
                <span>−{formatMXN(promoDiscount)}</span>
              </div>
            )}

            {discountTotal > 0 && (
              <div className="flex items-center justify-between text-sm font-bold text-emerald-700">
                <span>Subtotal {formatMXN(subtotal)} · Descuento</span>
                <span>−{formatMXN(discountTotal)}</span>
              </div>
            )}

            {/* Las tres acciones del diseño, con altura táctil de 56 px. */}
            <div className={`grid gap-2 ${store.modules.discounts ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {store.modules.discounts && (
                <button
                  type="button"
                  onClick={() => setDiscountOpen(true)}
                  disabled={cart.length === 0}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1.5 py-2.5 text-xs font-extrabold transition active:scale-95 xl:px-2 lg:text-sm ${
                    cart.length === 0
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  <span className="text-lg" aria-hidden="true">
                    🏷️
                  </span>
                  <span>Descuento</span>
                </button>
              )}
              <button
                type="button"
                onClick={undo}
                disabled={history.length === 0}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1.5 py-2.5 text-xs font-extrabold transition active:scale-95 xl:px-2 lg:text-sm ${
                  history.length === 0
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <span className="text-lg" aria-hidden="true">
                  ↩️
                </span>
                <span>Deshacer</span>
              </button>
              <button
                type="button"
                onClick={() => setAskCancel(true)}
                disabled={cart.length === 0}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1.5 py-2.5 text-xs font-extrabold transition active:scale-95 xl:px-2 lg:text-sm ${
                  cart.length === 0
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <span className="text-lg" aria-hidden="true">
                  ❌
                </span>
                <span>Cancelar</span>
              </button>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-1 rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-xs">
              <div>
                <span className="block text-xs font-black uppercase tracking-widest text-slate-500">
                  Total a Pagar
                </span>
                <span className="text-sm font-bold text-slate-600">IVA incluido</span>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black tracking-tight text-slate-900 xl:text-4xl">
                  {formatMXN(total)}
                </span>
                <span className="ml-1 text-xs font-black text-slate-500">MXN</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPaymentOpen(true)}
              disabled={cart.length === 0}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl border-b-4 px-6 py-5 text-xl font-black tracking-wide text-white shadow-lg transition active:scale-[0.98] xl:text-2xl ${
                cart.length === 0
                  ? 'cursor-not-allowed border-slate-300 bg-slate-300'
                  : 'border-emerald-800 bg-emerald-600 hover:bg-emerald-700 hover:shadow-xl'
              }`}
            >
              <span className="text-2xl leading-none xl:text-3xl" aria-hidden="true">
                💵
              </span>
              <span className="uppercase">Cobrar {cart.length > 0 ? formatMXN(total) : ''}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Barra inferior solo en teléfonos (en tablet horizontal se ven ambas). */}
      <nav className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-white p-2 md:hidden">
        <button
          type="button"
          onClick={() => setView('catalog')}
          className={`btn py-4 text-xl ${view === 'catalog' ? 'btn-primary text-white' : 'btn-neutral'}`}
        >
          🍎 Ver Catálogo
        </button>
        <button
          type="button"
          onClick={() => setView('cart')}
          className={`btn py-4 text-xl ${view === 'cart' ? 'btn-primary text-white' : 'btn-neutral'}`}
        >
          🛒 Ver Carrito{count > 0 ? ` (${count})` : ''}
        </button>
      </nav>

      {message && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-2xl bg-slate-900 px-6 py-3 text-xl font-bold text-white shadow-lg lg:bottom-6">
          {message}
        </div>
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {weightFor && (
        <WeightModal
          product={weightFor.product}
          onCancel={() => setWeightFor(null)}
          onConfirm={confirmWeight}
        />
      )}

      {paymentOpen && (
        <PaymentModal
          totalCents={total}
          customers={customers}
          allowCredit={allowCredit}
          onCancel={() => setPaymentOpen(false)}
          onConfirm={checkout}
        />
      )}

      {internalUseOpen && (
        <InternalUseModal
          store={store}
          user={user}
          products={products}
          onClose={() => setInternalUseOpen(false)}
          onDone={(text) => {
            setInternalUseOpen(false);
            setMessage(text);
            onRefreshProducts();
          }}
        />
      )}

      {discountOpen && (
        <DiscountModal
          cart={pricedCart}
          orderDiscountCents={orderDiscountCents}
          onApplyLine={applyLineDiscount}
          onApplyOrder={setOrderDiscountCents}
          onClose={() => setDiscountOpen(false)}
        />
      )}

      <TicketModal open={ticket !== null} store={store} data={ticket} onNewSale={() => setTicket(null)} />

      {productFormOpen && (
        <ProductFormModal
          categories={categories}
          storeId={store.id}
          userId={user.id}
          initialBarcode={newBarcode}
          onClose={() => {
            setProductFormOpen(false);
            setNewBarcode('');
          }}
          onSaved={(product) => {
            setProductFormOpen(false);
            setNewBarcode('');
            onRefreshProducts();
            setMessage(`Producto "${product.name}" guardado.`);
          }}
        />
      )}

      {heldOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="card max-h-[92dvh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true">
            <h2 className="title mb-2 text-3xl">Ventas en espera</h2>
            <p className="mb-4 text-base text-slate-500">
              Guarda la venta actual o retoma una venta anterior.
            </p>
            <button
              type="button"
              onClick={() => void holdSale()}
              disabled={cart.length === 0 || busy}
              className={`btn mb-4 w-full gap-2 rounded-2xl border-b-4 px-4 py-4 text-xl font-black text-white ${
                cart.length === 0 || busy
                  ? 'cursor-not-allowed border-slate-300 bg-slate-300'
                  : 'border-emerald-800 bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <span aria-hidden="true">⏳</span>
              <span>Guardar venta actual{cart.length > 0 ? ` (${count})` : ''}</span>
            </button>
            {held.length === 0 ? (
              <p className="mb-4 text-lg text-slate-600">No hay ventas en espera.</p>
            ) : (
              <ul className="mb-4 space-y-3">
                {held.map((entry) => (
                  <li key={entry.sale.id} className="card flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-xl font-bold">Venta #{entry.sale.number}</p>
                      <p className="text-base text-slate-500">
                        {entry.items.length} artículo(s) · {formatMXN(entry.sale.total_cents)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => resumeHeld(entry)} className="btn btn-primary px-5 py-3 text-lg text-white">
                        Retomar
                      </button>
                      <button type="button" onClick={() => cancelHeld(entry)} className="btn btn-danger px-5 py-3 text-lg text-white">
                        Cancelar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setHeldOpen(false)} className="btn btn-neutral w-full py-4 text-xl">
              Regresar
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={askCancel}
        title="¿Seguro que quieres cancelar esta venta?"
        message="Se quitarán todos los productos de la venta."
        confirmLabel="Sí, cancelar"
        onConfirm={() => {
          setAskCancel(false);
          setCart([]);
          setHistory([]);
          setOrderDiscountCents(0);
          setMessage('Venta cancelada.');
        }}
        onCancel={() => setAskCancel(false)}
      />

      <ConfirmDialog
        open={askSelfAuthorize}
        title="Supera el límite de fiado"
        message={
          creditOverride
            ? `${creditOverride.name} llegaría a ${formatMXN(creditOverride.projected)} y su límite es ${formatMXN(creditOverride.limit)}. ¿Autorizas esta venta a fiado?`
            : ''
        }
        confirmLabel="Sí, autorizar"
        onConfirm={authorizeCredit}
        onCancel={() => {
          setAskSelfAuthorize(false);
          setCreditOverride(null);
        }}
      />

      {authOpen && creditOverride && (
        <ManagerAuthModal
          message={`${creditOverride.name} llegaría a ${formatMXN(creditOverride.projected)} y su límite es ${formatMXN(creditOverride.limit)}.`}
          users={users}
          onAuthorized={authorizeCredit}
          onCancel={() => {
            setAuthOpen(false);
            setCreditOverride(null);
          }}
        />
      )}
    </div>
  );
}
