import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchActiveChallengeWithCount } from '../../lib/challenge-queries';
import {
  type PostFeedRow,
  fetchBestPosts,
  fetchMyPostsRecent,
  fetchPostsPage,
  formatHomePostDateTime,
  postChannelDisplayLabel,
  postListingBannerUrl,
  postPreviewTitle,
} from '../../lib/community-queries';
import { truncateCatName, truncateUserNickname } from '../../lib/display-strings';
import { fetchAnniversaries } from '../../lib/cat-life-queries';
import { fetchLatestCat } from '../../lib/fetch-latest-cat';
import { pickSoonestAnniversaryHighlight } from '../../lib/home-anniversary';
import { getAgentScreenVisited } from '../../lib/agent-home-ui-flag';
import { formatAgentQuestion, getAgentTimeContext } from '../../lib/agent-time-context';
import { LEGAL_LINKS } from '../../lib/legal-urls';
import { waGwa } from '../../lib/korean-particle';
import { getNyanBtiArchetype } from '../../lib/nyan-bti-archetypes';
import {
  communityChannelTabStyles,
  communityScreenPaddingTop,
  SCREEN_BG_VIOLET,
} from '../../lib/community-tab-styles';

const PRIMARY = '#7F77DD';

/** 홈 피드 카드: Pressable 은 NativeWind interop에서 navigation 오류가 나 TouchableOpacity 사용 */
const homePostCardStyles = StyleSheet.create({
  press: {
    marginBottom: 12,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ede9fe',
    backgroundColor: '#fff',
  },
  pressRow: { flexDirection: 'row' },
  thumb: { width: 92, height: 92, backgroundColor: '#ede9fe' },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#ede9fe',
  },
  thumbPlaceholderIcon: { width: 52, height: 52 },
  noImageLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#a78bfa',
    letterSpacing: 0.2,
  },
  content: { minWidth: 0, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  contentFlex: { flex: 1 },
  author: { fontSize: 12, fontWeight: '500', color: '#a78bfa' },
  /** 1줄: 작성자만 (길면 말줄임) */
  metaBlock: { width: '100%', minWidth: 0 },
  /** 2줄: 카테고리 칩 + 작성일시 */
  metaSecondRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f5f3ff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd6fe',
  },
  chipText: { fontSize: 11, fontWeight: '700', color: '#6d28d9' },
  dateTimeInline: {
    fontSize: 10,
    fontWeight: '500',
    color: '#a78bfa',
    flexShrink: 1,
  },
  title: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: '#2e1064',
  },
  meta: { marginTop: 8, fontSize: 12, color: '#8b5cf6' },
});

/** NativeWind + Pressable 조합 시 navigation context 오류가 나므로 홈 탭 터치는 TouchableOpacity 사용 */
const homeScreenPressStyles = StyleSheet.create({
  nyanBtiHeaderBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  agentChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  challengeCta: {
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  /** 미등록 유저: 냥BTI 카드 위 프로필 등록 CTA */
  profileSetupCta: {
    borderRadius: 16,
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#5b21b6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  communityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  communityWriteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ede9fe',
  },
  communityWriteBtnText: { marginLeft: 6, fontSize: 13, fontWeight: '800', color: PRIMARY },
  communityTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#4c1d95',
    letterSpacing: -0.3,
  },
  communityEmpty: {
    paddingVertical: 22,
    textAlign: 'center',
    fontSize: 13,
    color: '#7c3aed',
    lineHeight: 18,
  },
  communityMoreBtn: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#ede9fe',
  },
  /** 에이전트 화면 방문 후 홈: 칩 대신 단일 CTA */
  agentChatCta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#CCABDB',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  agentChatCtaText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#3b0764',
  },
  homeAnniversaryCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ede9fe',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});

const HOME_COMMUNITY_MAX = 5;

type CommunityTab = 'hot' | 'latest' | 'mine';

const TAB_LABELS: Record<CommunityTab, string> = {
  hot: '베스트',
  latest: '최신글',
  mine: '내글',
};

