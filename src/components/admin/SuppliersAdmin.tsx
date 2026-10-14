import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppUser, Store, Supplier, SupplierSchedule, SupplierType, SupplierVisit } from '../../types/database';
import { repository } from '../../data';

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

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
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
          <h3 className="title mb-4 text-2xl">Proveedores ({activeSuppliers.length})</h3>
          {message && (
            <p className="mb-3 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">
              {message}
            </p>
          )}
          {activeSuppliers.length === 0 ? (
            <p className="text-lg text-slate-500">Aún no hay proveedores registrados.</p>
          ) : (
            <ul className="space-y-2">
              {activeSuppliers.map((supplier) => (
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
                      onClick={() => void deactivate(supplier.id)}
                      className="btn btn-danger py-3 text-lg text-white"
                    >
                      🗑 Quitar
                    </button>
                  </div>
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
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-slate-400">Registrado por {user.name}.</p>
      </section>
    </div>
  );
}
