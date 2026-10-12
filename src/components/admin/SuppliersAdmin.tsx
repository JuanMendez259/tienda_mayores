import { useCallback, useEffect, useState } from 'react';
import type { Store, Supplier } from '../../types/database';
import { repository } from '../../data';

interface SuppliersAdminProps {
  store: Store;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

/** Proveedores: alta, edición y baja (F-606). */
export function SuppliersAdmin({ store }: SuppliersAdminProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSuppliers(await repository.listSuppliers());
  }, []);

  useEffect(() => {
    void (async () => {
      setSuppliers(await repository.listSuppliers());
    })();
  }, []);

  function reset() {
    setName('');
    setPhone('');
    setNotes('');
    setEditingId(null);
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError('Escribe el nombre del proveedor.');
    if (editingId) {
      await repository.updateSupplier(editingId, {
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
    } else {
      await repository.createSupplier({
        store_id: store.id,
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
    }
    reset();
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
    setNotes(supplier.notes ?? '');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">{editingId ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
        <div className="mb-3">
          <label className={label} htmlFor="s-name">Nombre</label>
          <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div className="mb-3">
          <label className={label} htmlFor="s-phone">Teléfono (opcional)</label>
          <input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={field} />
        </div>
        <div className="mb-4">
          <label className={label} htmlFor="s-notes">Notas (opcional)</label>
          <input id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </div>
        {error && <p className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>}
        <div className="flex gap-3">
          {editingId && (
            <button type="button" onClick={reset} className="btn btn-neutral flex-1 py-4 text-xl">
              Cancelar
            </button>
          )}
          <button type="button" onClick={save} className="btn btn-primary flex-1 py-4 text-xl text-white">
            {editingId ? 'Guardar cambios' : 'Agregar proveedor'}
          </button>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Proveedores ({suppliers.length})</h3>
        {suppliers.length === 0 ? (
          <p className="text-lg text-slate-500">Aún no hay proveedores registrados.</p>
        ) : (
          <ul className="space-y-2">
            {suppliers.map((supplier) => (
              <li key={supplier.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div>
                  <p className="text-xl font-bold">{supplier.name}</p>
                  {supplier.phone && <p className="text-base text-slate-500">{supplier.phone}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => edit(supplier)} className="btn btn-neutral px-4 py-3 text-lg">
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => deactivate(supplier.id)}
                    className="btn btn-danger px-4 py-3 text-lg text-white"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
