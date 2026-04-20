import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';
import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { SplashScreen, Stack, usePathname, useRouter, useRootNavigationState } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applySessionFromAuthUrl, looksLikeAuthCallback } from '../lib/auth-url';
import { registerForPushNotifications } from '../lib/notifications';
import { supabase } from '../lib/supabase';

function RootNavigation() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const handledAuthUrl = useRef<string | null>(null);
  /** session이 여러 번 바뀌어도 hideAsync는 1회만 (두 번째부터 네이티브 오류) */
  const splashHiddenRef = useRef(false);

  useEffect(() => {
    const handleAuthUrl = async (url: string | null) => {
      if (!url || !looksLikeAuthCallback(url)) return;
      if (handledAuthUrl.current === url) return;
      const { ok } = await applySessionFromAuthUrl(supabase, url);
      if (ok) {
        handledAuthUrl.current = url;
        router.replace('/');
      }
    };

    void Linking.getInitialURL().then(handleAuthUrl);
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) setSession(s ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    void registerForPushNotifications();
  }, [session?.user?.id]);

  useEffect(() => {
    if (session === undefined || splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {
      /* Expo Go / 웹 등에서 스플래시 미등록 시 무시 */
    });
  }, [session]);

  useEffect(() => {
    if (session === undefined || !navigationState?.key) return;

    const onLogin = pathname === '/login';
    const onCheckEmail = pathname.startsWith('/check-email');
    const onAuthCallback = pathname.startsWith('/auth/callback');
    const onNyanBti = pathname.startsWith('/nyan-bti');
    const loggedIn = Boolean(session);

    if (!loggedIn && !onLogin && !onAuthCallback && !onCheckEmail && !onNyanBti) {
      router.replace('/login');
    } else if (loggedIn && onLogin) {
      router.replace('/');
    } else if (loggedIn && onAuthCallback) {
      router.replace('/');
    } else if (loggedIn && onCheckEmail) {
      router.replace('/');
    }
  }, [session, pathname, navigationState?.key, router]);

  return (
    <View style={styles.flex}>
      <Stack screenOptions={{ headerShown: false }} />
      {session === undefined && (
        <View style={[StyleSheet.absoluteFillObject, styles.loading]}>
          <ActivityIndicator size="large" color="#7F77DD" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
  },
});

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigation />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
