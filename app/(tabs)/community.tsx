import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  POST_CHANNELS,
  type CommunityPostSort,
  type PostChannelDb,
  type PostFeedRow,
  fetchPostsPage,
  getNextPostsPageParam,
  postListingBannerUrl,
} from '../../lib/community-queries';
import { TabScreenHeaderRow } from '../../components/TabScreenHeaderRow';
import { truncateUserNickname } from '../../lib/display-strings';
import { COMMUNITY_PRIMARY, communityChannelTabStyles, communityScreenPaddingTop } from '../../lib/community-tab-styles';

const PRIMARY = COMMUNITY_PRIMARY;
const SUMMARY_BG = '#f1f5f9';

/** 베스트·최신글·내글 제외, 채널(게시판)만 */
const COMMUNITY_FEED_TABS = POST_CHANNELS.filter(
  (c): c is (typeof POST_CHANNELS)[number] & { db: PostChannelDb } => c.db != null,
);
type CommunityFeedChannelKey = (typeof COMMUNITY_FEED_TABS)[number]['key'];

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

function channelLabel(db: PostChannelDb): string {
  const row = POST_CHANNELS.find((c) => c.db === db);
  return row?.label ?? db;
}

function pickNickname(row: PostFeedRow): string {
  const p = row.profiles as { nickname?: string | null } | { nickname?: string | null }[] | null | undefined;
  if (p == null) return '냥집사';
  if (Array.isArray(p)) return p[0]?.nickname?.trim() || '냥집사';
  return p.nickname?.trim() || '냥집사';
}

function pickCat(row: PostFeedRow): { breed: string | null; avatar_url: string | null } {
  const c = row.cats as
    | { breed?: string | null; avatar_url?: string | null; representative_photo_url?: string | null }
    | { breed?: string | null; avatar_url?: string | null; representative_photo_url?: string | null }[]
    | null
    | undefined;
  if (c == null) return { breed: null, avatar_url: null };
  if (Array.isArray(c)) {
    const x = c[0];
    const rep = x?.representative_photo_url?.trim();
    const av = x?.avatar_url?.trim();
    return { breed: x?.breed ?? null, avatar_url: rep || av || null };
  }
  const rep = c.representative_photo_url?.trim();
  const av = c.avatar_url?.trim();
  return { breed: c.breed ?? null, avatar_url: rep || av || null };
}

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

const COMMUNITY_SORT_CHIPS: { key: CommunityPostSort; label: string }[] = [
  { key: 'latest', label: '최신글순' },
  { key: 'comments', label: '댓글순' },
  { key: 'likes', label: '좋아요순' },
];

