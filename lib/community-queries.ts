import { supabase } from './supabase';
import { thumbnailPublicUrlFromFullPublicUrl } from './image-upload';
import { trimValidHttpUrl } from './safe-external-url';

export const POST_CHANNELS = [
  /** RPC `get_best_posts` 기반 목록 (채널 무관) — 예전 ‘전체’ 자리 */
  { key: 'best', label: '베스트', db: null as string | null },
  /** 전체 채널 최신순 (posts, 채널 필터 없음) */
  { key: 'latest', label: '최신글', db: null as string | null },
  /** 내가 쓴 글 */
  { key: 'mine', label: '내글', db: null as string | null },
  { key: 'food', label: '먹거리', db: 'food' },
  { key: 'health', label: '건강', db: 'health' },
  { key: 'daily', label: '일상', db: 'daily' },
  { key: 'goods', label: '용품', db: 'goods' },
  /** 기타(구 코숏) — 채널 칩 순서 맨 뒤 */
  { key: 'koshort', label: '기타', db: 'koshort' },
] as const;

export type PostChannelDb = 'koshort' | 'food' | 'health' | 'daily' | 'goods';

/** 게시글 채널 → 커뮤니티 탭 라벨 (칩용) */
export function postChannelDisplayLabel(channel: PostChannelDb): string {
  const row = POST_CHANNELS.find((c) => c.db === channel);
  return row?.label ?? channel;
}

/** 목록 칩용 짧은 날짜 */
export function formatShortPostDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

/** 홈 커뮤니티 카드: 연·월·일·시각 (보조 텍스트, 칩 아님) */
export function formatHomePostDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** 글쓰기 분류 칩 (전체·미분류 없음 — `posts.channel`에 그대로 저장). 기본 선택은 첫 항목(일상). */
export const COMMUNITY_WRITE_CHANNELS: { label: string; db: PostChannelDb }[] = [
  { label: '일상', db: 'daily' },
  { label: '먹거리', db: 'food' },
  { label: '건강', db: 'health' },
  { label: '용품', db: 'goods' },
  { label: '기타', db: 'koshort' },
];

/** posts 테이블 한 행 (RPC get_best_posts / get_hot_posts 등) */
export type PostRow = {
  id: string;
  user_id: string;
  cat_id: string | null;
  channel: PostChannelDb;
  body: string;
  agent_summary: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  image_urls: string[] | null;
  video_url: string | null;
};

export type PostFeedRow = {
  id: string;
  user_id: string;
  cat_id: string | null;
  channel: PostChannelDb;
  body: string;
  agent_summary: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  image_urls: string[] | null;
  video_url: string | null;
  profiles: { nickname: string | null; avatar_url?: string | null } | null;
  cats: {
    name: string | null;
    breed: string | null;
    avatar_url: string | null;
    representative_photo_url?: string | null;
  } | null;
};

export const POST_PAGE_SIZE = 12;

/** 커뮤니티 검색어 정리 (ilike 와일드카드·OR 구문 쉼표 방지) */
export function sanitizeCommunitySearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/%/g, '')
    .replace(/_/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type CommunityPostsRpcRow = {
  id: string;
  user_id: string;
  cat_id: string | null;
  channel: string;
  body: string;
  agent_summary: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  image_urls: string[] | null;
  video_url: string | null;
  profile_nickname: string | null;
  profile_avatar_url: string | null;
  cat_name: string | null;
  cat_breed: string | null;
  cat_avatar_url: string | null;
  cat_representative_photo_url: string | null;
};

function mapCommunityPostsRpcToFeedRows(rows: CommunityPostsRpcRow[] | null): PostFeedRow[] {
  if (!rows?.length) return [];
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    cat_id: r.cat_id,
    channel: r.channel as PostChannelDb,
    body: r.body,
    agent_summary: r.agent_summary,
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    created_at: r.created_at,
    image_urls: r.image_urls,
    video_url: r.video_url,
    profiles: { nickname: r.profile_nickname, avatar_url: r.profile_avatar_url },
    cats:
      r.cat_id == null
        ? null
        : {
            name: r.cat_name,
            breed: r.cat_breed,
            avatar_url: r.cat_avatar_url,
            representative_photo_url: r.cat_representative_photo_url,
          },
  }));
}

/**
 * 본문·요약·집사 닉네임·냥 이름 OR 검색 (RPC `community_posts_page`).
 * RPC 미적용 시 null 반환 → 호출부에서 본문 ilike 폴백.
 */
