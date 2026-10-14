import { useEffect, useMemo, useState } from 'react';
import type { AppUser, Product, StockMovement, StockMovementType } from '../../types/database';
import { repository } from '../../data';
import { formatStock } from '../../lib/weight';

interface MovementsAdminProps {
  products: Product[];
  users: AppUser[];
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-lg';
const label = 'mb-1 block text-base font-semibold';

const TYPE_LABELS: Record<StockMovementType, string> = {
  sale: 'Venta',
  purchase: 'Compra',
  adjustment: 'Ajuste',
  waste: 'Merma',
  return: 'Devolución',
  supplier_exchange_out: 'Cambio proveedor (sale)',
  supplier_exchange_in: 'Cambio proveedor (entra)',
  internal_use: 'Consumo interno',
};

/** Historial de movimientos de inventario con filtros (F-506). */
export function MovementsAdmin({ products, users }: MovementsAdminProps) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [productId, setProductId] = useState('');
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  useEffect(() => {
    void (async () => {
      const data = await repository.listStockMovements({
        productId: productId || undefined,
        type: (type || undefined) as StockMovementType | undefined,
        userId: userId || undefined,
      });
      setMovements(data);
    })();
  }, [productId, type, userId]);

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="m-product">Producto</label>
          <select id="m-product" value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="m-type">Tipo</label>
          <select id="m-type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="m-user">Usuario</label>
          <select id="m-user" value={userId} onChange={(e) => setUserId(e.target.value)} className={field}>
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {movements.length === 0 ? (
        <p className="text-lg text-slate-500">No hay movimientos con esos filtros.</p>
      ) : (
        <ul className="space-y-2">
          {movements.map((movement) => {
            const product = productById.get(movement.product_id);
            const sign = movement.qty >= 0 ? '+' : '−';
            const positive = movement.qty >= 0;
            return (
              <li key={movement.id} className="card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold">{product?.name ?? 'Producto'}</p>
                  <p className="text-base text-slate-500">
                    {TYPE_LABELS[movement.type]}
                    {movement.reason ? ` · ${movement.reason}` : ''}
                    {movement.user_id ? ` · ${userById.get(movement.user_id) ?? ''}` : ''}
                  </p>
                  <p className="text-base text-slate-400">
                    {new Date(movement.created_at).toLocaleString('es-MX')}
                  </p>
                </div>
                <span className={`text-2xl font-extrabold ${positive ? 'text-green-700' : 'text-red-700'}`}>
                  {sign}
                  {product ? formatStock(Math.abs(movement.qty), product.sale_unit) : Math.abs(movement.qty)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
