import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMyChallengeParticipations, type MyChallengeParticipation } from '../../lib/challenge-queries';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

function isChallengeEnded(endIso: string): boolean {
  return new Date(endIso).getTime() < Date.now();
}

export default function MyChallengesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const listQuery = useQuery({
    queryKey: ['my-challenge-participations-page'],
    queryFn: async () => {
      const { data: u, error: ue } = await supabase.auth.getUser();
      if (ue || !u.user?.id) return [];
      return fetchMyChallengeParticipations(u.user.id);
    },
    staleTime: 60_000,
  });

  const renderItem = ({ item }: { item: MyChallengeParticipation }) => {
    const ended = isChallengeEnded(item.endDate);
    return (
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/challenge', params: { id: item.challengeId } })}
        activeOpacity={0.88}
        className="mb-3 flex-row items-center gap-3 overflow-hidden rounded-2xl border border-violet-100 bg-white p-3"
      >
        <Image
          source={{ uri: item.photoUrl }}
          className="h-20 w-20 rounded-xl bg-violet-100"
          resizeMode="cover"
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-base font-bold text-violet-950" numberOfLines={2}>
              {item.title}
            </Text>
            {ended ? (
              <View className="rounded-full bg-violet-100 px-2 py-0.5">
                <Text className="text-[11px] font-bold text-violet-600">종료</Text>
              </View>
            ) : (
              <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                <Text className="text-[11px] font-bold text-emerald-700">진행</Text>
              </View>
            )}
          </View>
          <Text className="mt-1 text-xs text-violet-500">
            참여 {new Date(item.participatedAt).toLocaleString('ko-KR', { dateStyle: 'medium' })}
          </Text>
          <Text className="mt-0.5 text-[11px] text-violet-400">
            {new Date(item.startDate).toLocaleDateString('ko-KR')} —{' '}
            {new Date(item.endDate).toLocaleDateString('ko-KR')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#c4b5fd" />
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-violet-50" style={{ paddingTop: insets.top }}>
      <View className="relative flex-row items-center justify-center border-b border-violet-100 bg-violet-50 px-4 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          activeOpacity={0.75}
          className="absolute left-4 top-0 z-10 flex-row items-center gap-0.5 py-3"
        >
          <Ionicons name="chevron-back" size={24} color={PRIMARY} />
          <Text className="text-base font-semibold" style={{ color: PRIMARY }}>
            뒤로
          </Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-violet-950">나의 챌린지</Text>
      </View>

      <Text className="px-4 pb-2 pt-3 text-sm text-violet-600">
        내가 참여한 챌린지를 모아 보여요. 여러 기간의 챌린지에 도전한 기록이 쌓입니다.
      </Text>

      {listQuery.isPending ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : listQuery.isError ? (
        <View className="mx-4 mt-4 rounded-2xl bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{(listQuery.error as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={listQuery.data ?? []}
          keyExtractor={(it) => it.entryId}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 16,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-center text-base text-violet-600">참여한 챌린지가 없어요.</Text>
              <Text className="mt-2 text-center text-sm text-violet-400">
                커뮤니티에서 진행 중인 챌린지에 참여해 보세요.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
