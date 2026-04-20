import { supabase } from './supabase';

export type ChallengeRow = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  /** 홈 배너 우선순위(클수록 우선). 없으면 0으로 간주 */
  banner_weight?: number;
};

export type ChallengeEntryRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
  /** fetchChallengeEntries에서 병합 */
  author_nickname?: string | null;
  cat_name?: string | null;
  nyan_bti_type?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** 진행 중: start_date ≤ now &lt; end_date (복수 행 가능) */
function challengesLiveFilter<T extends { lte: (c: string, v: string) => T; gt: (c: string, v: string) => T }>(
  q: T,
): T {
  const t = nowIso();
  return q.lte('start_date', t).gt('end_date', t);
}

/**
 * 홈 배너·`/challenge` 무id 진입용: 진행 중 챌린지 중 **한 개**
 * `banner_weight` 큰 순 → `created_at` 최신 순 (새로 등록한 챌린지가 상단을 가져감)
 */
export async function fetchActiveChallenge(): Promise<ChallengeRow | null> {
  const { data, error } = await challengesLiveFilter(
    supabase.from('challenges').select('id, title, description, start_date, end_date, created_at, banner_weight'),
  )
    .order('banner_weight', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42703' && /banner_weight/i.test(error.message)) {
      const { data: d2, error: e2 } = await challengesLiveFilter(
        supabase.from('challenges').select('id, title, description, start_date, end_date, created_at'),
      )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e2) {
        if (e2.code === '42P01' || /does not exist|schema cache/i.test(e2.message)) {
          console.warn('[challenges] table missing?', e2.message);
          return null;
        }
        throw e2;
      }
      return d2 as ChallengeRow | null;
    }
    if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) {
      console.warn('[challenges] table missing?', error.message);
      return null;
    }
    throw error;
  }
  return data as ChallengeRow | null;
}

/** 진행 중인 모든 챌린지(커뮤니티 목록 등). 배너 우선순위 순 */
export async function fetchOpenChallenges(): Promise<ChallengeRow[]> {
  const { data, error } = await challengesLiveFilter(
    supabase.from('challenges').select('id, title, description, start_date, end_date, created_at, banner_weight'),
  )
    .order('banner_weight', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42703' && /banner_weight/i.test(error.message)) {
      const { data: d2, error: e2 } = await challengesLiveFilter(
        supabase.from('challenges').select('id, title, description, start_date, end_date, created_at'),
      ).order('created_at', { ascending: false });
      if (e2) {
        if (e2.code === '42P01' || /does not exist|schema cache/i.test(e2.message)) return [];
        throw e2;
      }
      return (d2 ?? []) as ChallengeRow[];
    }
    if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as ChallengeRow[];
}

export async function fetchOpenChallengesWithCounts(): Promise<
  { challenge: ChallengeRow; participantCount: number }[]
> {
  const rows = await fetchOpenChallenges();
  const withCounts = await Promise.all(
    rows.map(async (challenge) => ({
      challenge,
      participantCount: await countChallengeParticipants(challenge.id),
    })),
  );
  return withCounts;
}

export async function fetchChallengeById(id: string): Promise<ChallengeRow | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id, title, description, start_date, end_date, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as ChallengeRow | null;
}

export async function countChallengeParticipants(challengeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('challenge_entries')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId);

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) return 0;
    throw error;
  }
  return count ?? 0;
}

