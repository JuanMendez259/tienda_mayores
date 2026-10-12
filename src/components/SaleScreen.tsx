import { useEffect, useState } from 'react';
import type { AppUser, CashSession, Category, Product, SaleItem, Store } from '../types/database';
import { repository } from '../data';
import type { SaleWithItems } from '../data';
import {
  addMeasure,
  addPiece,
  cartItemCount,
  cartTotalCents,
  changeQty,
  removeItem,
  setMeasure,
  type CartItem,
} from '../lib/cart';
import { changeDue, formatMXN } from '../lib/money';
import { formatMeasure } from '../lib/weight';
import { uid } from '../lib/uid';
import { beep } from '../lib/sound';
import { ProductGrid } from './ProductGrid';
import { Cart } from './Cart';
import { WeightModal } from './WeightModal';
import { PaymentModal } from './PaymentModal';
import { TicketModal, type TicketData } from './TicketModal';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductFormModal } from './ProductFormModal';

interface SaleScreenProps {
  store: Store;
  user: AppUser;
  cashSession: CashSession;
  products: Product[];
  categories: Category[];
  onRefreshProducts: () => void;
  onOpenCash: () => void;
  onLogout: () => void;
}

export function SaleScreen({
  store,
  user,
  cashSession,
  products,
  categories,
  onRefreshProducts,
  onOpenCash,
  onLogout,
}: SaleScreenProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<CartItem[][]>([]);
  const [weightFor, setWeightFor] = useState<{ product: Product; key?: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [held, setHeld] = useState<SaleWithItems[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = cartTotalCents(cart);
  const count = cartItemCount(cart);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 1800);
    return () => clearTimeout(timer);
  }, [message]);

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
    };
  }

  function buildLines() {
    return cart.map((item) => ({
      product_id: item.productId,
      name: item.name,
      sale_unit: item.saleUnit,
      qty: item.qty,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      weight_grams: item.measure,
    }));
  }

  async function holdSale() {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    await repository.holdSale({
      store_id: store.id,
      user_id: user.id,
      client_uuid: uid(),
      subtotal_cents: total,
      total_cents: total,
      lines: buildLines(),
    });
    setBusy(false);
    setCart([]);
    setHistory([]);
    setMessage('Venta guardada en espera.');
  }

  async function openHeld() {
    setHeld(await repository.listHeldSales(store.id));
    setHeldOpen(true);
  }

  function resumeHeld(entry: SaleWithItems) {
    const items = entry.items
      .map((item) => cartItemFromSaleLine(item))
      .filter((item): item is CartItem => item !== null);
    setCart(items);
    setHistory([]);
    setHeldOpen(false);
    setMessage('Venta retomada.');
  }

  async function cancelHeld(entry: SaleWithItems) {
    await repository.cancelSale(entry.sale.id, user.id, 'Cancelada por el cajero');
    setHeld(await repository.listHeldSales(store.id));
    setMessage('Venta cancelada.');
  }

  async function checkout(received: number) {
    if (busy) return;
    setBusy(true);
    const result = await repository.checkout({
      store_id: store.id,
      user_id: user.id,
      client_uuid: uid(),
      subtotal_cents: total,
      discount_cents: 0,
      total_cents: total,
      lines: buildLines(),
      payments: [{ method: 'cash', amount_cents: total, reference: null }],
    });
    setBusy(false);
    setTicket({
      number: result.sale.number,
      dateIso: result.sale.paid_at ?? result.sale.created_at,
      lines: cart.map((item) => ({
        name: item.name,
        detail:
          item.saleUnit === 'piece'
            ? `${item.qty} × ${formatMXN(item.unitPriceCents)}`
            : `${formatMeasure(item.measure ?? 0, item.saleUnit)} × ${formatMXN(item.unitPriceCents)}`,
        importeCents: item.lineTotalCents,
      })),
      subtotalCents: total,
      totalCents: total,
      receivedCents: received,
      changeCents: changeDue(total, received),
    });
    setPaymentOpen(false);
    setCart([]);
    setHistory([]);
    beep(1200, 150);
    onRefreshProducts();
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          {store.logo_url && <img src={store.logo_url} alt="" className="h-12 w-12 rounded-xl" />}
          <div>
            <p className="text-xl font-extrabold leading-tight">{store.name}</p>
            <p className="text-base text-slate-500">
              {user.name} · Caja abierta {formatMXN(cashSession.opening_cents)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openHeld} className="btn btn-neutral px-4 py-3 text-lg">
            En espera
          </button>
          <button type="button" onClick={onOpenCash} className="btn btn-neutral px-4 py-3 text-lg">
            Caja
          </button>
          <button type="button" onClick={onLogout} className="btn btn-neutral px-4 py-3 text-lg">
            Salir
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 flex-1">
          <ProductGrid
            products={products}
            categories={categories}
            onPick={pick}
            onNewProduct={() => setProductFormOpen(true)}
          />
        </main>

        <aside className="flex w-full flex-col border-t border-slate-200 bg-white md:w-[440px] md:border-l md:border-t-0">
          <Cart
            items={cart}
            onInc={(key) => mutate(changeQty(cart, key, 1))}
            onDec={(key) => mutate(changeQty(cart, key, -1))}
            onRemove={(key) => mutate(removeItem(cart, key))}
            onEditMeasure={(item) => {
              const product = products.find((p) => p.id === item.productId);
              if (product) setWeightFor({ product, key: item.key });
            }}
          />

          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xl text-slate-600">{count} artículo(s)</span>
              <span className="text-3xl font-extrabold">{formatMXN(total)}</span>
            </div>

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

      {message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-slate-900 px-6 py-3 text-xl font-bold text-white shadow-lg">
          {message}
        </div>
      )}

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

      <TicketModal open={ticket !== null} store={store} data={ticket} onNewSale={() => setTicket(null)} />

      <ProductFormModal
        open={productFormOpen}
        categories={categories}
        storeId={store.id}
        userId={user.id}
        onClose={() => setProductFormOpen(false)}
        onSaved={(product) => {
          setProductFormOpen(false);
          onRefreshProducts();
          setMessage(`Producto "${product.name}" guardado.`);
        }}
      />

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
          setMessage('Venta cancelada.');
        }}
        onCancel={() => setAskCancel(false)}
      />
    </div>
  );
}
