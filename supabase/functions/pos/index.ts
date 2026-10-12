// Edge Function: pos  (Opción A de autenticación)
// El cliente nunca toca las tablas (RLS sin políticas). Esta función usa la
// `service_role`, valida el PIN con la función SQL `verify_pin` y aplica los
// permisos por rol. Despliegue: `supabase functions deploy pos`.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const cashSales = (sales ?? [])
    .flatMap((s: { payment?: Array<{ amount_cents: number; method: string }> }) => s.payment ?? [])
    .filter((p) => p.method === 'cash')
    .reduce((acc, p) => acc + p.amount_cents, 0);

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

// Estructura mínima del cuerpo de cada llamada.
interface Body {
  action: string;
  [key: string]: unknown;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

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
          .select('id, store_id, name, photo_url, role, active, failed_attempts, locked_until, created_at, updated_at')
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

      case 'listCategories': {
        const { data, error } = await db
          .from('category')
          .select('*')
          .eq('active', true)
          .order('sort_order');
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
        return json(data);
      }

      case 'updateProduct': {
        const { data, error } = await db
          .from('product')
          .update(body.patch)
          .eq('id', body.id)
          .select('*')
          .single();
        if (error) throw error;
        return json(data);
      }

      case 'checkout': {
        const input = body.input as Record<string, unknown> & {
          lines: Array<Record<string, unknown>>;
          payments: Array<Record<string, unknown>>;
        };
        const { lines, payments, ...sale } = input;
        const { data: created, error: saleError } = await db
          .from('sale')
          .insert({ ...sale, status: 'paid', paid_at: new Date().toISOString() })
          .select('*')
          .single();
        if (saleError) throw saleError;
        const saleId = created.id;

        const { data: items, error: itemsError } = await db
          .from('sale_item')
          .insert(lines.map((l) => ({ ...l, sale_id: saleId })))
          .select('*');
        if (itemsError) throw itemsError;

        const { error: payError } = await db
          .from('payment')
          .insert(payments.map((p) => ({ ...p, sale_id: saleId })));
        if (payError) throw payError;

        // Descuento de inventario + movimientos (F-501).
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
          .insert(lines.map((l) => ({ ...l, sale_id: created.id })))
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

      default:
        return fail(`Acción desconocida: ${body.action}`, 404);
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail(detail, 500);
  }
});
