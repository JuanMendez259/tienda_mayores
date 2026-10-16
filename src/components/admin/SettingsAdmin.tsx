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
  const [ticketWidth, setTicketWidth] = useState(store.ticket_width_mm);
  const [whatsappCode, setWhatsappCode] = useState(store.whatsapp_country_code);
  const [creditCashier, setCreditCashier] = useState(store.credit_cashier_allowed);
  const [internalUseCashier, setInternalUseCashier] = useState(
    store.internal_use_cashier_allowed,
  );
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
      ticket_width_mm: ticketWidth,
      whatsapp_country_code: whatsappCode.trim() || '+52',
      credit_cashier_allowed: creditCashier,
      internal_use_cashier_allowed: internalUseCashier,
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
            <label className={label} htmlFor="st-width">Ancho del papel (impresora)</label>
            <select
              id="st-width"
              value={ticketWidth}
              onChange={(e) => setTicketWidth(Number(e.target.value))}
              className={field}
            >
              <option value={58}>58 mm</option>
              <option value={80}>80 mm</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="st-wa">Código de país (WhatsApp)</label>
            <input
              id="st-wa"
              value={whatsappCode}
              onChange={(e) => setWhatsappCode(e.target.value)}
              placeholder="+52"
              className={field}
            />
          </div>
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

        <h4 className="mb-2 text-xl font-bold">¿Quién puede…?</h4>
        <label className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-lg">
          <input
            type="checkbox"
            checked={creditCashier}
            onChange={(e) => setCreditCashier(e.target.checked)}
            className="h-8 w-8"
          />
          El cajero puede cobrar a fiado
        </label>
        <label className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-lg">
          <input
            type="checkbox"
            checked={internalUseCashier}
            onChange={(e) => setInternalUseCashier(e.target.checked)}
            className="h-8 w-8"
          />
          El cajero puede registrar consumo interno
        </label>
        <p className="mb-4 text-base text-slate-500">
          Dueño y encargado siempre pueden. Estas opciones solo abren el permiso a los cajeros.
        </p>

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
