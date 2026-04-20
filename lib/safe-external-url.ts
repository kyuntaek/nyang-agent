import { Alert, Linking } from 'react-native';

/** http(s)만 허용. 파싱 실패·비 http(s) 스킴은 null. */
export function trimValidHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** 브라우저/앱으로 열기. 잘못된 주소·open 실패 시 Alert만 띄우고 throw 하지 않음. */
export async function openExternalHttpUrlWithAlert(raw: string): Promise<void> {
  const href = trimValidHttpUrl(raw);
  if (href === null) {
    Alert.alert('링크', '열 수 있는 웹 주소 형식이 아니에요.');
    return;
  }
  try {
    await Linking.openURL(href);
  } catch {
    Alert.alert('링크를 열 수 없어요', '주소가 올바른지 확인하거나 잠시 후 다시 시도해 주세요.');
  }
}
