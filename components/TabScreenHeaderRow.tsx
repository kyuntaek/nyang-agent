import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { COMMUNITY_PRIMARY } from '../lib/community-tab-styles';

type TabScreenHeaderRowProps = {
  title: string;
  /** 제목 줄(행) 컨테이너 */
  containerStyle?: StyleProp<ViewStyle>;
  /** 우측 액션(에이전트 `대화기록삭제` 등) — 없으면 빈 영역으로 균형만 맞춤 */
  right?: ReactNode;
};

/** 커뮤니티·마이페이지·에이전트 공통: 좌 `< 홈`, 가운데 제목, 선택적 우측 */
export function TabScreenHeaderRow({ title, containerStyle, right }: TabScreenHeaderRowProps) {
  const router = useRouter();
  return (
    <View className="flex-row items-center" style={containerStyle}>
      <View className="min-w-0 flex-1 items-start justify-center">
        <TouchableOpacity
          onPress={() => router.push('/')}
          hitSlop={10}
          activeOpacity={0.75}
          accessibilityRole="link"
          accessibilityLabel="홈으로"
        >
          <Text className="text-base font-semibold" style={{ color: COMMUNITY_PRIMARY }}>
            {'< '}홈
          </Text>
        </TouchableOpacity>
      </View>
      <View className="min-w-0 flex-[2] items-center justify-center px-1">
        <Text className="text-xl font-bold text-violet-950" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View className="min-w-0 flex-1 items-end justify-center">{right ?? null}</View>
    </View>
  );
}
