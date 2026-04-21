import { useEffect } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Platform,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { clamp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const DEFAULT_MAX_SCALE = 5;

export type ZoomableImageProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover';
  disabled?: boolean;
  maxScale?: number;
};

/**
 * 핀치로 **레이아웃 크기**까지 키워 확대(클립만 되는 transform-only 한계 완화) + 팬.
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
  const pinchStartScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const vw = useSharedValue(0);
  const vh = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
  }, [uri]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    vw.value = width;
    vh.value = height;
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
      pinchStartScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = clamp(pinchStartScale.value * e.scale, 1, maxScale);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
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
      const bw = vw.value;
      const bh = vh.value;
      if (bw <= 0 || bh <= 0) return;
      const w = bw * scale.value;
      const h = bh * scale.value;
      const maxTx = Math.max(0, (w - bw) / 2);
      const maxTy = Math.max(0, (h - bh) / 2);
      const nx = startTx.value + e.translationX;
      const ny = startTy.value + e.translationY;
      tx.value = clamp(nx, -maxTx, maxTx);
      ty.value = clamp(ny, -maxTy, maxTy);
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => {
    const s = Math.max(1, Math.min(scale.value, maxScale));
    const bw = vw.value;
    const bh = vh.value;
    if (bw <= 0 || bh <= 0) {
      return {};
    }
    const w = bw * s;
    const h = bh * s;
    return {
      width: w,
      height: h,
      marginLeft: (bw - w) / 2 + tx.value,
      marginTop: (bh - h) / 2 + ty.value,
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <View style={[style, { overflow: 'visible' }]} onLayout={onLayout} collapsable={false}>
        <Animated.View style={[{ overflow: 'visible' }, animatedStyle]}>
          <Animated.Image
            source={{ uri }}
            style={[{ width: '100%', height: '100%' }, imageStyle]}
            resizeMode={resizeMode}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
