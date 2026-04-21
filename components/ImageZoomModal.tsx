import { Ionicons } from '@expo/vector-icons';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ListRenderItem,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Zoom, createZoomListComponent } from 'react-native-reanimated-zoom';

const ZoomFlatList = createZoomListComponent(FlatList);

/** `images`와 동일한 길이로 넘기면, 현재 페이지에 맞는 메타가 표시됩니다. */
export type ImageZoomSlideMeta = {
  caption?: string | null;
  /** 한 줄 상단 문구. `challengeTwoRow`가 있으면 무시 */
  heroLine?: string | null;
  /** 챌린지: 1열 냥BTI 칩+냥이명, 2열 하트+집사 */
  challengeTwoRow?: {
    btiChipLabel: string;
    catName: string;
    ownerNickname: string;
  } | null;
  authorNickname?: string | null;
  catName?: string | null;
  nyanBtiChip?: string | null;
};

const SPEECH_BUBBLE_BG = 'rgba(247, 244, 255, 0.82)';

export type ImageZoomModalProps = {
  visible: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  /** 챌린지 등: 슬라이드별 상단/하단 메타 (스와이프 시 같이 바뀜) */
  slidesMeta?: ImageZoomSlideMeta[];
  /** 상단 바 오른쪽 (앨범 홈 대표·삭제 등) */
  headerAccessory?: ReactNode;
  /** 가로 스와이프로 보이는 인덱스가 바뀔 때 */
  onIndexChange?: (index: number) => void;
  /** 전체 화면 덮는 오버레이 (삭제 중 로딩 등) */
  overlay?: ReactNode;
};

function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(i, len - 1));
}

/**
 * 풀스크린 이미지 뷰어: 검정 배경, react-native-reanimated-zoom 핀치 줌,
 * 여러 장이면 가로 스와이프(ZoomFlatList).
 */
