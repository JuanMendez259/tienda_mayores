import { useMemo, useRef, useState } from 'react';
import type { AppUser, Category, Product, Store } from '../../types/database';
import { repository } from '../../data';
import { formatMXN } from '../../lib/money';
import { formatStock, unitLabel } from '../../lib/weight';
import { parseProductsCsv, productsCsvTemplate } from '../../lib/csv';
import { printLabels } from '../../devices/printer';
import { emojiImage } from '../../data/seed';
import { ProductFormModal } from '../ProductFormModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { CategoriesAdmin } from './CategoriesAdmin';

interface ProductsAdminProps {
  store: Store;
  user: AppUser;
  products: Product[];
  categories: Category[];
  onRefresh: () => void;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';

/** Catálogo: alta, edición, baja e importación CSV (F-401, F-402, F-408). */
export function ProductsAdmin({ store, user, products, categories, onRefresh }: ProductsAdminProps) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) ?? '—' : 'Sin categoría');
  }, [categories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? products.filter(
          (p) => p.name.toLowerCase().includes(term) || (p.barcode ?? '').includes(term),
        )
      : products;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search]);

  function downloadTemplate() {
    const blob = new Blob([productsCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plantilla-productos.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { rows, errors } = parseProductsCsv(text);
    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    let created = 0;
    let newCategories = 0;
    for (const row of rows) {
      let categoryId: string | null = null;
      if (row.category) {
        const key = row.category.toLowerCase();
        let found = categoryByName.get(key);
        if (!found) {
          // La categoría del CSV no existe: se crea automáticamente (F-401).
          const createdCategory = await repository.createCategory({
            store_id: store.id,
            name: row.category,
            image_url: emojiImage('🏷️', '#e2e8f0'),
            color: '#e2e8f0',
          });
          found = createdCategory.id;
          categoryByName.set(key, found);
          newCategories += 1;
        }
        categoryId = found;
      }
      await repository.createProduct({
        store_id: store.id,
        category_id: categoryId,
        name: row.name,
        image_url: row.imageUrl,
        sale_unit: row.saleUnit,
        price_cents: row.priceCents,
        cost_cents: row.costCents,
        barcode: row.barcode,
        is_generated_barcode: false,
        track_stock: true,
        stock_qty: row.stockQty,
        low_stock_threshold: row.lowStockThreshold,
        created_by: user.id,
      });
      created += 1;
    }
    if (fileRef.current) fileRef.current.value = '';
    onRefresh();
    setReport(
      `Importación terminada: ${created} producto(s) creado(s)` +
        (newCategories ? `, ${newCategories} categoría(s) nueva(s)` : '') +
        (errors.length ? `, ${errors.length} con error.` : '.'),
    );
  }

  async function deactivate() {
    if (!toDelete) return;
    await repository.deactivateProduct(toDelete.id);
    setToDelete(null);
    onRefresh();
    setReport('Producto desactivado.');
  }

  /** Imprime etiquetas con precio y QR de los productos filtrados (F-406). */
  async function printPriceTags() {
    const items = filtered.slice(0, 60).map((product) => ({
      name: product.name,
      code: product.barcode ?? '',
      priceLabel: `${formatMXN(product.price_cents)}/${unitLabel(product.sale_unit)}`,
    }));
    if (items.length === 0) return;
    setReport(`Preparando ${items.length} etiqueta(s)…`);
    await printLabels(items, store.name, store.ticket_width_mm);
    setReport(`Etiquetas listas (${items.length}).`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className={`${field} flex-1 min-w-[220px]`}
        />
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="btn btn-primary px-5 py-4 text-lg text-white"
        >
          + Nuevo producto
        </button>
        <button type="button" onClick={downloadTemplate} className="btn btn-neutral px-5 py-4 text-lg">
          Plantilla CSV
        </button>
        <button
          type="button"
          onClick={() => setCategoriesOpen(true)}
          className="btn btn-neutral px-5 py-4 text-lg"
        >
          🏷️ Categorías
        </button>
        <label className="btn btn-neutral cursor-pointer px-5 py-4 text-lg">
          Importar CSV
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
        </label>
        <button type="button" onClick={() => void printPriceTags()} className="btn btn-neutral px-5 py-4 text-lg">
          🖨 Etiquetas
        </button>
      </div>

      {report && (
        <p className="mb-4 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{report}</p>
      )}

      <ul className="space-y-2">
        {filtered.map((product) => (
          <li key={product.id} className="card flex items-center gap-3 p-3">
            {product.image_url ? (
              <img src={product.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                🥫
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold">{product.name}</p>
              <p className="text-base text-slate-600">
                {categoryName(product.category_id)} · {formatMXN(product.price_cents)}/{unitLabel(product.sale_unit)} ·{' '}
                {formatStock(product.stock_qty, product.sale_unit)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(product);
                  setFormOpen(true);
                }}
                className="btn btn-neutral px-4 py-3 text-lg"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setToDelete(product)}
                className="btn btn-danger px-4 py-3 text-lg text-white"
              >
                Quitar
              </button>
            </div>
          </li>
        ))}
        {filtered.length === 0 && <p className="text-lg text-slate-500">No se encontraron productos.</p>}
      </ul>

      {formOpen && (
        <ProductFormModal
          key={editing?.id ?? 'new'}
          product={editing}
          categories={categories}
          storeId={store.id}
          userId={user.id}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            onRefresh();
            setReport('Producto guardado.');
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`¿Quitar "${toDelete?.name ?? ''}"?`}
        message="El producto dejará de aparecer en la venta, pero se conserva su historial."
        confirmLabel="Sí, quitar"
        onConfirm={deactivate}
        onCancel={() => setToDelete(null)}
      />

      {categoriesOpen && (
        <CategoriesAdmin
          store={store}
          onClose={() => setCategoriesOpen(false)}
          onChanged={onRefresh}
        />
      )}
    </div>
  );
}
