import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SmartKeyboardScreen, useSmartKeyboardFieldFocus } from '../SmartKeyboardScreen';
import type { LatestCatRow } from '../../lib/fetch-latest-cat';
import { anniversaryCountdownLabel } from '../../lib/dday';
import { fetchAnniversaries, type AnniversaryRow } from '../../lib/cat-life-queries';
import { IOS_DATE_PICKER_LOCALE, toLocaleDateLongKo } from '../../lib/ko-date';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';
/** 모달 바깥 딤 — 반투명으로 바닥은 비치되 내용은 잘 가리기 */
const ANNIVERSARY_MODAL_SCRIM = 'rgba(24, 22, 52, 0.58)';
/** 시트 배경 — 리스트 화면(흰/연보라)과 구분 */
const ANNIVERSARY_SHEET_BG = '#E8E4FF';

type Props = {
  cat: LatestCatRow;
};

type AnniversaryAddModalSheetProps = {
  title: string;
  setTitle: (s: string) => void;
  dateStrWeb: string;
  setDateStrWeb: (s: string) => void;
  eventDate: Date;
  repeatYearly: boolean;
  setRepeatYearly: (v: boolean) => void;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
  iosDatePickerKey: number;
  saving: boolean;
  setModalOpen: (open: boolean) => void;
  formatYmd: (d: Date) => string;
  onPickerChange: (e: DateTimePickerEvent, d?: Date) => void;
  saveAnniversary: () => Promise<void>;
};

function AnniversaryAddModalSheet({
  title,
  setTitle,
  dateStrWeb,
  setDateStrWeb,
  eventDate,
  repeatYearly,
  setRepeatYearly,
  showPicker,
  setShowPicker,
  iosDatePickerKey,
  saving,
  setModalOpen,
  formatYmd,
  onPickerChange,
  saveAnniversary,
}: AnniversaryAddModalSheetProps) {
  const setFocusedField = useSmartKeyboardFieldFocus();
  const titleRef = useRef<TextInput>(null);
  const dateWebRef = useRef<TextInput>(null);

  return (
    <>
      <Text className="text-lg font-bold text-violet-950">기념일 추가</Text>

      <Text className="mt-3 text-sm font-semibold text-violet-800">제목</Text>
      <TextInput
        ref={titleRef}
        value={title}
        onChangeText={setTitle}
        onFocus={() => setFocusedField(titleRef.current)}
        placeholder="예: 다음 예방접종"
        placeholderTextColor="#a78bfa"
        className="mt-2 rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-3 text-base text-violet-950"
      />

      <Text className="mt-3 text-sm font-semibold text-violet-800">날짜</Text>
      {Platform.OS === 'web' ? (
        <TextInput
          ref={dateWebRef}
          value={dateStrWeb}
          onChangeText={setDateStrWeb}
          onFocus={() => setFocusedField(dateWebRef.current)}
          placeholder={formatYmd(eventDate)}
          placeholderTextColor="#a78bfa"
          className="mt-2 rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-3 text-base text-violet-950"
        />
      ) : Platform.OS === 'ios' ? (
        <View className="mt-2 self-stretch overflow-hidden rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-2 py-1">
          <DateTimePicker
            key={iosDatePickerKey}
            value={eventDate}
            mode="date"
            display="compact"
            locale={IOS_DATE_PICKER_LOCALE}
            onChange={onPickerChange}
            themeVariant="light"
          />
        </View>
      ) : (
        <>
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            className="mt-2 rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-4"
          >
            <Text className="text-center text-lg font-semibold text-violet-950">
              {toLocaleDateLongKo(eventDate)}
            </Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display="default"
              locale={IOS_DATE_PICKER_LOCALE}
              onChange={onPickerChange}
              themeVariant="light"
            />
          )}
        </>
      )}

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-violet-800">매년 반복</Text>
        <Switch value={repeatYearly} onValueChange={setRepeatYearly} trackColor={{ true: PRIMARY }} />
      </View>

      <View className="mt-5 flex-row gap-3">
        <TouchableOpacity
          onPress={() => setModalOpen(false)}
          disabled={saving}
          className="flex-1 items-center rounded-2xl border-2 border-violet-200 py-4"
        >
          <Text className="font-bold text-violet-800">취소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void saveAnniversary()}
          disabled={saving}
          style={{ backgroundColor: PRIMARY }}
          className="flex-1 items-center rounded-2xl py-4 opacity-100"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-bold text-white">저장</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

type BuiltInRow = {
  key: string;
  title: string;
  date: string;
  repeatYearly: boolean;
};

