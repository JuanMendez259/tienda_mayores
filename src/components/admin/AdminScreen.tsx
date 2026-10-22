import { useCallback, useEffect, useState } from 'react';
import type { AppUser, Category, Product, Store } from '../../types/database';
import { repository } from '../../data';
import { daysUntil } from '../../lib/expirations';
import { ProductsAdmin } from './ProductsAdmin';
import { InventoryAdmin } from './InventoryAdmin';
import { PurchasesAdmin } from './PurchasesAdmin';
import { PurchaseOrdersAdmin } from './PurchaseOrdersAdmin';
import { SuppliersAdmin } from './SuppliersAdmin';
import { CustomersAdmin } from './CustomersAdmin';
import { MovementsAdmin } from './MovementsAdmin';
import { SettingsAdmin } from './SettingsAdmin';
import { PromotionsAdmin } from './PromotionsAdmin';
import { ExpirationsAdmin } from './ExpirationsAdmin';
import { ReportsAdmin } from './ReportsAdmin';
import { DiagnosticsAdmin } from './DiagnosticsAdmin';

interface AdminScreenProps {
  store: Store;
  user: AppUser;
  users: AppUser[];
  products: Product[];
  categories: Category[];
  /** Sesión de caja abierta (para que los abonos en efectivo entren al corte). */
  cashSessionId: string | null;
  onClose: () => void;
  onRefreshProducts: () => void;
  onStoreSaved: (store: Store) => void;
}

type Tab =
  | 'products'
  | 'inventory'
  | 'promotions'
  | 'expirations'
  | 'orders'
  | 'purchases'
  | 'suppliers'
  | 'credit'
  | 'movements'
  | 'reports'
  | 'settings'
  | 'diagnostics';

type AlertTone = 'red' | 'amber';

interface Alert {
  text: string;
  tone: AlertTone;
}

interface MenuItem {
  id: Tab;
  label: string;
  emoji: string;
  hint: string;
}

/**
 * Centro de administración (catálogo, inventario, compras, reportes y
 * configuración). Pensado para adultos mayores: un menú de una sola pantalla
 * con botones grandes; al entrar a una sección se vuelve con "← Menú".
 * Cada botón muestra un aviso cuando hay algo que atender.
 */
