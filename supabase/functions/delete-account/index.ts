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
    return jsonResponse({ error: '회원탈퇴 처리 중 오류가 발생했습니다.' }, 500);
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
  const { error: entitlementError } = await serviceClient
    .from('entitlements')
    .delete()
    .eq('user_id', userId);

  if (entitlementError) {
    return jsonResponse({ error: '권한 정보 삭제에 실패했습니다.' }, 500);
  }

  const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(userId, true);

  if (deleteUserError) {
    return jsonResponse({ error: '계정 삭제에 실패했습니다.' }, 500);
  }

  return jsonResponse({ success: true });
});
