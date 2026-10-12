import { useCallback, useEffect, useState } from 'react';
import type { Category, Product, Store } from '../../types/database';
import { repository } from '../../data';
import { clearErrors, listErrors, type ErrorLogEntry } from '../../lib/errorLog';
import { pendingCount } from '../../lib/offlineQueue';
import { flushPendingSales } from '../../lib/sync';
import { catalogToCsv, downloadText } from '../../lib/reportExport';
import { getLastScan, subscribeDeviceStatus } from '../../devices/deviceStatus';
import { ticketPrinter } from '../../devices/printer';
import { CameraCapture } from '../CameraCapture';

interface DiagnosticsAdminProps {
  store: Store;
  products: Product[];
  categories: Category[];
}

/** Estado de conexión, sincronización y registro de errores (F-704, F-706, F-707). */
export function DiagnosticsAdmin({ store, products, categories }: DiagnosticsAdminProps) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastScan, setLastScan] = useState(getLastScan());
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraShot, setCameraShot] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPending(await pendingCount());
    setErrors(listErrors());
  }, []);

  useEffect(() => {
    void (async () => {
      setPending(await pendingCount());
      setErrors(listErrors());
    })();
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => subscribeDeviceStatus(() => setLastScan(getLastScan())), []);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    const result = await flushPendingSales();
    await refresh();
    setBusy(false);
    setMessage(
      result.sent === 0 && result.failed === 0
        ? 'No había ventas pendientes.'
        : `Sincronizadas ${result.sent} venta(s). Fallaron ${result.failed}.`,
    );
  }

  function exportCatalog() {
    downloadText(`catalogo-${store.name.replace(/\s+/g, '-').toLowerCase()}.csv`, catalogToCsv(products, categories));
  }

  async function exportSales() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    const report = await repository.getReport({ from: from.toISOString(), to: to.toISOString() });
    const rows = [
      ['fecha', 'ventas_mxn', 'cantidad'],
      ...report.byDay.map((day) => [day.date, (day.totalCents / 100).toFixed(2), String(day.count)]),
    ];
    downloadText(`ventas-30-dias-${store.name.replace(/\s+/g, '-').toLowerCase()}.csv`, rows.map((r) => r.join(',')).join('\n'));
    setMessage('Reporte de ventas exportado.');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="title mb-3 text-2xl">Conexión y sincronización</h3>
        <p className={`mb-4 rounded-xl p-3 text-lg font-semibold ${online ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
          {online ? '✅ Conectado a internet' : '📶 Sin internet: las ventas se guardan y se enviarán al reconectar'}
        </p>
        <p className="mb-4 text-lg">
          Ventas pendientes por enviar: <span className="font-extrabold">{pending}</span>
        </p>
        {message && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-lg font-semibold">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={syncNow} disabled={busy} className="btn btn-primary px-5 py-3 text-lg text-white">
            {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <button type="button" onClick={() => void refresh()} className="btn btn-neutral px-5 py-3 text-lg">
            Actualizar
          </button>
        </div>

        <h4 className="mb-2 mt-6 text-xl font-bold">Exportar datos (respaldo)</h4>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCatalog} className="btn btn-neutral px-5 py-3 text-lg">
            ⬇ Catálogo (CSV)
          </button>
          <button type="button" onClick={() => void exportSales()} className="btn btn-neutral px-5 py-3 text-lg">
            ⬇ Ventas 30 días (CSV)
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="title text-2xl">Errores registrados ({errors.length})</h3>
          {errors.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearErrors();
                void refresh();
              }}
              className="btn btn-neutral px-4 py-2 text-base"
            >
              Limpiar
            </button>
          )}
        </div>
        {errors.length === 0 ? (
          <p className="text-lg text-slate-500">No hay errores registrados. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {errors.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="rounded-xl bg-red-50 p-3">
                <p className="text-base font-semibold text-red-900">{entry.message}</p>
                <p className="text-sm text-slate-600">
                  {new Date(entry.at).toLocaleString('es-MX')}
                  {entry.context ? ` · ${entry.context}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 lg:col-span-2">
        <h3 className="title mb-3 text-2xl">Dispositivos</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="mb-1 text-xl font-bold">🔎 Escáner</p>
            {lastScan ? (
              <>
                <p className="text-lg">
                  Último código: <span className="font-extrabold">{lastScan.code}</span>
                </p>
                <p className="text-base text-slate-500">
                  {new Date(lastScan.at).toLocaleTimeString('es-MX')}
                </p>
              </>
            ) : (
              <p className="text-lg text-slate-500">Escanea un producto de prueba para comprobarlo.</p>
            )}
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="mb-1 text-xl font-bold">🖨 Impresora</p>
            <p className="mb-3 text-lg">Papel de {store.ticket_width_mm} mm</p>
            <button
              type="button"
              onClick={() => ticketPrinter.printTest(store)}
              className="btn btn-neutral px-4 py-3 text-lg"
            >
              Imprimir prueba
            </button>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="mb-1 text-xl font-bold">📷 Cámara</p>
            {cameraShot ? (
              <img
                src={cameraShot}
                alt="Prueba de cámara"
                className="mb-3 h-24 w-24 rounded-xl object-cover"
              />
            ) : (
              <p className="mb-3 text-lg text-slate-500">Aún sin prueba.</p>
            )}
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="btn btn-neutral px-4 py-3 text-lg"
            >
              Probar cámara
            </button>
          </div>
        </div>
      </section>

      {cameraOpen && (
        <CameraCapture onCapture={(dataUrl) => setCameraShot(dataUrl)} onClose={() => setCameraOpen(false)} />
      )}
    </div>
  );
}
