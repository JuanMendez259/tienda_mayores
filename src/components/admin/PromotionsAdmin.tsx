import { useEffect, useState } from 'react';
import type { Product, Promotion, PromotionType, Store } from '../../types/database';
import { repository } from '../../data';
import { formatMXN, parseAmountToCents } from '../../lib/money';

interface PromotionsAdminProps {
  store: Store;
  products: Product[];
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

const TYPE_LABEL: Record<PromotionType, string> = {
  bogo: '2×1 (lleva 2, paga 1)',
  qty_discount: 'Descuento por cantidad',
};

/** Promociones sencillas por producto (F-407): 2×1 o descuento por cantidad. */
export function PromotionsAdmin({ store, products }: PromotionsAdminProps) {
  const pieceProducts = products.filter((p) => p.active && p.sale_unit === 'piece');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [productId, setProductId] = useState(pieceProducts[0]?.id ?? '');
  const [type, setType] = useState<PromotionType>('bogo');
  const [minQty, setMinQty] = useState('2');
  const [discount, setDiscount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setPromotions(await repository.listPromotions());
  }

  useEffect(() => {
    void (async () => {
      setPromotions(await repository.listPromotions());
    })();
  }, []);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';

  async function save() {
    if (!productId) return setError('Elige un producto.');
    const minQtyValue = type === 'bogo' ? 2 : Math.max(2, Number.parseInt(minQty, 10) || 2);
    const discountCents = type === 'qty_discount' ? parseAmountToCents(discount) : 0;
    if (type === 'qty_discount' && discountCents <= 0) {
      return setError('Escribe el monto del descuento.');
    }
    setBusy(true);
    setError(null);
    await repository.savePromotion({
      store_id: store.id,
      product_id: productId,
      type,
      min_qty: minQtyValue,
      discount_cents: discountCents,
      active: true,
    });
    setBusy(false);
    setMessage(`Promoción guardada para ${productName(productId)}.`);
    await load();
  }

  async function remove(promotion: Promotion) {
    await repository.deletePromotion(promotion.id);
    setMessage(`Promoción eliminada de ${productName(promotion.product_id)}.`);
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Nueva promoción</h3>

        <div className="mb-3">
          <label className={label} htmlFor="pr-product">Producto (por pieza)</label>
          <select id="pr-product" value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
            {pieceProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className={label} htmlFor="pr-type">Tipo</label>
          <select
            id="pr-type"
            value={type}
            onChange={(e) => setType(e.target.value as PromotionType)}
            className={field}
          >
            {(Object.keys(TYPE_LABEL) as PromotionType[]).map((value) => (
              <option key={value} value={value}>{TYPE_LABEL[value]}</option>
            ))}
          </select>
        </div>

        {type === 'qty_discount' && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="pr-min">Cantidad mínima</label>
              <input
                id="pr-min"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                inputMode="numeric"
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="pr-discount">Descuento (MXN)</label>
              <input
                id="pr-discount"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={field}
              />
            </div>
          </div>
        )}

        {error && <p className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>}
        {message && <p className="mb-4 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>}

        <button type="button" onClick={save} disabled={busy} className="btn btn-primary w-full py-4 text-xl text-white">
          {busy ? 'Guardando…' : 'Guardar promoción'}
        </button>
      </section>

      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Promociones activas ({promotions.length})</h3>
        {promotions.length === 0 ? (
          <p className="text-lg text-slate-500">Aún no hay promociones.</p>
        ) : (
          <ul className="space-y-2">
            {promotions.map((promotion) => (
              <li key={promotion.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div>
                  <p className="text-lg font-semibold">{productName(promotion.product_id)}</p>
                  <p className="text-base text-slate-600">
                    {TYPE_LABEL[promotion.type]}
                    {promotion.type === 'qty_discount'
                      ? ` · desde ${promotion.min_qty} · −${formatMXN(promotion.discount_cents)}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(promotion)}
                  className="btn btn-danger px-4 py-3 text-lg text-white"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
