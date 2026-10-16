import { useCallback, useEffect, useState } from 'react';
import type { AppUser, Product, PurchaseOrderStatus, Store, Supplier } from '../../types/database';
import { repository } from '../../data';
import type { PurchaseOrderWithItems } from '../../data';
import { formatMXN } from '../../lib/money';

interface PurchaseOrdersAdminProps {
  store: Store;
  user: AppUser;
  products: Product[];
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

interface DraftLine {
  product_id: string;
  qty: number;
  unit_cost_cents: number;
}

/** Órdenes de compra (F-A06): armar pedido, enviar al proveedor y seguir el estado. */
export function PurchaseOrdersAdmin({ store, user, products }: PurchaseOrdersAdminProps) {
  const [orders, setOrders] = useState<PurchaseOrderWithItems[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickerId, setPickerId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, supplierList] = await Promise.all([
      repository.listPurchaseOrders(store.id),
      repository.listSuppliers(),
    ]);
    setOrders(list);
    setSuppliers(supplierList);
    setLoading(false);
  }, [store.id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  function addLine() {
    const product = products.find((p) => p.id === pickerId);
    if (!product) return;
    setLines((prev) => [
      ...prev,
      { product_id: product.id, qty: 1, unit_cost_cents: product.cost_cents },
    ]);
    setPickerId('');
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  /** Carga los productos con stock bajo (del proveedor elegido) como renglones (F-A06). */
  function suggestLowStock() {
    const pool = products.filter(
      (product) =>
        product.active &&
        product.track_stock &&
        product.stock_qty <= product.low_stock_threshold &&
        (!supplierId || product.supplier_id === supplierId) &&
        !lines.some((line) => line.product_id === product.id),
    );
    if (pool.length === 0) {
      setError('No hay productos con stock bajo para este proveedor.');
      return;
    }
    setError(null);
    setLines((prev) => [
      ...prev,
      ...pool.map((product) => ({
        product_id: product.id,
        qty: Math.max(1, product.low_stock_threshold * 2 - product.stock_qty),
        unit_cost_cents: product.cost_cents,
      })),
    ]);
  }

  async function saveOrder() {
    if (lines.length === 0) {
      setError('Agrega al menos un producto.');
      return;
    }
    setError(null);
    const created = await repository.createPurchaseOrder({
      store_id: store.id,
      supplier_id: supplierId || null,
      user_id: user.id,
      expected_on: null,
      notes: notes.trim() || null,
      items: lines,
    });
    setOrders((prev) => [created, ...prev]);
    setNewOpen(false);
    setLines([]);
    setNotes('');
    setSupplierId('');
    setMessage('Orden guardada como borrador.');
  }

  async function changeStatus(order: PurchaseOrderWithItems, status: PurchaseOrderStatus) {
    const updated = await repository.setPurchaseOrderStatus(order.order.id, status);
    setOrders((prev) =>
      prev.map((entry) => (entry.order.id === updated.id ? { ...entry, order: updated } : entry)),
    );
  }

  /**
   * Recibir un pedido registra la entrada de mercancía (compra) y luego cambia
   * el estado a "recibida" (F-A06).
   */
  async function receive(order: PurchaseOrderWithItems) {
    if (order.order.status === 'received' || receivingId) return;
    setReceivingId(order.order.id);
    setError(null);
    try {
      await repository.createPurchase({
        store_id: store.id,
        supplier_id: order.order.supplier_id,
        user_id: user.id,
        invoice_ref: `Orden ${order.order.id.slice(0, 8)}`,
        invoice_file_url: null,
        items: order.items.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          unit_cost_cents: item.unit_cost_cents,
          expires_on: null,
        })),
      });
      const updated = await repository.setPurchaseOrderStatus(order.order.id, 'received');
      setOrders((prev) =>
        prev.map((entry) => (entry.order.id === updated.id ? { ...entry, order: updated } : entry)),
      );
      setMessage('Pedido recibido. Se registró la entrada de mercancía.');
    } finally {
      setReceivingId(null);
    }
  }

  function orderText(order: PurchaseOrderWithItems): string {
    const supplier = order.order.supplier_id ? supplierById.get(order.order.supplier_id) : null;
    const header = `Pedido para ${supplier?.name ?? 'proveedor'} (${store.name})`;
    const body = order.items
      .map((item) => {
        const product = productById.get(item.product_id);
        return `• ${product?.name ?? 'Producto'}: ${item.qty}`;
      })
      .join('\n');
    return `${header}\n${body}`;
  }

  function sendWhatsApp(order: PurchaseOrderWithItems) {
    const supplier = order.order.supplier_id ? supplierById.get(order.order.supplier_id) : null;
    const phone = (supplier?.phone ?? '').replace(/[^0-9]/g, '');
    const text = encodeURIComponent(orderText(order));
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener');
    void changeStatus(order, 'sent');
  }

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <h3 className="title text-2xl">🧾 Órdenes de compra</h3>
        <button
          type="button"
          onClick={() => {
            setNewOpen((prev) => !prev);
            setError(null);
          }}
          className="btn btn-primary px-5 py-3 text-lg text-white"
        >
          ➕ Nueva orden
        </button>
      </div>

      {message && (
        <p className="rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>
      )}

      {newOpen && (
        <div className="card space-y-3 p-4">
          <div>
            <label className={label} htmlFor="po-supplier">
              Proveedor
            </label>
            <select
              id="po-supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className={field}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={suggestLowStock}
            className="btn btn-warning w-full py-3 text-lg"
          >
            📉 Sugerir por stock bajo
          </button>

          <div>
            <label className={label} htmlFor="po-product">
              Agregar producto
            </label>
            <div className="flex items-center gap-2">
              <select
                id="po-product"
                value={pickerId}
                onChange={(event) => setPickerId(event.target.value)}
                className={field}
              >
                <option value="">Elige un producto…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLine}
                disabled={!pickerId}
                className="btn btn-neutral shrink-0 px-5 py-3 text-lg"
              >
                ➕
              </button>
            </div>
          </div>

          {lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map((line, index) => {
                const product = productById.get(line.product_id);
                return (
                  <li key={`${line.product_id}-${index}`} className="rounded-xl bg-slate-50 p-3">
                    <p className="mb-2 text-lg font-semibold">{product?.name ?? 'Producto'}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-base font-semibold">
                        Cantidad
                        <input
                          value={line.qty}
                          inputMode="numeric"
                          onChange={(event) =>
                            updateLine(index, { qty: Math.max(1, Math.round(Number(event.target.value) || 1)) })
                          }
                          className={`${field} mt-1`}
                        />
                      </label>
                      <label className="text-base font-semibold">
                        Costo unitario (pesos)
                        <input
                          value={(line.unit_cost_cents / 100).toString()}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateLine(index, {
                              unit_cost_cents: Math.round(Number(event.target.value.replace(/[^0-9.]/g, '')) * 100),
                            })
                          }
                          className={`${field} mt-1`}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      className="btn btn-danger mt-2 w-full py-2 text-base"
                    >
                      🗑 Quitar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <label className={label} htmlFor="po-notes">
              Notas (opcional)
            </label>
            <input
              id="po-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={field}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>
          )}

          <button
            type="button"
            onClick={() => void saveOrder()}
            className="btn btn-primary w-full py-4 text-xl text-white"
          >
            Guardar borrador
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-lg text-slate-500">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-lg text-slate-500">Todavía no hay órdenes de compra.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const supplier = order.order.supplier_id
              ? supplierById.get(order.order.supplier_id)
              : null;
            const total = order.items.reduce(
              (acc, item) => acc + item.qty * item.unit_cost_cents,
              0,
            );
            return (
              <li key={order.order.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold">{supplier?.name ?? 'Sin proveedor'}</p>
                    <p className="text-base text-slate-500">
                      {order.order.created_at.slice(0, 10)} · {order.items.length} producto(s)
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-base font-bold ${
                      order.order.status === 'received'
                        ? 'bg-green-100 text-green-800'
                        : order.order.status === 'sent'
                          ? 'bg-blue-100 text-blue-800'
                          : order.order.status === 'cancelled'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {STATUS_LABEL[order.order.status]}
                  </span>
                </div>

                <ul className="space-y-1">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between text-base text-slate-700">
                      <span>
                        {productById.get(item.product_id)?.name ?? 'Producto'} × {item.qty}
                      </span>
                      <span className="font-semibold">
                        {formatMXN(item.qty * item.unit_cost_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-right text-lg font-bold">Total: {formatMXN(total)}</p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => sendWhatsApp(order)}
                    className="btn btn-neutral py-3 text-lg"
                  >
                    📲 Enviar por WhatsApp
                  </button>
                  {order.order.status !== 'received' ? (
                    <button
                      type="button"
                      onClick={() => void receive(order)}
                      disabled={receivingId === order.order.id}
                      className="btn btn-primary py-3 text-lg text-white"
                    >
                      {receivingId === order.order.id ? 'Registrando…' : '✅ Marcar recibida'}
                    </button>
                  ) : (
                    <span className="flex items-center justify-center rounded-2xl bg-green-50 p-3 text-base font-semibold text-green-800">
                      Pedido recibido
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
