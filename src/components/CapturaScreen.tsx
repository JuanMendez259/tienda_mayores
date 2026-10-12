import { useEffect, useState } from 'react';
import type { Category, SaleUnit, Store } from '../types/database';
import { repository } from '../data';
import { parseAmountToCents } from '../lib/money';
import { fileToDataUrl } from '../lib/image';
import { generateBarcode } from '../lib/csv';

const field = 'min-h-[64px] w-full rounded-2xl border-2 border-slate-300 px-4 text-2xl';
const label = 'mb-1 block text-xl font-semibold';

/**
 * Pantalla móvil para dar de alta productos con foto desde el celular (F-404).
 * Se abre escaneando el QR desde Configuración → Fotos desde el celular.
 */
export function CapturaScreen() {
  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>('piece');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [loadedStore, loadedCategories] = await Promise.all([
        repository.getStore(),
        repository.listCategories(),
      ]);
      setStore(loadedStore);
      setCategories(loadedCategories);
      setCategoryId(loadedCategories[0]?.id ?? '');
    })();
  }, []);

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
    if (!store) return;
    const priceCents = parseAmountToCents(price);
    if (!name.trim()) return setError('Escribe el nombre del producto.');
    if (priceCents <= 0) return setError('Escribe un precio mayor a cero.');

    setSaving(true);
    setError(null);
    const product = await repository.createProduct({
      store_id: store.id,
      category_id: categoryId || null,
      name: name.trim(),
      image_url: imageUrl,
      sale_unit: saleUnit,
      price_cents: priceCents,
      cost_cents: 0,
      barcode: generateBarcode(),
      is_generated_barcode: true,
      track_stock: true,
      stock_qty: 0,
      low_stock_threshold: 0,
      created_by: null,
    });
    setSaving(false);
    setMessage(`"${product.name}" guardado. Puedes capturar otro.`);
    setName('');
    setPrice('');
    setImageUrl(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <h1 className="title mb-1 text-3xl">📷 Alta rápida</h1>
      <p className="mb-4 text-lg text-slate-600">{store?.name ?? 'Cargando…'}</p>

      <div className="mb-4 flex items-center gap-4">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-28 w-28 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white text-5xl">📷</div>
        )}
        <label className="btn btn-primary cursor-pointer px-5 py-5 text-xl text-white">
          Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={pickImage} className="hidden" />
        </label>
      </div>

      <div className="mb-3">
        <label className={label} htmlFor="cap-name">Nombre</label>
        <input id="cap-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </div>

      <div className="mb-3">
        <label className={label} htmlFor="cap-cat">Categoría</label>
        <select id="cap-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className={label} htmlFor="cap-unit">Se vende por</label>
        <select id="cap-unit" value={saleUnit} onChange={(e) => setSaleUnit(e.target.value as SaleUnit)} className={field}>
          <option value="piece">Pieza</option>
          <option value="weight">Kilo (peso)</option>
          <option value="volume">Litro (volumen)</option>
        </select>
      </div>

      <div className="mb-4">
        <label className={label} htmlFor="cap-price">
          Precio por {saleUnit === 'weight' ? 'kilo' : saleUnit === 'volume' ? 'litro' : 'pieza'}
        </label>
        <input
          id="cap-price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className={field}
        />
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>}
      {message && <p className="mb-4 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn btn-primary w-full py-5 text-2xl text-white"
      >
        {saving ? 'Guardando…' : 'Guardar producto'}
      </button>
    </div>
  );
}
