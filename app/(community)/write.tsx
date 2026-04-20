import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SmartKeyboardScreen,
  useSmartKeyboardFieldFocus,
  useSmartKeyboardScrollExtraBottom,
} from '../../components/SmartKeyboardScreen';
import { processPickedImageForUpload, thumbnailStoragePathFromMainPath } from '../../lib/image-upload';
import {
  COMMUNITY_WRITE_CHANNELS,
  fetchPostById,
  normalizePostImageUrls,
  type PostChannelDb,
  updatePost,
} from '../../lib/community-queries';
import { fetchLatestCat } from '../../lib/fetch-latest-cat';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';
const MAX_POST_IMAGES = 6;

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

const MAX_VIDEO_URL_LEN = 2048;

/** 비어 있으면 통과(선택). 값이 있으면 http(s) URL만 허용 */
function optionalVideoUrlError(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0) return null;
  if (s.length > MAX_VIDEO_URL_LEN) {
    return `링크는 ${MAX_VIDEO_URL_LEN}자 이하로 입력해 주세요.`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'http 또는 https로 시작하는 주소만 입력할 수 있어요.';
    }
    if (!u.hostname || u.hostname.length < 2) {
      return '도메인이 있는 주소인지 확인해 주세요.';
    }
    return null;
  } catch {
    return 'URL 형식이 올바르지 않아요. (예: https://www.youtube.com/watch?v=…)';
  }
}

