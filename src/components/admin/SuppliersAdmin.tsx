import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppUser,
  Store,
  Supplier,
  SupplierSchedule,
  SupplierType,
  SupplierVisit,
  SupplierVisitSteps,
} from '../../types/database';
import { repository } from '../../data';
import type { PurchaseOrderWithItems, SupplierExchangeWithItems } from '../../data';
import { formatMXN } from '../../lib/money';

interface SuppliersAdminProps {
  store: Store;
  user: AppUser;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

const TYPES: { id: SupplierType; label: string }[] = [
  { id: 'local', label: '🏪 Local' },
  { id: 'regional', label: '🚚 Regional' },
  { id: 'national', label: '🏭 Nacional' },
];

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Pasos que se marcan durante la visita a un proveedor (F-A02). */
const VISIT_STEPS: { key: keyof SupplierVisitSteps; label: string }[] = [
  { key: 'inventory', label: 'Revisar inventario' },
  { key: 'expirations', label: 'Revisar caducidades' },
  { key: 'order', label: 'Generar pedido' },
];

const VISIT_STATUS_LABEL: Record<string, string> = {
  scheduled: '⏳ Programada',
  done: '✅ Visitó',
  skipped: '⛔ No vino',
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Proveedores (F-606) con su TIPO (F-A01) y su agenda de visitas y hora límite
 * de pedido (F-A02, F-A07, F-A08).
 */
export function SuppliersAdmin({ store, user }: SuppliersAdminProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [schedules, setSchedules] = useState<SupplierSchedule[]>([]);
  const [visits, setVisits] = useState<SupplierVisit[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<SupplierType>('local');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [listTypeFilter, setListTypeFilter] = useState<SupplierType | 'all'>('all');

  // Historial por proveedor (F-A08)
  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);
  const [historyVisits, setHistoryVisits] = useState<SupplierVisit[]>([]);
  const [historyOrders, setHistoryOrders] = useState<PurchaseOrderWithItems[]>([]);
  const [historyExchanges, setHistoryExchanges] = useState<SupplierExchangeWithItems[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Agenda
  const [scheduleSupplierId, setScheduleSupplierId] = useState('');
  const [scheduleWeekday, setScheduleWeekday] = useState(1);
  const [scheduleCutoff, setScheduleCutoff] = useState('12:00');

  const today = todayIso();

  const load = useCallback(async () => {
    const [supplierList, scheduleList, visitList] = await Promise.all([
      repository.listSuppliers(),
      repository.listSchedules(store.id),
      repository.listVisits(store.id, today, today),
    ]);
    setSuppliers(supplierList);
    setSchedules(scheduleList);
    setVisits(visitList);
  }, [store.id, today]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.active), [suppliers]);
  const shownSuppliers = useMemo(
    () =>
      listTypeFilter === 'all'
        ? activeSuppliers
        : activeSuppliers.filter((supplier) => supplier.type === listTypeFilter),
    [activeSuppliers, listTypeFilter],
  );
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const todayWeekday = new Date().getDay();
  const todaySchedules = schedules.filter((s) => s.weekday === todayWeekday);

  function reset() {
    setName('');
    setPhone('');
    setType('local');
    setNotes('');
    setEditingId(null);
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError('Escribe el nombre del proveedor.');
    const input = {
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      type,
    };
    if (editingId) {
      await repository.updateSupplier(editingId, input);
    } else {
      await repository.createSupplier({ store_id: store.id, ...input });
    }
    reset();
    setMessage('Proveedor guardado.');
    await load();
  }

  async function deactivate(id: string) {
    await repository.updateSupplier(id, { active: false });
    await load();
  }

  function edit(supplier: Supplier) {
    setEditingId(supplier.id);
    setName(supplier.name);
    setPhone(supplier.phone ?? '');
    setType(supplier.type);
    setNotes(supplier.notes ?? '');
    setError(null);
  }

  async function addSchedule() {
    if (!scheduleSupplierId) return setError('Elige el proveedor para la agenda.');
    setError(null);
    await repository.saveSchedule({
      store_id: store.id,
      supplier_id: scheduleSupplierId,
      weekday: scheduleWeekday,
      order_cutoff_time: scheduleCutoff,
      notes: null,
    });
    setScheduleSupplierId('');
    setMessage('Día de visita agregado.');
    await load();
  }

  async function removeSchedule(id: string) {
    await repository.deleteSchedule(id);
    await load();
  }

  async function markVisit(supplierId: string, status: 'done' | 'skipped') {
    await repository.markVisit({
      store_id: store.id,
      supplier_id: supplierId,
      visit_date: today,
      status,
      notes: null,
    });
    await load();
  }

  const visitStatus = (supplierId: string) =>
    visits.find((v) => v.supplier_id === supplierId)?.status ?? null;

  const visitSteps = (supplierId: string) =>
    visits.find((v) => v.supplier_id === supplierId)?.steps ?? {};

  async function toggleStep(supplierId: string, key: keyof SupplierVisitSteps) {
    const visit = visits.find((v) => v.supplier_id === supplierId);
    const steps: SupplierVisitSteps = { ...(visit?.steps ?? {}), [key]: !(visit?.steps?.[key]) };
    await repository.markVisit({
      store_id: store.id,
      supplier_id: supplierId,
      visit_date: today,
      status: visit?.status ?? 'scheduled',
      notes: visit?.notes ?? null,
      steps,
    });
    await load();
  }

  async function openHistory(supplier: Supplier) {
    setHistoryFor(supplier);
    setHistoryLoading(true);
    const [visitList, orderList, exchangeList] = await Promise.all([
      repository.listVisits(store.id, daysAgoIso(60), today),
      repository.listPurchaseOrders(store.id),
      repository.listSupplierExchanges(store.id),
    ]);
    setHistoryVisits(visitList.filter((v) => v.supplier_id === supplier.id));
    setHistoryOrders(orderList.filter((o) => o.order.supplier_id === supplier.id));
    setHistoryExchanges(exchangeList.filter((e) => e.exchange.supplier_id === supplier.id));
    setHistoryLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="title mb-4 text-2xl">{editingId ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
          <div className="mb-3">
            <label className={label} htmlFor="s-name">
              Nombre
            </label>
            <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div className="mb-3">
            <label className={label} htmlFor="s-phone">
              Teléfono (opcional)
            </label>
            <input
              id="s-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className={field}
            />
          </div>
          <p className={label}>Tipo</p>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id)}
                className={`btn px-1 py-3 text-base ${
                  type === item.id ? 'btn-primary text-white' : 'btn-neutral'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mb-4">
            <label className={label} htmlFor="s-notes">
              Notas (opcional)
            </label>
            <input id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
          </div>
          {error && (
            <p className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>
          )}
          <div className="flex gap-3">
            {editingId && (
              <button type="button" onClick={reset} className="btn btn-neutral flex-1 py-4 text-xl">
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={() => void save()}
              className="btn btn-primary flex-1 py-4 text-xl text-white"
            >
              {editingId ? 'Guardar cambios' : 'Agregar proveedor'}
            </button>
          </div>
        </section>

        <section className="card p-4">
          <h3 className="title mb-3 text-2xl">Proveedores ({shownSuppliers.length})</h3>
          {message && (
            <p className="mb-3 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">
              {message}
            </p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setListTypeFilter('all')}
              className={`btn px-3 py-2 text-base ${
                listTypeFilter === 'all' ? 'btn-primary text-white' : 'btn-neutral'
              }`}
            >
              Todos
            </button>
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setListTypeFilter(item.id)}
                className={`btn px-3 py-2 text-base ${
                  listTypeFilter === item.id ? 'btn-primary text-white' : 'btn-neutral'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {shownSuppliers.length === 0 ? (
            <p className="text-lg text-slate-500">No hay proveedores de ese tipo.</p>
          ) : (
            <ul className="space-y-2">
              {shownSuppliers.map((supplier) => (
                <li key={supplier.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xl font-bold">{supplier.name}</p>
                      <p className="text-base text-slate-500">
                        {TYPES.find((t) => t.id === supplier.type)?.label ?? supplier.type}
                        {supplier.phone ? ` · 📞 ${supplier.phone}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => edit(supplier)}
                      className="btn btn-neutral py-3 text-lg"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void openHistory(supplier)}
                      className="btn btn-neutral py-3 text-lg"
                    >
                      📜 Historial
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deactivate(supplier.id)}
                    className="btn btn-danger mt-2 w-full py-3 text-lg text-white"
                  >
                    🗑 Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-4">
        <h3 className="title mb-2 text-2xl">🗓 Agenda de visitas</h3>
        <p className="mb-4 text-lg text-slate-600">
          Día de visita de cada proveedor y hora límite para pedir (F-A02, F-A07).
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="ag-supplier">
              Proveedor
            </label>
            <select
              id="ag-supplier"
              value={scheduleSupplierId}
              onChange={(e) => setScheduleSupplierId(e.target.value)}
              className={field}
            >
              <option value="">Elige…</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ag-weekday">
              Día
            </label>
            <select
              id="ag-weekday"
              value={scheduleWeekday}
              onChange={(e) => setScheduleWeekday(Number(e.target.value))}
              className={field}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ag-cutoff">
              Hora límite
            </label>
            <input
              id="ag-cutoff"
              type="time"
              value={scheduleCutoff}
              onChange={(e) => setScheduleCutoff(e.target.value)}
              className={field}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void addSchedule()}
          className="btn btn-primary mb-4 w-full py-4 text-xl text-white"
        >
          ➕ Agregar día de visita
        </button>

        {schedules.length === 0 ? (
          <p className="text-lg text-slate-500">Sin días de visita configurados.</p>
        ) : (
          <ul className="space-y-2">
            {schedules
              .slice()
              .sort((a, b) => a.weekday - b.weekday)
              .map((schedule) => (
                <li
                  key={schedule.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <div>
                    <p className="text-lg font-semibold">
                      {supplierById.get(schedule.supplier_id)?.name ?? 'Proveedor'}
                    </p>
                    <p className="text-base text-slate-600">
                      {WEEKDAYS[schedule.weekday]} · pedir antes de {schedule.order_cutoff_time}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSchedule(schedule.id)}
                    className="btn btn-neutral px-4 py-3 text-lg"
                  >
                    🗑
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h3 className="title mb-2 text-2xl">📅 Hoy visitan ({todaySchedules.length})</h3>
        {todaySchedules.length === 0 ? (
          <p className="text-lg text-slate-500">Hoy no hay visitas programadas.</p>
        ) : (
          <ul className="space-y-2">
            {todaySchedules.map((schedule) => {
              const supplier = supplierById.get(schedule.supplier_id);
              const status = visitStatus(schedule.supplier_id);
              return (
                <li key={schedule.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{supplier?.name ?? 'Proveedor'}</p>
                      <p className="text-base text-slate-600">
                        Hora límite: {schedule.order_cutoff_time}
                        {status === 'done'
                          ? ' · ✅ Visitó'
                          : status === 'skipped'
                            ? ' · ⛔ No vino'
                            : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void markVisit(schedule.supplier_id, 'done')}
                        className="btn btn-primary px-4 py-3 text-lg text-white"
                      >
                        ✅
                      </button>
                      <button
                        type="button"
                        onClick={() => void markVisit(schedule.supplier_id, 'skipped')}
                        className="btn btn-neutral px-4 py-3 text-lg"
                      >
                        ⛔
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {VISIT_STEPS.map((step) => {
                      const done = Boolean(visitSteps(schedule.supplier_id)[step.key]);
                      return (
                        <button
                          key={step.key}
                          type="button"
                          onClick={() => void toggleStep(schedule.supplier_id, step.key)}
                          className={`btn px-2 py-3 text-base ${
                            done ? 'btn-primary text-white' : 'btn-neutral'
                          }`}
                        >
                          {done ? '✅' : '⬜'} {step.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-slate-400">Registrado por {user.name}.</p>
      </section>

      {historyFor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
          <div
            className="card max-h-[92dvh] w-full max-w-2xl space-y-4 overflow-y-auto p-6"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="title text-2xl">Historial · {historyFor.name}</h3>
              <button
                type="button"
                onClick={() => setHistoryFor(null)}
                className="btn btn-neutral px-4 py-3 text-lg"
              >
                ← Cerrar
              </button>
            </div>

            {historyLoading ? (
              <p className="text-lg text-slate-500">Cargando…</p>
            ) : (
              <>
                <div>
                  <h4 className="mb-2 text-xl font-bold">Visitas (últimos 60 días)</h4>
                  {historyVisits.length === 0 ? (
                    <p className="text-lg text-slate-500">Sin visitas registradas.</p>
                  ) : (
                    <ul className="space-y-2">
                      {historyVisits
                        .slice()
                        .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
                        .map((visit) => (
                          <li key={visit.id} className="rounded-xl bg-slate-50 p-3 text-lg">
                            {visit.visit_date} · {VISIT_STATUS_LABEL[visit.status] ?? visit.status}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xl font-bold">Pedidos</h4>
                  {historyOrders.length === 0 ? (
                    <p className="text-lg text-slate-500">Sin pedidos registrados.</p>
                  ) : (
                    <ul className="space-y-2">
                      {historyOrders.map((entry) => {
                        const total = entry.items.reduce(
                          (acc, item) => acc + item.qty * item.unit_cost_cents,
                          0,
                        );
                        return (
                          <li key={entry.order.id} className="rounded-xl bg-slate-50 p-3">
                            <div className="flex items-center justify-between text-lg">
                              <span className="font-semibold">
                                {entry.order.created_at.slice(0, 10)}
                              </span>
                              <span>{formatMXN(total)}</span>
                            </div>
                            <p className="text-base text-slate-600">
                              {entry.items.length} producto(s) ·{' '}
                              {entry.order.status === 'received'
                                ? '✅ Recibida'
                                : entry.order.status === 'sent'
                                  ? '📲 Enviada'
                                  : entry.order.status === 'cancelled'
                                    ? '⛔ Cancelada'
                                    : '📝 Borrador'}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xl font-bold">Cambios con proveedor</h4>
                  {historyExchanges.length === 0 ? (
                    <p className="text-lg text-slate-500">Sin cambios registrados.</p>
                  ) : (
                    <ul className="space-y-2">
                      {historyExchanges.map((entry) => (
                        <li key={entry.exchange.id} className="rounded-xl bg-slate-50 p-3">
                          <div className="flex items-center justify-between text-lg">
                            <span className="font-semibold">
                              {entry.exchange.created_at.slice(0, 10)}
                            </span>
                            <span>{entry.items.length} producto(s)</span>
                          </div>
                          {entry.exchange.notes && (
                            <p className="text-base text-slate-600">{entry.exchange.notes}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
