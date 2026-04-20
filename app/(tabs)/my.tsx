import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AlbumTab from '../../components/my/AlbumTab';
import { AnniversaryTab } from '../../components/my/AnniversaryTab';
import { fetchLatestCat } from '../../lib/fetch-latest-cat';
import { getNyanBtiArchetype, type NyanBtiArchetype } from '../../lib/nyan-bti-archetypes';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

type MyTab = 'profile' | 'album' | 'anniversary';

const TABS: { id: MyTab; label: string }[] = [
  { id: 'profile', label: '프로필' },
  { id: 'album', label: '앨범' },
  { id: 'anniversary', label: '기념일' },
];

function daysSinceTogether(startIso: string): number {
  const start = new Date(startIso);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.max(1, diffDays + 1);
}

/** 냥BTI 코드 4글자 — 우측 박스 표시용 */
function BtiCodeBoxes({
  archetype,
  rawCode,
}: {
  archetype: NyanBtiArchetype | null;
  rawCode: string;
}) {
  const chars = useMemo(() => {
    if (archetype) return Array.from(archetype.code);
    const t = rawCode.trim();
    if (Array.from(t).length === 4) return Array.from(t);
    return null;
  }, [archetype, rawCode]);

  const cells = chars ?? ['—', '—', '—', '—'];
  const filled = chars != null;

  return (
    <View className="flex-row items-center gap-1.5">
      {cells.map((ch, i) => (
        <View
          key={i}
          className="h-12 w-9 items-center justify-center rounded-lg border-2 border-violet-200 bg-violet-50/90"
        >
          <Text
            className={`text-[15px] font-extrabold ${filled ? 'text-violet-950' : 'text-violet-300'}`}
            numberOfLines={1}
          >
            {ch}
          </Text>
        </View>
      ))}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  tabRow: {
    marginTop: 16,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: 'rgba(237, 233, 254, 0.85)',
    padding: 4,
  },
  tabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 10,
  },
  tabPressableActive: {
    backgroundColor: '#fff',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6d5fa8',
  },
  tabLabelActive: {
    color: PRIMARY,
  },
});

