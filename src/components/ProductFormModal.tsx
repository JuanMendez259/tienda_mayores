import { useState } from 'react';
import type { Category, Product, SaleUnit } from '../types/database';
import { repository } from '../data';
import { parseAmountToCents } from '../lib/money';
import { fileToDataUrl } from '../lib/image';

interface ProductFormModalProps {
  open: boolean;
  categories: Category[];
  storeId: string;
  userId: string;
  onClose: () => void;
  onSaved: (product: Product) => void;
}

/** Alta rápida de producto desde la venta, con foto desde archivo (F-403). */
export function ProductFormModal({
  open,
  categories,
  storeId,
  userId,
  onClose,
  onSaved,
}: ProductFormModalProps) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>('piece');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('0');
  const [lowStock, setLowStock] = useState('3');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const stockLabel =
    saleUnit === 'weight' ? 'Gramos en bodega' : saleUnit === 'volume' ? 'Mililitros en bodega' : 'Piezas en bodega';

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImageUrl(await fileToDataUrl(file));
    } catch {
      setError('No se pudo leer la foto.');
    }
  }

  async function save() {
    const priceCents = parseAmountToCents(price);
    if (!name.trim()) return setError('Escribe el nombre del producto.');
    if (priceCents <= 0) return setError('Escribe un precio mayor a cero.');

    setSaving(true);
    setError(null);
    const product = await repository.createProduct({
      store_id: storeId,
      category_id: categoryId || null,
      name: name.trim(),
      image_url: imageUrl,
      sale_unit: saleUnit,
      price_cents: priceCents,
      cost_cents: parseAmountToCents(cost),
      barcode: barcode.trim() || null,
      is_generated_barcode: !barcode.trim(),
      track_stock: true,
      stock_qty: Math.max(0, Math.round(Number(stock) || 0)),
      low_stock_threshold: Math.max(0, Math.round(Number(lowStock) || 0)),
      created_by: userId,
    });
    setSaving(false);
    onSaved(product);
  }

  const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
  const label = 'mb-1 block text-lg font-semibold';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-4 text-3xl">Nuevo producto</h2>

        <div className="mb-4 flex items-center gap-4">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-24 w-24 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-4xl">
              📷
            </div>
          )}
          <label className="btn btn-neutral cursor-pointer px-5 py-4 text-lg">
            Elegir foto
            <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="p-name">Nombre</label>
            <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>

          <div>
            <label className={label} htmlFor="p-cat">Categoría</label>
            <select id="p-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="p-unit">Se vende por</label>
            <select id="p-unit" value={saleUnit} onChange={(e) => setSaleUnit(e.target.value as SaleUnit)} className={field}>
              <option value="piece">Pieza</option>
              <option value="weight">Kilo (peso)</option>
              <option value="volume">Litro (volumen)</option>
            </select>
          </div>

          <div>
            <label className={label} htmlFor="p-price">
              Precio por {saleUnit === 'weight' ? 'kilo' : saleUnit === 'volume' ? 'litro' : 'pieza'}
            </label>
            <input id="p-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
          </div>

          <div>
            <label className={label} htmlFor="p-cost">Costo (opcional)</label>
            <input id="p-cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
          </div>

          <div>
            <label className={label} htmlFor="p-stock">{stockLabel}</label>
            <input id="p-stock" value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={field} />
          </div>

          <div>
            <label className={label} htmlFor="p-low">Aviso de poco stock</label>
            <input id="p-low" value={lowStock} onChange={(e) => setLowStock(e.target.value)} inputMode="numeric" className={field} />
          </div>

          <div className="sm:col-span-2">
            <label className={label} htmlFor="p-barcode">Código de barras (opcional)</label>
            <input id="p-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} className={field} />
            <p className="mt-1 text-base text-slate-500">
              Si lo dejas vacío, el sistema genera un código interno (F-405).
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-neutral flex-1 py-4 text-xl">
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-primary flex-1 py-4 text-xl text-white"
          >
            {saving ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </div>
    </div>
  );
}
