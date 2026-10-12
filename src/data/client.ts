import { createClient } from '@supabase/supabase-js';

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * En la Opción A el cliente usa la llave `anon` SOLO para invocar la Edge
 * Function `pos`. Las tablas tienen RLS sin políticas: nadie accede a ellas
 * directamente. El backend (service_role) valida PIN y permisos.
 */
export const isRemoteConfigured = Boolean(url && anonKey);

export const supabase = isRemoteConfigured ? createClient(url as string, anonKey as string) : null;