export default function MyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<MyTab>('profile');

  const { data: cat, isPending, isError, error, refetch } = useQuery({
    queryKey: ['home-cat'],
    queryFn: fetchLatestCat,
  });

  const displayName = cat?.name?.trim() || '냥이';
  const togetherStartIso = useMemo(
    () => (cat ? (cat.adopted_at ?? cat.created_at ?? null) : null),
    [cat]
  );
  const days = useMemo(
    () => (togetherStartIso ? daysSinceTogether(togetherStartIso) : null),
    [togetherStartIso]
  );

  const btiCode = cat?.nyanBTI_type?.trim() ?? '';
  const archetype = useMemo(() => getNyanBtiArchetype(btiCode), [btiCode]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const noCatBlock = (
    <View className="mt-8 rounded-2xl border border-violet-100 bg-white px-5 py-6">
      <Text className="text-center text-base text-violet-700">
        냥이 프로필을 먼저 등록하면 앨범·기념일을 쓸 수 있어요.
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/profile-setup')}
        activeOpacity={0.9}
        style={{ backgroundColor: PRIMARY }}
        className="mt-4 items-center rounded-2xl py-3"
      >
        <Text className="font-bold text-white">프로필 등록하기</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-violet-50">
      <View style={{ paddingTop: insets.top + 12 }} className="px-5">
        <Text className="text-xl font-bold text-violet-950">마이페이지</Text>

        {!isPending && !isError && (
          <View style={tabStyles.tabRow}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  activeOpacity={0.85}
                  style={[tabStyles.tabPressable, active && tabStyles.tabPressableActive]}
                >
                  <Text style={[tabStyles.tabLabel, active && tabStyles.tabLabelActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {tab === 'album' || tab === 'anniversary' ? (
        <View className="flex-1 px-5 pt-4">
          {isPending && (
            <View className="flex-1 items-center justify-center py-16">
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
          {!isPending && !isError && !cat && noCatBlock}
          {!isPending && !isError && cat && tab === 'album' && (
            <AlbumTab catId={cat.id} catName={displayName} />
          )}
          {!isPending && !isError && cat && tab === 'anniversary' && <AnniversaryTab cat={cat} />}
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {isPending && (
            <View className="mt-10 items-center py-8">
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          )}

          {isError && (
            <View className="mt-6 rounded-2xl bg-red-50 px-4 py-3">
              <Text className="text-sm text-red-700">{(error as Error).message}</Text>
              <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.75} className="mt-2">
                <Text className="text-sm font-semibold text-[#7F77DD]">다시 불러오기</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isPending && !isError && (
            <>
              <View className="mt-2 flex-row items-center gap-4">
                <View className="h-20 w-20 overflow-hidden rounded-full border-2 border-violet-200 bg-violet-100">
                  {cat?.representative_photo_url || cat?.avatar_url ? (
                    <Image
                      source={{ uri: (cat.representative_photo_url || cat.avatar_url) as string }}
                      className="h-full w-full"
                    />
                  ) : (
                    <View className="h-full w-full items-center justify-center">
                      <Text className="text-4xl">🐱</Text>
                    </View>
                  )}
                </View>
                <View className="min-w-0 flex-1 justify-center">
                  <Text className="text-2xl font-bold text-violet-950">{displayName}</Text>
                  {togetherStartIso && days != null ? (
                    <Text className="mt-2 text-sm leading-5 text-violet-700">
                      함께한 지 <Text className="font-bold text-[#7F77DD]">{days}일째</Text>
                    </Text>
                  ) : (
                    <Text className="mt-2 text-sm leading-5 text-violet-500">
                      프로필을 등록하면 함께한 날을 볼 수 있어요.
                    </Text>
                  )}
                </View>
              </View>

              <View className="mt-8 rounded-[24px] border-2 border-violet-100 bg-white p-5 shadow-sm">
                <Text className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                  냥BTI 결과
                </Text>
                <View className="mt-3 min-h-[72px] flex-row items-center gap-3">
                  <View className="min-w-0 flex-1 justify-center">
                    {archetype ? (
                      <View className="flex-row items-center gap-3">
                        <Text className="text-4xl">{archetype.emoji}</Text>
                        <View className="min-w-0 flex-1">
                          <Text className="text-lg font-bold text-violet-950">{archetype.nickname}</Text>
                          <Text className="mt-1 text-sm text-violet-600">{archetype.headline}</Text>
                        </View>
                      </View>
                    ) : (
                      <Text className="text-base text-violet-600">아직 테스트를 하지 않았어요.</Text>
                    )}
                  </View>
                  <BtiCodeBoxes archetype={archetype} rawCode={btiCode} />
                </View>
              </View>

              <View className="mt-8 overflow-hidden rounded-2xl border border-violet-100 bg-white">
                <TouchableOpacity
                  onPress={() => router.push('/profile-setup')}
                  activeOpacity={0.85}
                  className="border-b border-violet-100 px-5 py-4"
                >
                  <Text className="text-base font-semibold text-violet-950">냥이 프로필 수정</Text>
                  <Text className="mt-1 text-sm text-violet-500">이름, 생일, 입양일 등</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/nyan-bti')}
                  activeOpacity={0.85}
                  className="border-b border-violet-100 px-5 py-4"
                >
                  <Text className="text-base font-semibold text-violet-950">냥BTI 다시 하기</Text>
                  <Text className="mt-1 text-sm text-violet-500">성향 테스트</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/my-challenges')}
                  activeOpacity={0.85}
                  className="border-b border-violet-100 px-5 py-4"
                >
                  <Text className="text-base font-semibold text-violet-950">나의 챌린지 보기</Text>
                  <Text className="mt-1 text-sm text-violet-500">
                    참여했던 챌린지를 모아서 확인해요.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => void onLogout()} activeOpacity={0.85} className="px-5 py-4">
                  <Text className="text-base font-semibold text-red-600">로그아웃</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}
      <StatusBar style="dark" />
    </View>
  );
}
