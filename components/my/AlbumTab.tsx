import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageZoomModal } from '../ImageZoomModal';
import { fetchCatPhotos, type CatPhotoRow } from '../../lib/cat-life-queries';
import { processPickedImageForUpload, thumbnailPublicUrlFromFullPublicUrl, thumbnailStoragePathFromMainPath } from '../../lib/image-upload';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';

const albumLayout = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
});

/** 공개 URL에서 Storage 객체 경로(uid/catId/파일) 추출 */
function pathFromCatPhotoPublicUrl(publicUrl: string): string | null {
  try {
    const parts = new URL(publicUrl).pathname.split('/').filter(Boolean);
    const i = parts.indexOf('cat-photos');
    if (i === -1 || i >= parts.length - 1) return null;
    return parts.slice(i + 1).join('/');
  } catch {
    return null;
  }
}

function gridThumbSource(fullUrl: string): string {
  if (!/\/object\/public\/cat-photos\//.test(fullUrl) || /_thumb\./i.test(fullUrl)) return fullUrl;
  return thumbnailPublicUrlFromFullPublicUrl(fullUrl);
}

function AlbumGridImage({ fullUrl }: { fullUrl: string }) {
  const initial = useMemo(() => gridThumbSource(fullUrl), [fullUrl]);
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

type Props = {
  catId: string;
  catName: string;
};

export default function AlbumTab({ catId, catName }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState<CatPhotoRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    data: photos = [],
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cat-photos', catId],
    queryFn: () => fetchCatPhotos(catId),
  });

  const uploadPhoto = useCallback(async () => {
    let ImagePickerMod: typeof import('expo-image-picker');
    try {
      ImagePickerMod = await import('expo-image-picker');
    } catch {
      Alert.alert(
        '설치 필요',
        'expo-image-picker를 찾을 수 없어요.\n\n터미널에서 실행 후 Metro를 캐시 없이 다시 시작해 주세요.\n\nnpx expo install expo-image-picker\nnpx expo start -c'
      );
      return;
    }

    const perm = await ImagePickerMod.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 올리려면 갤러리 접근을 허용해 주세요.');
      return;
    }

    const result = await ImagePickerMod.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: false,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      Alert.alert('로그인', '다시 로그인한 뒤 시도해 주세요.');
      return;
    }

    let processed;
    try {
      processed = await processPickedImageForUpload(asset);
    } catch (e) {
      Alert.alert('이미지', e instanceof Error ? e.message : '이미지를 처리하지 못했어요.');
      return;
    }

    setUploading(true);
    try {
      const path = `${uid}/${catId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${processed.ext}`;
      const thumbPath = thumbnailStoragePathFromMainPath(path);

      const { error: upErr } = await supabase.storage.from('cat-photos').upload(path, processed.mainBody, {
        contentType: processed.mime,
        upsert: false,
      });
      if (upErr) {
        if (__DEV__) {
          console.warn('[cat-photos upload]', upErr);
        }
        const msg = upErr.message ?? '';
        const detail =
          /bucket not found/i.test(msg)
            ? 'Supabase에 Storage 버킷 cat-photos가 없습니다.\n\nDashboard → Storage에서 이름 cat-photos로 버킷을 만들고(공개 여부는 프로젝트에 맞게), 또는 supabase/migrations의 SQL을 원격 DB에 적용해 주세요.'
            : msg;
        Alert.alert('업로드 실패', detail);
        return;
      }

      const { error: thumbErr } = await supabase.storage.from('cat-photos').upload(thumbPath, processed.thumbBody, {
        contentType: processed.mime,
        upsert: false,
      });
      if (thumbErr && __DEV__) {
        console.warn('[cat-photos thumb]', thumbErr);
      }

      const { data: pub } = supabase.storage.from('cat-photos').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: insErr } = await supabase.from('cat_photos').insert({
        cat_id: catId,
        url: publicUrl,
      });
      if (insErr) {
        Alert.alert('저장 실패', insErr.message);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['cat-photos', catId] });
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '업로드에 실패했어요.');
    } finally {
      setUploading(false);
    }
  }, [catId, queryClient]);

  const closeViewer = useCallback(() => {
    if (deleting) return;
    setViewerPhoto(null);
  }, [deleting]);

  const deletePhoto = useCallback(
    async (photo: CatPhotoRow) => {
      setDeleting(true);
      try {
        const path = pathFromCatPhotoPublicUrl(photo.url);
        if (path) {
          const thumbP = thumbnailStoragePathFromMainPath(path);
          const { error: stErr } = await supabase.storage.from('cat-photos').remove([path, thumbP]);
          if (stErr && __DEV__) {
            console.warn('[cat-photos storage remove]', stErr);
          }
        }
        const { error } = await supabase.from('cat_photos').delete().eq('id', photo.id);
        if (error) {
          Alert.alert('삭제 실패', error.message);
          return;
        }
        setViewerPhoto(null);
        await queryClient.invalidateQueries({ queryKey: ['cat-photos', catId] });
      } catch (e) {
        Alert.alert('오류', e instanceof Error ? e.message : '삭제에 실패했어요.');
      } finally {
        setDeleting(false);
      }
    },
    [catId, queryClient]
  );

  const confirmDeletePhoto = useCallback(
    (photo: CatPhotoRow) => {
      Alert.alert('사진 삭제', '이 사진을 삭제할까요? 저장소에서도 지워져요.', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => void deletePhoto(photo),
        },
      ]);
    },
    [deletePhoto]
  );

  const setAsHomeRepresentative = useCallback(async () => {
    if (!viewerPhoto) return;
    try {
      const { error } = await supabase
        .from('cats')
        .update({ representative_photo_url: viewerPhoto.url })
        .eq('id', catId);
      if (error) {
        Alert.alert('저장 실패', error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['home-cat'] });
      Alert.alert('홈 대표 사진', '홈과 프로필에 이 사진이 대표로 표시돼요.');
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '저장에 실패했어요.');
    }
  }, [catId, queryClient, viewerPhoto]);

  const display = catName.trim() || '냥이';

  return (
    <View style={albumLayout.root}>
      <ScrollView
        style={albumLayout.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        <Text className="text-lg font-bold text-violet-950">
          📖 {display}의 이야기
        </Text>

        {isPending && (
          <View className="mt-8 items-center py-8">
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

        {!isPending && !isError && photos.length === 0 && (
          <View className="mt-12 items-center px-4">
            <Text className="text-center text-base text-violet-600">
              첫 사진을 올려주세요 📸
            </Text>
          </View>
        )}

        {!isPending && !isError && photos.length > 0 && (
          <View className="mt-6 flex-row flex-wrap justify-between">
            {photos.map((p) => (
              <TouchableOpacity
                key={p.id}
                accessibilityRole="imagebutton"
                accessibilityLabel="사진 크게 보기"
                onPress={() => setViewerPhoto(p)}
                className="mb-2 overflow-hidden rounded-xl bg-violet-100"
                style={{ width: '31%', aspectRatio: 1 }}
              >
                <AlbumGridImage fullUrl={p.url} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <ImageZoomModal
        visible={viewerPhoto !== null}
        onClose={closeViewer}
        images={photos.map((p) => p.url)}
        initialIndex={
          viewerPhoto ? Math.max(0, photos.findIndex((p) => p.id === viewerPhoto.id)) : 0
        }
        onIndexChange={(i) => {
          const next = photos[i];
          if (next) setViewerPhoto(next);
        }}
        headerAccessory={
          viewerPhoto ? (
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => void setAsHomeRepresentative()}
                hitSlop={12}
                disabled={deleting}
              >
                <Text className="text-base font-semibold text-emerald-300">홈 대표</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmDeletePhoto(viewerPhoto)}
                hitSlop={12}
                disabled={deleting}
              >
                <Text className="text-base font-semibold text-red-300">삭제</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        overlay={
          deleting ? (
            <View
              className="absolute inset-0 items-center justify-center bg-black/40"
              pointerEvents="auto"
              style={{ zIndex: 40, elevation: 40 }}
            >
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        onPress={() => void uploadPhoto()}
        disabled={uploading}
        style={{
          position: 'absolute',
          right: 20,
          bottom: Math.max(insets.bottom, 16) + 8,
          backgroundColor: PRIMARY,
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: uploading ? 0.6 : 1,
        }}
        className="shadow-lg"
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-3xl font-light text-white">+</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
