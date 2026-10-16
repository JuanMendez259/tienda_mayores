// Edge Function: pos  (Opción A de autenticación)
// El cliente nunca toca las tablas (RLS sin políticas). Esta función usa la
// `service_role`, valida el PIN con la función SQL `verify_pin` y aplica los
// permisos por rol. Despliegue: `supabase functions deploy pos`.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// Cabeceras CORS: la app (Vercel) y la tablet llaman desde otro origen.
// `*` permite cualquier origen; se incluyen métodos y cabeceras para superar
// el preflight OPTIONS del navegador.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** Extrae un texto legible de cualquier cosa lanzada (Error, PostgrestError, etc.). */
function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object' && cause !== null) {
    const e = cause as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint, e.code]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .map(String);
    if (parts.length > 0) return parts.join(' | ');
  }
  return String(cause);
}

// Calcula el resumen de caja (F-603) reutilizado por corte y consulta.
async function cashSummary(sessionId: string) {
  const { data: session, error } = await db
    .from('cash_session')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) throw error;

  const { data: sales } = await db
    .from('sale')
    .select('id, payment(amount_cents, method)')
    .eq('store_id', session.store_id)
    .eq('status', 'paid')
    .gte('paid_at', session.opened_at);
  const cashSalesFromSales = (sales ?? [])
    .flatMap((s: { payment?: Array<{ amount_cents: number; method: string }> }) => s.payment ?? [])
    .filter((p) => p.method === 'cash')
    .reduce((acc, p) => acc + p.amount_cents, 0);

  // Abonos de fiado cobrados en efectivo dentro de esta sesión (F-B04).
  const { data: creditPayments } = await db
    .from('customer_payment')
    .select('amount_cents, method')
    .eq('cash_session_id', sessionId)
    .eq('method', 'cash');
  const cashSales =
    cashSalesFromSales +
    (creditPayments ?? []).reduce(
      (acc: number, p: { amount_cents: number }) => acc + p.amount_cents,
      0,
    );

  const { data: movements } = await db
    .from('cash_movement')
    .select('type, amount_cents')
    .eq('cash_session_id', sessionId);
  const movementsTotal = (movements ?? []).reduce(
    (acc: number, m: { type: string; amount_cents: number }) =>
      acc + (m.type === 'deposit' ? m.amount_cents : -m.amount_cents),
    0,
  );

  return {
    session,
    opening_cents: session.opening_cents,
    cash_sales_cents: cashSales,
    movements_cents: movementsTotal,
    expected_cents: session.opening_cents + cashSales + movementsTotal,
  };
}

// Consume lotes existentes en orden FEFO (primero en caducar) para una salida (F-505).
async function consumeLotsFefo(productId: string, qtyBase: number): Promise<void> {
  let remaining = qtyBase;
  const { data: lots } = await db
    .from('product_lot')
    .select('id, qty, expires_on, received_at')
    .eq('product_id', productId)
    .gt('qty', 0)
    .order('expires_on', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: true });
  for (const lot of lots ?? []) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    await db
      .from('product_lot')
      .update({ qty: lot.qty - take })
      .eq('id', lot.id);
    remaining -= take;
  }
}

// Convierte un renglón de venta del cliente en columnas de `sale_item`.
// El cliente envía `name` y `sale_unit` solo para mostrar el ticket; la tabla
// no tiene esas columnas, así que se descartan aquí.
function saleItemRow(line: Record<string, unknown>, saleId: string) {
  return {
    sale_id: saleId,
    product_id: line.product_id,
    qty: line.qty,
    unit_price_cents: line.unit_price_cents,
    line_total_cents: line.line_total_cents,
    discount_cents: line.discount_cents ?? 0,
    weight_grams: line.weight_grams ?? null,
  };
}

// Estructura mínima del cuerpo de cada llamada.
interface Body {
  action: string;
  [key: string]: unknown;
}

