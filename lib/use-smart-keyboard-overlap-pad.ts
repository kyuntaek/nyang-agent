import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Dimensions, Keyboard, type KeyboardEvent, Platform, TextInput } from 'react-native';

/** 겹침 시 루트 `paddingBottom`에 더하는 최소 여백(px). 입력 전체 높이는 넣지 않아 키보드 위 빈칸을 줄입니다. */
export const SMART_KEYBOARD_INPUT_GAP = 4;

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

function resolveMeasurableField(lastFocusedRef: MutableRefObject<TextInput | null>): Measurable | null {
  const direct = lastFocusedRef.current;
  if (direct && typeof direct.measureInWindow === 'function') return direct;

  const cur = TextInput.State.currentlyFocusedInput() as unknown;
  if (cur && typeof (cur as Measurable).measureInWindow === 'function') {
    return cur as Measurable;
  }
  return null;
}

/**
 * 포커스된 입력이 키보드에 가릴 때만 루트 하단 패딩 = 키보드 높이 + {@link SMART_KEYBOARD_INPUT_GAP}.
 * 스크롤은 `useSmartKeyboardScrollExtraBottom`으로 `keyboardInset`만큼 따로 늘립니다.
 * Android `resize` 등 좌표 보정을 위해 지연 측정을 한 번 더 합니다.
 */
export function useSmartKeyboardOverlapPad() {
  const [overlapPad, setOverlapPad] = useState(0);
  /** 키보드가 열려 있을 때 높이. 스크롤 `contentContainerStyle.paddingBottom` 등에 먼저 반영 */
  const [keyboardInset, setKeyboardInset] = useState(0);
  const lastFocusedRef = useRef<TextInput | null>(null);
  /** 첫 프레임에 겹침으로 pad를 켠 뒤, 레이아웃이 밀려 재측정에서 겹침이 0으로만 나오는 경우 방지 (키보드 닫힐 때까지 유지) */
  const hadOverlapPadRef = useRef(false);
  const measureTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setFocusedField = useCallback((node: TextInput | null) => {
    if (node !== lastFocusedRef.current) {
      hadOverlapPadRef.current = false;
    }
    lastFocusedRef.current = node;
  }, []);

  useEffect(() => {
    const clearMeasureTimeouts = () => {
      for (const t of measureTimeoutsRef.current) {
        clearTimeout(t);
      }
      measureTimeoutsRef.current = [];
    };

    const applyPadForKeyboard = (kb: KeyboardEvent['endCoordinates']) => {
      /**
       * `app.json`의 `softwareKeyboardLayoutMode: "resize"`(기본)일 때 창 높이가 이미 줄어듦.
       * 여기서 `overlapPad`까지 키보드 높이만큼 주면 이중 밀림 → 입력이 키보드 위로 뜸.
       */
      if (Platform.OS === 'android') {
        hadOverlapPadRef.current = false;
        setOverlapPad(0);
        return;
      }

      const kbTop = kb.screenY;
      const gap = SMART_KEYBOARD_INPUT_GAP;
      const node = resolveMeasurableField(lastFocusedRef);
      if (!node) {
        hadOverlapPadRef.current = false;
        setOverlapPad(0);
        return;
      }
      node.measureInWindow((_x, y, _w, h) => {
        const fieldBottom = y + h;
        const winH = Dimensions.get('window').height;
        /** 키보드 상단선 기준 겹침 */
        const overlapsKbTop = fieldBottom > kbTop - gap;
        /**
         * Android `resize` + 하단 고정 입력: `kbTop`·좌표가 어긋나 겹침이 0으로만 나올 때,
         * 입력이 화면 하단·키보드 슬롯 근처면 밀기 적용 (에이전트·댓글 등).
         */
        const reserveBottom = kb.height + gap * 3;
        const androidDockFallback =
          Platform.OS === 'android' &&
          y >= winH - kb.height - 200 &&
          fieldBottom > winH - reserveBottom;
        const iosDockFallback =
          Platform.OS === 'ios' &&
          y > winH * 0.52 &&
          fieldBottom > winH - kb.height - 16;
        const needsPad = overlapsKbTop || androidDockFallback || iosDockFallback;
        if (needsPad) {
          hadOverlapPadRef.current = true;
          setOverlapPad(kb.height + gap);
        } else if (hadOverlapPadRef.current) {
          setOverlapPad(kb.height + gap);
        } else {
          setOverlapPad(0);
        }
      });
    };

    const onShow = (e: KeyboardEvent) => {
      const kb = e.endCoordinates;
      clearMeasureTimeouts();
      setKeyboardInset(kb.height);

      const run = () => applyPadForKeyboard(kb);

      requestAnimationFrame(run);

      const delays = Platform.OS === 'android' ? [64, 160] : [28];
      for (const ms of delays) {
        measureTimeoutsRef.current.push(
          setTimeout(run, ms),
        );
      }
    };

    const onHide = () => {
      clearMeasureTimeouts();
      hadOverlapPadRef.current = false;
      setKeyboardInset(0);
      setOverlapPad(0);
    };

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      clearMeasureTimeouts();
      s.remove();
      h.remove();
    };
  }, []);

  return { overlapPad, keyboardInset, setFocusedField };
}
