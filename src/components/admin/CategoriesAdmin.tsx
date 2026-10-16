import { useCallback, useEffect, useState } from 'react';
import type { Category, CategoryUpdate, Store } from '../../types/database';
import { repository } from '../../data';
import { emojiImage } from '../../data/seed';

interface CategoriesAdminProps {
  store: Store;
  onClose: () => void;
  /** Se llama cuando cambian las categorías para refrescar el catálogo. */
  onChanged: () => void;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

/** Colores suaves para el botón de la categoría en la venta. */
const COLORS: { value: string; name: string }[] = [
  { value: '#dcfce7', name: 'Verde' },
  { value: '#dbeafe', name: 'Azul' },
  { value: '#fef3c7', name: 'Amarillo' },
  { value: '#fce7f3', name: 'Rosa' },
  { value: '#f3e8ff', name: 'Morado' },
  { value: '#ffedd5', name: 'Naranja' },
  { value: '#e2e8f0', name: 'Gris' },
];

/**
 * Alta, edición y baja de categorías del catálogo (F-401).
 * Se abre desde Productos; las categorías nuevas aparecen al instante en la venta.
 */
export function CategoriesAdmin({ store, onClose, onChanged }: CategoriesAdminProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏷️');
  const [color, setColor] = useState(COLORS[0].value);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editColor, setEditColor] = useState(COLORS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setCategories(await repository.listCategories());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function add() {
    const clean = name.trim();
    if (!clean) return setError('Escribe el nombre de la categoría.');
    setBusy(true);
    setError(null);
    try {
      await repository.createCategory({
        store_id: store.id,
        name: clean,
        image_url: emojiImage(emoji.trim() || '🏷️', color),
        color,
        sort_order: categories.length + 1,
      });
      setName('');
      setEmoji('🏷️');
      await load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear la categoría.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditEmoji('');
    setEditColor(category.color ?? COLORS[0].value);
    setError(null);
  }

  async function saveEdit(id: string) {
    const clean = editName.trim();
    if (!clean) return setError('El nombre no puede quedar vacío.');
    setBusy(true);
    setError(null);
    try {
      const patch: CategoryUpdate = { name: clean, color: editColor };
      if (editEmoji.trim()) patch.image_url = emojiImage(editEmoji.trim(), editColor);
      await repository.updateCategory(id, patch);
      setEditingId(null);
      await load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la categoría.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(category: Category) {
    setBusy(true);
    setError(null);
    try {
      await repository.updateCategory(category.id, { active: false });
      await load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo quitar la categoría.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6" role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="title text-3xl">🏷️ Categorías</h2>
          <button type="button" onClick={onClose} className="btn btn-neutral px-5 py-3 text-lg">
            Cerrar
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-900">{error}</p>
        )}

        <div className="mb-5 rounded-2xl bg-slate-100 p-4">
          <h3 className="mb-3 text-xl font-bold">Nueva categoría</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="c-name">Nombre</label>
              <input
                id="c-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Botanas"
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="c-emoji">Emoji</label>
              <input
                id="c-emoji"
                value={emoji}
                maxLength={2}
                onChange={(event) => setEmoji(event.target.value)}
                placeholder="🏷️"
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="c-color">Color</label>
              <select
                id="c-color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className={field}
              >
                {COLORS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            className="btn btn-primary mt-3 w-full py-4 text-xl text-white disabled:opacity-50"
          >
            ➕ Agregar categoría
          </button>
        </div>

        <h3 className="mb-2 text-xl font-bold">Categorías existentes</h3>
        <ul className="space-y-2">
          {categories.map((category) => (
            <li key={category.id} className="card flex flex-wrap items-center gap-3 p-3">
              {category.image_url ? (
                <img src={category.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                  🏷️
                </div>
              )}
              {editingId === category.id ? (
                <div className="flex min-w-[200px] flex-1 flex-wrap items-end gap-2">
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    aria-label="Nombre de la categoría"
                    className={`${field} flex-1`}
                  />
                  <input
                    value={editEmoji}
                    maxLength={2}
                    onChange={(event) => setEditEmoji(event.target.value)}
                    placeholder="Emoji"
                    aria-label="Emoji"
                    className={`${field} w-24`}
                  />
                  <select
                    value={editColor}
                    onChange={(event) => setEditColor(event.target.value)}
                    aria-label="Color"
                    className={`${field} w-40`}
                  >
                    {COLORS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="min-w-0 flex-1 truncate text-xl font-bold">{category.name}</span>
              )}
              <div className="flex gap-2">
                {editingId === category.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void saveEdit(category.id)}
                      disabled={busy}
                      className="btn btn-primary px-4 py-3 text-lg text-white disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="btn btn-neutral px-4 py-3 text-lg"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(category)}
                      className="btn btn-neutral px-4 py-3 text-lg"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void deactivate(category)}
                      disabled={busy}
                      className="btn btn-danger px-4 py-3 text-lg text-white disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
          {categories.length === 0 && (
            <li className="text-lg text-slate-500">Aún no hay categorías. Agrega la primera arriba.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
