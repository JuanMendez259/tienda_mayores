import { useState } from 'react';
import type { FontSize, Store, StoreModules } from '../../types/database';
import { repository } from '../../data';
import { CapturaModal } from './CapturaModal';

interface SettingsAdminProps {
  store: Store;
  onSaved: (store: Store) => void;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

const MODULE_LABELS: Record<keyof StoreModules, string> = {
  discounts: 'Descuentos',
  inventory: 'Inventario (ajustes y mermas)',
  movements: 'Historial de movimientos',
  photos: 'Fotos desde el celular',
  purchases: 'Compras a proveedores',
  suppliers: 'Proveedores',
};

const FONT_LABELS: Record<FontSize, string> = {
  normal: 'Normal',
  grande: 'Grande',
  muy_grande: 'Muy grande',
};

/** Configuración de la tienda y activación de módulos (F-702, F-703). */
export function SettingsAdmin({ store, onSaved }: SettingsAdminProps) {
  const [name, setName] = useState(store.name);
  const [ticketFooter, setTicketFooter] = useState(store.ticket_footer ?? '');
  const [fontSize, setFontSize] = useState<FontSize>(store.font_size);
  const [primaryColor, setPrimaryColor] = useState(store.primary_color);
  const [discountRequiresManager, setDiscountRequiresManager] = useState(store.discount_requires_manager);
  const [modules, setModules] = useState<StoreModules>(store.modules);
  const [expiryDays, setExpiryDays] = useState(store.expiry_alert_days);
  const [capturaOpen, setCapturaOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleModule(key: keyof StoreModules) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function save() {
    const updated = await repository.updateStore({
      name: name.trim() || store.name,
      ticket_footer: ticketFooter.trim() || null,
      font_size: fontSize,
      primary_color: primaryColor,
      discount_requires_manager: discountRequiresManager,
      modules,
      expiry_alert_days: expiryDays,
    });
    setSaved(true);
    onSaved(updated);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Datos de la tienda</h3>

        <div className="mb-3">
          <label className={label} htmlFor="st-name">Nombre</label>
          <input id="st-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>

        <div className="mb-3">
          <label className={label} htmlFor="st-footer">Pie del ticket</label>
          <input id="st-footer" value={ticketFooter} onChange={(e) => setTicketFooter(e.target.value)} className={field} />
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="st-font">Tamaño de letra</label>
            <select id="st-font" value={fontSize} onChange={(e) => setFontSize(e.target.value as FontSize)} className={field}>
              {(Object.keys(FONT_LABELS) as FontSize[]).map((value) => (
                <option key={value} value={value}>{FONT_LABELS[value]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="st-color">Color principal</label>
            <input
              id="st-color"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-[56px] w-full rounded-2xl border-2 border-slate-300 px-2"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className={label} htmlFor="st-expiry">Aviso de caducidad</label>
          <select
            id="st-expiry"
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
            className={field}
          >
            <option value={7}>7 días antes</option>
            <option value={15}>15 días antes</option>
            <option value={30}>30 días antes</option>
          </select>
        </div>

        <label className="mb-4 flex items-center gap-3 text-lg">
          <input
            type="checkbox"
            checked={discountRequiresManager}
            onChange={(e) => setDiscountRequiresManager(e.target.checked)}
            className="h-8 w-8"
          />
          Los descuentos requieren autorización de encargado
        </label>

        {saved && <p className="mb-4 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">Cambios guardados.</p>}

        <button type="button" onClick={save} className="btn btn-primary w-full py-4 text-xl text-white">
          Guardar configuración
        </button>
      </section>

      <section className="card p-4">
        <h3 className="title mb-4 text-2xl">Módulos visibles</h3>
        <p className="mb-4 text-base text-slate-500">
          Oculta las secciones que no uses para que la caja sea más sencilla.
        </p>
        <ul className="mb-4 space-y-2">
          {(Object.keys(MODULE_LABELS) as (keyof StoreModules)[]).map((key) => (
            <li key={key}>
              <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-lg">
                <input type="checkbox" checked={modules[key]} onChange={() => toggleModule(key)} className="h-8 w-8" />
                {MODULE_LABELS[key]}
              </label>
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => setCapturaOpen(true)} className="btn btn-neutral w-full py-4 text-xl">
          📷 Cargar fotos desde el celular
        </button>
      </section>

      {capturaOpen && <CapturaModal onClose={() => setCapturaOpen(false)} />}
    </div>
  );
}
