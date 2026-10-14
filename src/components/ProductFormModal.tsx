import { useEffect, useState } from 'react';
import type { Category, Product, SaleUnit, Supplier } from '../types/database';
import { repository } from '../data';
import { parseAmountToCents } from '../lib/money';
import { fileToDataUrl } from '../lib/image';
import { generateBarcode } from '../lib/csv';
import { CameraCapture } from './CameraCapture';

interface ProductFormModalProps {
  categories: Category[];
  storeId: string;
  userId: string;
  /** Si se pasa, el formulario edita ese producto (F-401). */
  product?: Product | null;
  /** Código leído con el escáner cuando el producto aún no existe (F-102). */
  initialBarcode?: string;
  onClose: () => void;
  onSaved: (product: Product) => void;
}

/** Alta y edición de producto, con foto desde cámara o archivo (F-401, F-403). */
export function ProductFormModal({
  categories,
  storeId,
  userId,
  product = null,
  initialBarcode = '',
  onClose,
  onSaved,
}: ProductFormModalProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? categories[0]?.id ?? '');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>(product?.sale_unit ?? 'piece');
  const [price, setPrice] = useState(product ? (product.price_cents / 100).toFixed(2) : '');
  const [cost, setCost] = useState(product && product.cost_cents ? (product.cost_cents / 100).toFixed(2) : '');
  const [stock, setStock] = useState(product ? String(product.stock_qty) : '0');
  const [lowStock, setLowStock] = useState(product ? String(product.low_stock_threshold) : '3');
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode);
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [supplierId, setSupplierId] = useState(product?.supplier_id ?? '');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void repository.listSuppliers().then((list) => {
      if (active) setSuppliers(list.filter((supplier) => supplier.active));
    });
    return () => {
      active = false;
    };
  }, []);

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
    const trimmedBarcode = barcode.trim();
    const fields = {
      category_id: categoryId || null,
      name: name.trim(),
      image_url: imageUrl,
      sale_unit: saleUnit,
      price_cents: priceCents,
      cost_cents: parseAmountToCents(cost),
      barcode: trimmedBarcode || generateBarcode(),
      is_generated_barcode: !trimmedBarcode,
      track_stock: true,
      stock_qty: Math.max(0, Math.round(Number(stock) || 0)),
      low_stock_threshold: Math.max(0, Math.round(Number(lowStock) || 0)),
      brand: brand.trim() || null,
      supplier_id: supplierId || null,
    };
    const saved = product
      ? await repository.updateProduct(product.id, fields)
      : await repository.createProduct({ ...fields, store_id: storeId, created_by: userId });
    setSaving(false);
    onSaved(saved);
  }

  const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
  const label = 'mb-1 block text-lg font-semibold';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-4 text-3xl">{product ? 'Editar producto' : 'Nuevo producto'}</h2>

        <div className="mb-4 flex items-center gap-4">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-24 w-24 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-4xl">
              📷
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCameraOpen(true)} className="btn btn-neutral px-5 py-4 text-lg">
              📸 Usar cámara
            </button>
            <label className="btn btn-neutral cursor-pointer px-5 py-4 text-lg">
              Elegir archivo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={pickImage}
                className="hidden"
              />
            </label>
          </div>
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

          <div>
            <label className={label} htmlFor="p-brand">Marca (opcional)</label>
            <input id="p-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={field} />
          </div>

          <div>
            <label className={label} htmlFor="p-supplier">Proveedor (opcional)</label>
            <select
              id="p-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
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
            {saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Guardar producto'}
          </button>
        </div>
      </div>

      {cameraOpen && (
        <CameraCapture onCapture={(dataUrl) => setImageUrl(dataUrl)} onClose={() => setCameraOpen(false)} />
      )}
    </div>
  );
}
