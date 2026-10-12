import { useCallback, useEffect, useState } from 'react';
import type { AppUser, CashSession, Category, Product, Store } from './types/database';
import { repository, isRemoteConfigured } from './data';
import { LoginScreen } from './components/LoginScreen';
import { OpenCashScreen } from './components/OpenCashScreen';
import { SaleScreen } from './components/SaleScreen';
import { CashPanel } from './components/CashPanel';

type Stage = 'loading' | 'login' | 'openCash' | 'ready' | 'error';

function App() {
  const [stage, setStage] = useState<Stage>('loading');
  const [store, setStore] = useState<Store | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cashPanelOpen, setCashPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

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

  async function handleLogin(selected: AppUser) {
    setUser(selected);
    const session = await repository.getOpenCashSession(selected.store_id);
    if (session) {
      setCashSession(session);
      await loadCatalog();
      setStage('ready');
    } else {
      setStage('openCash');
    }
  }

  async function handleOpened(session: CashSession) {
    setCashSession(session);
    await loadCatalog();
    setStage('ready');
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
            onRefreshProducts={refreshProducts}
            onOpenCash={() => setCashPanelOpen(true)}
            onLogout={handleLogout}
          />
          {cashPanelOpen && (
            <CashPanel
              session={cashSession}
              onClose={() => setCashPanelOpen(false)}
              onClosed={handleCashClosed}
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
