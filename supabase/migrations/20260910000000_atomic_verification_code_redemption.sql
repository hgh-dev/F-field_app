-- 인증코드 차감과 권한 지급을 한 트랜잭션에서 처리합니다.
-- 동시 요청이 같은 코드를 읽고 여러 계정에 권한을 주는 경쟁 상태를 방지합니다.
create or replace function public.redeem_verification_code(
  p_code_hash text,
  p_user_id uuid
)
returns table (
  ok boolean,
  error_code text,
  entitlement_tier text,
  entitlement_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  code_row public.verified_codes%rowtype;
  next_used_count integer;
  granted_tier text;
begin
  select *
  into code_row
  from public.verified_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    return query select false, 'invalid', null::text, null::timestamptz;
    return;
  end if;

  if code_row.assigned_to is not null and code_row.assigned_to <> p_user_id then
    return query select false, 'not_assigned', null::text, null::timestamptz;
    return;
  end if;

  if code_row.expires_at is not null and code_row.expires_at <= now() then
    return query select false, 'expired', null::text, code_row.expires_at;
    return;
  end if;

  if code_row.status <> 'unused'
     or coalesce(code_row.used_count, 0) >= greatest(1, coalesce(code_row.max_uses, 1)) then
    return query select false, 'used', null::text, code_row.expires_at;
    return;
  end if;

  next_used_count := coalesce(code_row.used_count, 0) + 1;

  update public.verified_codes
  set
    status = case
      when next_used_count >= greatest(1, coalesce(code_row.max_uses, 1)) then 'used'
      else 'unused'
    end,
    used_count = next_used_count,
    used_by_user_id = p_user_id,
    used_at = now()
  where id = code_row.id;

  insert into public.entitlements (user_id, tier, source, expires_at)
  values (p_user_id, 'verified', 'verified_code', code_row.expires_at)
  on conflict (user_id)
  do update set
    tier = case
      when public.entitlements.tier = 'admin' then public.entitlements.tier
      else excluded.tier
    end,
    source = case
      when public.entitlements.tier = 'admin' then public.entitlements.source
      else excluded.source
    end,
    expires_at = case
      when public.entitlements.tier = 'admin' then public.entitlements.expires_at
      else excluded.expires_at
    end;

  select tier
  into granted_tier
  from public.entitlements
  where user_id = p_user_id;

  return query select
    true,
    null::text,
    coalesce(granted_tier, 'verified'),
    case when granted_tier = 'admin' then null::timestamptz else code_row.expires_at end;
end;
$$;

revoke all on function public.redeem_verification_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_verification_code(text, uuid) to service_role;
