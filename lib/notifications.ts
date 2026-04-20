import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7F77DD',
    });
  }
}

/**
 * Expo Push 토큰 발급 후 `profiles.push_token`에 저장.
 * 실기기 + 로그인 세션 필요. 웹/시뮬레이터는 조용히 스킵.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    if (__DEV__) {
      console.info('[push] 실기기가 아니면 푸시 토큰을 발급할 수 없어요.');
    }
    return null;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.id) {
    if (__DEV__) {
      console.info('[push] 로그인 후에 토큰을 등록할 수 있어요.');
    }
    return null;
  }
  const uid = userData.user.id;

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    if (__DEV__) {
      console.info('[push] 알림 권한이 없어 토큰을 저장하지 않았어요.');
    }
    return null;
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;

  let tokenData: Notifications.ExpoPushToken;
  try {
    tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
  } catch (e) {
    if (__DEV__) {
      console.warn('[push] 토큰 발급 실패', e);
    }
    return null;
  }

  const token = tokenData.data;
  if (!token) return null;

  const { error } = await supabase.from('profiles').upsert(
    { id: uid, push_token: token },
    { onConflict: 'id' }
  );

  if (error) {
    if (__DEV__) {
      console.warn('[push] profiles.push_token 저장 실패', error.message);
    }
    return null;
  }

  return token;
}

function readRoutePathFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  const rawPath = record.path ?? record.href ?? record.url ?? record.screen;
  if (typeof rawPath !== 'string') return null;

  const path = rawPath.trim();
  if (!path) return null;

  if (path.startsWith('/')) return path;
  return `/${path.replace(/^\/+/, '')}`;
}

/**
 * 알림 수신/클릭 리스너 등록.
 * - 수신: 디버그 로그
 * - 클릭: payload의 path/href/url/screen 값을 읽어 화면 이동
 */
export function attachNotificationListeners(onNavigate: (path: string) => void): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    if (__DEV__) {
      console.log('[push] foreground notification received', notification.request.content);
    }
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    const path = readRoutePathFromNotificationData(data);
    if (!path) {
      if (__DEV__) {
        console.log('[push] notification click without route data', data);
      }
      return;
    }
    onNavigate(path);
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
