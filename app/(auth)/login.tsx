import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();
import {
  SmartKeyboardScreen,
  useSmartKeyboardFieldFocus,
  useSmartKeyboardScrollExtraBottom,
} from '../../components/SmartKeyboardScreen';
import { applySessionFromAuthUrl, getEmailRedirectTo, getOAuthRedirectTo } from '../../lib/auth-url';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';
const KAKAO_YELLOW = '#FEE500';

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function LoginScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const paramEmail = useMemo(() => firstParam(params.email).trim(), [params.email]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busyLogin, setBusyLogin] = useState(false);
  const [busySignUp, setBusySignUp] = useState(false);
  const [busyKakao, setBusyKakao] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const setFocusedField = useSmartKeyboardFieldFocus();
  const scrollExtraBottom = useSmartKeyboardScrollExtraBottom();

  useEffect(() => {
    if (paramEmail) setEmail(paramEmail);
  }, [paramEmail]);

  useEffect(() => {
    if (__DEV__) {
      // Supabase → Authentication → URL Configuration → Redirect URLs에 추가
      console.log('[auth] Redirect URL (emailRedirectTo):', getEmailRedirectTo());
      console.log('[auth] OAuth redirectTo (Kakao 등):', getOAuthRedirectTo());
    }
  }, []);

  const onKakaoLogin = useCallback(async () => {
    const redirectTo = getOAuthRedirectTo();
    setBusyKakao(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          scopes: 'account_email',
          queryParams: {
            lang: 'ko',
          },
        },
      });

      if (error) {
        Alert.alert('카카오 로그인', error.message);
        return;
      }
      if (!data?.url) {
        Alert.alert('카카오 로그인', '인증 URL을 받지 못했어요. Supabase에 Kakao 프로바이더를 설정했는지 확인해 주세요.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success' || !result.url) {
        return;
      }

      const { ok, error: sessionErr } = await applySessionFromAuthUrl(supabase, result.url);
      if (!ok) {
        Alert.alert('카카오 로그인', sessionErr ?? '세션을 만들지 못했어요.');
        return;
      }

      router.replace('/');
    } catch (e) {
      Alert.alert('카카오 로그인', e instanceof Error ? e.message : '알 수 없는 오류예요.');
    } finally {
      setBusyKakao(false);
    }
  }, [router]);

  const onLogin = async () => {
    const e = email.trim();
    if (!e || !password) {
      Alert.alert('입력 확인', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setBusyLogin(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          Alert.alert(
            '이메일 미인증',
            '메일함의 인증 링크를 먼저 눌러 주세요. (Supabase Redirect URL도 확인)'
          );
          return;
        }
        Alert.alert('로그인 실패', error.message);
        return;
      }
      router.replace('/');
    } finally {
      setBusyLogin(false);
    }
  };

  const onSignUp = async () => {
    const e = email.trim();
    if (!e || !password) {
      Alert.alert('입력 확인', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('비밀번호', '비밀번호는 6자 이상으로 설정해 주세요.');
      return;
    }
    setBusySignUp(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
        },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already')) {
          Alert.alert('회원가입', '이미 가입된 이메일이에요. 로그인을 시도해 보세요.');
          return;
        }
        Alert.alert('회원가입 실패', error.message);
        return;
      }
      if (data.session) {
        router.replace('/');
        return;
      }

      const identities = data.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        Alert.alert(
          '안내',
          '이 이메일은 이미 등록된 상태일 수 있어요. 로그인을 시도하거나 비밀번호 재설정을 이용해 보세요.'
        );
      }

      router.replace({
        pathname: '/check-email',
        params: { email: e },
      });
    } finally {
      setBusySignUp(false);
    }
  };

  const busy = busyLogin || busySignUp || busyKakao;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 32,
        paddingBottom: Math.max(insets.bottom, 12) + 28 + scrollExtraBottom,
        paddingHorizontal: 24,
        justifyContent: 'flex-start',
      }}
    >
        <Text className="text-center text-3xl font-bold text-[#7F77DD]">냥 에이전트</Text>
        <Text className="mt-2 text-center text-base text-violet-900/60">이메일로 로그인하거나 가입해요</Text>

        <View className="mt-10 rounded-[28px] border-2 border-violet-100 bg-white p-6 shadow-sm">
          <Text className="text-sm font-semibold text-violet-900/70">이메일</Text>
          <TextInput
            ref={emailInputRef}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField(emailInputRef.current)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#a78bfa"
            className="mt-2 rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-3.5 text-base text-violet-950"
            returnKeyType="next"
          />

          <Text className="mt-5 text-sm font-semibold text-violet-900/70">비밀번호</Text>
          <TextInput
            ref={passwordInputRef}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField(passwordInputRef.current)}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#a78bfa"
            className="mt-2 rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-3.5 text-base text-violet-950"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          <TouchableOpacity
            onPress={onSignUp}
            disabled={busy}
            activeOpacity={0.85}
            className="mt-8 items-center rounded-2xl border-2 border-[#7F77DD] bg-violet-50 py-4 disabled:opacity-50"
          >
            {busySignUp ? (
              <ActivityIndicator color={PRIMARY} />
            ) : (
              <Text className="text-base font-bold text-[#7F77DD]">회원가입</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onKakaoLogin}
            disabled={busy}
            activeOpacity={0.88}
            style={{ backgroundColor: KAKAO_YELLOW }}
            className="mt-3 items-center rounded-2xl py-4 disabled:opacity-50"
            accessibilityRole="button"
            accessibilityLabel="카카오로 시작하기"
          >
            {busyKakao ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text className="text-base font-bold text-black">카카오로 시작하기</Text>
            )}
          </TouchableOpacity>

          <View className="mt-5 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-violet-200" />
            <Text className="text-xs font-semibold text-violet-400">또는</Text>
            <View className="h-px flex-1 bg-violet-200" />
          </View>

          <TouchableOpacity
            onPress={onLogin}
            disabled={busy}
            activeOpacity={0.9}
            style={{ backgroundColor: PRIMARY }}
            className="mt-5 items-center rounded-2xl py-4 disabled:opacity-50"
          >
            {busyLogin ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">로그인</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
  );
}

export default function LoginScreen() {
  return (
    <SmartKeyboardScreen className="flex-1 bg-violet-50">
      <LoginScreenInner />
    </SmartKeyboardScreen>
  );
}
