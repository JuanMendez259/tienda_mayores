import { useEffect, useState } from 'react';
import type { Store } from '../../types/database';
import { repository } from '../../data';
import type { ReportData } from '../../data/repository';
import { formatMXN } from '../../lib/money';
import { downloadText, printReport, reportToCsv } from '../../lib/reportExport';

interface ReportsAdminProps {
  store: Store;
}

type Preset = 'hoy' | 'semana' | 'mes';

const PRESET_LABEL: Record<Preset, string> = {
  hoy: 'Hoy',
  semana: 'Últimos 7 días',
  mes: 'Últimos 30 días',
};

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card_clip: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

function rangeFor(preset: Preset): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === 'semana') from.setDate(from.getDate() - 6);
  if (preset === 'mes') from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Reportes de ventas, productos y ganancia estimada (F-604) con exportación (F-605). */
export function ReportsAdmin({ store }: ReportsAdminProps) {
  const [preset, setPreset] = useState<Preset>('hoy');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const data = await repository.getReport(rangeFor(preset));
      setReport(data);
      setLoading(false);
    })();
  }, [preset]);

  function changePreset(value: Preset) {
    setLoading(true);
    setPreset(value);
  }

  function exportCsv() {
    if (!report) return;
    downloadText(`reporte-${report.from.slice(0, 10)}.csv`, reportToCsv(report));
  }

  function exportPdf() {
    if (report) printReport(store, report);
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(Object.keys(PRESET_LABEL) as Preset[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changePreset(value)}
              className={`btn px-4 py-3 text-lg ${preset === value ? 'btn-primary text-white' : 'btn-neutral'}`}
            >
              {PRESET_LABEL[value]}
            </button>
          ))}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={exportCsv} disabled={!report} className="btn btn-neutral px-4 py-3 text-lg">
              ⬇ CSV
            </button>
            <button type="button" onClick={exportPdf} disabled={!report} className="btn btn-neutral px-4 py-3 text-lg">
              🖨 PDF
            </button>
          </span>
        </div>

        {loading || !report ? (
          <p className="text-lg text-slate-500">Calculando…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Ventas totales" value={formatMXN(report.totalSalesCents)} />
            <Metric label="Número de ventas" value={String(report.salesCount)} />
            <Metric label="Ganancia estimada" value={formatMXN(report.profitCents)} />
          </div>
        )}
      </section>

      {report && !loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h3 className="title mb-3 text-2xl">Ventas por día</h3>
            {report.byDay.length === 0 ? (
              <p className="text-lg text-slate-500">Sin ventas en el periodo.</p>
            ) : (
              <table className="w-full text-lg">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1">Fecha</th>
                    <th className="py-1 text-right">Ventas</th>
                    <th className="py-1 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDay.map((day) => (
                    <tr key={day.date} className="border-t border-slate-200">
                      <td className="py-1">{day.date}</td>
                      <td className="py-1 text-right font-semibold">{formatMXN(day.totalCents)}</td>
                      <td className="py-1 text-right">{day.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card p-4">
            <h3 className="title mb-3 text-2xl">Formas de pago</h3>
            {report.byPaymentMethod.length === 0 ? (
              <p className="text-lg text-slate-500">Sin pagos registrados.</p>
            ) : (
              <ul className="space-y-2">
                {report.byPaymentMethod.map((method) => (
                  <li key={method.method} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                    <span className="text-lg font-semibold">{METHOD_LABEL[method.method] ?? method.method}</span>
                    <span className="text-lg font-bold">{formatMXN(method.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h3 className="title mb-3 text-2xl">Más vendidos</h3>
            {report.topProducts.length === 0 ? (
              <p className="text-lg text-slate-500">Sin datos.</p>
            ) : (
              <ul className="space-y-2">
                {report.topProducts.map((product) => (
                  <li key={product.productId} className="flex items-center justify-between rounded-xl bg-green-50 p-3">
                    <span className="text-lg font-semibold">{product.name}</span>
                    <span className="text-lg font-bold">
                      {product.qty} · {formatMXN(product.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h3 className="title mb-3 text-2xl">Menor rotación</h3>
            {report.lowRotation.length === 0 ? (
              <p className="text-lg text-slate-500">Sin datos.</p>
            ) : (
              <ul className="space-y-2">
                {report.lowRotation.map((product) => (
                  <li key={product.productId} className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
                    <span className="text-lg font-semibold">{product.name}</span>
                    <span className="text-lg font-bold">{product.qty} vendidos</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-base text-slate-500">{label}</p>
      <p className="text-3xl font-extrabold">{value}</p>
    </div>
  );
}
