import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageZoomModal, type ImageZoomSlideMeta } from '../../components/ImageZoomModal';
import {
  processPickedImageForUpload,
  thumbnailPublicUrlFromFullPublicUrl,
  thumbnailStoragePathFromMainPath,
  type ProcessedImageBuffers,
} from '../../lib/image-upload';
import {
  challengePhotoPathFromPublicUrl,
  fetchActiveChallenge,
  fetchChallengeById,
  fetchChallengeEntries,
  fetchChallengeEntryForUser,
  type ChallengeEntryRow,
} from '../../lib/challenge-queries';
import { truncateCatName, truncateUserNickname } from '../../lib/display-strings';
import { getNyanBtiArchetype } from '../../lib/nyan-bti-archetypes';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

function challengeBtiChipText(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const t = code.trim();
  const arc = getNyanBtiArchetype(t);
  if (arc) return `냥BTI ${arc.nickname}`;
  if (t.length <= 10) return `냥BTI ${t}`;
  return `냥BTI ${t.slice(0, 8)}…`;
}

/** 냥BTI 칩 안 텍스트: `냥BTI {별명}`에서 앞의 "냥BTI "만 제거 */
function challengeBtiChipInnerOnly(code: string | null | undefined): string {
  const t = challengeBtiChipText(code)?.trim();
  if (!t) return '';
  if (t.startsWith('냥BTI ')) return t.slice(5).trim();
  return t;
}