function CommunityWriteScreenInner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editPostId?: string | string[] }>();
  const editPostId = firstParam(params.editPostId);
  const isEdit = Boolean(editPostId);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [channelLabel, setChannelLabel] = useState(COMMUNITY_WRITE_CHANNELS[0].label);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyInputRef = useRef<TextInput>(null);
  const videoInputRef = useRef<TextInput>(null);
  const setFocusedField = useSmartKeyboardFieldFocus();
  const scrollExtraBottom = useSmartKeyboardScrollExtraBottom();

  const { data: cat, isPending: catPending } = useQuery({
    queryKey: ['home-cat'],
    queryFn: fetchLatestCat,
  });

  const existingPostQuery = useQuery({
    queryKey: ['post-for-edit', editPostId],
    queryFn: () => fetchPostById(editPostId),
    enabled: isEdit,
  });

  const hydratedForPostId = useRef<string | null>(null);
  useEffect(() => {
    if (!isEdit) hydratedForPostId.current = null;
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit || !existingPostQuery.data) return;
    if (hydratedForPostId.current === editPostId) return;
    hydratedForPostId.current = editPostId;
    const p = existingPostQuery.data;
    setBody(p.body ?? '');
    setVideoUrl(p.video_url?.trim() ?? '');
    setImageUrls(normalizePostImageUrls(p.image_urls));
    const label = COMMUNITY_WRITE_CHANNELS.find((c) => c.db === p.channel)?.label;
    setChannelLabel(label ?? COMMUNITY_WRITE_CHANNELS[0].label);
  }, [isEdit, editPostId, existingPostQuery.data]);

  useEffect(() => {
    const post = existingPostQuery.data;
    if (!isEdit || existingPostQuery.isPending || !post) return;
    let cancelled = false;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (cancelled || !uid) return;
      if (post.user_id !== uid) {
        Alert.alert('권한 없음', '본인이 작성한 글만 수정할 수 있어요.');
        router.back();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, existingPostQuery.isPending, existingPostQuery.data, router]);

  const channelDb = useMemo((): PostChannelDb => {
    return COMMUNITY_WRITE_CHANNELS.find((c) => c.label === channelLabel)?.db ?? 'daily';
  }, [channelLabel]);

  const videoUrlError = useMemo(
    () => (videoUrl.trim().length > 0 ? optionalVideoUrlError(videoUrl) : null),
    [videoUrl],
  );

  const pickAndUploadImage = useCallback(async () => {
    if (imageUrls.length >= MAX_POST_IMAGES) {
      Alert.alert('사진', `사진은 최대 ${MAX_POST_IMAGES}장까지 첨부할 수 있어요.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 첨부하려면 갤러리 접근을 허용해 주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      Alert.alert('로그인', '다시 로그인한 뒤 시도해 주세요.');
      return;
    }

    setUploadingImage(true);
    try {
      let processed;
      try {
        processed = await processPickedImageForUpload(asset);
      } catch (e) {
        Alert.alert('이미지', e instanceof Error ? e.message : '이미지를 처리하지 못했어요.');
        return;
      }

      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${processed.ext}`;
      const thumbPath = thumbnailStoragePathFromMainPath(path);

      const { error: upErr } = await supabase.storage.from('post-media').upload(path, processed.mainBody, {
        contentType: processed.mime,
        upsert: false,
      });
      if (upErr) {
        if (__DEV__) console.warn('[post-media upload]', upErr);
        const msg = upErr.message ?? '';
        const detail = /bucket not found/i.test(msg)
          ? 'Storage 버킷 post-media가 없습니다. supabase/migrations/20260420150000_posts_media_profiles_avatar.sql 을 적용해 주세요.'
          : msg;
        Alert.alert('업로드 실패', detail);
        return;
      }

      const { error: thumbErr } = await supabase.storage.from('post-media').upload(thumbPath, processed.thumbBody, {
        contentType: processed.mime,
        upsert: false,
      });
      if (thumbErr && __DEV__) console.warn('[post-media thumb upload]', thumbErr);

      const { data: pub } = supabase.storage.from('post-media').getPublicUrl(path);
      setImageUrls((prev) => [...prev, pub.publicUrl]);
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '사진을 올리지 못했어요.');
    } finally {
      setUploadingImage(false);
    }
  }, [imageUrls.length]);

  const removeImageAt = useCallback((index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const save = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      Alert.alert('내용을 입력해 주세요', '본문이 비어 있어요.');
      return;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.log('[community write] getUser error (full)', userErr);
      Alert.alert('로그인', userErr.message);
      return;
    }
    const uid = userData.user?.id;
    if (!uid) {
      Alert.alert('로그인', '다시 로그인한 뒤 시도해 주세요.');
      return;
    }

    const catId = cat?.id ?? null;
    if (!isEdit && !catId) {
      Alert.alert('냥이 정보 필요', '냥이 프로필을 먼저 등록한 뒤 글을 쓸 수 있어요.');
      return;
    }

    const vUrl = videoUrl.trim();
    const videoErr = optionalVideoUrlError(videoUrl);
    if (videoErr) {
      Alert.alert('동영상 링크', videoErr);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && editPostId) {
        await updatePost(editPostId, {
          channel: channelDb,
          body: trimmed,
          image_urls: imageUrls,
          video_url: vUrl.length > 0 ? vUrl : null,
        });
      } else {
        const payload: Record<string, unknown> = {
          user_id: uid,
          cat_id: catId,
          channel: channelDb,
          body: trimmed,
          agent_summary: null,
          image_urls: imageUrls,
          video_url: vUrl.length > 0 ? vUrl : null,
        };
        const { error } = await supabase.from('posts').insert(payload);

        if (error) {
          console.log('[community write] insert error (full object)', error);
          console.log('[community write] insert error (serialized)', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
          try {
            console.log('[community write] insert error (JSON)', JSON.stringify(error, Object.getOwnPropertyNames(error)));
          } catch {
            console.log('[community write] insert error JSON stringify failed');
          }
          const hint =
            /image_urls|video_url|column/i.test(error.message ?? '')
              ? `${error.message}\n\posts 테이블에 image_urls, video_url 컬럼 마이그레이션을 적용했는지 확인해 주세요.`
              : (error.message ?? '글을 저장하지 못했어요.');
          Alert.alert('저장 실패', hint);
          return;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      await queryClient.invalidateQueries({ queryKey: ['community-best-posts'] });
      await queryClient.invalidateQueries({ queryKey: ['home-posts-latest'] });
      await queryClient.invalidateQueries({ queryKey: ['home-posts-mine'] });
      await queryClient.invalidateQueries({ queryKey: ['post-detail', editPostId] });
      await queryClient.invalidateQueries({ queryKey: ['post-for-edit', editPostId] });
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '처리하지 못했어요.');
    } finally {
      setSaving(false);
    }
  }, [body, cat?.id, channelDb, editPostId, imageUrls, isEdit, queryClient, router, videoUrl]);

  return (
    <Fragment>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-violet-50">
        <View className="flex-1" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center justify-between border-b border-violet-100 bg-white px-4 py-3 shrink-0">
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={12}
              activeOpacity={0.75}
              className="flex-row items-center gap-1 py-1"
              disabled={saving}
            >
              <Ionicons name="chevron-back" size={22} color={PRIMARY} />
              <Text className="text-base font-semibold text-[#7F77DD]">닫기</Text>
            </TouchableOpacity>
            <Text className="text-base font-bold text-violet-950">{isEdit ? '글 수정' : '글쓰기'}</Text>
            <TouchableOpacity
              onPress={() => void save()}
              hitSlop={12}
              activeOpacity={0.75}
              disabled={saving || catPending || uploadingImage}
              className="min-w-[52px] items-end py-1"
            >
              {saving ? (
                <ActivityIndicator size="small" color={PRIMARY} />
              ) : (
                <Text className="text-base font-bold text-[#7F77DD]">저장</Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="min-h-0 flex-1 px-4">
            <ScrollView
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingBottom: 16 + scrollExtraBottom,
              }}
            >
            {isEdit && existingPostQuery.isPending ? (
              <View className="mt-8 items-center py-8">
                <ActivityIndicator color={PRIMARY} />
                <Text className="mt-3 text-sm text-violet-600">글을 불러오는 중…</Text>
              </View>
            ) : null}
            {isEdit && existingPostQuery.isError ? (
              <Text className="mt-4 text-sm text-red-600">{(existingPostQuery.error as Error).message}</Text>
            ) : null}
            {isEdit && !existingPostQuery.isPending && !existingPostQuery.isError && !existingPostQuery.data ? (
              <Text className="mt-4 text-center text-sm text-violet-600">글을 찾을 수 없어요.</Text>
            ) : null}

            <Text className="mt-4 text-sm font-semibold text-violet-800">채널</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {COMMUNITY_WRITE_CHANNELS.map((c) => {
                const selected = c.label === channelLabel;
                return (
                  <TouchableOpacity
                    key={c.label}
                    onPress={() => setChannelLabel(c.label)}
                    activeOpacity={0.85}
                    style={{ backgroundColor: selected ? PRIMARY : '#fff' }}
                    className={`rounded-full border-2 px-3 py-2 ${
                      selected ? 'border-[#7F77DD]' : 'border-violet-100'
                    }`}
                  >
                    <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-violet-800'}`}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {catPending ? (
              <View className="mt-4 flex-row items-center gap-2">
                <ActivityIndicator size="small" color={PRIMARY} />
                <Text className="text-sm text-violet-600">냥이 정보를 불러오는 중…</Text>
              </View>
            ) : !cat ? (
              <Text className="mt-4 text-sm text-amber-700">
                등록된 냥이가 없으면 글을 저장할 수 없어요. 마이 탭에서 프로필을 등록해 주세요.
              </Text>
            ) : null}
            </ScrollView>
          </View>

          <View
            className="border-t border-violet-200 bg-violet-100 px-4 pt-2"
            style={{
              paddingBottom:
                scrollExtraBottom > 0 ? 8 : Math.max(insets.bottom, 6),
            }}
          >
            <Text className="text-xs font-semibold text-violet-700">동영상 링크 (선택)</Text>
            <TextInput
              ref={videoInputRef}
              value={videoUrl}
              onChangeText={setVideoUrl}
              onFocus={() => setFocusedField(videoInputRef.current)}
              placeholder="예: https://youtu.be/… 또는 YouTube 전체 URL"
              placeholderTextColor="#8b7fd8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className={`mt-1 rounded-xl border-2 bg-violet-50 px-3 py-2 text-sm text-violet-950 ${
                videoUrlError ? 'border-rose-400' : 'border-violet-300'
              }`}
            />
            {videoUrlError ? (
              <Text className="mt-1 text-xs font-medium text-rose-600">{videoUrlError}</Text>
            ) : (
              <Text className="mt-1 text-[11px] text-violet-500">비워 두면 링크 없이 저장돼요.</Text>
            )}

            <Text className="mt-3 text-xs font-semibold text-violet-700">사진 첨부 (선택)</Text>
            <Text className="mt-0.5 text-[11px] text-violet-500">최대 {MAX_POST_IMAGES}장</Text>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              className="mt-1.5"
              style={{ minHeight: 88 }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="flex-row gap-2 py-1">
                {imageUrls.map((uri, idx) => (
                  <View key={`${uri}-${idx}`} className="relative">
                    <Image source={{ uri }} className="h-20 w-20 rounded-xl bg-violet-100" resizeMode="cover" />
                    <TouchableOpacity
                      onPress={() => removeImageAt(idx)}
                      activeOpacity={0.85}
                      className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full bg-violet-900/90"
                      hitSlop={6}
                    >
                      <Text className="text-xs font-bold text-white">×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {imageUrls.length < MAX_POST_IMAGES ? (
                  <TouchableOpacity
                    onPress={() => void pickAndUploadImage()}
                    disabled={uploadingImage || saving}
                    activeOpacity={0.85}
                    className="h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/80"
                  >
                    {uploadingImage ? (
                      <ActivityIndicator color={PRIMARY} />
                    ) : (
                      <Text className="text-2xl font-light text-violet-400">+</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>

            <Text className="mt-2 text-xs font-semibold text-violet-700">본문</Text>
            <View className="mt-1 flex-row items-end gap-2">
              <TextInput
                ref={bodyInputRef}
                value={body}
                onChangeText={setBody}
                onFocus={() => setFocusedField(bodyInputRef.current)}
                placeholder="커뮤니티에 올릴 이야기를 적어 주세요."
                placeholderTextColor="#8b7fd8"
                multiline
                textAlignVertical="top"
                className="max-h-32 min-h-[88px] flex-1 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 text-base leading-6 text-violet-950"
              />
            </View>
          </View>
        </View>
      </View>
    </Fragment>
  );
}

export default function CommunityWriteScreen() {
  return (
    <SmartKeyboardScreen className="flex-1 bg-violet-50">
      <CommunityWriteScreenInner />
    </SmartKeyboardScreen>
  );
}