export function AnniversaryTab({ cat }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date());
  const [dateStrWeb, setDateStrWeb] = useState('');
  const [repeatYearly, setRepeatYearly] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  /** iOS compact 캘린더 팝오버를 날짜 확정 직후 닫기 위해 리마운트 */
  const [iosDatePickerKey, setIosDatePickerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const anniversaryDeleteInProgressRef = useRef(false);

  const {
    data: rows = [],
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['anniversaries', cat.id],
    queryFn: () => fetchAnniversaries(cat.id),
  });

  const builtIns = useMemo((): BuiltInRow[] => {
    const list: BuiltInRow[] = [];
    if (cat.birth_date) {
      list.push({
        key: 'birth',
        title: '생일',
        date: cat.birth_date,
        repeatYearly: true,
      });
    }
    if (cat.adopted_at) {
      list.push({
        key: 'adopted',
        title: '입양일',
        date: cat.adopted_at,
        repeatYearly: true,
      });
    }
    return list;
  }, [cat.birth_date, cat.adopted_at]);

  const openModal = () => {
    setTitle('');
    setEventDate(new Date());
    setDateStrWeb('');
    setRepeatYearly(true);
    setIosDatePickerKey((k) => k + 1);
    setModalOpen(true);
  };

  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const onPickerChange = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') {
      if (e.type === 'dismissed' || e.type === 'set') {
        setShowPicker(false);
      }
      if (e.type === 'set' && d) {
        setEventDate(d);
      }
      return;
    }
    if (Platform.OS === 'ios' && e.type === 'set' && d) {
      setEventDate(d);
      setIosDatePickerKey((k) => k + 1);
    }
  };

  const saveAnniversary = async () => {
    const t = title.trim();
    if (!t) {
      Alert.alert('입력', '기념일 제목을 입력해 주세요.');
      return;
    }
    let ymd = formatYmd(eventDate);
    if (Platform.OS === 'web') {
      const s = dateStrWeb.trim();
      if (s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          Alert.alert('날짜', 'YYYY-MM-DD 형식으로 입력해 주세요.');
          return;
        }
        ymd = s;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('anniversaries').insert({
        cat_id: cat.id,
        title: t,
        date: ymd,
        repeat_yearly: repeatYearly,
      });
      if (error) {
        Alert.alert('저장 실패', error.message);
        return;
      }
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['anniversaries', cat.id] });
    } finally {
      setSaving(false);
    }
  };

  const removeAnniversary = useCallback(
    (row: AnniversaryRow) => {
      if (anniversaryDeleteInProgressRef.current) {
        Alert.alert('알림', '처리 중입니다. 잠시만 기다려 주세요.');
        return;
      }
      Alert.alert('삭제', `"${row.title}" 기념일을 삭제할까요?`, [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            if (anniversaryDeleteInProgressRef.current) {
              Alert.alert('알림', '처리 중입니다. 잠시만 기다려 주세요.');
              return;
            }
            anniversaryDeleteInProgressRef.current = true;
            try {
              const { error } = await supabase.from('anniversaries').delete().eq('id', row.id);
              if (error) {
                Alert.alert('삭제 실패', error.message);
                return;
              }
              await queryClient.invalidateQueries({ queryKey: ['anniversaries', cat.id] });
            } finally {
              anniversaryDeleteInProgressRef.current = false;
            }
          },
        },
      ]);
    },
    [cat.id, queryClient]
  );

  const Row = ({
    title: rowTitle,
    date,
    repeatYearly: ry,
    onDelete,
    variant = 'custom',
  }: {
    title: string;
    date: string;
    repeatYearly: boolean;
    onDelete?: () => void;
    /** 프로필 생일·입양일(삭제 불가) vs 직접 추가 기념일 */
    variant?: 'builtin' | 'custom';
  }) => {
    const ymd = date.slice(0, 10);
    const label = anniversaryCountdownLabel(ymd, ry);
    const isBuiltin = variant === 'builtin';
    return (
      <View
        className={`mb-3 flex-row items-center justify-between rounded-2xl border px-4 py-4 ${
          isBuiltin
            ? 'border-violet-300/90 bg-violet-100/70'
            : 'border-violet-100 bg-white'
        }`}
        style={isBuiltin ? { borderStyle: 'dashed', borderWidth: 1 } : undefined}
      >
        <View className="min-w-0 flex-1 pr-2">
          <View className="flex-row flex-wrap items-center gap-2">
            {isBuiltin ? (
              <View className="rounded-md border border-violet-300/60 bg-white/90 px-2 py-0.5">
                <Text className="text-[10px] font-bold tracking-wide text-violet-600">프로필</Text>
              </View>
            ) : null}
            <Text className={`text-base font-semibold ${isBuiltin ? 'text-violet-900' : 'text-violet-950'}`}>
              {rowTitle}
            </Text>
            {ry ? (
              <View
                className={`rounded-full px-2 py-0.5 ${
                  isBuiltin ? 'border border-violet-200/80 bg-white/80' : 'bg-violet-100'
                }`}
              >
                <Text className={`text-xs font-semibold ${isBuiltin ? 'text-violet-700' : 'text-violet-700'}`}>
                  매년 반복
                </Text>
              </View>
            ) : null}
          </View>
          <Text className={`mt-1 text-sm ${isBuiltin ? 'text-violet-600' : 'text-violet-500'}`}>{ymd}</Text>
          {isBuiltin ? (
            <Text className="mt-1.5 text-xs leading-4 text-violet-500/90">
              프로필에서 날짜를 바꿀 수 있어요 · 이 목록에서는 삭제되지 않아요
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <View className="rounded-full bg-[#EEEDFE] px-3 py-1">
            <Text className="text-sm font-bold text-[#7F77DD]">{label}</Text>
          </View>
          {onDelete ? (
            <TouchableOpacity onPress={onDelete} hitSlop={8} className="px-1 py-1">
              <Text className="text-xs font-semibold text-red-500">삭제</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-lg font-bold text-violet-950">기념일</Text>
        <Text className="mt-1 text-sm text-violet-600">
          생일·입양일은 프로필 기준이에요. 예방접종 등은 직접 추가할 수 있어요.
        </Text>

        {isPending && (
          <View className="mt-8 items-center py-6">
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        )}

        {isError && (
          <View className="mt-4 rounded-2xl bg-red-50 px-4 py-3">
            <Text className="text-sm text-red-700">{(error as Error).message}</Text>
            <TouchableOpacity onPress={() => void refetch()} className="mt-2">
              <Text className="text-sm font-semibold text-[#7F77DD]">다시 불러오기</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isPending && !isError && (
          <View className="mt-6">
            {builtIns.map((b) => (
              <Row
                key={b.key}
                variant="builtin"
                title={b.title}
                date={b.date}
                repeatYearly={b.repeatYearly}
              />
            ))}

            {rows.map((r) => (
              <Row
                key={r.id}
                title={r.title}
                date={r.date}
                repeatYearly={r.repeat_yearly}
                onDelete={() => void removeAnniversary(r)}
              />
            ))}

            {builtIns.length === 0 && rows.length === 0 && (
              <Text className="mt-6 text-center text-base text-violet-600">
                등록된 기념일이 없어요. 아래에서 추가해 보세요.
              </Text>
            )}

            <TouchableOpacity
              onPress={openModal}
              style={{ backgroundColor: PRIMARY }}
              className="mt-6 items-center rounded-2xl py-4 active:opacity-90"
            >
              <Text className="text-base font-bold text-white">+ 기념일 추가</Text>
            </TouchableOpacity>

            <Text className="mt-4 text-center text-xs leading-5 text-violet-400">
              예: &quot;다음 예방접종&quot; + 날짜를 넣으면 D-day로 보여 드려요.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <SmartKeyboardScreen style={styles.modalRoot}>
          <View style={[styles.modalScrim, { backgroundColor: ANNIVERSARY_MODAL_SCRIM }]}>
            <TouchableOpacity
              accessibilityLabel="기념일 추가 닫기"
              accessibilityRole="button"
              disabled={saving}
              onPress={() => !saving && setModalOpen(false)}
              style={StyleSheet.absoluteFillObject}
            />
            <TouchableOpacity
              onPress={(e) => e.stopPropagation()}
              style={[
                styles.modalSheet,
                {
                  backgroundColor: ANNIVERSARY_SHEET_BG,
                  paddingBottom: Math.max(insets.bottom, 6) + 6,
                },
              ]}
            >
              <AnniversaryAddModalSheet
                title={title}
                setTitle={setTitle}
                dateStrWeb={dateStrWeb}
                setDateStrWeb={setDateStrWeb}
                eventDate={eventDate}
                repeatYearly={repeatYearly}
                setRepeatYearly={setRepeatYearly}
                showPicker={showPicker}
                setShowPicker={setShowPicker}
                iosDatePickerKey={iosDatePickerKey}
                saving={saving}
                setModalOpen={setModalOpen}
                formatYmd={formatYmd}
                onPickerChange={onPickerChange}
                saveAnniversary={saveAnniversary}
              />
            </TouchableOpacity>
          </View>
        </SmartKeyboardScreen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  modalScrim: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(127, 119, 221, 0.45)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});