export function AdminScreen({
  store,
  user,
  users,
  products,
  categories,
  cashSessionId,
  onClose,
  onRefreshProducts,
  onStoreSaved,
}: AdminScreenProps) {
  const isOwner = user.role === 'owner';
  const isManager = user.role === 'manager';
  const modules = store.modules;
  const showInventory = modules.inventory;
  const showPurchases = modules.purchases;
  const showCredit = isOwner || isManager;
  const storeId = store.id;
  const expiryDays = store.expiry_alert_days;

  const menu: MenuItem[] = [];
  if (modules.inventory) {
    menu.push({ id: 'products', label: 'Productos', emoji: '🏷️', hint: 'Altas, precios y fotos' });
    menu.push({ id: 'inventory', label: 'Inventario', emoji: '📦', hint: 'Ajustes y mermas' });
  }
  if (modules.discounts) {
    menu.push({ id: 'promotions', label: 'Promociones', emoji: '🎉', hint: 'Ofertas y descuentos' });
  }
  if (modules.inventory) {
    menu.push({ id: 'expirations', label: 'Caducidades', emoji: '📅', hint: 'Por vencer y vencidos' });
  }
  if (modules.purchases) {
    menu.push({ id: 'orders', label: 'Órdenes', emoji: '🧾', hint: 'Pedidos a proveedores' });
    menu.push({ id: 'purchases', label: 'Compras', emoji: '🚚', hint: 'Entradas de mercancía' });
  }
  if (modules.suppliers) {
    menu.push({ id: 'suppliers', label: 'Proveedores', emoji: '🏪', hint: 'Agenda y cambios' });
  }
  if (showCredit) {
    menu.push({ id: 'credit', label: 'Fiado', emoji: '🪙', hint: 'Deudores y abonos' });
  }
  if (modules.movements) {
    menu.push({ id: 'movements', label: 'Movimientos', emoji: '🔄', hint: 'Historial de inventario' });
  }
  menu.push({ id: 'reports', label: 'Reportes', emoji: '📊', hint: 'Ventas y ganancias' });
  if (isOwner) {
    menu.push({ id: 'settings', label: 'Configuración', emoji: '⚙️', hint: 'Tienda y permisos' });
    menu.push({ id: 'diagnostics', label: 'Diagnóstico', emoji: '🩺', hint: 'Conexión e impresora' });
  }

  /** null = menú principal; si no, la sección abierta. */
  const [tab, setTab] = useState<Tab | null>(null);
  const [alerts, setAlerts] = useState<Partial<Record<Tab, Alert>>>({});
  const active = menu.find((item) => item.id === tab) ?? null;

  /** Cuenta lo que necesita atención para avisarlo en el menú. */
  const loadAlerts = useCallback(async () => {
    const next: Partial<Record<Tab, Alert>> = {};

    if (showInventory) {
      const low = products.filter(
        (product) =>
          product.active && product.track_stock && product.stock_qty <= product.low_stock_threshold,
      ).length;
      if (low > 0) {
        next.inventory = { text: `⚠️ ${low} con stock bajo`, tone: 'amber' };
      }
    }

    const tasks: Array<Promise<void>> = [];

    if (showInventory) {
      tasks.push(
        repository
          .listExpiringLots(expiryDays)
          .then((lots) => {
            const expired = lots.filter(
              (lot) => lot.expires_on !== null && daysUntil(lot.expires_on) < 0,
            ).length;
            const soon = lots.length - expired;
            if (expired > 0) {
              next.expirations = {
                text: `⚠️ ${expired} vencido${expired === 1 ? '' : 's'}`,
                tone: 'red',
              };
            } else if (soon > 0) {
              next.expirations = { text: `⚠️ ${soon} por vencer`, tone: 'amber' };
            }
          })
          .catch(() => undefined),
      );
    }

    if (showPurchases) {
      tasks.push(
        repository
          .listPurchaseOrders(storeId)
          .then((orders) => {
            const pending = orders.filter(
              (order) => order.order.status === 'draft' || order.order.status === 'sent',
            ).length;
            if (pending > 0) {
              next.orders = { text: `⚠️ ${pending} por recibir`, tone: 'amber' };
            }
          })
          .catch(() => undefined),
      );
    }

    if (showCredit) {
      tasks.push(
        (async () => {
          const customers = await repository.listCustomers(storeId);
          if (customers.length === 0) return;
          const statements = await Promise.all(
            customers.map((customer) =>
              repository.getCustomerStatement(customer.id).catch(() => null),
            ),
          );
          const debtors = statements.filter((s) => s !== null && s.balance_cents > 0).length;
          const overdue = statements.filter((s) => s !== null && s.overdue_cents > 0).length;
          if (overdue > 0) {
            next.credit = {
              text: `⚠️ ${overdue} moroso${overdue === 1 ? '' : 's'}`,
              tone: 'red',
            };
          } else if (debtors > 0) {
            next.credit = { text: `💳 ${debtors} con fiado`, tone: 'amber' };
          }
        })().catch(() => undefined),
      );
    }

    await Promise.all(tasks);
    setAlerts(next);
  }, [expiryDays, products, showCredit, showInventory, showPurchases, storeId]);

  useEffect(() => {
    void Promise.resolve().then(loadAlerts);
  }, [loadAlerts]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-100">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {active && (
            <button
              type="button"
              onClick={() => {
                setTab(null);
                void loadAlerts();
              }}
              className="btn btn-neutral shrink-0 px-4 py-3 text-lg"
            >
              ← Menú
            </button>
          )}
          <div className="min-w-0">
            <h1 className="title truncate text-2xl">
              {active ? `${active.emoji} ${active.label}` : 'Administración'}
            </h1>
            <p className="truncate text-base text-slate-500">
              {active ? active.hint : 'Elige qué quieres hacer'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-exit shrink-0 px-5 py-3 text-lg"
        >
          🚪 Volver a vender
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!active ? (
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
            {menu.map((item) => {
              const alert = alerts[item.id];
              const toneClass =
                alert?.tone === 'red'
                  ? 'bg-red-50 ring-2 ring-red-300'
                  : alert?.tone === 'amber'
                    ? 'bg-amber-50 ring-2 ring-amber-300'
                    : '';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`card flex min-h-[140px] flex-col items-center justify-center gap-1 p-4 text-center transition-colors ${
                    toneClass || 'hover:border-green-500 hover:bg-green-50'
                  }`}
                >
                  <span className="text-4xl" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="text-xl font-extrabold leading-tight text-slate-900">
                    {item.label}
                  </span>
                  <span className="text-base leading-tight text-slate-500">{item.hint}</span>
                  {alert && (
                    <span
                      className={`mt-1 rounded-full px-3 py-1 text-base font-extrabold ${
                        alert.tone === 'red'
                          ? 'bg-red-200 text-red-900'
                          : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      {alert.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto max-w-6xl">
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
              <InventoryAdmin
                store={store}
                user={user}
                products={products}
                onRefresh={onRefreshProducts}
              />
            )}
            {tab === 'promotions' && <PromotionsAdmin store={store} products={products} />}
            {tab === 'expirations' && (
              <ExpirationsAdmin store={store} user={user} products={products} />
            )}
            {tab === 'orders' && (
              <PurchaseOrdersAdmin store={store} user={user} products={products} />
            )}
            {tab === 'purchases' && (
              <PurchasesAdmin
                store={store}
                user={user}
                products={products}
                onRefresh={onRefreshProducts}
              />
            )}
            {tab === 'suppliers' && <SuppliersAdmin store={store} user={user} />}
            {tab === 'credit' && (
              <CustomersAdmin
                store={store}
                user={user}
                products={products}
                cashSessionId={cashSessionId}
              />
            )}
            {tab === 'movements' && <MovementsAdmin products={products} users={users} />}
            {tab === 'reports' && <ReportsAdmin store={store} />}
            {tab === 'settings' && isOwner && (
              <SettingsAdmin store={store} onSaved={onStoreSaved} />
            )}
            {tab === 'diagnostics' && isOwner && (
              <DiagnosticsAdmin store={store} products={products} categories={categories} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
