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

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeVerificationCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    return jsonResponse({ error: '인증코드 확인 중 오류가 발생했습니다.' }, 500);
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

  let payload: { code?: unknown };
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: '인증코드가 올바르지 않습니다.' }, 400);
  }

  const code = typeof payload.code === 'string' ? normalizeVerificationCode(payload.code) : '';
  if (!code) {
    return jsonResponse({ error: '인증코드가 올바르지 않습니다.' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const codeHash = await sha256Hex(code);
  const { data: verificationCode, error: codeError } = await serviceClient
    .from('verified_codes')
    .select('id, status, expires_at, max_uses, used_count, assigned_to')
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (codeError) {
    console.error('verified_codes select failed:', codeError);
    return jsonResponse({ error: '인증코드 확인 중 오류가 발생했습니다.', detail: codeError.message }, 500);
  }

  if (!verificationCode) {
    return jsonResponse({ error: '인증코드가 올바르지 않습니다.' }, 400);
  }

  if (verificationCode.status !== 'unused') {
    return jsonResponse({ error: '이미 사용된 인증코드입니다.' }, 409);
  }

  if (verificationCode.assigned_to && verificationCode.assigned_to !== userData.user.id) {
    return jsonResponse({ error: '이 계정에서 사용할 수 없는 인증코드입니다.' }, 403);
  }

  const maxUses = Math.max(1, Number(verificationCode.max_uses || 1));
  const usedCount = Math.max(0, Number(verificationCode.used_count || 0));
  if (usedCount >= maxUses) {
    return jsonResponse({ error: '이미 사용된 인증코드입니다.' }, 409);
  }

  const usedAt = new Date().toISOString();
  const { error: entitlementError } = await serviceClient
    .from('entitlements')
    .upsert({
      user_id: userData.user.id,
      tier: 'verified',
      source: 'verified_code',
      expires_at: verificationCode.expires_at || null,
    }, { onConflict: 'user_id' });

  if (entitlementError) {
    console.error('entitlements upsert failed:', entitlementError);
    return jsonResponse({ error: '인증코드 확인 중 오류가 발생했습니다.', detail: entitlementError.message }, 500);
  }

  const nextUsedCount = usedCount + 1;
  const nextStatus = nextUsedCount >= maxUses ? 'used' : 'unused';
  const { data: updatedRows, error: updateError } = await serviceClient
    .from('verified_codes')
    .update({
      status: nextStatus,
      used_count: nextUsedCount,
      used_by_user_id: userData.user.id,
      used_at: usedAt,
    })
    .eq('id', verificationCode.id)
    .eq('status', 'unused')
    .lt('used_count', maxUses)
    .select('id');

  if (updateError) {
    console.error('verified_codes update failed:', updateError);
    return jsonResponse({ error: '인증코드 확인 중 오류가 발생했습니다.', detail: updateError.message }, 500);
  }

  if (!updatedRows || updatedRows.length === 0) {
    return jsonResponse({ error: '이미 사용된 인증코드입니다.' }, 409);
  }

  return jsonResponse({ ok: true, tier: 'verified' });
});
