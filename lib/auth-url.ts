import * as Linking from 'expo-linking';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Supabase Dashboard → Authentication → URL Configuration → Redirect URLs에 그대로 추가하세요. */
export function getEmailRedirectTo(): string {
  return Linking.createURL('auth/callback');
}

/**
 * OAuth(Kakao 등) `redirectTo`.
 * 로컬 예: `exp://127.0.0.1:8081/--/auth/callback` — Metro 주소·scheme에 맞게 자동 생성됩니다.
 */
export function getOAuthRedirectTo(): string {
  return Linking.createURL('auth/callback');
}

type ParsedAuth = {
  access_token?: string;
  refresh_token?: string;
  code?: string;
};

export function parseAuthParamsFromUrl(url: string): ParsedAuth {
  const hashIdx = url.indexOf('#');
  const preHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';

  const qIdx = preHash.indexOf('?');
  const search = qIdx >= 0 ? preHash.slice(qIdx + 1) : '';

  const h = new URLSearchParams(hash);
  const s = new URLSearchParams(search);

  return {
    access_token: h.get('access_token') || s.get('access_token') || undefined,
    refresh_token: h.get('refresh_token') || s.get('refresh_token') || undefined,
    code: h.get('code') || s.get('code') || undefined,
  };
}

export function looksLikeAuthCallback(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('access_token') ||
    url.includes('refresh_token=') ||
    url.includes('code=')
  );
}

export async function applySessionFromAuthUrl(
  supabase: SupabaseClient,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  const { access_token, refresh_token, code } = parseAuthParamsFromUrl(url);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: false };
}
