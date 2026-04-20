import { ActivityIndicator, Text, View } from 'react-native';

/** Supabase 인증 후 `emailRedirectTo`로 열리는 화면. 세션 적용은 `app/_layout.tsx`의 Linking 처리가 담당합니다. */
export default function AuthCallbackScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-violet-50 px-6">
      <ActivityIndicator size="large" color="#7F77DD" />
      <Text className="mt-4 text-center text-base text-violet-900/70">인증 확인 중…</Text>
    </View>
  );
}
