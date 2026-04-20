import { supabase } from './supabase';

export type LatestCatRow = {
  id: string;
  name: string;
  created_at: string;
  birth_date: string | null;
  adopted_at: string | null;
  nyanBTI_type: string | null;
  avatar_url: string | null;
  /** 앨범에서 지정한 홈용 대표 사진 (마이그레이션 전에는 null) */
  representative_photo_url?: string | null;
};

export async function fetchLatestCat(): Promise<LatestCatRow | null> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data, error } = await supabase
    .from('cats')
    .select('id, name, created_at, birth_date, adopted_at, nyanBTI_type, avatar_url, representative_photo_url')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LatestCatRow | null;
}

/** 프로필 설정/수정 화면용 (최신 1마리) */
export type CatProfileForEdit = {
  id: string;
  name: string;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  adopted_at: string | null;
  avatar_url: string | null;
  representative_photo_url: string | null;
};

export async function fetchLatestCatForProfileEdit(): Promise<CatProfileForEdit | null> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data, error } = await supabase
    .from('cats')
    .select('id, name, breed, gender, birth_date, adopted_at, avatar_url, representative_photo_url')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CatProfileForEdit | null;
}
