import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function getRemainingInfo(expiresAt: string | null) {
  if (!expiresAt) {
    return {
      remainingText: '만료일 없음',
      remainingDays: null,
      expired: false,
    };
  }

  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return {
      remainingText: '만료일 정보 오류',
      remainingDays: null,
      expired: false,
    };
  }

  if (diffMs <= 0) {
    return {
      remainingText: '만료됨',
      remainingDays: 0,
      expired: true,
    };
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}분`);

  return {
    remainingText: parts.length ? parts.join(' ') : '1분 미만',
    remainingDays: Math.ceil(diffMs / 86400000),
    expired: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
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
    return jsonResponse({ error: '인증정보를 불러올 수 없습니다.' }, 500);
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
    .select('tier, source, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (entitlementError) {
    return jsonResponse({ error: '권한 정보를 불러올 수 없습니다.', detail: entitlementError.message }, 500);
  }

  const { data: verificationCode, error: codeError } = await serviceClient
    .from('verified_codes')
    .select('used_at, expires_at, memo, max_uses, used_count')
    .eq('used_by_user_id', userId)
    .not('used_at', 'is', null)
    .order('used_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (codeError) {
    return jsonResponse({ error: '인증코드 정보를 불러올 수 없습니다.', detail: codeError.message }, 500);
  }

  const isAdmin = entitlement?.tier === 'admin';
  const expiresAt = isAdmin ? null : (entitlement?.expires_at || verificationCode?.expires_at || null);
  const remaining = getRemainingInfo(expiresAt);

  return jsonResponse({
    tier: entitlement?.tier || 'free',
    source: entitlement?.source || null,
    verifiedAt: verificationCode?.used_at || null,
    expiresAt,
    memo: verificationCode?.memo || null,
    maxUses: verificationCode?.max_uses ?? null,
    usedCount: verificationCode?.used_count ?? null,
    ...remaining,
    serverTime: new Date().toISOString(),
  });
});
