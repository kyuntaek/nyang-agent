import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  INITIAL_SCORES,
  NYAN_BTI_QUESTIONS,
  addChoiceScores,
  computeNyanBtiCode,
  type BtiChoice,
} from '../../lib/nyan-bti';

const PRIMARY = '#7F77DD';
const TOTAL = NYAN_BTI_QUESTIONS.length;

export default function NyanBtiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState(INITIAL_SCORES);

  const question = NYAN_BTI_QUESTIONS[step];

  const onPick = useCallback(
    (choice: BtiChoice) => {
      const nextScores = addChoiceScores(scores, choice.tags);
      if (step >= TOTAL - 1) {
        const code = computeNyanBtiCode(nextScores);
        router.replace({ pathname: '/nyan-bti-result', params: { code } });
        return;
      }
      setScores(nextScores);
      setStep((s) => s + 1);
    },
    [step, scores, router]
  );

  const progressLabel = useMemo(() => `${step + 1} / ${TOTAL}`, [step]);

  const exit = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  if (!question) return null;

  return (
    <View className="flex-1 bg-violet-50" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View className="px-5 pb-4">
        <View className="flex-row items-center">
          <View className="w-[4.5rem] items-start">
            <TouchableOpacity
              onPress={exit}
              hitSlop={12}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="냥BTI 나가기"
              className="rounded-lg px-1 py-1"
            >
              <Text className="text-base font-semibold text-violet-600">닫기</Text>
            </TouchableOpacity>
          </View>
          <View className="min-w-0 flex-1 items-center">
            <Text className="text-sm font-medium text-[#7F77DD]">냥BTI</Text>
          </View>
          <View className="w-[4.5rem]" />
        </View>
        <Text className="mt-3 text-sm font-semibold text-violet-900/60">{progressLabel}</Text>
        <View className="mt-3 flex-row gap-2">
          {Array.from({ length: TOTAL }, (_, i) => (
            <View
              key={i}
              className={`h-3 flex-1 rounded-full ${i <= step ? 'bg-[#7F77DD]' : 'bg-violet-200/80'}`}
            />
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <View className="rounded-[28px] border-2 border-violet-100 bg-white p-6 shadow-sm">
          <Text className="text-xl font-bold leading-8 text-violet-950">{question.prompt}</Text>

          <View className="mt-8 gap-3">
            {question.choices.map((c, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => onPick(c)}
                activeOpacity={0.85}
                className="rounded-2xl border-2 border-violet-100 bg-violet-50/60 px-4 py-4"
              >
                <Text className="text-base font-semibold text-violet-950">{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={exit} activeOpacity={0.75} className="mt-8 self-center py-2">
            <Text className="text-sm font-medium text-violet-400">다음에 할게요</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
