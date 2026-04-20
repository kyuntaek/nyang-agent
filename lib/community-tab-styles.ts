import { StyleSheet } from 'react-native';

/** 홈 커뮤니티 카드 · 커뮤니티 탭 공통 — 채널/서브탭 가로 균등 + 하단 활성 라인 */
export const COMMUNITY_PRIMARY = '#7F77DD';

/** NativeWind `bg-violet-50` — 탭바·씬·스크롤 배경 통일로 하단 ‘빈 줄’ 제거 */
export const SCREEN_BG_VIOLET = '#f5f3ff';

export const communityChannelTabStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e9d5ff',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 0,
  },
  indicator: {
    height: 3,
    alignSelf: 'stretch',
    marginTop: 10,
    borderRadius: 2,
  },
});

/** 커뮤니티 탭 화면과 동일하게 상단 안전영역 + 8 */
export function communityScreenPaddingTop(insetsTop: number): number {
  return insetsTop + 8;
}
