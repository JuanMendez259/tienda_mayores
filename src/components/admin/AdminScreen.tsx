import { useState } from 'react';
import type { AppUser, Category, Product, Store } from '../../types/database';
import { ProductsAdmin } from './ProductsAdmin';
import { InventoryAdmin } from './InventoryAdmin';
import { PurchasesAdmin } from './PurchasesAdmin';
import { SuppliersAdmin } from './SuppliersAdmin';
import { MovementsAdmin } from './MovementsAdmin';
import { SettingsAdmin } from './SettingsAdmin';

interface AdminScreenProps {
  store: Store;
  user: AppUser;
  users: AppUser[];
  products: Product[];
  categories: Category[];
  onClose: () => void;
  onRefreshProducts: () => void;
  onStoreSaved: (store: Store) => void;
}

type Tab = 'products' | 'inventory' | 'purchases' | 'suppliers' | 'movements' | 'settings';

/** Centro de administración de la Fase 2 (catálogo, inventario, compras, configuración). */
export function AdminScreen({
  store,
  user,
  users,
  products,
  categories,
  onClose,
  onRefreshProducts,
  onStoreSaved,
}: AdminScreenProps) {
  const isOwner = user.role === 'owner';
  const modules = store.modules;

  const tabs: { id: Tab; label: string }[] = [];
  if (modules.inventory) tabs.push({ id: 'products', label: 'Productos' });
  if (modules.inventory) tabs.push({ id: 'inventory', label: 'Inventario' });
  if (modules.purchases) tabs.push({ id: 'purchases', label: 'Compras' });
  if (modules.suppliers) tabs.push({ id: 'suppliers', label: 'Proveedores' });
  if (modules.movements) tabs.push({ id: 'movements', label: 'Movimientos' });
  if (isOwner) tabs.push({ id: 'settings', label: 'Configuración' });

  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'products');

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-100">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="title text-2xl">Administración</h1>
        <button type="button" onClick={onClose} className="btn btn-neutral px-5 py-3 text-lg">
          Volver a la venta
        </button>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`btn whitespace-nowrap px-4 py-3 text-lg ${
              tab === item.id ? 'btn-primary text-white' : 'btn-neutral'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'products' && (
          <ProductsAdmin
            store={store}
            user={user}
            products={products}
            categories={categories}
            onRefresh={onRefreshProducts}
          />
        )}
        {tab === 'inventory' && (
          <InventoryAdmin store={store} user={user} products={products} onRefresh={onRefreshProducts} />
        )}
        {tab === 'purchases' && (
          <PurchasesAdmin store={store} user={user} products={products} onRefresh={onRefreshProducts} />
        )}
        {tab === 'suppliers' && <SuppliersAdmin store={store} />}
        {tab === 'movements' && <MovementsAdmin products={products} users={users} />}
        {tab === 'settings' && isOwner && <SettingsAdmin store={store} onSaved={onStoreSaved} />}
      </div>
    </div>
  );
}
