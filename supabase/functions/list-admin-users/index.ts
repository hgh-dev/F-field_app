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

async function getServiceRoleKey() {
  try {
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    return secretKeys.default || '';
  } catch (_error) {
    return '';
  }
}

async function requireAdmin(req: Request, supabaseUrl: string, supabaseAnonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    throw new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), { status: 401 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: entitlement, error } = await serviceClient
    .from('entitlements')
    .select('tier')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw new Response(JSON.stringify({ error: '관리자 권한 확인에 실패했습니다.' }), { status: 500 });
  if (entitlement?.tier !== 'admin') {
    throw new Response(JSON.stringify({ error: '관리자 권한이 필요합니다.' }), { status: 403 });
  }

  return { serviceClient, currentUserId: userData.user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = await getServiceRoleKey();
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: '회원 정보를 불러올 수 없습니다.' }, 500);
  }

  try {
    const { serviceClient, currentUserId } = await requireAdmin(req, supabaseUrl, supabaseAnonKey, serviceRoleKey);
    const [userResult, entitlementResult] = await Promise.all([
      serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      serviceClient.from('entitlements').select('user_id, tier, source, expires_at, created_at, updated_at'),
    ]);

    if (userResult.error) {
      return jsonResponse({ error: '회원 목록을 불러올 수 없습니다.', detail: userResult.error.message }, 500);
    }
    if (entitlementResult.error) {
      return jsonResponse({ error: '권한 목록을 불러올 수 없습니다.', detail: entitlementResult.error.message }, 500);
    }

    const entitlementMap = new Map((entitlementResult.data || []).map((row) => [row.user_id, row]));
    const users = userResult.data.users
      .map((user) => {
        const entitlement = entitlementMap.get(user.id);
        return {
          id: user.id,
          email: user.email || '',
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at || null,
          tier: entitlement?.tier || 'free',
          source: entitlement?.source || null,
          expiresAt: entitlement?.expires_at || null,
          isCurrentUser: user.id === currentUserId,
        };
      })
      .sort((a, b) => String(a.email).localeCompare(String(b.email)));

    return jsonResponse({ users, currentUserId, serverTime: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Response) {
      const body = await error.text();
      return new Response(body, { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return jsonResponse({ error: '회원 정보를 불러올 수 없습니다.' }, 500);
  }
});