export async function fetchChallengeEntries(challengeId: string): Promise<ChallengeEntryRow[]> {
  const { data, error } = await supabase
    .from('challenge_entries')
    .select('id, challenge_id, user_id, photo_url, caption, created_at, profiles(nickname)')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) return [];
    throw error;
  }

  const raw = (data ?? []) as (ChallengeEntryRow & {
    profiles?: { nickname?: string | null } | { nickname?: string | null }[] | null;
  })[];

  const uids = [...new Set(raw.map((r) => r.user_id))];
  const catByUser = new Map<string, { name: string; nyanBTI_type: string | null }>();

  if (uids.length > 0) {
    const { data: catRows, error: catErr } = await supabase
      .from('cats')
      .select('user_id, name, nyanBTI_type, created_at')
      .in('user_id', uids)
      .order('created_at', { ascending: false });

    if (!catErr && catRows) {
      for (const c of catRows) {
        const uid = c.user_id as string;
        if (!catByUser.has(uid)) {
          catByUser.set(uid, {
            name: typeof c.name === 'string' ? c.name : '냥이',
            nyanBTI_type: (c as { nyanBTI_type?: string | null }).nyanBTI_type ?? null,
          });
        }
      }
    }
  }

  return raw.map((row) => {
    const pr = row.profiles;
    const nick =
      pr == null
        ? null
        : Array.isArray(pr)
          ? pr[0]?.nickname?.trim() ?? null
          : pr.nickname?.trim() ?? null;
    const cat = catByUser.get(row.user_id);
    const { profiles: _p, ...rest } = row;
    return {
      ...rest,
      author_nickname: nick,
      cat_name: cat?.name ?? null,
      nyan_bti_type: cat?.nyanBTI_type ?? null,
    } as ChallengeEntryRow;
  });
}

export async function userHasChallengeEntry(challengeId: string, userId: string): Promise<boolean> {
  const row = await fetchChallengeEntryForUser(challengeId, userId);
  return row != null;
}

/** 현재 사용자의 해당 챌린지 참여 행 1건 (없으면 null) */
export async function fetchChallengeEntryForUser(
  challengeId: string,
  userId: string
): Promise<ChallengeEntryRow | null> {
  const { data, error } = await supabase
    .from('challenge_entries')
    .select('id, challenge_id, user_id, photo_url, caption, created_at')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) return null;
    throw error;
  }
  return (data ?? null) as ChallengeEntryRow | null;
}

/** 공개 URL에서 Storage 객체 경로 추출 (challenge-photos 버킷 기준) */
export function challengePhotoPathFromPublicUrl(publicUrl: string): string | null {
  const marker = '/challenge-photos/';
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  const rest = publicUrl.slice(i + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest ?? '');
  } catch {
    return rest ?? null;
  }
}

export async function fetchActiveChallengeWithCount(): Promise<{
  challenge: ChallengeRow | null;
  participantCount: number;
}> {
  const challenge = await fetchActiveChallenge();
  if (!challenge) return { challenge: null, participantCount: 0 };
  const participantCount = await countChallengeParticipants(challenge.id);
  return { challenge, participantCount };
}

/** 마이페이지·나의 챌린지: 내가 참여한 챌린지 이력 */
export type MyChallengeParticipation = {
  entryId: string;
  challengeId: string;
  title: string;
  startDate: string;
  endDate: string;
  photoUrl: string;
  caption: string | null;
  participatedAt: string;
};

export async function fetchMyChallengeParticipations(userId: string): Promise<MyChallengeParticipation[]> {
  const { data, error } = await supabase
    .from('challenge_entries')
    .select(
      'id, challenge_id, photo_url, caption, created_at, challenges ( id, title, start_date, end_date )',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) return [];
    throw error;
  }

  const raw = (data ?? []) as {
    id: string;
    challenge_id: string;
    photo_url: string;
    caption: string | null;
    created_at: string;
    challenges:
      | { id: string; title: string; start_date: string; end_date: string }
      | { id: string; title: string; start_date: string; end_date: string }[]
      | null;
  }[];

  return raw
    .map((row) => {
      const ch = row.challenges;
      const c = Array.isArray(ch) ? ch[0] : ch;
      if (!c?.id) return null;
      return {
        entryId: row.id,
        challengeId: c.id,
        title: c.title,
        startDate: c.start_date,
        endDate: c.end_date,
        photoUrl: row.photo_url,
        caption: row.caption,
        participatedAt: row.created_at,
      } satisfies MyChallengeParticipation;
    })
    .filter((x): x is MyChallengeParticipation => x != null);
}
