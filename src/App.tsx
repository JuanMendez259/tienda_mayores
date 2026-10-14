import { useCallback, useEffect, useState } from 'react';
import type { AppUser, CashSession, Category, Product, Store } from './types/database';
import { repository, isRemoteConfigured } from './data';
import { LoginScreen } from './components/LoginScreen';
import { OpenCashScreen } from './components/OpenCashScreen';
import { SaleScreen } from './components/SaleScreen';
import { CashPanel } from './components/CashPanel';
import { AdminScreen } from './components/admin/AdminScreen';
import { CapturaScreen } from './components/CapturaScreen';
import { flushPendingSales } from './lib/sync';
import { installErrorHandlers, logError } from './lib/errorLog';

type Stage = 'loading' | 'login' | 'openCash' | 'ready' | 'error';

const FONT_SIZES: Record<Store['font_size'], string> = {
  normal: '18px',
  grande: '20px',
  muy_grande: '22px',
};

const isCapturaMode = new URLSearchParams(window.location.search).get('captura') === '1';

function App() {
  const [stage, setStage] = useState<Stage>('loading');
  const [store, setStore] = useState<Store | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cashPanelOpen, setCashPanelOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [promotionsKey, setPromotionsKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!store) return;
    document.documentElement.style.fontSize = FONT_SIZES[store.font_size] ?? FONT_SIZES.normal;
    document.documentElement.style.setProperty('--color-primary', store.primary_color);
  }, [store]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    installErrorHandlers();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [loadedStore, loadedUsers] = await Promise.all([
          repository.getStore(),
          repository.listUsers(),
        ]);
        setStore(loadedStore);
        setUsers(loadedUsers);
        setStage('login');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos.');
        setStage('error');
      }
    })();
  }, []);

  const loadCatalog = useCallback(async () => {
    const [loadedCategories, loadedProducts] = await Promise.all([
      repository.listCategories(),
      repository.listProducts(),
    ]);
    setCategories(loadedCategories);
    setProducts(loadedProducts);
  }, []);

  const refreshProducts = useCallback(() => {
    void repository.listProducts().then(setProducts);
  }, []);

  // Al recuperar la conexión, enviar las ventas pendientes y refrescar el catálogo (F-704).
  useEffect(() => {
    if (!online) return;
    void (async () => {
      try {
        const result = await flushPendingSales();
        if (result.sent > 0) {
          refreshProducts();
        }
      } catch (cause) {
        logError(cause, 'sync-effect');
      }
    })();
  }, [online, refreshProducts]);

  async function handleLogin(selected: AppUser) {
    setUser(selected);
    try {
      const session = await repository.getOpenCashSession(selected.store_id);
      if (session) {
        setCashSession(session);
        await loadCatalog();
        setStage('ready');
      } else {
        setStage('openCash');
      }
    } catch (cause) {
      logError(cause, 'login');
      setError(cause instanceof Error ? cause.message : 'No se pudo entrar.');
      setStage('error');
    }
  }

  async function handleOpened(session: CashSession) {
    setCashSession(session);
    try {
      await loadCatalog();
      setStage('ready');
    } catch (cause) {
      logError(cause, 'open-cash');
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.');
      setStage('error');
    }
  }

  function handleLogout() {
    setUser(null);
    setCashSession(null);
    setProducts([]);
    setCategories([]);
    setStage('login');
  }

  function handleCashClosed() {
    setCashPanelOpen(false);
    setCashSession(null);
    setStage('openCash');
  }

  if (isCapturaMode) {
    return <CapturaScreen />;
  }

  if (stage === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-2xl font-bold">
        Cargando…
      </div>
    );
  }

  if (stage === 'error' || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center">
        <span className="text-5xl">⚠️</span>
        <h1 className="title text-3xl">No se pudo iniciar</h1>
        <p className="text-xl text-slate-600">{error ?? 'Revisa la configuración.'}</p>
      </div>
    );
  }

  return (
    <>
      {!online && (
        <div className="bg-amber-400 px-4 py-2 text-center text-lg font-bold text-amber-950">
          Sin internet: tus ventas se guardarán y se enviarán después.
        </div>
      )}

      {stage === 'login' && <LoginScreen store={store} users={users} onLogin={handleLogin} />}

      {stage === 'openCash' && user && (
        <OpenCashScreen store={store} user={user} onOpened={handleOpened} />
      )}

      {stage === 'ready' && user && cashSession && (
        <>
          <SaleScreen
            store={store}
            user={user}
            cashSession={cashSession}
            products={products}
            categories={categories}
            promotionsKey={promotionsKey}
            onRefreshProducts={refreshProducts}
            onOpenCash={() => setCashPanelOpen(true)}
            onOpenAdmin={() => setAdminOpen(true)}
            onLogout={handleLogout}
          />
          {cashPanelOpen && (
            <CashPanel
              session={cashSession}
              onClose={() => setCashPanelOpen(false)}
              onClosed={handleCashClosed}
              onProfiles={() => {
                setCashPanelOpen(false);
                handleLogout();
              }}
            />
          )}
          {adminOpen && (
            <AdminScreen
              store={store}
              user={user}
              users={users}
              products={products}
              categories={categories}
              onClose={() => {
                setAdminOpen(false);
                setPromotionsKey((key) => key + 1);
              }}
              onRefreshProducts={refreshProducts}
              onStoreSaved={setStore}
            />
          )}
        </>
      )}

      {!isRemoteConfigured && (
        <div className="pointer-events-none fixed bottom-1 right-2 text-sm text-slate-400">
          modo demostración
        </div>
      )}
    </>
  );
}

export default App;
