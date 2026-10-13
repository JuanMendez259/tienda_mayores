-- ============================================================
-- 0005 · Corrección: verify_pin no encontraba crypt() (pgcrypto)
-- ============================================================
-- En Supabase, la extensión `pgcrypto` vive en el esquema `extensions`.
-- La función `verify_pin` se definió con `set search_path = public`, así que
-- `crypt(text, text)` no se resolvía y toda verificación de PIN fallaba con
-- el error 42883 ("function crypt(text, text) does not exist"). Esto rompía
-- el inicio de sesión (la Edge Function devolvía 500).
--
-- Se recrea la función incluyendo `extensions` en el search_path.

create or replace function public.verify_pin(p_user_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash   text;
  v_locked timestamptz;
  v_active boolean;
begin
  select pin_hash, locked_until, active
    into v_hash, v_locked, v_active
    from public.app_user
   where id = p_user_id;

  if not found or not v_active then
    return false;
  end if;

  if v_locked is not null and v_locked > now() then
    return false;  -- bloqueado temporalmente
  end if;

  if v_hash = crypt(p_pin, v_hash) then
    update public.app_user
       set failed_attempts = 0, locked_until = null
     where id = p_user_id;
    return true;
  end if;

  update public.app_user
     set failed_attempts = failed_attempts + 1,
         locked_until = case
           when failed_attempts + 1 >= 5 then now() + interval '5 minutes'
           else locked_until
         end
   where id = p_user_id;

  return false;
end;
$$;

-- Solo el backend (service_role) puede verificar PINs.
revoke all on function public.verify_pin(uuid, text) from public, anon, authenticated;
