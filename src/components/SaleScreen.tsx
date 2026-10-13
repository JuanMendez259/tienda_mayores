import { useEffect, useMemo, useState } from 'react';
import type { AppUser, CashSession, Category, Product, Promotion, SaleItem, Store } from '../types/database';
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

interface SaleScreenProps {
  store: Store;
  user: AppUser;
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

  // Los descuentos por promoción se calculan al vuelo (F-407).
  const pricedCart = useMemo(() => applyAutoPromotions(cart, promotions), [cart, promotions]);

  const subtotal = cartSubtotalCents(pricedCart);
  const lineDiscount = cartDiscountCents(pricedCart);
  const promoDiscount = cartPromoDiscountCents(pricedCart);
  const discountTotal = lineDiscount + orderDiscountCents;
  const total = Math.max(0, cartTotalCents(pricedCart) - orderDiscountCents);
  const count = cartItemCount(pricedCart);
  const canManage = user.role !== 'cashier';
  const lowStock = products.filter((p) => p.track_stock && p.stock_qty <= p.low_stock_threshold);

  useEffect(() => {
    let active = true;
    void repository.listPromotions().then((result) => {
      if (active) setPromotions(result);
    });
    return () => {
      active = false;
    };
  }, [promotionsKey]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 1800);
    return () => clearTimeout(timer);
  }, [message]);

  // Escáner USB activo solo cuando no hay otro modal abierto (F-102).
  const scanningEnabled =
    !paymentOpen && !weightFor && !productFormOpen && !discountOpen && !heldOpen && !helpOpen && !askCancel && ticket === null;
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

  async function checkout(payments: PaymentInput[], received: number) {
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
        <div className="flex min-w-0 items-center gap-3">
          {store.logo_url && <img src={store.logo_url} alt="" className="h-12 w-12 rounded-xl" />}
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold leading-tight">{store.name}</p>
            <p className="truncate text-base text-slate-500">
              {user.name} · Caja abierta {formatMXN(cashSession.opening_cents)}
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <button type="button" onClick={() => setHelpOpen(true)} className="btn btn-neutral px-3 py-3 text-lg sm:px-4">
            ❓ Ayuda
          </button>
          {canManage && (
            <button type="button" onClick={onOpenAdmin} className="btn btn-neutral px-3 py-3 text-lg sm:px-4">
              📋 Menú
            </button>
          )}
          <button type="button" onClick={openHeld} className="btn btn-neutral px-3 py-3 text-lg sm:px-4">
            ⏳ En espera
          </button>
          <button type="button" onClick={onOpenCash} className="btn btn-neutral px-3 py-3 text-lg sm:px-4">
            💰 Caja
          </button>
          <button
            type="button"
            onClick={onLogout}
            className={`btn btn-exit px-3 py-3 text-lg sm:px-4 ${canManage ? 'col-span-2' : ''}`}
          >
            🚪 Salir
          </button>
        </div>
      </header>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-lg font-semibold text-amber-900">
          <span aria-hidden="true">⚠️</span>
          {lowStock.length} producto(s) con poco stock. Revísalo en Menú → Inventario.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        <main
          className={`min-h-0 lg:col-span-8 lg:block ${view === 'catalog' ? 'block' : 'hidden'}`}
        >
          <ProductGrid
            products={products}
            categories={categories}
            onPick={pick}
            onNewProduct={() => {
              setNewBarcode('');
              setProductFormOpen(true);
            }}
          />
        </main>

        <aside
          className={`min-h-0 flex-col border-t border-slate-200 bg-white lg:col-span-4 lg:flex lg:border-l lg:border-t-0 ${
            view === 'cart' ? 'flex' : 'hidden'
          }`}
        >
          <div className="min-h-0 flex-1 overflow-hidden">
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
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xl text-slate-600">{count} artículo(s)</span>
              <span className="text-3xl font-extrabold">{formatMXN(total)}</span>
            </div>

            {promoDiscount > 0 && (
              <div className="mb-2 flex items-center justify-between text-lg text-green-700">
                <span>🏷️ Promociones</span>
                <span className="font-bold">−{formatMXN(promoDiscount)}</span>
              </div>
            )}

            {discountTotal > 0 && (
              <div className="mb-3 flex items-center justify-between text-lg text-green-700">
                <span>Subtotal {formatMXN(subtotal)} · Descuento</span>
                <span className="font-bold">−{formatMXN(discountTotal)}</span>
              </div>
            )}

            {store.modules.discounts && (
              <button
                type="button"
                onClick={() => setDiscountOpen(true)}
                disabled={cart.length === 0}
                className={`btn mb-2 w-full py-4 text-xl ${cart.length === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'btn-neutral'}`}
              >
                % Aplicar descuento
              </button>
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={history.length === 0}
                className={`btn py-4 text-lg ${history.length === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'btn-warning'}`}
              >
                ↶ Deshacer
              </button>
              <button
                type="button"
                onClick={() => setAskCancel(true)}
                disabled={cart.length === 0}
                className={`btn py-4 text-lg ${cart.length === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'btn-danger text-white'}`}
              >
                Cancelar venta
              </button>
            </div>

            <button
              type="button"
              onClick={holdSale}
              disabled={cart.length === 0}
              className={`btn mb-2 w-full py-4 text-xl ${cart.length === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'btn-neutral'}`}
            >
              Poner en espera
            </button>

            <button
              type="button"
              onClick={() => setPaymentOpen(true)}
              disabled={cart.length === 0}
              className={`btn w-full py-6 text-3xl text-white ${
                cart.length === 0 ? 'cursor-not-allowed bg-slate-300' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              Cobrar {cart.length > 0 ? formatMXN(total) : ''}
            </button>
          </div>
        </aside>
      </div>

      {/* Barra inferior para alternar vistas en móvil/tablet (en lg se ven ambas). */}
      <nav className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-white p-2 lg:hidden">
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
          onCancel={() => setPaymentOpen(false)}
          onConfirm={checkout}
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
          <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true">
            <h2 className="title mb-4 text-3xl">Ventas en espera</h2>
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
    </div>
  );
}
