import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SCREEN_BG_VIOLET } from '../../lib/community-tab-styles';

const PRIMARY = '#7F77DD';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        /** 씬과 탭바 배경을 맞춰 콘텐츠·탭 사이 색 띠(마진처럼 보임) 제거 */
        sceneStyle: { flex: 1, backgroundColor: SCREEN_BG_VIOLET },
        tabBarStyle: {
          backgroundColor: SCREEN_BG_VIOLET,
          borderTopColor: '#e9e4f7',
          borderTopWidth: StyleSheet.hairlineWidth,
          marginTop: 0,
          marginBottom: 0,
          paddingTop: 0,
          height: Platform.OS === 'ios' ? 48 + insets.bottom : 56 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          elevation: 0,
          shadowOpacity: 0,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 0,
        },
        tabBarItemStyle: {
          marginTop: 0,
          marginBottom: 0,
          paddingTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: '에이전트',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: '커뮤니티',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: '마이',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
