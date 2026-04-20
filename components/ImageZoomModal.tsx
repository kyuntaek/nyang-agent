import { useLayoutEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomableImage } from './ZoomableImage';
import { GestureHandlerRootView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
const ZOOM_IMG_W = WIN_W * 0.98;
const ZOOM_IMG_H = Math.min(WIN_W * 0.98, WIN_H * 0.85);

type Props = {
  uri: string | null;
  onClose: () => void;
  /** 챌린지 한마디 등 부가 텍스트 */
  caption?: string | null;
  /** 이미지 상단 메타 (챌린지 상세 등) */
  authorNickname?: string | null;
  catName?: string | null;
  nyanBtiChip?: string | null;
};

/**
 * 게시글 이미지 풀스크린: Reanimated 핀치 줌 + 확대 시 한 손가락 팬
 * (ScrollView 네이티브 줌은 닫았다 다시 열 때 오프셋·배율이 남는 이슈가 있음)
 */
export function ImageZoomModal({
  uri,
  onClose,
  caption,
  authorNickname,
  catName,
  nyanBtiChip,
}: Props) {
  const insets = useSafeAreaInsets();
  /** 열릴 때마다 올려 Modal·줌 상태를 리마운트 */
  const [mountKey, setMountKey] = useState(0);

  useLayoutEffect(() => {
    if (!uri) return;
    setMountKey((k) => k + 1);
  }, [uri]);

  const cap = typeof caption === 'string' ? caption.trim() : '';
  const author = typeof authorNickname === 'string' ? authorNickname.trim() : '';
  const cat = typeof catName === 'string' ? catName.trim() : '';
  const bti = typeof nyanBtiChip === 'string' ? nyanBtiChip.trim() : '';
  const showMeta = author.length > 0 || cat.length > 0 || bti.length > 0;

  if (!uri) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="닫기"
          activeOpacity={1}
        >
          <View style={StyleSheet.absoluteFill} />
        </TouchableOpacity>
        {showMeta ? (
          <View
            style={[styles.metaTop, { paddingTop: insets.top + 8 }]}
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
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText} numberOfLines={1}>
                      {cat}
                    </Text>
                  </View>
                ) : null}
                {bti.length > 0 ? (
                  <View style={[styles.metaChip, styles.metaChipBti]}>
                    <Text style={styles.metaChipTextBti} numberOfLines={1}>
                      {bti}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.center} pointerEvents="box-none">
          <View key={`zoom-${mountKey}`} style={styles.zoomViewport} pointerEvents="box-none">
            <ZoomableImage uri={uri} style={{ width: ZOOM_IMG_W, height: ZOOM_IMG_H }} resizeMode="contain" />
          </View>
        </View>
        {cap.length > 0 ? (
          <View
            style={[
              styles.captionWrap,
              { paddingBottom: Math.max(insets.bottom, 12) + 10 },
            ]}
            pointerEvents="box-none"
          >
            <ScrollView
              style={styles.captionScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.captionText}>{cap}</Text>
            </ScrollView>
          </View>
        ) : null}
        <GHTouchableOpacity
          onPress={onClose}
          style={[styles.closeBtn, { top: Math.max(insets.top + 8, 48) }]}
          hitSlop={12}
          activeOpacity={0.85}
        >
          <Text style={styles.closeText}>닫기</Text>
        </GHTouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomViewport: {
    width: ZOOM_IMG_W,
    height: ZOOM_IMG_H,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
    elevation: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  closeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  metaTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 3,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  metaInner: {
    paddingRight: 88,
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
    maxWidth: WIN_W * 0.45,
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
  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: WIN_H * 0.28,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  captionScroll: { maxHeight: WIN_H * 0.22 },
  captionText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    lineHeight: 22,
  },
});
