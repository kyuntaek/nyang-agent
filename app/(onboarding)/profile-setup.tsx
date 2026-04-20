import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SmartKeyboardScreen,
  useSmartKeyboardFieldFocus,
  useSmartKeyboardScrollExtraBottom,
} from '../../components/SmartKeyboardScreen';
import { fetchLatestCatForProfileEdit } from '../../lib/fetch-latest-cat';
import { IOS_DATE_PICKER_LOCALE, toLocaleDateLongKo, toYmd } from '../../lib/ko-date';
import { processPickedImageForUpload, thumbnailStoragePathFromMainPath } from '../../lib/image-upload';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

const STEPS = 6;

async function uploadCatProfilePhoto(uid: string, catId: string, asset: ImagePickerAsset): Promise<string> {
  const processed = await processPickedImageForUpload(asset);
  const path = `${uid}/${catId}/profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${processed.ext}`;
  const thumbPath = thumbnailStoragePathFromMainPath(path);

  const { error: upErr } = await supabase.storage.from('cat-photos').upload(path, processed.mainBody, {
    contentType: processed.mime,
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error: thumbErr } = await supabase.storage.from('cat-photos').upload(thumbPath, processed.thumbBody, {
    contentType: processed.mime,
    upsert: false,
  });
  if (thumbErr && __DEV__) {
    console.warn('[cat-photos profile thumb]', thumbErr);
  }

  const { data: pub } = supabase.storage.from('cat-photos').getPublicUrl(path);
  return pub.publicUrl;
}

const BREEDS = [
  '코리안숏헤어',
  '러시안블루',
  '페르시안',
  '메인쿤',
  '스코티시폴드',
  '기타',
] as const;

function isBreedOption(b: string): b is (typeof BREEDS)[number] {
  return (BREEDS as readonly string[]).includes(b);
}

type Gender = 'female' | 'male';
type KnowUnknownChoice = 'know' | 'unknown' | null;

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function ProfileSetupScreenInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nameInputRef = useRef<TextInput>(null);
  const birthWebInputRef = useRef<TextInput>(null);
  const adoptedWebInputRef = useRef<TextInput>(null);
  const setFocusedField = useSmartKeyboardFieldFocus();
  const scrollExtraBottom = useSmartKeyboardScrollExtraBottom();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthDate, setBirthDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  });
  const [birthChoice, setBirthChoice] = useState<KnowUnknownChoice>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** iOS compact 캘린더 팝오버를 날짜 확정 직후 닫기 위해 리마운트 */
  const [birthIosPickerKey, setBirthIosPickerKey] = useState(0);
  const [birthInputWeb, setBirthInputWeb] = useState('');
  const [adoptedChoice, setAdoptedChoice] = useState<KnowUnknownChoice>(null);
  const [adoptedDate, setAdoptedDate] = useState(() => new Date());
  const [showAdoptedPicker, setShowAdoptedPicker] = useState(false);
  const [adoptedIosPickerKey, setAdoptedIosPickerKey] = useState(0);
  const [adoptedInputWeb, setAdoptedInputWeb] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  /** 갤러리에서 고른 새 사진 (저장 시 cat-photos 업로드) */
  const [pickedProfileAsset, setPickedProfileAsset] = useState<ImagePickerAsset | null>(null);
  /** 서버에 있던 대표/아바타 URL (수정 화면 미리보기) */
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);

  const birthdayYmd = useMemo(() => toYmd(birthDate), [birthDate]);
  const birthdayDisplay = useMemo(() => toLocaleDateLongKo(birthDate), [birthDate]);
  const adoptedYmd = useMemo(() => toYmd(adoptedDate), [adoptedDate]);
  const adoptedDisplay = useMemo(() => toLocaleDateLongKo(adoptedDate), [adoptedDate]);

  const canGoNext = useMemo(() => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return name.trim().length > 0;
      case 2:
        return breed !== null;
      case 3:
        return gender !== null;
      case 4:
        if (birthChoice === 'unknown') return true;
        if (birthChoice === 'know') {
          if (Platform.OS === 'web') {
            return parseISODate(birthInputWeb.trim() || birthdayYmd) !== null;
          }
          return true;
        }
        return false;
      case 5:
        if (adoptedChoice === 'unknown') return true;
        if (adoptedChoice === 'know') {
          if (Platform.OS === 'web') {
            return parseISODate(adoptedInputWeb.trim() || adoptedYmd) !== null;
          }
          return true;
        }
        return false;
      default:
        return false;
    }
  }, [
    step,
    name,
    breed,
    gender,
    birthChoice,
    birthInputWeb,
    birthdayYmd,
    adoptedChoice,
    adoptedInputWeb,
    adoptedYmd,
  ]);

  const onDateChange = useCallback((event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && date) {
        setBirthDate(date);
      }
      return;
    }
    if (Platform.OS === 'ios' && event.type === 'set' && date) {
      setBirthDate(date);
      setBirthIosPickerKey((k) => k + 1);
    }
  }, []);

  const onAdoptedDateChange = useCallback((event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowAdoptedPicker(false);
      if (event.type === 'set' && date) {
        setAdoptedDate(date);
      }
      return;
    }
    if (Platform.OS === 'ios' && event.type === 'set' && date) {
      setAdoptedDate(date);
      setAdoptedIosPickerKey((k) => k + 1);
    }
  }, []);

  const pickProfilePhoto = useCallback(async () => {
    let ImagePickerMod: typeof import('expo-image-picker');
    try {
      ImagePickerMod = await import('expo-image-picker');
    } catch {
      Alert.alert(
        '설치 필요',
        'expo-image-picker를 찾을 수 없어요.\n\nnpx expo install expo-image-picker\nnpx expo start -c'
      );
      return;
    }

    const perm = await ImagePickerMod.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 등록하려면 갤러리 접근을 허용해 주세요.');
      return;
    }

    const result = await ImagePickerMod.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.88,
      base64: false,
    });

    if (result.canceled || !result.assets[0]) return;
    setPickedProfileAsset(result.assets[0]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setInitError(null);
      try {
        const row = await fetchLatestCatForProfileEdit();
        if (cancelled) return;
        if (!row) {
          setEditingCatId(null);
          setExistingPhotoUrl(null);
          setPickedProfileAsset(null);
          setInitializing(false);
          return;
        }
        setEditingCatId(row.id);
        setName(row.name ?? '');
        const rep = row.representative_photo_url?.trim();
        const av = row.avatar_url?.trim();
        setExistingPhotoUrl(rep || av || null);
        const br = row.breed?.trim() ?? '';
        setBreed(br && isBreedOption(br) ? br : br ? '기타' : null);
        const g = row.gender;
        setGender(g === 'female' || g === 'male' ? g : null);
        if (row.birth_date) {
          setBirthChoice('know');
          const bd = parseISODate(row.birth_date);
          if (bd) setBirthDate(bd);
          setBirthInputWeb(row.birth_date);
        } else {
          setBirthChoice('unknown');
        }
        if (row.adopted_at) {
          setAdoptedChoice('know');
          const ad = parseISODate(row.adopted_at);
          if (ad) setAdoptedDate(ad);
          setAdoptedInputWeb(row.adopted_at);
        } else {
          setAdoptedChoice('unknown');
        }
      } catch (e) {
        if (!cancelled) {
          setInitError(e instanceof Error ? e.message : '불러오기에 실패했어요.');
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadToken]);

  const saveAndGoHome = useCallback(async () => {
    if (!name.trim() || !breed || !gender) return;

    let birthDateValue: string | null = null;
    if (birthChoice === 'know') {
      if (Platform.OS === 'web') {
        const parsed = parseISODate(birthInputWeb.trim() || birthdayYmd);
        if (!parsed) {
          Alert.alert('생일 확인', 'YYYY-MM-DD 형식으로 입력해 주세요.');
          return;
        }
        birthDateValue = toYmd(parsed);
      } else {
        birthDateValue = birthdayYmd;
      }
    }

    let adoptedAt: string | null = null;
    if (adoptedChoice === 'know') {
      if (Platform.OS === 'web') {
        const parsedAdopted = parseISODate(adoptedInputWeb.trim() || adoptedYmd);
        if (!parsedAdopted) {
          Alert.alert('입양일 확인', 'YYYY-MM-DD 형식으로 입력해 주세요.');
          return;
        }
        adoptedAt = toYmd(parsedAdopted);
      } else {
        adoptedAt = adoptedYmd;
      }
    }

    setSubmitting(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        const sessionMissing =
          userError.name === 'AuthSessionMissingError' ||
          /session missing/i.test(userError.message);
        Alert.alert(
          sessionMissing ? '로그인 세션이 없어요' : '오류',
          sessionMissing
            ? '로그인한 뒤 저장해 주세요. (세션은 기기에 저장되도록 설정되어 있어요.)'
            : userError.message
        );
        return;
      }
      if (!userData.user) {
        Alert.alert(
          '로그인 필요',
          '냥이 프로필을 저장하려면 Supabase Auth로 로그인한 상태여야 해요.'
        );
        return;
      }

      const uid = userData.user.id;

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: uid }, { onConflict: 'id' });

      if (profileError) {
        Alert.alert('프로필 저장 실패', profileError.message);
        return;
      }

      const payload = {
        name: name.trim(),
        breed,
        gender,
        birth_date: birthDateValue,
        adopted_at: adoptedAt,
      };

      const { data: savedCat, error } = editingCatId
        ? await supabase.from('cats').update(payload).eq('id', editingCatId).select('id').single()
        : await supabase.from('cats').insert({ user_id: uid, ...payload }).select('id').single();

      if (error) {
        Alert.alert('저장 실패', error.message);
        return;
      }

      if (!savedCat?.id) {
        Alert.alert('저장 실패', '냥이 정보 id를 확인할 수 없어요.');
        return;
      }

      const catId = savedCat.id;
      if (pickedProfileAsset && catId) {
        try {
          const publicUrl = await uploadCatProfilePhoto(uid, catId, pickedProfileAsset);
          const { error: avatarErr } = await supabase.from('cats').update({ avatar_url: publicUrl }).eq('id', catId);
          if (avatarErr) {
            Alert.alert(
              '사진',
              `프로필은 저장됐지만 사진 URL 반영에 실패했어요.\n${avatarErr.message}`
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : '사진 업로드에 실패했어요.';
          const detail =
            /bucket not found/i.test(msg)
              ? 'Supabase Storage에 cat-photos 버킷이 있는지 확인해 주세요.'
              : msg;
          Alert.alert('사진 업로드', `프로필 정보는 저장됐어요.\n\n${detail}`);
        }
      }

      router.replace('/');
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    breed,
    gender,
    birthChoice,
    birthdayYmd,
    birthInputWeb,
    adoptedChoice,
    adoptedYmd,
    adoptedInputWeb,
    editingCatId,
    pickedProfileAsset,
    router,
  ]);

  const goNext = () => {
    if (step < STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }
    void saveAndGoHome();
  };

  const goPrev = () => {
    if (step > 0) {
      if (step === 4) {
        setBirthChoice(null);
        setShowDatePicker(false);
      }
      if (step === 5) {
        setAdoptedChoice(null);
        setShowAdoptedPicker(false);
      }
      setStep((s) => s - 1);
    }
  };

  const profilePreviewUri = pickedProfileAsset?.uri ?? existingPhotoUrl ?? null;

  const stepTitle = [
    '프로필 사진을 올려줘',
    '이름을 알려줘',
    '품종이 뭐야?',
    '성별은?',
    '생일을 알고 계세요?',
    '입양한 날을 알고 계세요?',
  ][step];

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1 px-5"
        style={{ minHeight: 0 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 4,
          paddingBottom: Math.max(insets.bottom, 8) + 12 + scrollExtraBottom,
        }}
      >
        {!initializing && editingCatId ? (
          <TouchableOpacity
            onPress={() => router.replace('/')}
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel="홈으로 나가기"
            className="mb-2 self-start py-1 active:opacity-70"
          >
            <Text className="text-base font-semibold text-[#7F77DD]">← 홈</Text>
          </TouchableOpacity>
        ) : null}
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-violet-900/60">
            {step + 1} / {STEPS}
          </Text>
          <Text className="text-sm font-medium text-[#7F77DD]">
            {editingCatId ? '냥이 프로필 수정' : '냥이 프로필'}
          </Text>
        </View>
        {editingCatId && !initializing ? (
          <Text className="mb-3 text-center text-sm leading-5 text-violet-600">
            등록된 정보가 있어요. 단계마다 바꿀 수 있어요.
          </Text>
        ) : null}

        <View className="mb-8 flex-row gap-2">
          {Array.from({ length: STEPS }, (_, i) => (
            <View
              key={i}
              className={`h-3 flex-1 rounded-full ${i <= step ? 'bg-[#7F77DD]' : 'bg-violet-200/80'}`}
            />
          ))}
        </View>

        <View className="rounded-[28px] border-2 border-violet-100 bg-white p-6 shadow-sm">
          {initializing ? (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text className="mt-4 text-center text-sm text-violet-600">냥이 정보를 불러오는 중…</Text>
            </View>
          ) : initError ? (
            <View className="py-6">
              <Text className="text-center text-base text-red-600">{initError}</Text>
              <TouchableOpacity
                onPress={() => {
                  setInitError(null);
                  setInitializing(true);
                  setLoadToken((t) => t + 1);
                }}
                className="mt-4 items-center rounded-2xl border-2 border-violet-200 py-3 active:bg-violet-50"
              >
                <Text className="text-sm font-semibold text-[#7F77DD]">다시 불러오기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
          <Text className="text-2xl font-bold text-violet-950">{stepTitle}</Text>

          {step === 0 && (
            <View className="mt-6 items-center">
              <Text className="mb-6 text-center text-base leading-6 text-violet-600">
                홈과 마이에서 보이는 냥이 사진이에요. 나중에 바꿀 수 있어요.
              </Text>
              <TouchableOpacity
                onPress={pickProfilePhoto}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 선택"
                className="items-center"
              >
                {profilePreviewUri ? (
                  <Image
                    source={{ uri: profilePreviewUri }}
                    className="h-40 w-40 rounded-full border-4 border-violet-100 bg-violet-50"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="h-40 w-40 items-center justify-center rounded-full border-2 border-dashed border-violet-200 bg-violet-50/80">
                    <Text className="text-center text-4xl">📷</Text>
                    <Text className="mt-2 text-center text-sm font-semibold text-violet-700">사진 선택</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickProfilePhoto}
                className="mt-5 rounded-2xl border-2 border-[#7F77DD] bg-violet-50/80 px-6 py-3 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel="갤러리에서 사진 고르기"
              >
                <Text className="text-center text-base font-bold text-[#7F77DD]">
                  {profilePreviewUri ? '다른 사진으로 바꾸기' : '갤러리에서 고르기'}
                </Text>
              </TouchableOpacity>
              <Text className="mt-4 text-center text-sm text-violet-400">건너뛰려면 다음을 눌러 주세요</Text>
            </View>
          )}

          {step === 1 && (
            <TextInput
              ref={nameInputRef}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedField(nameInputRef.current)}
              placeholder="예: 모찌"
              placeholderTextColor="#a78bfa"
              className="mt-6 rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-4 text-lg text-violet-950"
              maxLength={32}
              autoFocus
            />
          )}

          {step === 2 && (
            <View className="mt-6 flex-row flex-wrap gap-3">
              {BREEDS.map((b) => (
                <TouchableOpacity
                  key={b}
                  onPress={() => setBreed(b)}
                  className={`rounded-2xl border-2 px-4 py-3 active:opacity-90 ${
                    breed === b
                      ? 'border-[#7F77DD] bg-[#7F77DD]'
                      : 'border-violet-100 bg-violet-50/80'
                  }`}
                >
                  <Text
                    className={`text-center text-base font-semibold ${
                      breed === b ? 'text-white' : 'text-violet-900'
                    }`}
                  >
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 3 && (
            <View className="mt-8 flex-row gap-4">
              {(
                [
                  { key: 'female' as const, label: '여아', emoji: '💖' },
                  { key: 'male' as const, label: '남아', emoji: '💙' },
                ] as const
              ).map(({ key, label, emoji }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setGender(key)}
                  className={`flex-1 items-center rounded-3xl border-2 py-8 active:opacity-90 ${
                    gender === key
                      ? 'border-[#7F77DD] bg-[#7F77DD]'
                      : 'border-violet-100 bg-violet-50/80'
                  }`}
                >
                  <Text className="text-4xl">{emoji}</Text>
                  <Text
                    className={`mt-2 text-lg font-bold ${
                      gender === key ? 'text-white' : 'text-violet-900'
                    }`}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 4 && (
            <View className="mt-6">
              {birthChoice === null && (
                <View className="mt-4 flex-row gap-4">
                  <TouchableOpacity
                    onPress={() => {
                      setBirthChoice('know');
                      setBirthInputWeb('');
                    }}
                    className="flex-1 items-center rounded-3xl border-2 border-[#7F77DD] bg-[#7F77DD] py-6 active:opacity-90"
                  >
                    <Text className="text-lg font-bold text-white">알아요</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setBirthChoice('unknown')}
                    className="flex-1 items-center rounded-3xl border-2 border-violet-100 bg-violet-50/80 py-6 active:opacity-90"
                  >
                    <Text className="text-lg font-bold text-violet-900">몰라요</Text>
                  </TouchableOpacity>
                </View>
              )}

              {birthChoice === 'unknown' && (
                <View className="mt-4">
                  <Text className="text-center text-base text-violet-600">
                    괜찮아요. 생일 없이 저장할게요.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setBirthChoice('know');
                      setBirthInputWeb('');
                      setBirthIosPickerKey((k) => k + 1);
                    }}
                    className="mt-4 items-center rounded-2xl border-2 border-[#7F77DD] bg-violet-50/80 py-4 active:opacity-90"
                  >
                    <Text className="text-base font-bold text-[#7F77DD]">생일을 입력할게요</Text>
                  </TouchableOpacity>
                </View>
              )}

              {birthChoice === 'know' && (
                <View className="mt-4">
                  {Platform.OS === 'web' ? (
                    <>
                      <TextInput
                        ref={birthWebInputRef}
                        value={birthInputWeb}
                        onChangeText={setBirthInputWeb}
                        onFocus={() => setFocusedField(birthWebInputRef.current)}
                        placeholder={birthdayYmd}
                        placeholderTextColor="#a78bfa"
                        className="rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-4 text-lg text-violet-950"
                      />
                      <Text className="mt-2 text-sm text-violet-400">YYYY-MM-DD 형식으로 입력해 주세요</Text>
                    </>
                  ) : Platform.OS === 'ios' ? (
                    <View className="mt-1 self-stretch overflow-hidden rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-2 py-1">
                      <DateTimePicker
                        key={birthIosPickerKey}
                        value={birthDate}
                        mode="date"
                        display="compact"
                        locale={IOS_DATE_PICKER_LOCALE}
                        onChange={onDateChange}
                        maximumDate={new Date()}
                        themeVariant="light"
                      />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        className="rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-4 active:opacity-80"
                      >
                        <Text className="text-center text-xl font-semibold text-violet-950">
                          {birthdayDisplay}
                        </Text>
                        <Text className="mt-1 text-center text-sm text-violet-400">탭해서 날짜 변경</Text>
                      </TouchableOpacity>
                      {showDatePicker && (
                        <DateTimePicker
                          value={birthDate}
                          mode="date"
                          display="default"
                          locale={IOS_DATE_PICKER_LOCALE}
                          onChange={onDateChange}
                          maximumDate={new Date()}
                          themeVariant="light"
                        />
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {step === 5 && (
            <View className="mt-6">
              {adoptedChoice === null && (
                <View className="mt-4 flex-row gap-4">
                  <TouchableOpacity
                    onPress={() => {
                      setAdoptedChoice('know');
                      setAdoptedInputWeb('');
                    }}
                    className="flex-1 items-center rounded-3xl border-2 border-[#7F77DD] bg-[#7F77DD] py-6 active:opacity-90"
                  >
                    <Text className="text-lg font-bold text-white">알아요</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setAdoptedChoice('unknown')}
                    className="flex-1 items-center rounded-3xl border-2 border-violet-100 bg-violet-50/80 py-6 active:opacity-90"
                  >
                    <Text className="text-lg font-bold text-violet-900">몰라요</Text>
                  </TouchableOpacity>
                </View>
              )}

              {adoptedChoice === 'unknown' && (
                <View className="mt-4">
                  <Text className="text-center text-base text-violet-600">
                    괜찮아요. 입양일 없이 저장할게요.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setAdoptedChoice('know');
                      setAdoptedInputWeb('');
                      setAdoptedIosPickerKey((k) => k + 1);
                    }}
                    className="mt-4 items-center rounded-2xl border-2 border-[#7F77DD] bg-violet-50/80 py-4 active:opacity-90"
                  >
                    <Text className="text-base font-bold text-[#7F77DD]">입양일을 입력할게요</Text>
                  </TouchableOpacity>
                </View>
              )}

              {adoptedChoice === 'know' && (
                <View className="mt-4">
                  {Platform.OS === 'web' ? (
                    <>
                      <TextInput
                        ref={adoptedWebInputRef}
                        value={adoptedInputWeb}
                        onChangeText={setAdoptedInputWeb}
                        onFocus={() => setFocusedField(adoptedWebInputRef.current)}
                        placeholder={adoptedYmd}
                        placeholderTextColor="#a78bfa"
                        className="rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-4 text-lg text-violet-950"
                      />
                      <Text className="mt-2 text-sm text-violet-400">YYYY-MM-DD 형식으로 입력해 주세요</Text>
                    </>
                  ) : Platform.OS === 'ios' ? (
                    <View className="mt-1 self-stretch overflow-hidden rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-2 py-1">
                      <DateTimePicker
                        key={adoptedIosPickerKey}
                        value={adoptedDate}
                        mode="date"
                        display="compact"
                        locale={IOS_DATE_PICKER_LOCALE}
                        onChange={onAdoptedDateChange}
                        maximumDate={new Date()}
                        themeVariant="light"
                      />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => setShowAdoptedPicker(true)}
                        className="rounded-2xl border-2 border-violet-100 bg-violet-50/50 px-4 py-4 active:opacity-80"
                      >
                        <Text className="text-center text-xl font-semibold text-violet-950">
                          {adoptedDisplay}
                        </Text>
                        <Text className="mt-1 text-center text-sm text-violet-400">탭해서 입양일 변경</Text>
                      </TouchableOpacity>
                      {showAdoptedPicker && (
                        <DateTimePicker
                          value={adoptedDate}
                          mode="date"
                          display="default"
                          locale={IOS_DATE_PICKER_LOCALE}
                          onChange={onAdoptedDateChange}
                          maximumDate={new Date()}
                          themeVariant="light"
                        />
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )}
            </>
          )}
        </View>
      </ScrollView>

      <View
        className="flex-row gap-3 border-t border-violet-100 bg-white px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 8) + 8 }}
      >
        <TouchableOpacity
          onPress={goPrev}
          disabled={step === 0 || initializing}
          className={`flex-1 items-center rounded-2xl border-2 border-violet-200 py-4 ${
            step === 0 || initializing ? 'opacity-40' : 'active:bg-violet-50'
          }`}
        >
          <Text className="text-base font-bold text-violet-800">이전</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goNext}
          disabled={!canGoNext || submitting || initializing || Boolean(initError)}
          style={{ backgroundColor: PRIMARY }}
          className={`flex-1 items-center rounded-2xl py-4 ${!canGoNext || submitting || initializing || initError ? 'opacity-50' : 'active:opacity-90'}`}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-bold text-white">
              {step === STEPS - 1 ? (editingCatId ? '저장' : '완료') : '다음'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ProfileSetupScreen() {
  return (
    <SmartKeyboardScreen className="flex-1 bg-violet-50">
      <ProfileSetupScreenInner />
    </SmartKeyboardScreen>
  );
}
