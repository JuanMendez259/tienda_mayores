import { useEffect, useState } from 'react';
import type { AppUser, Product, Store, Supplier } from '../../types/database';
import { repository } from '../../data';
import { formatMXN, parseAmountToCents } from '../../lib/money';
import { unitLabel } from '../../lib/weight';
import { fileToDataUrl } from '../../lib/image';

interface PurchasesAdminProps {
  store: Store;
  user: AppUser;
  products: Product[];
  onRefresh: () => void;
}

interface DraftLine {
  key: string;
  productId: string;
  qty: string;
  cost: string;
  expiresOn: string;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';
const uid = () => Math.random().toString(36).slice(2);

function emptyLine(): DraftLine {
  return { key: uid(), productId: '', qty: '', cost: '', expiresOn: '' };
}

/** Registrar compras a proveedores y actualizar existencias (F-502, F-606). */
export function PurchasesAdmin({ store, user, products, onRefresh }: PurchasesAdminProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setSuppliers(await repository.listSuppliers());
    })();
  }, []);

  function product(id: string) {
    return products.find((p) => p.id === id) ?? null;
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function linePreview(line: DraftLine): number {
    const p = product(line.productId);
    if (!p) return 0;
    const qty = Number(line.qty) || 0;
    return Math.round(parseAmountToCents(line.cost) * qty);
  }

  const total = lines.reduce((acc, line) => acc + linePreview(line), 0);

  async function pickInvoice(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setInvoiceFile(await fileToDataUrl(file));
  }

  async function submit() {
    const valid = lines.filter((line) => line.productId && Number(line.qty) > 0);
    if (valid.length === 0) return setError('Agrega al menos un producto con cantidad.');

    setBusy(true);
    setError(null);
    await repository.createPurchase({
      store_id: store.id,
      supplier_id: supplierId || null,
      user_id: user.id,
      invoice_ref: invoiceRef.trim() || null,
      invoice_file_url: invoiceFile,
      items: valid.map((line) => {
        const p = product(line.productId)!;
        const qtySale = Number(line.qty) || 0;
        const qtyBase = p.sale_unit === 'piece' ? Math.round(qtySale) : Math.round(qtySale * 1000);
        return {
          product_id: p.id,
          qty: Math.max(1, qtyBase),
          unit_cost_cents: parseAmountToCents(line.cost),
          expires_on: line.expiresOn || null,
        };
      }),
    });
    setBusy(false);
    setLines([emptyLine()]);
    setInvoiceRef('');
    setInvoiceFile(null);
    setMessage('Compra registrada y existencias actualizadas.');
    onRefresh();
  }

  return (
    <div className="card p-4">
      <h3 className="title mb-4 text-2xl">Registrar compra</h3>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="c-supplier">Proveedor (opcional)</label>
          <select id="c-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="c-invoice">Folio / factura (opcional)</label>
          <input id="c-invoice" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} className={field} />
        </div>
      </div>

      <div className="mb-4">
        <label className="btn btn-neutral cursor-pointer px-5 py-3 text-lg">
          {invoiceFile ? 'Cambiar foto de factura' : 'Adjuntar factura (opcional)'}
          <input type="file" accept="image/*" capture="environment" onChange={pickInvoice} className="hidden" />
        </label>
      </div>

      <div className="mb-3 space-y-3">
        {lines.map((line) => {
          const p = product(line.productId);
          return (
            <div key={line.key} className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <div>
                <label className={label}>Producto</label>
                <select
                  value={line.productId}
                  onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                  className={field}
                >
                  <option value="">Elige…</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>{prod.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Cantidad ({p ? unitLabel(p.sale_unit) : ''})</label>
                <input
                  value={line.qty}
                  onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                  inputMode="decimal"
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Costo c/u ($)</label>
                <input
                  value={line.cost}
                  onChange={(e) => updateLine(line.key, { cost: e.target.value })}
                  inputMode="decimal"
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Caduca</label>
                <input
                  type="date"
                  value={line.expiresOn}
                  onChange={(e) => updateLine(line.key, { expiresOn: e.target.value })}
                  className={field}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  disabled={lines.length === 1}
                  className="btn btn-danger px-4 py-4 text-lg text-white disabled:opacity-40"
                  aria-label="Quitar renglón"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setLines((prev) => [...prev, emptyLine()])}
        className="btn btn-neutral mb-4 w-full py-3 text-lg"
      >
        + Agregar renglón
      </button>

      <div className="mb-4 flex items-center justify-between text-xl">
        <span className="text-slate-600">Total de la compra</span>
        <span className="text-3xl font-extrabold">{formatMXN(total)}</span>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>}
      {message && <p className="mb-4 rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>}

      <button type="button" onClick={submit} disabled={busy} className="btn btn-primary w-full py-4 text-xl text-white">
        {busy ? 'Guardando…' : 'Registrar compra'}
      </button>

      <p className="mt-3 text-base text-slate-500">
        La cantidad se captura en {products[0] ? 'la unidad de venta de cada producto' : 'unidades'} y se guarda en
        piezas / gramos / mililitros.
      </p>
    </div>
  );
}