Deno.serve(async (request) => {
  // Preflight CORS: responder de inmediato (200) con las cabeceras.
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail('Cuerpo inválido');
  }

  try {
    switch (body.action) {
      case 'getStore': {
        const { data, error } = await db.from('store').select('*').limit(1).single();
        if (error) throw error;
        return json(data);
      }

      case 'listUsers': {
        const { data, error } = await db
          .from('app_user')
          .select('id, store_id, name, photo_url, role, active, failed_attempts, locked_until, pin_reset_required, created_at, updated_at')
          .eq('active', true)
          .order('name');
        if (error) throw error;
        return json(data);
      }

      case 'verifyPin': {
        const { data, error } = await db.rpc('verify_pin', {
          p_user_id: body.userId as string,
          p_pin: body.pin as string,
        });
        if (error) throw error;
        return json(Boolean(data));
      }

      case 'setPin': {
        const userId = body.userId as string;
        const newPin = String(body.newPin ?? '');
        if (!/^[0-9]{4}$/.test(newPin)) {
          return fail('El PIN debe tener exactamente 4 dígitos.');
        }
        const { data: ok, error: verifyError } = await db.rpc('verify_pin', {
          p_user_id: userId,
          p_pin: String(body.oldPin ?? ''),
        });
        if (verifyError) throw verifyError;
        if (!ok) return fail('El PIN actual no es correcto.');
        const { data, error } = await db.rpc('set_pin', {
          p_user_id: userId,
          p_new_pin: newPin,
        });
        if (error) throw error;
        return json(Boolean(data));
      }

      case 'listCategories': {
        const { data, error } = await db
          .from('category')
          .select('*')
          .eq('active', true)
          .order('sort_order');
        if (error) throw error;
        return json(data);
      }

      case 'createCategory': {
        const input = body.input as { name?: string };
        if (!String(input?.name ?? '').trim()) {
          return fail('Escribe el nombre de la categoría.');
        }
        const { data, error } = await db.from('category').insert(body.input).select('*').single();
        if (error) throw error;
        return json(data);
      }

      case 'updateCategory': {
        const { data, error } = await db
          .from('category')
          .update(body.patch)
          .eq('id', body.id)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'listProducts': {
        const { data, error } = await db.from('product').select('*').eq('active', true).order('name');
        if (error) throw error;
        return json(data);
      }

      case 'createProduct': {
        const { data, error } = await db.from('product').insert(body.input).select('*').single();
        if (error) throw error;
        const input = body.input as {
          stock_qty?: number;
          track_stock?: boolean;
          created_by?: string | null;
        };
        // C-05: el inventario inicial queda como movimiento de ajuste.
        if (data && input.track_stock !== false && (input.stock_qty ?? 0) !== 0) {
          await db.from('stock_movement').insert({
            store_id: data.store_id,
            product_id: data.id,
            type: 'adjustment',
            qty: input.stock_qty ?? 0,
            reason: 'Inventario inicial',
            user_id: input.created_by ?? null,
          });
        }
        return json(data);
      }

      case 'updateProduct': {
        const patch = body.patch as Record<string, unknown> & { stock_qty?: number };
        const previous =
          patch.stock_qty !== undefined
            ? (await db.from('product').select('stock_qty').eq('id', body.id).single()).data
            : null;
        const { data, error } = await db
          .from('product')
          .update(patch)
          .eq('id', body.id)
          .select('*')
          .single();
        if (error) throw error;
        // C-05: un cambio manual de existencias queda como movimiento de ajuste.
        if (
          data &&
          previous &&
          patch.stock_qty !== undefined &&
          patch.stock_qty !== previous.stock_qty
        ) {
          await db.from('stock_movement').insert({
            store_id: data.store_id,
            product_id: data.id,
            type: 'adjustment',
            qty: patch.stock_qty - previous.stock_qty,
            reason: 'Ajuste manual de inventario',
            user_id: (body.userId as string | undefined) ?? null,
          });
        }
        return json(data);
      }

      case 'checkout': {
        const input = body.input as Record<string, unknown> & {
          client_uuid: string;
          lines: Array<Record<string, unknown>>;
          payments: Array<Record<string, unknown>>;
        };
        const { lines, payments, ...sale } = input;

        // Idempotencia de ventas offline (Fase 3): si ya existe el client_uuid,
        // devolver la venta existente sin duplicar.
        const { data: existing } = await db
          .from('sale')
          .select('*')
          .eq('client_uuid', sale.client_uuid)
          .maybeSingle();
        if (existing) {
          const { data: existingItems } = await db
            .from('sale_item')
            .select('*')
            .eq('sale_id', existing.id);
          return json({ sale: existing, items: existingItems ?? [] });
        }

        // Pagos combinados (F-204): la suma de los pagos debe igualar el total.
        const paidCents = payments.reduce(
          (acc, payment) => acc + Number(payment.amount_cents ?? 0),
          0,
        );
        const totalCents = Number(sale.total_cents ?? 0);
        if (paidCents !== totalCents) {
          return fail('La suma de los pagos no coincide con el total de la venta.');
        }

        // F-B06: el límite de fiado bloquea, salvo autorización de dueño/encargado.
        const creditCents = payments
          .filter((payment) => payment.method === 'credit')
          .reduce((acc, payment) => acc + Number(payment.amount_cents ?? 0), 0);
        const creditCustomerId = sale.customer_id as string | null | undefined;
        if (creditCents > 0 && creditCustomerId && !sale.credit_override) {
          const { data: customer } = await db
            .from('customer')
            .select('credit_limit_cents')
            .eq('id', creditCustomerId)
            .single();
          const limit = customer?.credit_limit_cents ?? null;
          if (limit !== null) {
            const { data: creditSales } = await db
              .from('sale')
              .select('total_cents')
              .eq('customer_id', creditCustomerId)
              .eq('status', 'paid');
            const { data: paidRows } = await db
              .from('customer_payment')
              .select('amount_cents')
              .eq('customer_id', creditCustomerId);
            const salesTotal = (creditSales ?? []).reduce(
              (acc: number, s: { total_cents: number }) => acc + s.total_cents,
              0,
            );
            const paidTotal = (paidRows ?? []).reduce(
              (acc: number, p: { amount_cents: number }) => acc + p.amount_cents,
              0,
            );
            const balance = Math.max(0, salesTotal - paidTotal);
            if (balance + creditCents > limit) {
              return fail(
                'La venta supera el límite de fiado del cliente. Registra un abono, sube el límite o pide autorización a un encargado.',
              );
            }
          }
        }

        const saleRow = { ...sale };
        delete saleRow.credit_override;
        const { data: created, error: saleError } = await db
          .from('sale')
          .insert({ ...saleRow, status: 'paid', paid_at: new Date().toISOString() })
          .select('*')
          .single();
        if (saleError) throw saleError;
        const saleId = created.id;

        const { data: items, error: itemsError } = await db
          .from('sale_item')
          .insert(lines.map((l) => saleItemRow(l, saleId)))
          .select('*');
        if (itemsError) throw itemsError;

        const { error: payError } = await db
          .from('payment')
          .insert(payments.map((p) => ({ ...p, sale_id: saleId })));
        if (payError) throw payError;

        // Descuento de inventario + movimientos (F-501) + consumo FEFO de lotes (F-505).
        for (const item of items) {
          const delta =
            item.weight_grams != null ? -item.weight_grams : -item.qty;
          const { data: product } = await db
            .from('product')
            .select('stock_qty, track_stock')
            .eq('id', item.product_id)
            .single();
          if (product?.track_stock) {
            await db
              .from('product')
              .update({ stock_qty: Math.max(0, product.stock_qty + delta) })
              .eq('id', item.product_id);
            await consumeLotsFefo(item.product_id, Math.abs(delta));
          }
          await db.from('stock_movement').insert({
            store_id: sale.store_id,
            product_id: item.product_id,
            type: 'sale',
            qty: delta,
            reason: `Venta #${created.number}`,
            user_id: sale.user_id,
            sale_id: saleId,
          });
        }
        return json({ sale: created, items });
      }

      case 'holdSale': {
        const input = body.input as Record<string, unknown> & {
          lines: Array<Record<string, unknown>>;
        };
        const { lines, ...sale } = input;
        const { data: created, error } = await db
          .from('sale')
          .insert({ ...sale, status: 'held' })
          .select('*')
          .single();
        if (error) throw error;
        const { data: items, error: itemsError } = await db
          .from('sale_item')
          .insert(lines.map((l) => saleItemRow(l, created.id)))
          .select('*');
        if (itemsError) throw itemsError;
        return json({ sale: created, items });
      }

      case 'listHeldSales': {
        const { data, error } = await db
          .from('sale')
          .select('*, items:sale_item(*)')
          .eq('store_id', body.storeId)
          .eq('status', 'held')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json((data ?? []).map((s) => ({ sale: s, items: s.items })));
      }

      case 'cancelSale': {
        const { error } = await db.from('sale').update({ status: 'cancelled' }).eq('id', body.saleId);
        if (error) throw error;
        await db.from('audit_log').insert({
          store_id: null,
          user_id: body.userId,
          entity: 'sale',
          entity_id: body.saleId,
          action: 'cancel',
          after: { reason: body.reason },
        });
        return json(true);
      }

      case 'getOpenCashSession': {
        const { data, error } = await db
          .from('cash_session')
          .select('*')
          .eq('store_id', body.storeId)
          .is('closed_at', null)
          .maybeSingle();
        if (error) throw error;
        return json(data);
      }

      case 'openCashSession': {
        const { data, error } = await db.from('cash_session').insert(body.input).select('*').single();
        if (error) throw error;
        return json(data);
      }

      case 'getCashSummary': {
        const summary = await cashSummary(body.sessionId as string);
        return json({
          opening_cents: summary.opening_cents,
          cash_sales_cents: summary.cash_sales_cents,
          movements_cents: summary.movements_cents,
          expected_cents: summary.expected_cents,
        });
      }

      case 'closeCashSession': {
        const summary = await cashSummary(body.sessionId as string);
        const counted = Number(body.countedCents) || 0;
        const { data, error } = await db
          .from('cash_session')
          .update({
            closed_at: new Date().toISOString(),
            expected_cents: summary.expected_cents,
            counted_cents: counted,
            difference_cents: counted - summary.expected_cents,
          })
          .eq('id', body.sessionId)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'addCashMovement': {
        const { data, error } = await db
          .from('cash_movement')
          .insert({
            cash_session_id: body.sessionId,
            type: body.type,
            amount_cents: body.amountCents,
            note: body.note,
          })
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'listCashMovements': {
        const { data, error } = await db
          .from('cash_movement')
          .select('*')
          .eq('cash_session_id', body.sessionId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json(data);
      }

      case 'deactivateProduct': {
        const { error } = await db
          .from('product')
          .update({ active: false })
          .eq('id', body.id);
        if (error) throw error;
        return json(true);
      }

      case 'listSuppliers': {
        const { data, error } = await db
          .from('supplier')
          .select('*')
          .eq('active', true)
          .order('name');
        if (error) throw error;
        return json(data);
      }

      case 'createSupplier': {
        const { data, error } = await db.from('supplier').insert(body.input).select('*').single();
        if (error) throw error;
        return json(data);
      }

      case 'updateSupplier': {
        const { data, error } = await db
          .from('supplier')
          .update(body.patch)
          .eq('id', body.id)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'createPurchase': {
        const input = body.input as {
          items: Array<{ product_id: string; qty: number; unit_cost_cents: number; expires_on: string | null }>;
          [key: string]: unknown;
        };
        const { items, ...purchaseData } = input;
        let total = 0;
        for (const item of items) {
          const { data: p } = await db
            .from('product')
            .select('sale_unit')
            .eq('id', item.product_id)
            .single();
          const saleQty = p?.sale_unit === 'piece' ? item.qty : item.qty / 1000;
          total += Math.round(item.unit_cost_cents * saleQty);
        }
        const { data: purchase, error } = await db
          .from('purchase')
          .insert({ ...purchaseData, total_cents: total })
          .select('*')
          .single();
        if (error) throw error;

        const { data: created, error: itemsError } = await db
          .from('purchase_item')
          .insert(items.map((item) => ({ ...item, purchase_id: purchase.id })))
          .select('*');
        if (itemsError) throw itemsError;

        for (const item of created) {
          const { data: product } = await db
            .from('product')
            .select('stock_qty')
            .eq('id', item.product_id)
            .single();
          if (product) {
            await db
              .from('product')
              .update({
                stock_qty: product.stock_qty + item.qty,
                cost_cents: item.unit_cost_cents,
              })
              .eq('id', item.product_id);
          }
          // Lote con caducidad (F-505).
          const { data: lot } = await db
            .from('product_lot')
            .insert({
              store_id: purchase.store_id,
              product_id: item.product_id,
              qty: item.qty,
              expires_on: item.expires_on,
              supplier_id: purchase.supplier_id,
              purchase_id: purchase.id,
            })
            .select('*')
            .single();
          await db.from('stock_movement').insert({
            store_id: purchase.store_id,
            product_id: item.product_id,
            type: 'purchase',
            qty: item.qty,
            reason: `Compra ${purchase.invoice_ref ?? ''}`.trim(),
            user_id: purchase.user_id,
            lot_id: lot?.id ?? null,
          });
        }
        return json({ purchase, items: created });
      }

      case 'listPurchases': {
        const { data, error } = await db
          .from('purchase')
          .select('*, items:purchase_item(*)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json((data ?? []).map((p) => ({ purchase: p, items: p.items })));
      }

      case 'adjustStock': {
        const input = body.input as {
          store_id: string;
          product_id: string;
          delta: number;
          type: 'adjustment' | 'waste';
          reason: string;
          user_id: string;
        };
        const { data: product } = await db
          .from('product')
          .select('stock_qty')
          .eq('id', input.product_id)
          .single();
        if (product) {
          await db
            .from('product')
            .update({ stock_qty: Math.max(0, product.stock_qty + input.delta) })
            .eq('id', input.product_id);
        }
        const { data, error } = await db
          .from('stock_movement')
          .insert({
            store_id: input.store_id,
            product_id: input.product_id,
            type: input.type,
            qty: input.delta,
            reason: input.reason,
            user_id: input.user_id,
          })
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'listStockMovements': {
        const filter = (body.filter ?? {}) as {
          productId?: string;
          type?: string;
          userId?: string;
          from?: string;
          to?: string;
        };
        let query = db.from('stock_movement').select('*').order('created_at', { ascending: false }).limit(500);
        if (filter.productId) query = query.eq('product_id', filter.productId);
        if (filter.type) query = query.eq('type', filter.type);
        if (filter.userId) query = query.eq('user_id', filter.userId);
        if (filter.from) query = query.gte('created_at', filter.from);
        if (filter.to) query = query.lte('created_at', filter.to);
        const { data, error } = await query;
        if (error) throw error;
        return json(data);
      }

      case 'listPromotions': {
        const { data, error } = await db.from('promotion').select('*').eq('active', true);
        if (error) throw error;
        return json(data);
      }

      case 'savePromotion': {
        const input = body.input as { product_id: string };
        const { data, error } = await db
          .from('promotion')
          .upsert(input, { onConflict: 'product_id' })
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'deletePromotion': {
        const { error } = await db.from('promotion').delete().eq('id', body.id);
        if (error) throw error;
        return json(true);
      }

      case 'listExpiringLots': {
        const days = Number(body.days) || 15;
        const limit = new Date();
        limit.setDate(limit.getDate() + days);
        const { data, error } = await db
          .from('product_lot')
          .select('*')
          .gt('qty', 0)
          .not('expires_on', 'is', null)
          .lte('expires_on', limit.toISOString().slice(0, 10))
          .order('expires_on', { ascending: true });
        if (error) throw error;
        return json(data);
      }

      case 'getReport': {
        const range = body.range as { from: string; to: string };
        const { data: sales, error } = await db
          .from('sale')
          .select('*, items:sale_item(*), payments:payment(*)')
          .eq('status', 'paid')
          .gte('created_at', range.from)
          .lte('created_at', range.to);
        if (error) throw error;
        const { data: allProducts } = await db
          .from('product')
          .select('id, name, cost_cents, sale_unit, active');
        const productById = new Map(
          (allProducts ?? []).map((p: { id: string }) => [p.id, p]),
        );

        const byDayMap = new Map<string, { totalCents: number; count: number }>();
        const byMethodMap = new Map<string, { totalCents: number; count: number }>();
        const byProduct = new Map<string, { qty: number; totalCents: number }>();
        let totalSalesCents = 0;
        let profitCents = 0;

        for (const sale of sales ?? []) {
          totalSalesCents += sale.total_cents;
          const day = (sale.created_at as string).slice(0, 10);
          const dayEntry = byDayMap.get(day) ?? { totalCents: 0, count: 0 };
          dayEntry.totalCents += sale.total_cents;
          dayEntry.count += 1;
          byDayMap.set(day, dayEntry);

          for (const payment of sale.payments ?? []) {
            const m = byMethodMap.get(payment.method) ?? { totalCents: 0, count: 0 };
            m.totalCents += payment.amount_cents;
            m.count += 1;
            byMethodMap.set(payment.method, m);
          }

          for (const item of sale.items ?? []) {
            const product = productById.get(item.product_id) as
              | { cost_cents: number; sale_unit: string; name: string }
              | undefined;
            const saleQty =
              item.weight_grams != null ? item.weight_grams / 1000 : item.qty;
            const entry = byProduct.get(item.product_id) ?? { qty: 0, totalCents: 0 };
            entry.qty += saleQty;
            entry.totalCents += item.line_total_cents - item.discount_cents;
            byProduct.set(item.product_id, entry);
            profitCents +=
              item.line_total_cents -
              item.discount_cents -
              (product?.cost_cents ?? 0) * saleQty;
          }
        }

        const productsSorted = [...byProduct.entries()]
          .map(([productId, value]) => ({
            productId,
            name: (productById.get(productId) as { name: string } | undefined)?.name ?? 'Producto',
            qty: value.qty,
            totalCents: value.totalCents,
          }))
          .sort((a, b) => b.qty - a.qty);

        const soldIds = new Set(byProduct.keys());
        const notSold = (allProducts ?? [])
          .filter((p: { id: string; active: boolean }) => p.active && !soldIds.has(p.id))
          .map((p: { id: string; name: string }) => ({ productId: p.id, name: p.name, qty: 0 }));
        const lowRotation = [...productsSorted.slice(-10).reverse(), ...notSold].slice(0, 10);

        return json({
          from: range.from,
          to: range.to,
          salesCount: (sales ?? []).length,
          totalSalesCents,
          profitCents,
          byDay: [...byDayMap.entries()]
            .map(([date, value]) => ({ date, ...value }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          byPaymentMethod: [...byMethodMap.entries()].map(([method, value]) => ({
            method,
            ...value,
          })),
          topProducts: productsSorted.slice(0, 10),
          lowRotation,
        });
      }

      case 'updateStore': {
        const { data: current, error: readError } = await db
          .from('store')
          .select('id')
          .limit(1)
          .single();
        if (readError) throw readError;
        const { data, error } = await db
          .from('store')
          .update(body.patch)
          .eq('id', current.id)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      // ------------------------------------------------------
      // v2 · Agenda de surtidores y visitas (F-A02, F-A07, F-A08)
      // ------------------------------------------------------
      case 'listSchedules': {
        const { data, error } = await db
          .from('supplier_schedule')
          .select('*')
          .eq('store_id', body.storeId)
          .order('weekday');
        if (error) throw error;
        return json(data);
      }

      case 'saveSchedule': {
        const input = body.input as { id?: string };
        const { data, error } = await db
          .from('supplier_schedule')
          .upsert(input, { onConflict: 'id' })
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'deleteSchedule': {
        const { error } = await db.from('supplier_schedule').delete().eq('id', body.id);
        if (error) throw error;
        return json(true);
      }

      case 'listVisits': {
        const { data, error } = await db
          .from('supplier_visit')
          .select('*')
          .eq('store_id', body.storeId)
          .gte('visit_date', body.from)
          .lte('visit_date', body.to)
          .order('visit_date');
        if (error) throw error;
        return json(data);
      }

      case 'markVisit': {
        const input = body.input as { supplier_id: string; visit_date: string };
        const { data: existing } = await db
          .from('supplier_visit')
          .select('*')
          .eq('supplier_id', input.supplier_id)
          .eq('visit_date', input.visit_date)
          .maybeSingle();
        if (existing) {
          const { data, error } = await db
            .from('supplier_visit')
            .update(input)
            .eq('id', existing.id)
            .select('*')
            .single();
          if (error) throw error;
          return json(data);
        }
        const { data, error } = await db.from('supplier_visit').insert(input).select('*').single();
        if (error) throw error;
        return json(data);
      }

      // ------------------------------------------------------
      // v2 · Órdenes de compra (F-A06)
      // ------------------------------------------------------
      case 'listPurchaseOrders': {
        const { data, error } = await db
          .from('purchase_order')
          .select('*, items:purchase_order_item(*)')
          .eq('store_id', body.storeId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json(
          (data ?? []).map((o: { items?: unknown }) => ({ order: o, items: o.items ?? [] })),
        );
      }

      case 'createPurchaseOrder': {
        const input = body.input as {
          items: Array<Record<string, unknown>>;
          [key: string]: unknown;
        };
        const { items, ...orderData } = input;
        const { data: order, error } = await db
          .from('purchase_order')
          .insert({ ...orderData, status: 'draft' })
          .select('*')
          .single();
        if (error) throw error;
        const { data: created, error: itemsError } = await db
          .from('purchase_order_item')
          .insert(items.map((i) => ({ ...i, purchase_order_id: order.id })))
          .select('*');
        if (itemsError) throw itemsError;
        return json({ order, items: created });
      }

      case 'setPurchaseOrderStatus': {
        const { data, error } = await db
          .from('purchase_order')
          .update({ status: body.status, updated_at: new Date().toISOString() })
          .eq('id', body.id)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      // ------------------------------------------------------
      // v2 · Cambios con proveedor sin costo (F-A04)
      // ------------------------------------------------------
      case 'createSupplierExchange': {
        const input = body.input as {
          store_id: string;
          supplier_id: string | null;
          user_id: string;
          notes: string | null;
          items: Array<{
            product_id: string;
            lot_id: string | null;
            qty_returned: number;
            qty_received: number;
            new_expires_on: string | null;
            reason: string;
          }>;
        };
        const { items, ...exchangeData } = input;
        const { data: exchange, error } = await db
          .from('supplier_exchange')
          .insert(exchangeData)
          .select('*')
          .single();
        if (error) throw error;
        for (const item of items) {
          const { data: product } = await db
            .from('product')
            .select('stock_qty, track_stock')
            .eq('id', item.product_id)
            .single();
          if (item.qty_returned > 0 && item.lot_id) {
            const { data: lot } = await db
              .from('product_lot')
              .select('qty')
              .eq('id', item.lot_id)
              .single();
            if (lot) {
              await db
                .from('product_lot')
                .update({ qty: Math.max(0, lot.qty - item.qty_returned) })
                .eq('id', item.lot_id);
            }
          }
          if (product?.track_stock) {
            const next = product.stock_qty - item.qty_returned + item.qty_received;
            await db
              .from('product')
              .update({ stock_qty: Math.max(0, next) })
              .eq('id', item.product_id);
          }
          if (item.qty_received > 0) {
            await db.from('product_lot').insert({
              store_id: input.store_id,
              product_id: item.product_id,
              qty: item.qty_received,
              expires_on: item.new_expires_on,
              supplier_id: input.supplier_id,
            });
          }
          await db.from('supplier_exchange_item').insert({ ...item, exchange_id: exchange.id });
          if (item.qty_returned > 0) {
            await db.from('stock_movement').insert({
              store_id: input.store_id,
              product_id: item.product_id,
              type: 'supplier_exchange_out',
              qty: -item.qty_returned,
              reason: 'Cambio con proveedor (sale)',
              user_id: input.user_id,
              lot_id: item.lot_id,
            });
          }
          if (item.qty_received > 0) {
            await db.from('stock_movement').insert({
              store_id: input.store_id,
              product_id: item.product_id,
              type: 'supplier_exchange_in',
              qty: item.qty_received,
              reason: 'Cambio con proveedor (entra)',
              user_id: input.user_id,
            });
          }
        }
        return json(exchange);
      }

      case 'listSupplierExchanges': {
        const { data, error } = await db
          .from('supplier_exchange')
          .select('*, items:supplier_exchange_item(*)')
          .eq('store_id', body.storeId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json(
          (data ?? []).map((e: { items?: unknown }) => ({ exchange: e, items: e.items ?? [] })),
        );
      }

      // ------------------------------------------------------
      // v2 · Consumo interno con nota obligatoria (F-C01)
      // ------------------------------------------------------
      case 'recordInternalUse': {
        const input = body.input as {
          store_id: string;
          product_id: string;
          qty: number;
          reason: string;
          user_id: string;
        };
        if (!String(input.reason ?? '').trim()) {
          return fail('La nota es obligatoria para el consumo interno.');
        }
        const { data: product } = await db
          .from('product')
          .select('stock_qty, track_stock')
          .eq('id', input.product_id)
          .single();
        if (product?.track_stock) {
          await db
            .from('product')
            .update({ stock_qty: Math.max(0, product.stock_qty - input.qty) })
            .eq('id', input.product_id);
          await consumeLotsFefo(input.product_id, input.qty);
        }
        const { data, error } = await db
          .from('stock_movement')
          .insert({
            store_id: input.store_id,
            product_id: input.product_id,
            type: 'internal_use',
            qty: -input.qty,
            reason: input.reason,
            user_id: input.user_id,
          })
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      // ------------------------------------------------------
      // v2 · Fiado (F-B01 a F-B06)
      // ------------------------------------------------------
      case 'listCustomers': {
        const { data, error } = await db
          .from('customer')
          .select('*')
          .eq('store_id', body.storeId)
          .eq('active', true)
          .order('name');
        if (error) throw error;
        return json(data);
      }

      case 'createCustomer': {
        const { data, error } = await db.from('customer').insert(body.input).select('*').single();
        if (error) throw error;
        return json(data);
      }

      case 'updateCustomer': {
        const { data, error } = await db
          .from('customer')
          .update({
            ...(body.patch as Record<string, unknown>),
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.id)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'listCustomerPayments': {
        const { data, error } = await db
          .from('customer_payment')
          .select('*')
          .eq('customer_id', body.customerId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json(data);
      }

      case 'createCustomerPayment': {
        const input = body.input as { amount_cents: number; customer_id: string };
        if (!input || Number(input.amount_cents) <= 0) {
          return fail('El abono debe ser mayor a cero.');
        }
        const { data, error } = await db.from('customer_payment').insert(input).select('*').single();
        if (error) throw error;
        return json(data);
      }

      case 'getCustomerStatement': {
        const customerId = body.customerId as string;
        const { data: customer, error } = await db
          .from('customer')
          .select('*')
          .eq('id', customerId)
          .single();
        if (error) throw error;
        const { data: sales } = await db
          .from('sale')
          .select('*')
          .eq('customer_id', customerId)
          .eq('status', 'paid')
          .order('created_at', { ascending: true });
        // Renglones de cada fiado, para el estado de cuenta legible (F-B04).
        const saleIds = (sales ?? []).map((sale: { id: string }) => sale.id);
        const { data: saleItems } = saleIds.length
          ? await db.from('sale_item').select('*').in('sale_id', saleIds)
          : { data: [] as Array<{ sale_id: string }> };
        const itemsBySale = new Map<string, Array<(typeof saleItems)[number]>>();
        for (const item of saleItems ?? []) {
          const list = itemsBySale.get(item.sale_id) ?? [];
          list.push(item);
          itemsBySale.set(item.sale_id, list);
        }
        const { data: payments } = await db
          .from('customer_payment')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: true });
        let remainingPaid = (payments ?? []).reduce(
          (acc: number, p: { amount_cents: number }) => acc + p.amount_cents,
          0,
        );
        const now = Date.now();
        let balance = 0;
        let overdue = 0;
        const salesWithBalance = (sales ?? []).map(
          (sale: { id: string; total_cents: number; created_at: string }) => {
            const applied = Math.min(remainingPaid, sale.total_cents);
            remainingPaid -= applied;
            const saleBalance = sale.total_cents - applied;
            balance += saleBalance;
            const ageDays = (now - new Date(sale.created_at).getTime()) / 86400000;
            if (ageDays > 30 && saleBalance > 0) overdue += saleBalance;
            return {
              sale,
              paid_cents: applied,
              balance_cents: saleBalance,
              age_days: Math.floor(ageDays),
              items: itemsBySale.get(sale.id) ?? [],
            };
          },
        );
        return json({
          customer,
          sales: salesWithBalance,
          payments: payments ?? [],
          balance_cents: balance,
          overdue_cents: overdue,
        });
      }

      default:
        return fail(`Acción desconocida: ${body.action}`, 404);
    }
  } catch (cause) {
    return fail(errorText(cause), 500);
  }
});