async function fetchCommunityPostsPageRpc(params: {
  onlyUserId: string | null;
  channel: string | null;
  searchTerm: string;
  offset: number;
}): Promise<PostFeedRow[] | null> {
  const s = sanitizeCommunitySearchTerm(params.searchTerm);
  if (!s) return null;

  const { data, error } = await supabase.rpc('community_posts_page', {
    p_only_user_id: params.onlyUserId,
    p_channel: params.channel,
    p_search: s,
    p_offset: params.offset,
    p_limit: POST_PAGE_SIZE,
  });

  if (error) {
    if (error.code === '42883' || /function .* does not exist/i.test(error.message)) {
      if (__DEV__) {
        console.warn(
          '[community_posts_page] RPC 없음. supabase/migrations/20260422140000_community_posts_search_rpc.sql 적용 후 재시도하세요.',
          error.message
        );
      }
      return null;
    }
    throw error;
  }

  return mapCommunityPostsRpcToFeedRows(data as CommunityPostsRpcRow[] | null);
}

const POST_FEED_SELECT = `
      id,
      user_id,
      cat_id,
      channel,
      body,
      agent_summary,
      like_count,
      comment_count,
      created_at,
      image_urls,
      video_url,
      profiles!posts_user_id_fkey ( nickname, avatar_url ),
      cats!posts_cat_id_fkey ( name, breed, avatar_url, representative_photo_url )
    `;

/** 본문에서 첫 이미지 URL 추출 (마크다운 이미지 또는 직접 URL) */
export function firstImageUrlFromBody(body: string | null | undefined): string | null {
  if (body == null || typeof body !== 'string') return null;
  const md = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i.exec(body);
  if (md?.[1]) return trimValidHttpUrl(md[1]);
  const bare = /(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s<>"']*)?)/i.exec(body);
  return trimValidHttpUrl(bare?.[1] ?? null);
}

function catAvatarFromFeedRow(row: PostFeedRow): string | null {
  const c = row.cats as
    | { avatar_url?: string | null; representative_photo_url?: string | null }
    | { avatar_url?: string | null; representative_photo_url?: string | null }[]
    | null
    | undefined;
  if (c == null) return null;
  if (Array.isArray(c)) {
    const x = c[0];
    return x?.representative_photo_url?.trim() || x?.avatar_url?.trim() || null;
  }
  return c.representative_photo_url?.trim() || c.avatar_url?.trim() || null;
}

/** DB/JSON 직렬화 차이로 string | string[] | json 문자열 등이 올 수 있음 (http(s) 파싱 가능한 것만) */
export function normalizePostImageUrls(raw: unknown): string[] {
  const finalize = (urls: string[]): string[] =>
    urls
      .map((u) => trimValidHttpUrl(u))
      .filter((u): u is string => u != null);

  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return finalize(
      raw.map((u) => (typeof u === 'string' ? u.trim() : '')).filter((u): u is string => u.length > 0),
    );
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        return normalizePostImageUrls(JSON.parse(t) as unknown);
      } catch {
        return finalize([t]);
      }
    }
    return finalize([t]);
  }
  return [];
}

function firstPostImageUrl(row: Pick<PostFeedRow | PostRow, 'image_urls'>): string | null {
  const urls = normalizePostImageUrls(row.image_urls);
  return urls[0] ?? null;
}