/** 홈 → 커뮤니티 탭 동기화 (`community.tsx`와 동일 키) */
function communityParamForHomeTab(tab: CommunityTab): 'best' | 'latest' | 'mine' {
  if (tab === 'hot') return 'best';
  if (tab === 'latest') return 'latest';
  return 'mine';
}

function daysSinceTogether(createdAtIso: string): number {
  const start = new Date(createdAtIso);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.max(1, diffDays + 1);
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return '좋은 밤이에요';
  if (h < 11) return '좋은 아침이에요';
  if (h < 18) return '좋은 오후에요';
  return '좋은 저녁이에요';
}

function pickNickname(row: PostFeedRow): string {
  const p = row.profiles as { nickname?: string | null } | { nickname?: string | null }[] | null | undefined;
  if (p == null) return '냥집사';
  if (Array.isArray(p)) return p[0]?.nickname?.trim() || '냥집사';
  return p.nickname?.trim() || '냥집사';
}

/** API/캐시 이상 행으로 map 렌더가 깨지지 않게 */
function homeFeedRows(data: PostFeedRow[] | undefined): PostFeedRow[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.filter((row) => row != null && typeof row === 'object' && typeof row.id === 'string' && row.id.length > 0);
}

/** 홈 커뮤니티: 좌측 92px에 썸네일 또는 냥 아이콘 + No Image */
function HomeUnifiedPostCard({
  authorLabel,
  dateTimeLabel,
  channelLabel,
  body,
  likeCount,
  commentCount,
  thumb,
  onPress,
}: {
  authorLabel: string;
  /** 연월일시 (카테고리 칩 다음, 작은 글씨) */
  dateTimeLabel: string;
  channelLabel: string;
  body: string;
  likeCount: number;
  commentCount: number;
  thumb: string | null;
  onPress: () => void;
}) {
  const hasBanner = Boolean(thumb?.trim());
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[homePostCardStyles.press, homePostCardStyles.pressRow]}
    >
      {hasBanner && thumb ? (
        <Image source={{ uri: thumb }} style={homePostCardStyles.thumb} resizeMode="cover" />
      ) : (
        <View style={[homePostCardStyles.thumb, homePostCardStyles.thumbPlaceholder]}>
          <Image
            source={require('../../assets/images/community-no-image.png')}
            style={homePostCardStyles.thumbPlaceholderIcon}
            resizeMode="contain"
            accessibilityLabel="이미지 없음"
          />
          <Text style={homePostCardStyles.noImageLabel}>No Image</Text>
        </View>
      )}
      <View style={[homePostCardStyles.content, homePostCardStyles.contentFlex]}>
        <View style={homePostCardStyles.metaBlock}>
          <Text
            style={homePostCardStyles.author}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {authorLabel}
          </Text>
          {channelLabel.length > 0 || dateTimeLabel.length > 0 ? (
            <View style={homePostCardStyles.metaSecondRow}>
              {channelLabel.length > 0 ? (
                <View style={homePostCardStyles.chip}>
                  <Text style={homePostCardStyles.chipText}>{channelLabel}</Text>
                </View>
              ) : null}
              {dateTimeLabel.length > 0 ? (
                <Text style={homePostCardStyles.dateTimeInline} numberOfLines={1}>
                  {dateTimeLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text style={homePostCardStyles.title} numberOfLines={2}>
          {postPreviewTitle(body, 72)}
        </Text>
        <Text style={homePostCardStyles.meta}>
          좋아요 {likeCount} · 댓글 {commentCount}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [communityTab, setCommunityTab] = useState<CommunityTab>('hot');
  const [showHomeAgentChips, setShowHomeAgentChips] = useState(() => !getAgentScreenVisited());

  useFocusEffect(
    useCallback(() => {
      setShowHomeAgentChips(!getAgentScreenVisited());
      void queryClient.invalidateQueries({ queryKey: ['community-best-posts'] });
      void queryClient.invalidateQueries({ queryKey: ['home-posts-latest'] });
      void queryClient.invalidateQueries({ queryKey: ['home-posts-mine'] });
      void queryClient.invalidateQueries({ queryKey: ['active-challenge'] });
      void queryClient.invalidateQueries({ queryKey: ['open-challenges-with-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['anniversaries'] });
    }, [queryClient])
  );

  const { data: cat, isPending, isError, error, refetch } = useQuery({
    queryKey: ['home-cat'],
    queryFn: fetchLatestCat,
  });

  const bestQuery = useQuery({
    queryKey: ['community-best-posts', 'home'],
    queryFn: () => fetchBestPosts(10),
    staleTime: 60_000,
  });

  const latestQuery = useQuery({
    queryKey: ['home-posts-latest'],
    queryFn: () => fetchPostsPage({ pageParam: 0, channel: null, search: '' }),
    staleTime: 30_000,
  });

  const mineQuery = useQuery({
    queryKey: ['home-posts-mine'],
    queryFn: () => fetchMyPostsRecent(12),
    staleTime: 30_000,
  });

  const activeChallengeQuery = useQuery({
    queryKey: ['active-challenge'],
    queryFn: fetchActiveChallengeWithCount,
    staleTime: 60_000,
  });

  const anniversariesQuery = useQuery({
    queryKey: ['anniversaries', cat?.id ?? '__none__'],
    queryFn: () => fetchAnniversaries(cat!.id),
    enabled: Boolean(cat?.id),
    staleTime: 30_000,
  });

  const homeAnniversaryHighlight = useMemo(() => {
    if (!cat) return null;
    return pickSoonestAnniversaryHighlight(cat, anniversariesQuery.data ?? []);
  }, [cat, anniversariesQuery.data]);

  const bestRows = useMemo(() => homeFeedRows(bestQuery.data), [bestQuery.data]);
  const latestRows = useMemo(() => homeFeedRows(latestQuery.data), [latestQuery.data]);
  const mineRows = useMemo(() => homeFeedRows(mineQuery.data), [mineQuery.data]);

  const bestRowsHome = useMemo(() => bestRows.slice(0, HOME_COMMUNITY_MAX), [bestRows]);
  const latestRowsHome = useMemo(() => latestRows.slice(0, HOME_COMMUNITY_MAX), [latestRows]);
  const mineRowsHome = useMemo(() => mineRows.slice(0, HOME_COMMUNITY_MAX), [mineRows]);

  const openCommunityTab = useCallback(
    (tab: CommunityTab) => {
      router.push({ pathname: '/community', params: { tab: communityParamForHomeTab(tab) } });
    },
    [router]
  );

  const displayName = cat?.name?.trim() || '냥이';
  const displayNameShort = useMemo(() => truncateCatName(displayName), [displayName]);
  const particle = useMemo(() => waGwa(displayName), [displayName]);
  const togetherStartIso = useMemo(
    () => (cat ? (cat.adopted_at ?? cat.created_at ?? null) : null),
    [cat]
  );
  const days = useMemo(
    () => (togetherStartIso ? daysSinceTogether(togetherStartIso) : null),
    [togetherStartIso]
  );

  const archetype = useMemo(() => getNyanBtiArchetype(cat?.nyanBTI_type?.trim() ?? ''), [cat?.nyanBTI_type]);

  const homeCatPhotoUri = useMemo(() => {
    const rep = cat?.representative_photo_url?.trim();
    const av = cat?.avatar_url?.trim();
    return rep || av || null;
  }, [cat?.representative_photo_url, cat?.avatar_url]);

  const goAgentQuick = (index: 0 | 1 | 2) => {
    router.push({ pathname: '/agent', params: { quick: `q${index}` } });
  };

  const goAgentChat = useCallback(() => {
    router.push({ pathname: '/agent' });
  }, [router]);

  const goMyAnniversaryTab = useCallback(() => {
    router.push({ pathname: '/my', params: { tab: 'anniversary' } });
  }, [router]);

  const goHomeChallenge = useCallback(() => {
    const c = activeChallengeQuery.data?.challenge;
    if (c) router.push({ pathname: '/challenge', params: { id: c.id } });
  }, [activeChallengeQuery.data?.challenge, router]);

  const openPost = (id: string) => {
    router.push(`/post-detail/${id}`);
  };

  const openLegal = (url: string) => {
    void Linking.openURL(url);
  };

  const scrollBottomPadding = Math.max(insets.bottom, 16) + 28;

  const agentTimeCtx = getAgentTimeContext();

  return (
    <View
      className="flex-1 bg-violet-50"
      style={{ flex: 1, paddingTop: communityScreenPaddingTop(insets.top), backgroundColor: SCREEN_BG_VIOLET }}
    >
      <ScrollView
        className="flex-1"
        nestedScrollEnabled
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1, backgroundColor: SCREEN_BG_VIOLET }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: scrollBottomPadding,
          paddingHorizontal: 20,
          backgroundColor: SCREEN_BG_VIOLET,
        }}
      >
        {isPending && (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        )}

        {isError && (
          <View className="rounded-2xl bg-red-50 px-4 py-3">
            <Text className="text-sm text-red-700">{(error as Error).message}</Text>
            <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.75} className="mt-2">
              <Text className="text-sm font-semibold text-[#7F77DD]">다시 불러오기</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isPending && !isError && (
          <>
            <Text className="text-2xl font-bold leading-8 text-violet-950">
              {greetingByHour()}, 냥집사님
            </Text>
            {days != null ? (
              <Text className="mt-2 text-base leading-6 text-violet-700">
                <Text className="font-semibold text-violet-900">{displayNameShort}</Text>
                {particle} 함께한 지 <Text className="font-bold text-[#7F77DD]">{days}일째</Text>예요.
              </Text>
            ) : (
              <Text className="mt-2 text-base text-violet-700">
                프로필에 냥이를 등록하면 함께한 날짜를 보여 드려요.
              </Text>
            )}

            {!cat && (
              <TouchableOpacity
                onPress={() => router.push('/profile-setup')}
                activeOpacity={0.88}
                className="mt-6"
                style={homeScreenPressStyles.profileSetupCta}
                accessibilityRole="button"
                accessibilityLabel="냥이 프로필 등록하기"
              >
                <Text className="text-center text-base font-extrabold text-white">냥이 프로필 등록하기</Text>
                <Text className="mt-1.5 text-center text-sm font-medium leading-5 text-white/90">
                  사진·이름을 등록하고 앨범·기념일을 시작해요
                </Text>
              </TouchableOpacity>
            )}

            <View className="mt-6 rounded-2xl border border-violet-100 bg-white p-4">
              <View className="mb-3 flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 pr-2 text-sm font-semibold leading-5 text-violet-800">
                  우리 냥이의 냥BTI는요..
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/nyan-bti')}
                  activeOpacity={0.82}
                  style={homeScreenPressStyles.nyanBtiHeaderBtn}
                >
                  <Text className="text-xs font-semibold text-violet-800">냥BTI 다시측정</Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row items-stretch gap-4">
                {homeCatPhotoUri ? (
                  <Image
                    source={{ uri: homeCatPhotoUri }}
                    className="h-32 w-32 shrink-0 rounded-2xl border border-violet-100 bg-violet-50"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="h-32 w-32 shrink-0 rounded-2xl border border-violet-100 bg-violet-50" />
                )}
                <View className="min-w-0 flex-1 justify-center">
                  {archetype ? (
                    <>
                      <Text className="text-lg font-bold text-violet-950">{archetype.nickname}</Text>
                      <Text className="mt-1 text-sm leading-5 text-violet-700">{archetype.headline}</Text>
                      <Text className="mt-2 text-sm leading-5 text-violet-600">{archetype.subline}</Text>
                    </>
                  ) : (
                    <>
                      <Text className="text-base font-semibold text-violet-900">아직 측정 전이에요</Text>
                      <Text className="mt-2 text-sm leading-5 text-violet-600">
                        독립·애교, 활동·여유, 직설·은근, 민감·무심 네 가지 축으로 냥이 성향을 알아볼 수 있어요. 집사님과 냥이에게 맞는 타입을 찾아 보세요.
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            {cat ? (
              <View style={homeScreenPressStyles.homeAnniversaryCard}>
                {anniversariesQuery.isPending ? (
                  <View className="items-center py-1">
                    <ActivityIndicator size="small" color={PRIMARY} />
                  </View>
                ) : homeAnniversaryHighlight ? (
                  <Text className="text-center text-base leading-6 text-violet-900">
                    <Text className="font-bold text-violet-950">{homeAnniversaryHighlight.title}</Text>
                    {' '}
                    <Text className="font-extrabold" style={{ color: PRIMARY }}>
                      {homeAnniversaryHighlight.countdownLabel}
                    </Text>
                  </Text>
                ) : (
                  <View className="flex-row items-stretch">
                    <View className="min-w-0 flex-1" />
                    <View className="min-w-0 flex-[2] justify-center px-1">
                      <Text className="text-center text-sm font-semibold leading-5 text-violet-600">
                        아직 기념일을 등록하지 않았어요!
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1 items-end justify-center">
                      <TouchableOpacity
                        onPress={goMyAnniversaryTab}
                        hitSlop={8}
                        activeOpacity={0.75}
                        accessibilityRole="link"
                        accessibilityLabel="기념일 등록, 마이페이지 기념일 탭으로 이동"
                      >
                        <Text className="text-xs font-extrabold" style={{ color: PRIMARY }}>
                          기념일등록 {'>'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

            {activeChallengeQuery.isPending ? (
              <View className="mt-6 overflow-hidden rounded-3xl bg-[#7F77DD] shadow-md">
                <View className="items-center py-8 px-5">
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              </View>
            ) : activeChallengeQuery.data?.challenge ? (
              <View className="mt-6 overflow-hidden rounded-3xl bg-[#7F77DD] shadow-md">
                <Pressable
                  onPress={goHomeChallenge}
                  android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
                  className="p-5"
                >
                  <View className="flex-row items-stretch gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-lg font-bold text-white">
                        📸 {activeChallengeQuery.data.challenge.title}
                      </Text>
                      <Text className="mt-2 text-sm leading-5 text-white/90">
                        오늘의 챌린지에 참여해 보세요.
                      </Text>
                      <Text className="mt-1 text-sm font-semibold text-white/85">
                        참여 {activeChallengeQuery.data.participantCount}명
                      </Text>
                    </View>
                    <View className="shrink-0 items-end justify-center gap-2.5">
                      <View className="flex-row items-center gap-0.5">
                        <Text className="text-xs font-semibold text-white underline">챌린지 보러가기</Text>
                        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.95)" />
                      </View>
                      <View
                        style={homeScreenPressStyles.challengeCta}
                        className="items-center justify-center px-3 py-2.5"
                        pointerEvents="none"
                      >
                        <Text className="text-center text-xs font-bold text-violet-900">오늘 참여하기</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </View>
            ) : (
              <View className="mt-6 rounded-2xl border border-violet-100 bg-white px-4 py-5 shadow-sm">
                <Text className="text-center text-sm font-semibold text-violet-800">
                  진행 중인 챌린지가 없어요
                </Text>
                <Text className="mt-2 text-center text-xs leading-5 text-violet-500">
                  아직 열린 챌린지가 없거나, 시작·마감 기간에 맞는 데이터가 없을 때예요.
                </Text>
              </View>
            )}

            <View
              className="mt-6 overflow-hidden rounded-3xl border border-violet-100 p-5 shadow-sm"
              style={{ backgroundColor: '#f3f0ff' }}
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name="chatbubbles" size={24} color={PRIMARY} accessibilityLabel="에이전트" />
                <Text
                  className="min-w-0 flex-1 text-lg font-bold leading-6 text-violet-950"
                  numberOfLines={2}
                >
                  {showHomeAgentChips
                    ? formatAgentQuestion(agentTimeCtx, displayNameShort)
                    : `${displayNameShort}에 대해 얘기해봐요.`}
                </Text>
              </View>
              {showHomeAgentChips ? (
                <View className="mt-4 flex-row flex-wrap gap-2">
                  {agentTimeCtx.chips.map((chipLabel, idx) => (
                    <TouchableOpacity
                      key={`home-agent-chip-${agentTimeCtx.slot}-${idx}`}
                      onPress={() => goAgentQuick(idx as 0 | 1 | 2)}
                      activeOpacity={0.88}
                      style={homeScreenPressStyles.agentChip}
                    >
                      <Text className="text-center text-xs font-bold text-violet-900" numberOfLines={1}>
                        {chipLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TouchableOpacity
                  onPress={goAgentChat}
                  activeOpacity={0.9}
                  className="mt-4"
                  style={homeScreenPressStyles.agentChatCta}
                  accessibilityRole="button"
                  accessibilityLabel="냥에이전트와 대화"
                >
                  <Text style={homeScreenPressStyles.agentChatCtaText}>냥에이전트와 대화</Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="mt-6 rounded-2xl border border-violet-100 bg-white p-4">
              <View style={homeScreenPressStyles.communityHeaderRow}>
                <Text
                  style={[homeScreenPressStyles.communityTitle, { flex: 1, minWidth: 0, paddingRight: 8 }]}
                  numberOfLines={2}
                >
                  우리 함께 이야기해요.
                </Text>
                <TouchableOpacity
                  style={homeScreenPressStyles.communityWriteBtn}
                  activeOpacity={0.82}
                  onPress={() => router.push('/write')}
                  accessibilityLabel="커뮤니티 글쓰기"
                >
                  <Ionicons name="create-outline" size={18} color={PRIMARY} />
                  <Text style={homeScreenPressStyles.communityWriteBtnText}>글쓰기</Text>
                </TouchableOpacity>
              </View>
              <View style={communityChannelTabStyles.row}>
                {(Object.keys(TAB_LABELS) as CommunityTab[]).map((key) => {
                  const active = communityTab === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.82}
                      onPress={() => setCommunityTab(key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={communityChannelTabStyles.tab}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: active ? '800' : '600',
                          color: active ? PRIMARY : '#6d28d9',
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {TAB_LABELS[key]}
                      </Text>
                      <View
                        style={[
                          communityChannelTabStyles.indicator,
                          { backgroundColor: active ? PRIMARY : 'transparent' },
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className="mt-4 min-h-[120px]">
                {communityTab === 'hot' &&
                  (bestQuery.isPending ? (
                    <View className="items-center py-10">
                      <ActivityIndicator color={PRIMARY} />
                    </View>
                  ) : bestQuery.isError ? (
                    <Text className="px-1 text-sm text-red-600">{(bestQuery.error as Error).message}</Text>
                  ) : bestRows.length === 0 ? (
                    <Text style={homeScreenPressStyles.communityEmpty}>베스트 글로 올릴 글이 아직 없어요.</Text>
                  ) : (
                    <>
                      {bestRowsHome.map((row) => (
                        <HomeUnifiedPostCard
                          key={row.id}
                          authorLabel={truncateUserNickname(pickNickname(row))}
                          dateTimeLabel={formatHomePostDateTime(row.created_at)}
                          channelLabel={postChannelDisplayLabel(row.channel)}
                          body={typeof row.body === 'string' ? row.body : ''}
                          likeCount={Number(row.like_count ?? 0)}
                          commentCount={Number(row.comment_count ?? 0)}
                          thumb={postListingBannerUrl(row)}
                          onPress={() => openPost(row.id)}
                        />
                      ))}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openCommunityTab('hot')}
                        style={homeScreenPressStyles.communityMoreBtn}
                        accessibilityLabel="커뮤니티 베스트 더보기"
                      >
                        <Text className="text-sm font-bold" style={{ color: PRIMARY }}>
                          더보기
                        </Text>
                      </TouchableOpacity>
                    </>
                  ))}

                {communityTab === 'latest' &&
                  (latestQuery.isPending ? (
                    <View className="items-center py-10">
                      <ActivityIndicator color={PRIMARY} />
                    </View>
                  ) : latestQuery.isError ? (
                    <Text className="px-1 text-sm text-red-600">{(latestQuery.error as Error).message}</Text>
                  ) : latestRows.length === 0 ? (
                    <Text style={homeScreenPressStyles.communityEmpty}>아직 글이 없어요.</Text>
                  ) : (
                    <>
                      {latestRowsHome.map((row) => (
                        <HomeUnifiedPostCard
                          key={row.id}
                          authorLabel={truncateUserNickname(pickNickname(row))}
                          dateTimeLabel={formatHomePostDateTime(row.created_at)}
                          channelLabel={postChannelDisplayLabel(row.channel)}
                          body={typeof row.body === 'string' ? row.body : ''}
                          likeCount={Number(row.like_count ?? 0)}
                          commentCount={Number(row.comment_count ?? 0)}
                          thumb={postListingBannerUrl(row)}
                          onPress={() => openPost(row.id)}
                        />
                      ))}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openCommunityTab('latest')}
                        style={homeScreenPressStyles.communityMoreBtn}
                        accessibilityLabel="커뮤니티 최신글 더보기"
                      >
                        <Text className="text-sm font-bold" style={{ color: PRIMARY }}>
                          더보기
                        </Text>
                      </TouchableOpacity>
                    </>
                  ))}

                {communityTab === 'mine' &&
                  (mineQuery.isPending ? (
                    <View className="items-center py-10">
                      <ActivityIndicator color={PRIMARY} />
                    </View>
                  ) : mineQuery.isError ? (
                    <Text className="px-1 text-sm text-red-600">{(mineQuery.error as Error).message}</Text>
                  ) : mineRows.length === 0 ? (
                    <Text style={homeScreenPressStyles.communityEmpty}>내가 쓴 글이 없어요.</Text>
                  ) : (
                    <>
                      {mineRowsHome.map((row) => (
                        <HomeUnifiedPostCard
                          key={row.id}
                          authorLabel={truncateUserNickname(pickNickname(row))}
                          dateTimeLabel={formatHomePostDateTime(row.created_at)}
                          channelLabel={postChannelDisplayLabel(row.channel)}
                          body={typeof row.body === 'string' ? row.body : ''}
                          likeCount={Number(row.like_count ?? 0)}
                          commentCount={Number(row.comment_count ?? 0)}
                          thumb={postListingBannerUrl(row)}
                          onPress={() => openPost(row.id)}
                        />
                      ))}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openCommunityTab('mine')}
                        style={homeScreenPressStyles.communityMoreBtn}
                        accessibilityLabel="커뮤니티 내글 더보기"
                      >
                        <Text className="text-sm font-bold" style={{ color: PRIMARY }}>
                          더보기
                        </Text>
                      </TouchableOpacity>
                    </>
                  ))}
              </View>
            </View>

            <View className="mt-5 border-t border-violet-100 pt-4 pb-1">
              <Text className="text-center text-xs leading-5 text-violet-400">
                © 2026. 냥BTI All rights reserved.
              </Text>
              <View className="mt-1.5 flex-row flex-wrap items-center justify-center gap-x-2 gap-y-2">
                <TouchableOpacity onPress={() => openLegal(LEGAL_LINKS.privacy)} activeOpacity={0.75}>
                  <Text className="text-xs font-semibold text-violet-500 underline">개인정보처리방침</Text>
                </TouchableOpacity>
                <Text className="text-xs text-violet-300">|</Text>
                <TouchableOpacity onPress={() => openLegal(LEGAL_LINKS.terms)} activeOpacity={0.75}>
                  <Text className="text-xs font-semibold text-violet-500 underline">이용약관</Text>
                </TouchableOpacity>
                <Text className="text-xs text-violet-300">|</Text>
                <TouchableOpacity onPress={() => openLegal(LEGAL_LINKS.business)} activeOpacity={0.75}>
                  <Text className="text-xs font-semibold text-violet-500 underline">사업자정보확인</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <StatusBar style="dark" />
    </View>
  );
}
