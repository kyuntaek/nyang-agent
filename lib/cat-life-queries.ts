import { supabase } from './supabase';

export type CatPhotoRow = {
  id: string;
  cat_id: string;
  url: string;
  created_at: string;
};

export type AnniversaryRow = {
  id: string;
  cat_id: string;
  title: string;
  date: string;
  repeat_yearly: boolean;
  created_at: string;
};

function isMissingTableError(err: { message?: string; details?: string; code?: string }): boolean {
  const t = `${err.message ?? ''} ${err.details ?? ''} ${err.code ?? ''}`;
  return /cat_photos|anniversaries|schema cache|does not exist|Could not find/i.test(t);
}

export async function fetchCatPhotos(catId: string): Promise<CatPhotoRow[]> {
  const { data, error } = await supabase
    .from('cat_photos')
    .select('id, cat_id, url, created_at')
    .eq('cat_id', catId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingTableError(error)) {
      console.warn('[cat_photos] 테이블이 없거나 마이그레이션이 적용되지 않았어요.', error.message);
      return [];
    }
    throw error;
  }
  return (data ?? []) as CatPhotoRow[];
}

export async function fetchAnniversaries(catId: string): Promise<AnniversaryRow[]> {
  const { data, error } = await supabase
    .from('anniversaries')
    .select('id, cat_id, title, date, repeat_yearly, created_at')
    .eq('cat_id', catId)
    .order('date', { ascending: true });
  if (error) {
    if (isMissingTableError(error)) {
      console.warn('[anniversaries] 테이블이 없거나 마이그레이션이 적용되지 않았어요.', error.message);
      return [];
    }
    throw error;
  }
  return (data ?? []) as AnniversaryRow[];
}
