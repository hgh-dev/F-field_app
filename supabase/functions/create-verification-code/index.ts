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

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeUuid(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
}

function normalizeMemo(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function normalizeMaxUses(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1000, Math.max(1, Math.floor(parsed)));
}

function normalizeExpiresAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

async function resolveAssignedUserId(serviceClient: ReturnType<typeof createClient>, assignedTo: unknown) {
  const directUuid = normalizeUuid(assignedTo);
  if (directUuid) return directUuid;

  const email = normalizeEmail(assignedTo);
  if (!email) return null;

  let page = 1;
  const perPage = 1000;
  while (page <= 20) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const matched = data.users.find((user) => user.email?.toLowerCase() === email);
    if (matched) return matched.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  throw new Error('assigned_to에 해당하는 사용자를 찾을 수 없습니다.');
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
    return jsonResponse({ error: '인증코드 생성 중 오류가 발생했습니다.' }, 500);
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

  let payload: {
    maxUses?: unknown;
    assignedTo?: unknown;
    expiresAt?: unknown;
    memo?: unknown;
  };
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: '입력값이 올바르지 않습니다.' }, 400);
  }

  const maxUses = normalizeMaxUses(payload.maxUses);
  const expiresAt = normalizeExpiresAt(payload.expiresAt);
  const memo = normalizeMemo(payload.memo);
  let assignedToUserId: string | null = null;

  try {
    assignedToUserId = await resolveAssignedUserId(serviceClient, payload.assignedTo);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'assigned_to 확인에 실패했습니다.' }, 400);
  }

  const code = generateCode();
  const codeHash = await sha256Hex(code);
  const { data: insertedCode, error: insertError } = await serviceClient
    .from('verified_codes')
    .insert({
      code_hash: codeHash,
      status: 'unused',
      max_uses: maxUses,
      used_count: 0,
      assigned_to: assignedToUserId,
      expires_at: expiresAt,
      memo,
      generated_by_user_id: userId,
    })
    .select('id, max_uses, assigned_to, expires_at, memo')
    .single();

  if (insertError) {
    console.error('verified_codes insert failed:', insertError);
    return jsonResponse({ error: '인증코드 생성에 실패했습니다.', detail: insertError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    code,
    id: insertedCode.id,
    maxUses: insertedCode.max_uses,
    assignedTo: insertedCode.assigned_to,
    expiresAt: insertedCode.expires_at,
    memo: insertedCode.memo,
  });
});
