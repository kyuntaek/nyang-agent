import { useEffect } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Platform,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { clamp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const DEFAULT_MAX_SCALE = 5;

/** 뷰포트(레이아웃) 기준: 확대 시 이동으로 빈 여백만 보이지 않도록 팬 상한 (transform origin = 중심 가정) */
function clampPanWorklet(tx: number, ty: number, scale: number, w: number, h: number) {
  'worklet';
  if (w <= 0 || h <= 0) return { tx: 0, ty: 0 };
  if (scale <= 1.001) return { tx: 0, ty: 0 };
  const maxX = (w * (scale - 1)) / 2;
  const maxY = (h * (scale - 1)) / 2;
  return {
    tx: clamp(tx, -maxX, maxX),
    ty: clamp(ty, -maxY, maxY),
  };
}

export type ZoomableImageProps = {
  uri: string;
  /** 제스처·클리핑 영역 (고정 크기 또는 flex:1 등) */
  style?: StyleProp<ViewStyle>;
  /** 내부 Image 스타일 (보통 width/height 100%) */
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover';
  disabled?: boolean;
  maxScale?: number;
};

/**
 * 핀치 줌 + 확대 시 팬. 팬은 뷰포트 기준으로 클램프되어 그림 끝이 화면 밖으로 과도하게 나가지 않습니다.
 * 커뮤니티(모달), 앨범, 챌린지 등 공용.
 */
export function ZoomableImage({
  uri,
  style,
  imageStyle,
  resizeMode = 'contain',
  disabled = false,
  maxScale = DEFAULT_MAX_SCALE,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const vw = useSharedValue(0);
  const vh = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
  }, [uri]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    vw.value = width;
    vh.value = height;
    const c = clampPanWorklet(tx.value, ty.value, scale.value, width, height);
    tx.value = c.tx;
    ty.value = c.ty;
  };

  if (Platform.OS === 'web') {
    return (
      <View style={style}>
        <Image
          source={{ uri }}
          style={[{ width: '100%', height: '100%', flex: 1 }, imageStyle]}
          resizeMode={resizeMode}
        />
      </View>
    );
  }

  const pinch = Gesture.Pinch()
    .enabled(!disabled)
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, 1, maxScale);
      scale.value = next;
      const c = clampPanWorklet(tx.value, ty.value, next, vw.value, vh.value);
      tx.value = c.tx;
      ty.value = c.ty;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
      } else {
        savedScale.value = scale.value;
        const c = clampPanWorklet(tx.value, ty.value, scale.value, vw.value, vh.value);
        tx.value = c.tx;
        ty.value = c.ty;
      }
    });

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .maxPointers(1)
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1.02) return;
      const nx = startTx.value + e.translationX;
      const ny = startTy.value + e.translationY;
      const c = clampPanWorklet(nx, ny, scale.value, vw.value, vh.value);
      tx.value = c.tx;
      ty.value = c.ty;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ overflow: 'hidden' }, style]} onLayout={onLayout}>
        <Animated.Image
          source={{ uri }}
          style={[{ width: '100%', height: '100%' }, imageStyle]}
          resizeMode={resizeMode}
        />
      </Animated.View>
    </GestureDetector>
  );
}
