import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { TextInput, View, type ViewProps } from 'react-native';
import { useSmartKeyboardOverlapPad } from '../lib/use-smart-keyboard-overlap-pad';

type TextInputInstance = InstanceType<typeof TextInput>;

export type SmartKeyboardContextValue = {
  setFocusedField: (node: TextInputInstance | null) => void;
  overlapPad: number;
  keyboardInset: number;
};

const SmartKeyboardFieldContext = createContext<SmartKeyboardContextValue | null>(null);

/**
 * `SmartKeyboardScreen` 안에서만 사용. 키보드 높이·겹침 패딩·포커스 등록.
 */
export function useSmartKeyboard(): SmartKeyboardContextValue {
  const ctx = useContext(SmartKeyboardFieldContext);
  if (!ctx) {
    throw new Error('useSmartKeyboard는 SmartKeyboardScreen 안에서만 사용해 주세요.');
  }
  return ctx;
}

/**
 * `SmartKeyboardScreen` 안에서만 사용. 포커스된 `TextInput`을 키보드 겹침 계산에 등록합니다.
 */
export function useSmartKeyboardFieldFocus(): (node: TextInputInstance | null) => void {
  return useSmartKeyboard().setFocusedField;
}

/** 키보드가 열려 있을 때 스크롤 `paddingBottom`에 더할 값(키보드 높이). 루트 `overlapPad`와 역할이 겹치지 않음 */
export function useSmartKeyboardScrollExtraBottom(): number {
  const { keyboardInset } = useSmartKeyboard();
  return keyboardInset;
}

export type SmartKeyboardScreenProps = ViewProps & {
  children?: ReactNode;
};

/**
 * 겹침 시 루트 `paddingBottom`·`margin:0`. 스크롤은 `useSmartKeyboardScrollExtraBottom()`으로
 * 키보드 높이만큼 `paddingBottom`을 더해 말풍선·본문을 위로 밀 수 있게 합니다.
 */
export function SmartKeyboardScreen({ children, style, ...rest }: SmartKeyboardScreenProps) {
  const { overlapPad, keyboardInset, setFocusedField } = useSmartKeyboardOverlapPad();
  const value = useMemo(
    () => ({ setFocusedField, overlapPad, keyboardInset }),
    [setFocusedField, overlapPad, keyboardInset],
  );

  return (
    <SmartKeyboardFieldContext.Provider value={value}>
      <View
        {...rest}
        style={[
          {
            flex: 1,
            margin: overlapPad > 0 ? 0 : undefined,
            paddingBottom: overlapPad,
          },
          style,
        ]}
      >
        {children}
      </View>
    </SmartKeyboardFieldContext.Provider>
  );
}