/** 피드 썸네일: post-media 등 업로드 원본 URL이면 `_thumb` 변형 사용 */
function feedThumbUrlIfApplicable(fullUrl: string): string {
  if (!/\/object\/public\/(post-media|challenge-photos|cat-photos)\//.test(fullUrl)) return fullUrl;
  if (/_thumb\./i.test(fullUrl)) return fullUrl;
  return thumbnailPublicUrlFromFullPublicUrl(fullUrl);
}

/** 글 목록 썸네일: 첨부 이미지 → 본문 URL → 고양이 프로필 (파싱 가능한 http(s)만 — 잘못된 문자열로 Image 오류 방지) */
export function postThumbnailUrl(row: PostFeedRow): string | null {
  const raw = firstPostImageUrl(row) ?? firstImageUrlFromBody(row.body) ?? catAvatarFromFeedRow(row);
  const u = trimValidHttpUrl(raw);
  if (!u) return null;
  return feedThumbUrlIfApplicable(u);
}

/** 베스트/인기 RPC 행: 첨부 이미지 → 본문 URL */
export function postThumbnailUrlFromPostRow(row: PostRow): string | null {
  const raw = firstPostImageUrl(row) ?? firstImageUrlFromBody(row.body);
  return trimValidHttpUrl(raw);
}

/** 인기글 카드용 짧은 제목 (첫 줄 또는 앞부분) */
export function postPreviewTitle(body: string | null | undefined, maxLen = 56): string {
  const raw = typeof body === 'string' ? body : '';
  const line = raw.trim().split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const t = line.trim();
  if (t.length <= maxLen) return t || '내용 없음';
  return `${t.slice(0, maxLen - 1)}…`;
}

/** 베스트 글: RPC로 순서만 정한 뒤 피드 select로 보강 (닉네임·냥 썸네일 폴백과 동일) */
export async function fetchBestPosts(limit = 5): Promise<PostFeedRow[]> {
  const capped = Math.max(1, Math.min(limit, 50));
  const { data: rpcData, error } = await supabase.rpc('get_best_posts', { p_limit: capped });
  if (error) {
    if (error.code === '42883' || /function .* does not exist/i.test(error.message)) {
      console.warn('[get_best_posts] RPC 없음. supabase/migrations/20260420140000_get_best_posts.sql 적용 여부를 확인하세요.', error.message);
      return [];
    }
    throw error;
  }
  const rpcRows = (rpcData ?? []) as PostRow[];
  if (rpcRows.length === 0) return [];

  const ids = rpcRows.map((r) => r.id);
  const { data: feedData, error: feedErr } = await supabase.from('posts').select(POST_FEED_SELECT).in('id', ids);
  if (feedErr) throw feedErr;

  const feed = (feedData ?? []) as unknown as PostFeedRow[];
  const byId = new Map(feed.map((r) => [r.id, r]));
  const ordered: PostFeedRow[] = [];
  for (const r of rpcRows) {
    const row = byId.get(r.id);
    if (row) ordered.push(row);
  }
  return ordered;
}

/** 최근 24시간 글 중 인기 (레거시 RPC). 베스트는 fetchBestPosts 사용 권장. */
export async function fetchHotPosts(): Promise<PostRow[]> {
  const { data, error } = await supabase.rpc('get_hot_posts');
  if (error) {
    if (error.code === '42883' || /function .* does not exist/i.test(error.message)) {
      console.warn('[get_hot_posts] RPC 없음.', error.message);
      return [];
    }
    throw error;
  }
  return (data ?? []) as PostRow[];
}

export async function fetchPostById(id: string): Promise<PostFeedRow | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_FEED_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as PostFeedRow | null;
}

export async function fetchUserLikedPost(postId: string): Promise<boolean> {
  if (!postId) return false;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return false;
  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) {
      return false;
    }
    throw error;
  }
  return data != null;
}

export async function togglePostLike(postId: string): Promise<{ liked: boolean; like_count: number }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) {
    throw new Error('로그인이 필요해요.');
  }
  const uid = userData.user.id;
  const liked = await fetchUserLikedPost(postId);
  if (liked) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', uid);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
    if (error) throw error;
  }
  const { data: post, error: pe } = await supabase.from('posts').select('like_count').eq('id', postId).single();
  if (pe) throw pe;
  return { liked: !liked, like_count: Number(post?.like_count ?? 0) };
}

export async function fetchPostsPage(params: {
  pageParam: number;
  channel: string | null;
  search: string;
}): Promise<PostFeedRow[]> {
  const { pageParam, channel, search } = params;
  const from = pageParam * POST_PAGE_SIZE;
  const to = from + POST_PAGE_SIZE - 1;

  const s = sanitizeCommunitySearchTerm(search);
  if (s) {
    const rpcRows = await fetchCommunityPostsPageRpc({
      onlyUserId: null,
      channel,
      searchTerm: search,
      offset: from,
    });
    if (rpcRows != null) return rpcRows;
  }

  let q = supabase
    .from('posts')
    .select(POST_FEED_SELECT)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (channel) {
    q = q.eq('channel', channel);
  }

  if (s) {
    q = q.ilike('body', `%${s}%`);
  }

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.warn('[posts] table missing?', error.message);
      return [];
    }
    throw error;
  }

  return (data ?? []) as unknown as PostFeedRow[];
}

/** 커뮤니티 내글 탭: 페이지네이션 */
export async function fetchMyPostsPage(params: {
  pageParam: number;
  search: string;
}): Promise<PostFeedRow[]> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.id) return [];

  const { pageParam, search } = params;
  const from = pageParam * POST_PAGE_SIZE;
  const to = from + POST_PAGE_SIZE - 1;
  const uid = userData.user.id;

  const s = sanitizeCommunitySearchTerm(search);
  if (s) {
    const rpcRows = await fetchCommunityPostsPageRpc({
      onlyUserId: uid,
      channel: null,
      searchTerm: search,
      offset: from,
    });
    if (rpcRows != null) return rpcRows;
  }

  let q = supabase
    .from('posts')
    .select(POST_FEED_SELECT)
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (s) {
    q = q.ilike('body', `%${s}%`);
  }

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.warn('[posts] table missing?', error.message);
      return [];
    }
    throw error;
  }
  return (data ?? []) as unknown as PostFeedRow[];
}

