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
  const { data: redemptionRows, error: redemptionError } = await serviceClient.rpc(
    'redeem_verification_code',
    {
      p_code_hash: codeHash,
      p_user_id: userData.user.id,
    },
  );

  if (redemptionError) {
    console.error('redeem_verification_code failed:', redemptionError);
    return jsonResponse({ error: '인증코드 확인 중 오류가 발생했습니다.', detail: redemptionError.message }, 500);
  }

  const redemption = Array.isArray(redemptionRows) ? redemptionRows[0] : redemptionRows;
  if (!redemption?.ok) {
    const errorCode = String(redemption?.error_code || 'invalid');
    if (errorCode === 'not_assigned') {
      return jsonResponse({ error: '이 계정에서 사용할 수 없는 인증코드입니다.' }, 403);
    }
    if (errorCode === 'expired') {
      return jsonResponse({ error: '사용 기간이 만료된 인증코드입니다.' }, 410);
    }
    if (errorCode === 'used') {
      return jsonResponse({ error: '이미 사용된 인증코드입니다.' }, 409);
    }
    return jsonResponse({ error: '인증코드가 올바르지 않습니다.' }, 400);
  }

  return jsonResponse({
    ok: true,
    tier: redemption.entitlement_tier || 'verified',
    expiresAt: redemption.entitlement_expires_at || null,
  });
});
