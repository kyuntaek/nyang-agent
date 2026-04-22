import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';
import type { Session, User } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { SplashScreen, Stack, usePathname, useRouter, useRootNavigationState } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applySessionFromAuthUrl, looksLikeAuthCallback } from '../lib/auth-url';
import {
  attachNotificationListeners,
  getInitialNotificationPath,
  registerForPushNotifications,
} from '../lib/notifications';
import { fetchMobileAppSettings } from '../lib/app-settings';
import { supabase } from '../lib/supabase';

const ACTIVITY_SYNC_INTERVAL_MS = 10 * 60 * 1000;

function RootNavigation() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const handledAuthUrl = useRef<string | null>(null);
  /** session이 여러 번 바뀌어도 hideAsync는 1회만 (두 번째부터 네이티브 오류) */
  const splashHiddenRef = useRef(false);
  const lastActivitySyncAtRef = useRef(0);
  const pendingNotificationPathRef = useRef<string | null>(null);
  const initialNotificationHandledRef = useRef(false);
  const appSettingsQuery = useQuery({
    queryKey: ['mobile-app-settings'],
    queryFn: fetchMobileAppSettings,
    staleTime: 5 * 60 * 1000,
  });
  const isMaintenanceMode = appSettingsQuery.data?.maintenanceMode ?? false;
  const appName = appSettingsQuery.data?.appName?.trim() || '냥이 에이전트';

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void queryClient.invalidateQueries({ queryKey: ['mobile-app-settings'] });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  const navigateFromNotification = (path: string) => {
    if (!navigationState?.key || session === undefined) {
      pendingNotificationPathRef.current = path;
      return;
    }
    router.push(path as never);
  };

  const syncProfileActivity = async (force = false, userFromSession?: User | null) => {
    const now = Date.now();
    if (!force && now - lastActivitySyncAtRef.current < ACTIVITY_SYNC_INTERVAL_MS) {
      return;
    }

    const user =
      userFromSession ??
      (
        await supabase.auth.getUser()
      ).data.user;

    if (!user?.id) return;

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          last_activity_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      if (__DEV__) {
        console.warn('[profiles activity sync]', error.message);
      }
      return;
    }

    lastActivitySyncAtRef.current = now;
  };

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
      if (s?.user?.id) {
        void syncProfileActivity(true, s.user);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    void syncProfileActivity(true);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    void syncProfileActivity();
  }, [pathname, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    void registerForPushNotifications();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const detach = attachNotificationListeners((path) => {
      navigateFromNotification(path);
    });
    return detach;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || initialNotificationHandledRef.current) return;
    initialNotificationHandledRef.current = true;
    void getInitialNotificationPath().then((path) => {
      if (!path) return;
      if (__DEV__) {
        console.log('[push] initial notification navigate to', path);
      }
      navigateFromNotification(path);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!navigationState?.key || session === undefined) return;
    const pendingPath = pendingNotificationPathRef.current;
    if (!pendingPath) return;
    pendingNotificationPathRef.current = null;
    router.push(pendingPath as never);
  }, [navigationState?.key, router, session]);

  useEffect(() => {
    if (session === undefined || splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => {
      /* Expo Go / 웹 등에서 스플래시 미등록 시 무시 */
    });
  }, [session]);

  if (isMaintenanceMode) {
    return (
      <View style={[styles.flex, styles.loading]}>
        <View style={styles.maintenanceCard}>
          <Text style={styles.maintenanceTitle}>점검 중</Text>
          <Text style={styles.maintenanceBody}>
            {appName} 서비스 점검 중입니다.{'\n'}잠시 후 다시 이용해 주세요.
          </Text>
          <TouchableOpacity
            onPress={() => void queryClient.invalidateQueries({ queryKey: ['mobile-app-settings'] })}
            activeOpacity={0.85}
            style={styles.maintenanceButton}
          >
            <Text style={styles.maintenanceButtonText}>새로고침</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  useEffect(() => {
    if (session === undefined || !navigationState?.key) return;
    if (pendingNotificationPathRef.current) return;

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
  maintenanceCard: {
    width: '86%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#e9e4f7',
  },
  maintenanceTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4c1d95',
    textAlign: 'center',
  },
  maintenanceBody: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 24,
    color: '#6d28d9',
    textAlign: 'center',
  },
  maintenanceButton: {
    marginTop: 16,
    alignSelf: 'center',
    backgroundColor: '#7F77DD',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  maintenanceButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
