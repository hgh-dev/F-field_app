# Supabase 인증코드 관리자 기능 적용 SQL

Supabase SQL Editor에서 아래 SQL을 1회 실행한다.

```sql
alter table public.verified_codes
  add column if not exists max_uses integer not null default 1,
  add column if not exists used_count integer not null default 0,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists memo text,
  add column if not exists generated_by_user_id uuid references auth.users(id) on delete set null;

alter table public.entitlements
  add column if not exists expires_at timestamptz;

update public.verified_codes
set
  max_uses = coalesce(max_uses, 1),
  used_count = coalesce(used_count, case when status = 'used' then 1 else 0 end);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verified_codes_max_uses_check'
  ) then
    alter table public.verified_codes
      add constraint verified_codes_max_uses_check check (max_uses >= 1 and max_uses <= 1000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'verified_codes_used_count_check'
  ) then
    alter table public.verified_codes
      add constraint verified_codes_used_count_check check (used_count >= 0 and used_count <= max_uses);
  end if;
end $$;

create unique index if not exists verified_codes_code_hash_key
  on public.verified_codes (code_hash);
```

`verified_codes.expires_at`은 이 코드로 인증된 계정의 권한 만료일로 사용한다. 인증 성공 시 `entitlements.expires_at`에 복사된다.

관리자 계정은 `entitlements.tier = 'admin'`이어야 한다.

```sql
insert into public.entitlements (user_id, tier, source)
select id, 'admin', 'verified_code'
from auth.users
where email = '관리자_이메일@example.com'
on conflict (user_id)
do update set
  tier = 'admin',
  source = 'verified_code';
```

Edge Function 배포:

```bash
supabase functions deploy verify-code
supabase functions deploy create-verification-code
```

## 공지 뱃지 설정 기능

Supabase SQL Editor에서 아래 SQL을 1회 실행한다.

```sql
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_notice_badge_read" on public.app_settings;
create policy "app_settings_notice_badge_read"
on public.app_settings
for select
to anon, authenticated
using (key = 'notice_badge');

drop policy if exists "app_settings_api_keys_read" on public.app_settings;
create policy "app_settings_api_keys_read"
on public.app_settings
for select
to anon, authenticated
using (key = 'api_keys');
```

공지 뱃지 Edge Function 배포:

```bash
supabase functions deploy get-app-settings
supabase functions deploy update-notice-badge
```

## API 키 관리 기능

`app_settings.api_keys`에 VWorld API 키와 만료일을 저장한다. 앱은 설정을 하루 단위로 로컬 캐시하고, 캐시가 없거나 만료되면 `get-app-settings`에서 다시 가져온다.

API 키 관리 Edge Function 배포:

```bash
supabase functions deploy get-app-settings
supabase functions deploy update-api-key
```
