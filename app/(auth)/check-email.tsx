import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function CheckEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => firstParam(params.email).trim(), [params.email]);
  const [resending, setResending] = useState(false);

  const goLogin = useCallback(() => {
    router.replace(email ? { pathname: '/login', params: { email } } : '/login');
  }, [router, email]);

  const resend = useCallback(async () => {
    if (!email) {
      Alert.alert('안내', '이메일 주소가 없어요. 회원가입 화면에서 다시 시도해 주세요.');
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) {
        Alert.alert('재전송 실패', error.message);
        return;
      }
      Alert.alert('보냄', '인증 메일을 다시 보냈어요. 잠시 후 받은편지함을 확인해 주세요.');
    } finally {
      setResending(false);
    }
  }, [email]);

  return (
    <ScrollView
      className="flex-1 bg-violet-50"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 32,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
    >
      <Text className="text-center text-2xl font-bold text-[#7F77DD]">이메일을 확인해 주세요</Text>
      {email ? (
        <Text className="mt-3 text-center text-base text-violet-900/80">
          다음 주소로 인증 메일을 보냈어요{'\n'}
          <Text className="font-semibold text-violet-950">{email}</Text>
        </Text>
      ) : (
        <Text className="mt-3 text-center text-base text-violet-900/70">
          가입한 이메일로 인증 메일이 발송됐어요.
        </Text>
      )}

      <Text className="mt-8 text-center text-sm leading-6 text-violet-800">
        메일이 도착하지 않는 경우 다시 보내기 선택전 스팸메일 확인바랍니다.
      </Text>

      <TouchableOpacity
        onPress={resend}
        disabled={resending || !email}
        activeOpacity={0.85}
        className="mt-8 items-center rounded-2xl border-2 border-[#7F77DD] bg-violet-50 py-4 disabled:opacity-40"
      >
        {resending ? (
          <ActivityIndicator color={PRIMARY} />
        ) : (
          <Text className="text-base font-bold text-[#7F77DD]">인증 메일 다시 보내기</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={goLogin}
        activeOpacity={0.9}
        style={{ backgroundColor: PRIMARY }}
        className="mt-3 items-center rounded-2xl py-4"
      >
        <Text className="text-base font-bold text-white">로그인 화면으로</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