/** 홈 등: 내가 쓴 글 최근 N개 */
export async function fetchMyPostsRecent(limit = 12): Promise<PostFeedRow[]> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.id) return [];

  const { data, error } = await supabase
    .from('posts')
    .select(POST_FEED_SELECT)
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.warn('[posts] table missing?', error.message);
      return [];
    }
    throw error;
  }
  return (data ?? []) as unknown as PostFeedRow[];
}

export function getNextPostsPageParam(lastPage: PostFeedRow[], allPages: PostFeedRow[][]): number | undefined {
  if (lastPage.length < POST_PAGE_SIZE) return undefined;
  return allPages.length;
}

export type PostCommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  author_nickname: string;
  created_at: string;
};

export async function fetchPostComments(postId: string): Promise<PostCommentRow[]> {
  if (!postId) return [];
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, post_id, user_id, body, author_nickname, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    const msg = error.message ?? '';
    const missingTable =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /does not exist|schema cache|Could not find the table/i.test(msg);
    if (missingTable) {
      if (__DEV__) {
        console.warn(
          '[post_comments] 테이블 없음. supabase/migrations/20260420170000_post_comments.sql 적용 후 Dashboard에서 API 스키마 리로드가 필요할 수 있어요.',
          msg
        );
      }
      return [];
    }
    throw error;
  }
  return (data ?? []) as PostCommentRow[];
}

export async function addPostComment(postId: string, body: string): Promise<PostCommentRow> {
  const t = body.trim();
  if (!postId || !t) throw new Error('댓글 내용을 입력해 주세요.');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) throw new Error('로그인이 필요해요.');
  const uid = userData.user.id;
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: uid, body: t })
    .select('id, post_id, user_id, body, author_nickname, created_at')
    .single();
  if (error) {
    const msg = error.message ?? '';
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /does not exist|schema cache|Could not find the table/i.test(msg)
    ) {
      throw new Error('댓글 DB가 아직 없어요. post_comments 마이그레이션을 적용한 뒤 Supabase를 새로고침해 주세요.');
    }
    throw new Error(msg || '댓글을 저장하지 못했어요.');
  }
  return data as PostCommentRow;
}

export async function updatePostComment(commentId: string, body: string): Promise<PostCommentRow> {
  const t = body.trim();
  if (!commentId || !t) throw new Error('댓글 내용을 입력해 주세요.');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) throw new Error('로그인이 필요해요.');
  const { data, error } = await supabase
    .from('post_comments')
    .update({ body: t })
    .eq('id', commentId)
    .eq('user_id', userData.user.id)
    .select('id, post_id, user_id, body, author_nickname, created_at')
    .single();
  if (error) {
    const msg = error.message ?? '';
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /does not exist|schema cache|Could not find the table/i.test(msg)
    ) {
      throw new Error('댓글 DB가 아직 없어요. post_comments 마이그레이션을 적용해 주세요.');
    }
    throw new Error(msg || '댓글을 수정하지 못했어요.');
  }
  return data as PostCommentRow;
}

export async function deletePostComment(commentId: string): Promise<void> {
  if (!commentId) return;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) throw new Error('로그인이 필요해요.');
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId).eq('user_id', userData.user.id);
  if (error) throw new Error(error.message || '댓글을 삭제하지 못했어요.');
}

export type PostUpdatePayload = {
  channel: PostChannelDb;
  body: string;
  image_urls: string[];
  video_url: string | null;
};

export async function updatePost(postId: string, patch: PostUpdatePayload): Promise<void> {
  if (!postId) throw new Error('글 정보가 없어요.');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) throw new Error('로그인이 필요해요.');
  const { error } = await supabase
    .from('posts')
    .update({
      channel: patch.channel,
      body: patch.body.trim(),
      image_urls: patch.image_urls,
      video_url: patch.video_url,
    })
    .eq('id', postId)
    .eq('user_id', userData.user.id);
  if (error) throw new Error(error.message || '글을 수정하지 못했어요.');
}

export async function deletePost(postId: string): Promise<void> {
  if (!postId) throw new Error('글 정보가 없어요.');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) throw new Error('로그인이 필요해요.');
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', userData.user.id);
  if (error) throw new Error(error.message || '글을 삭제하지 못했어요.');
}