function challengeGridThumbSource(fullUrl: string): string {
  if (!/\/object\/public\/challenge-photos\//.test(fullUrl) || /_thumb\./i.test(fullUrl)) return fullUrl;
  return thumbnailPublicUrlFromFullPublicUrl(fullUrl);
}

function ChallengeGridImage({ fullUrl }: { fullUrl: string }) {
  const initial = useMemo(() => challengeGridThumbSource(fullUrl), [fullUrl]);
  const [uri, setUri] = useState(initial);
  useEffect(() => {
    setUri(initial);
  }, [initial]);
  return (
    <Image
      source={{ uri }}
      className="h-full w-full"
      resizeMode="cover"
      onError={() => {
        if (uri !== fullUrl) setUri(fullUrl);
      }}
    />
  );
}

function dDayLabel(endIso: string): string {
  const end = new Date(endIso);
  const now = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((endDay.getTime() - nowDay.getTime()) / 86400000);
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-day';
  return `D-${diff}`;
}

type SubmitChallengePayload = {
  challengeId: string;
  uid: string;
  processed: ProcessedImageBuffers;
  caption: string;
};

type UpdateChallengePayload = {
  entryId: string;
  challengeId: string;
  uid: string;
  caption: string;
  imageDirty: boolean;
  processed: ProcessedImageBuffers | null;
  previousPhotoUrl: string;
};

export default function ChallengeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id: idParam } = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = firstParam(idParam);

  const challengeQuery = useQuery({
    queryKey: ['challenge-detail', routeId ?? 'active'],
    queryFn: async () => {
      if (routeId) return fetchChallengeById(routeId);
      return fetchActiveChallenge();
    },
  });

  const challenge = challengeQuery.data ?? null;
  const challengeId = challenge?.id;

  const entriesQuery = useQuery({
    queryKey: ['challenge-entries', challengeId],
    queryFn: () => (challengeId ? fetchChallengeEntries(challengeId) : Promise.resolve([])),
    enabled: Boolean(challengeId),
  });

  const sessionQuery = useQuery({
    queryKey: ['auth-session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const uid = sessionQuery.data?.user?.id;

  const myEntryQuery = useQuery({
    queryKey: ['challenge-my-entry', challengeId, uid],
    queryFn: () => fetchChallengeEntryForUser(challengeId!, uid!),
    enabled: Boolean(challengeId && uid),
  });
  const myEntry = myEntryQuery.data ?? null;

  const entries = entriesQuery.data ?? [];

  /** 목록에 이미 내 행이 있으면 my-entry 쿼리보다 먼저 쓸 수 있음 → 수정 폼 캡션/삭제 일치 */
  const myEntryResolved = useMemo(() => {
    if (!uid || !challengeId) return null;
    if (myEntry) return myEntry;
    return entries.find((x) => x.user_id === uid) ?? null;
  }, [myEntry, entries, uid, challengeId]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [previousPhotoUrl, setPreviousPhotoUrl] = useState<string | null>(null);
  const [imageDirty, setImageDirty] = useState(false);
  const [caption, setCaption] = useState('');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedProcessed, setPickedProcessed] = useState<ProcessedImageBuffers | null>(null);

  const [zoomGallery, setZoomGallery] = useState<{
    urls: string[];
    index: number;
    slidesMeta: ImageZoomSlideMeta[];
  } | null>(null);

  const entriesListSignature = useMemo(
    () =>
      entries
        .map(
          (e) =>
            `${e.id}:${e.photo_url}:${e.caption ?? ''}:${e.author_nickname ?? ''}:${e.cat_name ?? ''}:${e.nyan_bti_type ?? ''}`
        )
        .join('|'),
    [entries]
  );

  const submitMutation = useMutation({
    mutationFn: async (vars: SubmitChallengePayload) => {
      const { challengeId: cid, uid: u, processed: proc, caption: cap } = vars;
      if (!cid || !u) throw new Error('로그인이 필요해요.');

      const path = `${u}/${cid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${proc.ext}`;
      const thumbPath = thumbnailStoragePathFromMainPath(path);

      const { error: upErr } = await supabase.storage.from('challenge-photos').upload(path, proc.mainBody, {
        contentType: proc.mime,
        upsert: false,
      });
      if (upErr) {
        const msg = upErr.message ?? '';
        if (/bucket not found/i.test(msg)) {
          throw new Error('Storage 버킷 challenge-photos가 없습니다. 마이그레이션을 적용해 주세요.');
        }
        throw upErr;
      }

      const { error: thumbErr } = await supabase.storage.from('challenge-photos').upload(thumbPath, proc.thumbBody, {
        contentType: proc.mime,
        upsert: false,
      });
      if (thumbErr && __DEV__) console.warn('[challenge-photos thumb]', thumbErr);

      const { data: pub } = supabase.storage.from('challenge-photos').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: insErr } = await supabase.from('challenge_entries').insert({
        challenge_id: cid,
        user_id: u,
        photo_url: publicUrl,
        caption: cap.trim() || null,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          throw new Error('이미 이 챌린지에 참여했어요.');
        }
        throw insErr;
      }
    },
    onSuccess: async (_data, vars) => {
      setModalOpen(false);
      setCaption('');
      setPickedUri(null);
      setPickedProcessed(null);
      await queryClient.invalidateQueries({ queryKey: ['challenge-my-entry', vars.challengeId, vars.uid] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-entries', vars.challengeId] });
      await queryClient.invalidateQueries({ queryKey: ['active-challenge'] });
      await queryClient.invalidateQueries({ queryKey: ['open-challenges-with-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['my-challenge-participations-page'] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-joined'] });
      await queryClient.refetchQueries({ queryKey: ['challenge-my-entry', vars.challengeId, vars.uid] });
      await queryClient.refetchQueries({ queryKey: ['challenge-entries', vars.challengeId] });
    },
    onError: (e: Error) => {
      Alert.alert('참여 실패', e.message || '다시 시도해 주세요.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: UpdateChallengePayload) => {
      const cap = vars.caption.trim() || null;
      const { entryId, challengeId: cid, uid: u, imageDirty: dirty, processed: proc, previousPhotoUrl } = vars;

      if (dirty && proc) {
        const path = `${u}/${cid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${proc.ext}`;
        const thumbPath = thumbnailStoragePathFromMainPath(path);

        const { error: upErr } = await supabase.storage.from('challenge-photos').upload(path, proc.mainBody, {
          contentType: proc.mime,
          upsert: false,
        });
        if (upErr) throw upErr;

        const { error: thumbErr } = await supabase.storage.from('challenge-photos').upload(thumbPath, proc.thumbBody, {
          contentType: proc.mime,
          upsert: false,
        });
        if (thumbErr && __DEV__) console.warn('[challenge-photos thumb]', thumbErr);

        const { data: pub } = supabase.storage.from('challenge-photos').getPublicUrl(path);
        const newUrl = pub.publicUrl;

        const oldPath = challengePhotoPathFromPublicUrl(previousPhotoUrl);
        if (oldPath) {
          const oldThumb = thumbnailStoragePathFromMainPath(oldPath);
          const { error: rmErr } = await supabase.storage.from('challenge-photos').remove([oldPath, oldThumb]);
          if (rmErr && __DEV__) console.warn('[challenge-photos remove]', rmErr);
        }

        const { error: rowErr } = await supabase
          .from('challenge_entries')
          .update({ photo_url: newUrl, caption: cap })
          .eq('id', entryId);
        if (rowErr) throw rowErr;
      } else {
        const { error: rowErr } = await supabase.from('challenge_entries').update({ caption: cap }).eq('id', entryId);
        if (rowErr) throw rowErr;
      }
    },
    onSuccess: async (_data, vars) => {
      setModalOpen(false);
      setEditingEntryId(null);
      setImageDirty(false);
      setPreviousPhotoUrl(null);
      await queryClient.invalidateQueries({ queryKey: ['challenge-my-entry', vars.challengeId, vars.uid] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-entries', vars.challengeId] });
      await queryClient.invalidateQueries({ queryKey: ['active-challenge'] });
      await queryClient.invalidateQueries({ queryKey: ['open-challenges-with-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['my-challenge-participations-page'] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-joined'] });
      await queryClient.refetchQueries({ queryKey: ['challenge-my-entry', vars.challengeId, vars.uid] });
      await queryClient.refetchQueries({ queryKey: ['challenge-entries', vars.challengeId] });
    },
    onError: (e: Error) => {
      Alert.alert('수정 실패', e.message || '다시 시도해 주세요.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (vars: { entryId: string; photoUrl: string; challengeId: string; uid: string }) => {
      const p = challengePhotoPathFromPublicUrl(vars.photoUrl);
      if (p) {
        const pThumb = thumbnailStoragePathFromMainPath(p);
        const { error: rmErr } = await supabase.storage.from('challenge-photos').remove([p, pThumb]);
        if (rmErr && __DEV__) console.warn('[challenge-photos delete]', rmErr);
      }
      const { error } = await supabase.from('challenge_entries').delete().eq('id', vars.entryId);
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      setModalOpen(false);
      setEditingEntryId(null);
      setImageDirty(false);
      setPreviousPhotoUrl(null);
      await queryClient.invalidateQueries({ queryKey: ['challenge-my-entry', vars.challengeId, vars.uid] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-entries', vars.challengeId] });
      await queryClient.invalidateQueries({ queryKey: ['active-challenge'] });
      await queryClient.invalidateQueries({ queryKey: ['open-challenges-with-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['my-challenge-participations-page'] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-joined'] });
      await queryClient.refetchQueries({ queryKey: ['challenge-my-entry', vars.challengeId, vars.uid] });
      await queryClient.refetchQueries({ queryKey: ['challenge-entries', vars.challengeId] });
    },
    onError: (e: Error) => {
      Alert.alert('삭제 실패', e.message || '다시 시도해 주세요.');
    },
  });

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 첨부하려면 갤러리 접근을 허용해 주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const processed = await processPickedImageForUpload(asset);
      setPickedProcessed(processed);
      setPickedUri(asset.uri);
      setImageDirty(true);
    } catch (e) {
      Alert.alert('이미지', e instanceof Error ? e.message : '이미지를 처리하지 못했어요.');
    }
  }, []);

  const openCreateModal = useCallback(() => {
    if (!uid) {
      Alert.alert('로그인', '로그인한 뒤 참여할 수 있어요.');
      return;
    }
    if (myEntryResolved) return;
    setModalMode('create');
    setEditingEntryId(null);
    setPreviousPhotoUrl(null);
    setImageDirty(false);
    setCaption('');
    setPickedUri(null);
    setPickedProcessed(null);
    setModalOpen(true);
  }, [uid, myEntryResolved]);

  const openEditModal = useCallback(() => {
    if (!uid) {
      Alert.alert('로그인', '로그인한 뒤 수정할 수 있어요.');
      return;
    }
    const e = myEntryResolved;
    if (!e) return;
    setModalMode('edit');
    setEditingEntryId(e.id);
    setPreviousPhotoUrl(e.photo_url);
    setImageDirty(false);
    setCaption(e.caption ?? '');
    setPickedUri(e.photo_url);
    setPickedProcessed(null);
    setModalOpen(true);
  }, [uid, myEntryResolved]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingEntryId(null);
    setPreviousPhotoUrl(null);
    setImageDirty(false);
  }, []);

  const confirmDeleteEntry = useCallback(() => {
    const e = myEntryResolved;
    const cid = challengeId;
    const u = uid;
    if (!e || !cid || !u) return;
    const entryId = e.id;
    const photoUrl = e.photo_url;
    Alert.alert('참여 삭제', '이 챌린지 참여를 삭제할까요? 사진도 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          deleteMutation.mutate({ entryId, photoUrl, challengeId: cid, uid: u }),
      },
    ]);
  }, [myEntryResolved, challengeId, uid]);

  const headerBlock = useMemo(
    () => (
      <View className="px-4 pb-4 pt-2">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          activeOpacity={0.75}
          className="mb-4 flex-row items-center gap-1 self-start"
        >
          <Ionicons name="chevron-back" size={22} color={PRIMARY} />
          <Text className="text-base font-semibold" style={{ color: PRIMARY }}>
            뒤로
          </Text>
        </TouchableOpacity>

        {challengeQuery.isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : challengeQuery.isError ? (
          <Text className="text-center text-red-600">{(challengeQuery.error as Error).message}</Text>
        ) : !challenge ? (
          <Text className="text-center text-violet-700">진행 중인 챌린지가 없어요.</Text>
        ) : (
          <>
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-2xl font-bold leading-8 text-violet-950">{challenge.title}</Text>
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${PRIMARY}22` }}>
                <Text className="text-sm font-bold" style={{ color: PRIMARY }}>
                  {dDayLabel(challenge.end_date)}
                </Text>
              </View>
            </View>
            {challenge.description ? (
              <Text className="mt-3 text-base leading-6 text-violet-800">{challenge.description}</Text>
            ) : null}
            <Text className="mt-2 text-sm text-violet-500">
              마감 {new Date(challenge.end_date).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
          </>
        )}
      </View>
    ),
    [challenge, challengeQuery.isPending, challengeQuery.isError, challengeQuery.error, router]
  );

  const emptyBlock = useMemo(
    () => (
      <View className="items-center px-6 py-12">
        <Text className="text-center text-base text-violet-600">첫 번째 참여자가 되어보세요!</Text>
      </View>
    ),
    []
  );

  const gridGap = 8;
  const gridPad = 16;
  const cellSize = Math.floor((windowWidth - gridPad * 2 - gridGap * 2) / 3);

  const renderEntry = useCallback(
    ({ item }: { item: ChallengeEntryRow }) => {
      const mine = Boolean(uid && item.user_id === uid);
      return (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() =>
            setZoomGallery({
              urls: entries.map((e) => e.photo_url),
              index: Math.max(0, entries.findIndex((e) => e.id === item.id)),
              slidesMeta: entries.map(
                (e): ImageZoomSlideMeta => ({
                  caption: e.caption,
                  challengeTwoRow: {
                    btiChipLabel: challengeBtiChipInnerOnly(e.nyan_bti_type),
                    catName: e.cat_name?.trim() ? truncateCatName(e.cat_name.trim()) : '냥이',
                    ownerNickname: truncateUserNickname(e.author_nickname?.trim() || '냥집사'),
                  },
                })
              ),
            })
          }
          className="mb-2 overflow-hidden rounded-xl bg-violet-100"
          style={{
            width: cellSize,
            height: cellSize,
            borderWidth: mine ? 2 : 0,
            borderColor: mine ? PRIMARY : 'transparent',
          }}
        >
          <ChallengeGridImage key={`${item.id}-${item.photo_url}`} fullUrl={item.photo_url} />
        </TouchableOpacity>
      );
    },
    [cellSize, uid, entries]
  );

  return (
    <View className="flex-1 bg-violet-50" style={{ paddingTop: insets.top }}>
      <FlatList
        data={entries}
        extraData={entriesListSignature}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={{ gap: gridGap, marginBottom: 0 }}
        ListHeaderComponent={
          <>
            {headerBlock}
            <Text className="px-4 pb-2 text-sm font-semibold text-violet-600">참여 사진</Text>
          </>
        }
        ListEmptyComponent={
          entriesQuery.isPending ? (
            <View className="py-12">
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : (
            emptyBlock
          )
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        renderItem={renderEntry}
      />

      {challenge ? (
        <View
          className="absolute left-0 right-0 border-t border-violet-100 bg-white px-4 pt-3"
          style={{ bottom: 0, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <TouchableOpacity
            onPress={myEntryResolved ? openEditModal : openCreateModal}
            disabled={submitMutation.isPending || updateMutation.isPending || deleteMutation.isPending}
            activeOpacity={0.9}
            style={{ backgroundColor: PRIMARY }}
            className="items-center rounded-2xl py-4 disabled:opacity-50"
          >
            <Text className="text-base font-bold text-white">
              {myEntryResolved ? '내 참여 수정' : '참여하기'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              bounces={false}
              style={{
                maxHeight: windowHeight * 0.92,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                backgroundColor: '#fff',
              }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              }}
            >
            <Text className="text-lg font-bold text-violet-950">
              {modalMode === 'edit' ? '내 참여 수정' : '챌린지 참여'}
            </Text>
            <Text className="mt-1 text-sm text-violet-600">
              {modalMode === 'edit'
                ? '사진과 한마디를 바꿀 수 있어요.'
                : '사진과 한마디를 남겨 주세요.'}
            </Text>

            <TouchableOpacity
              onPress={pickImage}
              activeOpacity={0.85}
              className="mt-4 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50"
              style={{ height: 200 }}
            >
              {pickedUri ? (
                <Image source={{ uri: pickedUri }} className="h-full w-full" resizeMode="cover" />
              ) : (
                <Text className="font-semibold text-violet-500">탭해서 사진 선택</Text>
              )}
            </TouchableOpacity>

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="한마디 (선택)"
              placeholderTextColor="#a78bfa"
              className="mt-4 rounded-2xl border-2 border-violet-100 bg-violet-50/80 px-4 py-3 text-base text-violet-950"
              maxLength={200}
              multiline
              textAlignVertical="top"
            />

            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                onPress={closeModal}
                activeOpacity={0.85}
                className="flex-1 items-center rounded-2xl border-2 border-violet-200 py-3"
              >
                <Text className="font-bold text-violet-800">취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!challengeId || !uid) return;
                  if (modalMode === 'edit' && editingEntryId && previousPhotoUrl != null) {
                    updateMutation.mutate({
                      entryId: editingEntryId,
                      challengeId,
                      uid,
                      caption,
                      imageDirty,
                      processed: pickedProcessed,
                      previousPhotoUrl,
                    });
                    return;
                  }
                  if (!pickedProcessed) return;
                  submitMutation.mutate({
                    challengeId,
                    uid,
                    processed: pickedProcessed,
                    caption,
                  });
                }}
                disabled={
                  !challengeId ||
                  !uid ||
                  (modalMode === 'create' &&
                    (submitMutation.isPending || !pickedProcessed)) ||
                  (modalMode === 'edit' &&
                    (updateMutation.isPending ||
                      !editingEntryId ||
                      previousPhotoUrl == null ||
                      (imageDirty && !pickedProcessed)))
                }
                activeOpacity={0.9}
                className="flex-1 items-center rounded-2xl py-3 disabled:opacity-50"
                style={{ backgroundColor: PRIMARY }}
              >
                {modalMode === 'create' && submitMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : modalMode === 'edit' && updateMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-bold text-white">
                    {modalMode === 'edit' ? '저장' : '올리기'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {modalMode === 'edit' ? (
              <TouchableOpacity
                onPress={confirmDeleteEntry}
                disabled={deleteMutation.isPending}
                className="mt-4 items-center py-2 disabled:opacity-50"
              >
                <Text className="text-sm font-semibold text-red-600">참여 삭제</Text>
              </TouchableOpacity>
            ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ImageZoomModal
        visible={zoomGallery !== null}
        onClose={() => setZoomGallery(null)}
        images={zoomGallery?.urls ?? []}
        initialIndex={zoomGallery?.index ?? 0}
        slidesMeta={zoomGallery?.slidesMeta}
      />
    </View>
  );
}
