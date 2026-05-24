import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ALLOWED_TIERS = new Set(['free', 'verified', 'premium', 'admin']);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeUuid(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
}

function normalizeTier(value: unknown) {
  const tier = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_TIERS.has(tier) ? tier : '';
}

function normalizeExpiresAt(value: unknown, tier: string) {
  if (tier === 'admin' || tier === 'free') return null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getServiceRoleKey() {
  try {
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    return secretKeys.default || '';
  } catch (_error) {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: '권한 변경 중 오류가 발생했습니다.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const currentUserId = userData.user.id;
  const { data: adminEntitlement, error: adminError } = await serviceClient
    .from('entitlements')
    .select('tier')
    .eq('user_id', currentUserId)
    .maybeSingle();

  if (adminError) return jsonResponse({ error: '관리자 권한 확인에 실패했습니다.' }, 500);
  if (adminEntitlement?.tier !== 'admin') return jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403);

  let payload: { userId?: unknown; tier?: unknown; expiresAt?: unknown };
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: '입력값이 올바르지 않습니다.' }, 400);
  }

  const userId = normalizeUuid(payload.userId);
  const tier = normalizeTier(payload.tier);
  if (!userId || !tier) return jsonResponse({ error: '입력값이 올바르지 않습니다.' }, 400);
  if (userId === currentUserId) return jsonResponse({ error: '현재 관리자 계정의 권한은 이 화면에서 변경할 수 없습니다.' }, 400);

  if (tier === 'free') {
    const { error } = await serviceClient.from('entitlements').delete().eq('user_id', userId);
    if (error) return jsonResponse({ error: '권한 취소에 실패했습니다.', detail: error.message }, 500);
    return jsonResponse({ ok: true, userId, tier: 'free', expiresAt: null });
  }

  const expiresAt = normalizeExpiresAt(payload.expiresAt, tier);
  const { error } = await serviceClient
    .from('entitlements')
    .upsert({
      user_id: userId,
      tier,
      source: 'verified_code',
      expires_at: expiresAt,
    }, { onConflict: 'user_id' });

  if (error) return jsonResponse({ error: '권한 저장에 실패했습니다.', detail: error.message }, 500);
  return jsonResponse({ ok: true, userId, tier, expiresAt });
});
