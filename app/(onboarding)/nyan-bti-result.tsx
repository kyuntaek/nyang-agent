import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNyanBtiArchetype } from '../../lib/nyan-bti-archetypes';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function NyanBtiResultScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = useMemo(() => firstParam(params.code), [params.code]);
  const archetype = useMemo(() => getNyanBtiArchetype(code), [code]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedCode = useRef<string | null>(null);

  const persist = useCallback(async () => {
    if (!code || code.length !== 4) {
      setSaveError('결과 코드가 없어요. 테스트를 다시 진행해 주세요.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setSaveError('로그인한 뒤에 저장할 수 있어요. (로그인 후 다시 저장을 눌러 주세요.)');
        return;
      }
      const uid = userData.user.id;

      const { data: rows, error: selErr } = await supabase
        .from('cats')
        .select('id')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1);

      if (selErr) {
        setSaveError(selErr.message);
        return;
      }
      const row = rows?.[0];
      if (!row?.id) {
        setSaveError('저장할 냥이 프로필이 없어요. 먼저 프로필 등록을 완료해 주세요.');
        return;
      }

      const { error: upErr } = await supabase
        .from('cats')
        .update({ nyanBTI_type: code })
        .eq('id', row.id);

      if (upErr) {
        setSaveError(upErr.message);
        return;
      }
      setSaved(true);
      lastSavedCode.current = code;
    } finally {
      setSaving(false);
    }
  }, [code]);

  useEffect(() => {
    if (!code || code.length !== 4) return;
    if (lastSavedCode.current === code) return;
    void persist();
  }, [code, persist]);

  return (
    <ScrollView
      className="flex-1 bg-violet-50"
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-center text-sm font-semibold text-violet-900/50">냥BTI 결과</Text>

      {archetype ? (
        <View className="mt-6 items-center">
          <Text className="text-7xl">{archetype.emoji}</Text>
          <Text className="mt-3 text-center text-3xl font-bold text-[#7F77DD]">{archetype.nickname}</Text>
          <Text className="mt-1 text-center text-lg font-semibold text-violet-950">
            「{archetype.headline}」
          </Text>
          <Text className="mt-2 text-center text-base leading-6 text-violet-800/90">「{archetype.subline}」</Text>
        </View>
      ) : (
        <View className="mt-8 items-center">
          <Text className="text-5xl">🐱</Text>
          <Text className="mt-3 text-center text-lg text-violet-800">알 수 없는 유형이에요</Text>
        </View>
      )}

      <View className="mt-8 rounded-2xl border border-violet-200 bg-white/90 px-4 py-3">
        <Text className="text-center text-xs font-medium uppercase tracking-widest text-violet-400">코드</Text>
        <Text className="mt-1 text-center text-2xl font-bold tracking-[0.2em] text-violet-950">
          {code && code.length === 4 ? code : '— — — —'}
        </Text>
        <Text className="mt-2 text-center text-xs leading-5 text-violet-500">
          독·애 / 활·여 / 직·은 / 민·무
        </Text>
      </View>

      <View className="mt-8 rounded-[28px] border-2 border-violet-100 bg-white p-6 shadow-sm">
        {saving && (
          <View className="items-center py-2">
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text className="mt-3 text-center text-sm text-violet-600">프로필에 저장하는 중…</Text>
          </View>
        )}
        {!saving && saved && (
          <Text className="text-center text-base font-semibold text-emerald-700">저장했어요!</Text>
        )}
        {!saving && saveError && (
          <Text className="text-center text-sm leading-6 text-red-600">{saveError}</Text>
        )}
        {!saving && !saved && !saveError && code.length !== 4 && (
          <Text className="text-center text-sm text-violet-600">유효한 결과가 없어요.</Text>
        )}
      </View>

      <TouchableOpacity
        onPress={() => router.replace('/')}
        activeOpacity={0.9}
        style={{ backgroundColor: PRIMARY }}
        className="mt-8 items-center rounded-2xl py-4"
      >
        <Text className="text-base font-bold text-white">홈으로</Text>
      </TouchableOpacity>

      {!saved && saveError ? (
        <TouchableOpacity
          onPress={() => {
            lastSavedCode.current = null;
            void persist();
          }}
          activeOpacity={0.85}
          className="mt-3 items-center rounded-2xl border-2 border-[#7F77DD] py-4"
        >
          <Text className="text-base font-bold text-[#7F77DD]">다시 저장</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
