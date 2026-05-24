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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: '설정을 불러올 수 없습니다.' }, 500);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', 'notice_badge')
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: '설정을 불러올 수 없습니다.', detail: error.message }, 500);
  }

  const value = data?.value && typeof data.value === 'object' ? data.value as Record<string, unknown> : {};
  const until = typeof value.until === 'string' ? value.until : null;
  const enabled = value.enabled === true;
  const active = Boolean(enabled && until && new Date(until).getTime() > Date.now());

  const { data: apiKeyData, error: apiKeyError } = await client
    .from('app_settings')
    .select('value, updated_at')
    .eq('key', 'api_keys')
    .maybeSingle();

  if (apiKeyError) {
    return jsonResponse({ error: '설정을 불러올 수 없습니다.', detail: apiKeyError.message }, 500);
  }

  const apiKeyValue = apiKeyData?.value && typeof apiKeyData.value === 'object'
    ? apiKeyData.value as Record<string, unknown>
    : {};
  const vworldValue = apiKeyValue.vworld && typeof apiKeyValue.vworld === 'object'
    ? apiKeyValue.vworld as Record<string, unknown>
    : {};
  const vworldKey = typeof vworldValue.key === 'string' ? vworldValue.key.trim() : '';
  const vworldExpiresAt = typeof vworldValue.expiresAt === 'string' ? vworldValue.expiresAt : null;
  const vworldExpired = Boolean(vworldExpiresAt && new Date(vworldExpiresAt).getTime() <= Date.now());

  return jsonResponse({
    noticeBadge: {
      enabled,
      until,
      active,
      updatedAt: data?.updated_at || null,
    },
    apiKeys: {
      vworld: {
        key: vworldKey && !vworldExpired ? vworldKey : null,
        expiresAt: vworldExpiresAt,
        expired: vworldExpired,
        updatedAt: apiKeyData?.updated_at || null,
      },
    },
    serverTime: new Date().toISOString(),
  });
});
