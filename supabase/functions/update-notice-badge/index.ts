import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeUntil(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  let serviceRoleKey = '';
  try {
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    serviceRoleKey = secretKeys.default || '';
  } catch (_error) {
    serviceRoleKey = '';
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: '공지 뱃지 설정 중 오류가 발생했습니다.' }, 500);
  }

  if (!serviceRoleKey) {
    return jsonResponse({ error: 'SUPABASE_SECRET_KEYS.default가 설정되지 않았습니다.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const userId = userData.user.id;
  const { data: entitlement, error: entitlementError } = await serviceClient
    .from('entitlements')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();

  if (entitlementError) {
    return jsonResponse({ error: '관리자 권한 확인에 실패했습니다.', detail: entitlementError.message }, 500);
  }

  if (entitlement?.tier !== 'admin') {
    return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);
  }

  let payload: { enabled?: unknown; until?: unknown };
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: '입력값이 올바르지 않습니다.' }, 400);
  }

  const enabled = payload.enabled === true;
  const until = normalizeUntil(payload.until);
  if (enabled && !until) {
    return jsonResponse({ error: '뱃지를 켤 날짜와 시간을 입력하세요.' }, 400);
  }

  const value = { enabled, until };
  const { error: upsertError } = await serviceClient
    .from('app_settings')
    .upsert({
      key: 'notice_badge',
      value,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  if (upsertError) {
    return jsonResponse({ error: '공지 뱃지 설정 저장에 실패했습니다.', detail: upsertError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    noticeBadge: {
      ...value,
      active: Boolean(enabled && until && new Date(until).getTime() > Date.now()),
    },
    serverTime: new Date().toISOString(),
  });
});