function CommunityListHeader({
  search,
  setSearch,
  searchInputRef,
  channelKey,
  setChannelKey,
  sortKey,
  setSortKey,
}: {
  search: string;
  setSearch: (s: string) => void;
  searchInputRef: RefObject<TextInput | null>;
  channelKey: CommunityFeedChannelKey;
  setChannelKey: (k: CommunityFeedChannelKey) => void;
  sortKey: CommunityPostSort;
  setSortKey: (s: CommunityPostSort) => void;
}) {
  return (
    <View className="pb-2">
      <TabScreenHeaderRow title="커뮤니티" />

      <TextInput
        ref={searchInputRef}
        value={search}
        onChangeText={setSearch}
        placeholder="집사 닉네임 · 냥 이름 · 본문 검색"
        placeholderTextColor="#a78bfa"
        className="mt-4 rounded-2xl border-2 border-violet-100 bg-white px-4 py-3 text-base text-violet-950"
        returnKeyType="search"
      />
      <Text className="mt-2 text-center text-xs leading-4 text-violet-500">
        본문·요약·집사 닉네임·냥 이름 중 하나라도 맞으면 표시돼요.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          marginTop: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#e9d5ff',
        }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'stretch', paddingRight: 12 }}
      >
        {COMMUNITY_FEED_TABS.map((c) => {
          const selected = c.key === channelKey;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setChannelKey(c.key)}
              activeOpacity={0.85}
              style={{ minWidth: 68, alignItems: 'center', paddingTop: 10, paddingBottom: 0 }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: selected ? '800' : '600',
                  color: selected ? PRIMARY : '#5b21b6',
                  textAlign: 'center',
                }}
                numberOfLines={1}
              >
                {c.label}
              </Text>
              <View
                style={[
                  communityChannelTabStyles.indicator,
                  { backgroundColor: selected ? PRIMARY : 'transparent' },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View className="mt-5 overflow-hidden rounded-2xl px-5 py-4" style={{ backgroundColor: PRIMARY }}>
        <View className="flex-row gap-2">
          {COMMUNITY_SORT_CHIPS.map((chip) => {
            const active = chip.key === sortKey;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setSortKey(chip.key)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="min-w-0 flex-1 rounded-xl px-1 py-2.5"
                style={{
                  backgroundColor: active ? '#ffffff' : 'transparent',
                  borderWidth: active ? 0 : 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                }}
              >
                <Text
                  className="text-center text-xs font-extrabold"
                  style={{ color: active ? PRIMARY : 'rgba(255,255,255,0.95)' }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function CommunityScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const searchInputRef = useRef<TextInput>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [channelKey, setChannelKey] = useState<CommunityFeedChannelKey>('daily');
  const [sortKey, setSortKey] = useState<CommunityPostSort>('latest');

  const validFeedKeys = useMemo(
    () => new Set<string>(COMMUNITY_FEED_TABS.map((c) => c.key)),
    [],
  );

  useEffect(() => {
    const t = firstParam(params.tab);
    if (!t) return;
    if (validFeedKeys.has(t)) {
      setChannelKey(t as CommunityFeedChannelKey);
      return;
    }
    if (t === 'best' || t === 'latest' || t === 'mine' || t === 'hot') {
      setChannelKey('daily');
    }
  }, [params.tab, validFeedKeys]);

  const channelDb = useMemo((): PostChannelDb | null => {
    return COMMUNITY_FEED_TABS.find((c) => c.key === channelKey)?.db ?? null;
  }, [channelKey]);

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['community-posts', channelKey, channelDb, debouncedSearch, sortKey],
    initialPageParam: 0,
    enabled: channelDb != null,
    queryFn: ({ pageParam }) =>
      fetchPostsPage({
        pageParam: pageParam as number,
        channel: channelDb,
        search: debouncedSearch,
        sort: sortKey,
      }),
    getNextPageParam: getNextPostsPageParam,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    }, [queryClient])
  );

  const flat = useMemo(
    () => infiniteQuery.data?.pages.flatMap((p) => p) ?? [],
    [infiniteQuery.data]
  );

  const renderItem = useCallback(
    ({ item }: { item: PostFeedRow }) => {
      const nick = truncateUserNickname(pickNickname(item));
      const { breed, avatar_url: avatar } = pickCat(item);
      const initial = nick.slice(0, 1) || '?';
      const bannerUrl = postListingBannerUrl(item);

      return (
        <TouchableOpacity
          onPress={() => router.push(`/post-detail/${item.id}`)}
          activeOpacity={0.95}
          className="mb-4 overflow-hidden rounded-2xl border border-violet-100 bg-white"
        >
        {bannerUrl ? (
          <Image source={{ uri: bannerUrl }} className="h-[140px] w-full bg-violet-100" resizeMode="cover" />
        ) : (
          <View className="h-[140px] w-full flex-col items-center justify-center gap-2 bg-violet-100 px-4">
            <Image
              source={require('../../assets/images/community-no-image.png')}
              className="h-[72px] w-[72px]"
              resizeMode="contain"
              accessibilityLabel="이미지 없음"
            />
            <Text className="text-sm font-semibold text-violet-500">No Image</Text>
          </View>
        )}
        <View className="p-4">
          <View className="flex-row items-center gap-3">
            {avatar ? (
              <Image source={{ uri: avatar }} className="h-11 w-11 rounded-full bg-violet-100" />
            ) : (
              <View className="h-11 w-11 items-center justify-center rounded-full bg-violet-200">
                <Text className="text-lg font-bold text-violet-800">{initial}</Text>
              </View>
            )}
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-violet-950" numberOfLines={1}>
                {nick}
              </Text>
              <View className="mt-1 flex-row flex-wrap gap-1">
                <View className="rounded-md bg-violet-100 px-2 py-0.5">
                  <Text className="text-xs font-semibold text-violet-700">{channelLabel(item.channel)}</Text>
                </View>
                {breed ? (
                  <View className="rounded-md border border-violet-200 bg-white px-2 py-0.5">
                    <Text className="text-xs font-semibold text-violet-800" numberOfLines={1}>
                      {breed}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <Text className="mt-3 text-base leading-6 text-violet-900" numberOfLines={2} ellipsizeMode="tail">
            {item.body}
          </Text>

          {item.agent_summary ? (
            <View className="mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: SUMMARY_BG }}>
              <Text className="text-xs font-semibold text-slate-500">에이전트 요약</Text>
              <Text className="mt-1 text-sm leading-5 text-slate-700" numberOfLines={3}>
                {item.agent_summary}
              </Text>
            </View>
          ) : null}

          <View className="mt-3 flex-row items-center gap-4">
            <View className="flex-row items-center gap-1">
              <Ionicons name="heart-outline" size={18} color="#7c3aed" />
              <Text className="text-sm font-semibold text-violet-800">{item.like_count}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons name="chatbubble-outline" size={17} color="#7c3aed" />
              <Text className="text-sm font-semibold text-violet-800">{item.comment_count}</Text>
            </View>
          </View>
        </View>
        </TouchableOpacity>
      );
    },
    [router]
  );

  const listEmpty = useMemo(() => {
    if (infiniteQuery.isPending) {
      return (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      );
    }
    if (infiniteQuery.isError) {
      return (
        <View className="rounded-2xl bg-red-50 px-4 py-4">
          <Text className="text-sm text-red-700">{(infiniteQuery.error as Error).message}</Text>
        </View>
      );
    }
    return (
      <View className="items-center py-12">
        <Text className="text-center text-base text-violet-600">첫 글을 작성해 보세요</Text>
      </View>
    );
  }, [infiniteQuery.isPending, infiniteQuery.isError, infiniteQuery.error]);

  const header = (
    <CommunityListHeader
      search={search}
      setSearch={setSearch}
      searchInputRef={searchInputRef}
      channelKey={channelKey}
      setChannelKey={setChannelKey}
      sortKey={sortKey}
      setSortKey={setSortKey}
    />
  );

  return (
    <View className="flex-1 bg-violet-50" style={{ paddingTop: communityScreenPaddingTop(insets.top) }}>
      <FlatList
        data={flat}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={flat.length === 0 ? listEmpty : null}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 72,
        }}
        refreshControl={
          <RefreshControl
            refreshing={infiniteQuery.isRefetching && !infiniteQuery.isFetchingNextPage}
            onRefresh={() => {
              void infiniteQuery.refetch();
            }}
          />
        }
        onEndReached={() => {
          if (infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) void infiniteQuery.fetchNextPage();
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          infiniteQuery.isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        onPress={() => {
          const ch = channelDb ?? 'daily';
          router.push({ pathname: '/write', params: { channel: ch } });
        }}
        accessibilityLabel="글쓰기"
        activeOpacity={0.88}
        style={{
          position: 'absolute',
          right: 20,
          bottom: Math.max(insets.bottom, 12) + 56,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: PRIMARY,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 4,
        }}
      >
        <Text className="text-3xl font-light text-white">+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CommunityScreen() {
  return <CommunityScreenInner />;
}