export function ImageZoomModal({
  visible,
  onClose,
  images,
  initialIndex = 0,
  slidesMeta,
  headerAccessory,
  onIndexChange,
  overlay,
}: ImageZoomModalProps) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);
  const [listMount, setListMount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const urls = useMemo(
    () => images.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean),
    [images]
  );
  const count = urls.length;
  const safeInitial = clampIndex(initialIndex, count);
  const metaLen = slidesMeta?.length ?? 0;
  const hasSlidesMeta = metaLen > 0;
  const metaRow =
    slidesMeta && hasSlidesMeta && count > 0
      ? slidesMeta[clampIndex(activeIndex, Math.min(count, metaLen))]
      : undefined;

  useLayoutEffect(() => {
    if (visible && count > 0) {
      setListMount((k) => k + 1);
      setActiveIndex(safeInitial);
    }
  }, [visible, count, safeInitial]);

  useEffect(() => {
    if (!visible || count === 0 || safeInitial <= 0) return;
    const t = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: safeInitial, animated: false });
      } catch {
        /* scrollToIndex can throw if list not ready */
      }
    });
    return () => cancelAnimationFrame(t);
  }, [visible, count, safeInitial, listMount]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: winW,
      offset: winW * index,
      index,
    }),
    [winW]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (count <= 0) return;
      const x = e.nativeEvent.contentOffset.x;
      const idx = clampIndex(Math.round(x / winW), count);
      setActiveIndex(idx);
      onIndexChange?.(idx);
    },
    [onIndexChange, count, winW]
  );

  const renderItem: ListRenderItem<string> = useCallback(
    ({ item }) => {
      if (Platform.OS === 'web') {
        return (
          <View style={{ width: winW, height: winH, backgroundColor: '#000' }}>
            <Image source={{ uri: item }} style={styles.pageImage} resizeMode="contain" />
          </View>
        );
      }
      return (
        <View style={{ width: winW, height: winH, backgroundColor: '#000' }}>
          <Zoom style={styles.zoomBox} maximumZoomScale={8}>
            <Image source={{ uri: item }} style={styles.pageImage} resizeMode="contain" />
          </Zoom>
        </View>
      );
    },
    [winW, winH]
  );

  if (!visible || count === 0) return null;

  const author = typeof metaRow?.authorNickname === 'string' ? metaRow.authorNickname.trim() : '';
  const cat = typeof metaRow?.catName === 'string' ? metaRow.catName.trim() : '';
  const bti = typeof metaRow?.nyanBtiChip === 'string' ? metaRow.nyanBtiChip.trim() : '';
  const cap = typeof metaRow?.caption === 'string' ? metaRow.caption.trim() : '';
  const heroLine = typeof metaRow?.heroLine === 'string' ? metaRow.heroLine.trim() : '';
  const ch2 = metaRow?.challengeTwoRow ?? null;
  const showChallengeTwoRow =
    hasSlidesMeta &&
    ch2 != null &&
    (ch2.btiChipLabel.trim().length > 0 ||
      ch2.catName.trim().length > 0 ||
      ch2.ownerNickname.trim().length > 0);
  const showHeroLine = hasSlidesMeta && !showChallengeTwoRow && heroLine.length > 0;
  const showLegacyMeta =
    hasSlidesMeta &&
    !showChallengeTwoRow &&
    !showHeroLine &&
    (author.length > 0 || cat.length > 0 || bti.length > 0);

  const bubbleW = winW * 0.8;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.rootInner, { paddingBottom: insets.bottom }]}>
          <ZoomFlatList
            key={listMount}
            ref={listRef}
            data={urls}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialScrollIndex={safeInitial}
            getItemLayout={getItemLayout}
            initialNumToRender={Math.min(count, Math.max(3, safeInitial + 2))}
            windowSize={5}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${index}-${item.slice(0, 64)}`}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                try {
                  listRef.current?.scrollToIndex({ index, animated: false });
                } catch {
                  /* ignore */
                }
              });
            }}
            style={styles.list}
          />

          <View
            style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}
            pointerEvents="box-none"
          >
            {headerAccessory ? (
              <View style={[styles.accessoryWrap, styles.topBarLeft]} pointerEvents="box-none">
                {headerAccessory}
              </View>
            ) : null}
            <View style={styles.topBarSpacer} />
            <TouchableOpacity
              onPress={onClose}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              style={styles.closeHit}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
          </View>

          {showChallengeTwoRow && ch2 ? (
            <View
              style={[styles.challengeHeaderWrap, { paddingTop: Math.max(insets.top, 12) + 48 }]}
              pointerEvents="none"
            >
              <View style={styles.challengeRow1}>
                <View style={styles.challengeBtiChip}>
                  <Text style={styles.challengeBtiChipText} numberOfLines={1}>
                    {ch2.btiChipLabel.trim() ? ch2.btiChipLabel.trim() : '냥BTI'}
                  </Text>
                </View>
                <Text style={styles.challengeCatName} numberOfLines={1}>
                  {ch2.catName.trim() || '냥이'}
                </Text>
              </View>
              <View style={styles.challengeRow2}>
                <Ionicons name="heart" size={17} color="#fb7185" style={styles.challengeHeart} />
                <Text style={styles.challengeOwnerLine} numberOfLines={1}>
                  집사 : {ch2.ownerNickname.trim() || '냥집사'}
                </Text>
              </View>
            </View>
          ) : null}

          {showHeroLine ? (
            <View
              style={[styles.heroTop, { paddingTop: Math.max(insets.top, 12) + 48 }]}
              pointerEvents="none"
            >
              <Text
                style={[styles.heroLineText, { maxWidth: winW - 24 }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {heroLine}
              </Text>
            </View>
          ) : null}

          {showLegacyMeta ? (
            <View
              style={[styles.metaTop, { paddingTop: Math.max(insets.top, 12) + 50 }]}
              pointerEvents="none"
            >
              <View style={styles.metaInner}>
                {author.length > 0 ? (
                  <Text style={styles.metaAuthor} numberOfLines={1}>
                    {author}
                  </Text>
                ) : null}
                <View style={styles.metaChips}>
                  {cat.length > 0 ? (
                    <View style={[styles.metaChip, { maxWidth: winW * 0.45 }]}>
                      <Text style={styles.metaChipText} numberOfLines={1}>
                        {cat}
                      </Text>
                    </View>
                  ) : null}
                  {bti.length > 0 ? (
                    <View style={[styles.metaChip, styles.metaChipBti, { maxWidth: winW * 0.45 }]}>
                      <Text style={styles.metaChipTextBti} numberOfLines={1}>
                        {bti}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {hasSlidesMeta && cap.length > 0 ? (
            <View
              style={[styles.captionOuter, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}
              pointerEvents="box-none"
            >
              <View style={styles.bubbleColumn}>
                <View
                  style={[
                    styles.speechTailUp,
                    { borderBottomColor: SPEECH_BUBBLE_BG },
                  ]}
                />
                <View
                  style={[
                    styles.speechBubble,
                    {
                      width: bubbleW,
                      maxWidth: bubbleW,
                      backgroundColor: SPEECH_BUBBLE_BG,
                      borderColor: 'rgba(127,119,221,0.38)',
                    },
                  ]}
                >
                  <ScrollView
                    style={[styles.captionScroll, { maxHeight: winH * 0.22 }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={styles.speechBubbleText}>{cap}</Text>
                  </ScrollView>
                </View>
              </View>
            </View>
          ) : null}

          {overlay}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  rootInner: { flex: 1, backgroundColor: '#000' },
  list: { flex: 1, backgroundColor: '#000' },
  zoomBox: { flex: 1, width: '100%', height: '100%' },
  pageImage: { width: '100%', height: '100%' },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 20,
    elevation: 20,
  },
  closeHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarSpacer: { flex: 1 },
  topBarLeft: { flexShrink: 1 },
  accessoryWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  challengeHeaderWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 15,
    paddingHorizontal: 14,
    paddingBottom: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  challengeRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
    maxWidth: '100%',
  },
  challengeBtiChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(127,119,221,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    maxWidth: '46%',
  },
  challengeBtiChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
  challengeCatName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#faf8ff',
    letterSpacing: -0.35,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flexShrink: 1,
  },
  challengeRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  challengeHeart: {
    marginTop: 1,
  },
  challengeOwnerLine: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.25,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flexShrink: 1,
  },
  heroTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 15,
    paddingHorizontal: 12,
    paddingBottom: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  heroLineText: {
    color: '#faf8ff',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.25,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metaTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 15,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  metaInner: {
    paddingRight: 8,
  },
  metaAuthor: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  metaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  metaChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  metaChipBti: {
    backgroundColor: 'rgba(127,119,221,0.45)',
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  metaChipTextBti: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  captionOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'center',
    zIndex: 16,
    elevation: 16,
  },
  bubbleColumn: {
    alignItems: 'center',
  },
  speechBubble: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  /** 꼭짓점이 위(이미지 쪽)를 향함 */
  speechTailUp: {
    alignSelf: 'center',
    marginBottom: -1,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  captionScroll: {},
  speechBubbleText: {
    textAlign: 'center',
    color: '#3d2f66',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
