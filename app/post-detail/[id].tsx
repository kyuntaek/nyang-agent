import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageZoomModal } from '../../components/ImageZoomModal';
import { truncateCatName, truncateUserNickname } from '../../lib/display-strings';
import {
  SmartKeyboardScreen,
  useSmartKeyboardFieldFocus,
  useSmartKeyboardScrollExtraBottom,
} from '../../components/SmartKeyboardScreen';
import {
  POST_CHANNELS,
  type PostChannelDb,
  type PostFeedRow,
  addPostComment,
  deletePost,
  deletePostComment,
  fetchPostById,
  fetchPostComments,
  fetchUserLikedPost,
  normalizePostImageUrls,
  togglePostLike,
  updatePostComment,
} from '../../lib/community-queries';
import { openExternalHttpUrlWithAlert } from '../../lib/safe-external-url';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#7F77DD';
const SUMMARY_BG = '#f1f5f9';

/** 본문·댓글 본문 영역 공통 (아주 연한 동일 톤) */
const SHARED_TEXT_SURFACE = '#faf8ff';

const postDetailStyles = StyleSheet.create({
  /** 작은 라운드 배경 링크형 수정·삭제 (원글·댓글 공통) */
  linkActionEdit: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#f3e8ff',
  },
  linkActionEditText: { fontSize: 11, fontWeight: '800', color: PRIMARY },
  linkActionDel: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#ffe4e6',
  },
  linkActionDelText: { fontSize: 11, fontWeight: '800', color: '#e11d48' },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  postAuthorLabel: { fontSize: 11, fontWeight: '600', color: '#a78bfa' },
  postAuthorNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 },
  postAuthorName: { fontSize: 17, fontWeight: '800', color: '#4c1d95' },
  postAuthorCatSep: { fontSize: 16, fontWeight: '700', color: '#c4b5fd', marginHorizontal: 6 },
  postAuthorCatName: { fontSize: 16, fontWeight: '700', color: '#6d28d9', flexShrink: 1 },
  postAuthorBlock: { flex: 1, minWidth: 0 },
  postTagChip: {
    marginTop: 2,
    marginLeft: 10,
    borderRadius: 6,
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  postTagChipText: { fontSize: 12, fontWeight: '700', color: '#5b21b6' },
  postBodyTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  postBodyDate: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    color: '#a78bfa',
    marginRight: 8,
  },
  postBodyActions: { flexDirection: 'row', alignItems: 'center' },
  sharedTextSurface: {
    borderRadius: 12,
    backgroundColor: SHARED_TEXT_SURFACE,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  postBodyText: { fontSize: 16, lineHeight: 24, color: '#4c1d95' },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4c1d95',
    maxWidth: '38%',
  },
  commentTime: {
    flex: 1,
    fontSize: 11,
    color: '#a78bfa',
    marginHorizontal: 8,
  },
  commentActions: { flexDirection: 'row', alignItems: 'center' },
  commentActionBtnSpacer: { marginLeft: 8 },
  commentSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentSectionHint: { flex: 1, fontSize: 15, fontWeight: '800', color: '#5b21b6', marginRight: 12 },
  commentSectionCount: { fontSize: 12, fontWeight: '700', color: '#8b5cf6', textAlign: 'right' },
  commentEmptyWrap: { minHeight: 160, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  commentEmptyText: { fontSize: 14, color: '#7c3aed' },
  commentBodyText: { fontSize: 14, lineHeight: 21, color: '#5b21b6' },
});

function channelLabel(db: PostChannelDb): string {
  const row = POST_CHANNELS.find((c) => c.db === db);
  return row?.label ?? db;
}

function pickNickname(row: PostFeedRow): string {
  const p = row.profiles as { nickname?: string | null } | { nickname?: string | null }[] | null | undefined;
  if (p == null) return '냥집사';
  if (Array.isArray(p)) return p[0]?.nickname?.trim() || '냥집사';
  return p.nickname?.trim() || '냥집사';
}

function pickCatName(row: PostFeedRow): string | null {
  const c = row.cats as { name?: string | null } | { name?: string | null }[] | null | undefined;
  if (c == null) return null;
  if (Array.isArray(c)) {
    const n = c[0]?.name?.trim();
    return n && n.length > 0 ? n : null;
  }
  const n = c.name?.trim();
  return n && n.length > 0 ? n : null;
}

function formatCommentTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatPostDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function PostDetailScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const postId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');
  const [zoomGallery, setZoomGallery] = useState<{ urls: string[]; index: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const editCommentInputRef = useRef<TextInput>(null);
  const composerInputRef = useRef<TextInput>(null);
  const setFocusedField = useSmartKeyboardFieldFocus();
  const scrollExtraBottom = useSmartKeyboardScrollExtraBottom();

  useEffect(() => {
    if (!editingCommentId) return;
    const t = setTimeout(() => editCommentInputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [editingCommentId]);

  const selfQuery = useQuery({
    queryKey: ['auth-user-id'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 60_000,
  });
  const selfId = selfQuery.data ?? null;

  const postQuery = useQuery({
    queryKey: ['post-detail', postId],
    queryFn: () => fetchPostById(postId),
    enabled: Boolean(postId),
  });

  const likedQuery = useQuery({
    queryKey: ['post-like', postId],
    queryFn: () => fetchUserLikedPost(postId),
    enabled: Boolean(postId),
  });

  const likeMutation = useMutation({
    mutationFn: () => togglePostLike(postId),
    onSuccess: (res) => {
      queryClient.setQueryData(['post-like', postId], res.liked);
      queryClient.setQueryData(['post-detail', postId], (prev: PostFeedRow | null | undefined) =>
        prev ? { ...prev, like_count: res.like_count } : prev
      );
      void queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      void queryClient.invalidateQueries({ queryKey: ['community-best-posts'] });
      void queryClient.invalidateQueries({ queryKey: ['home-posts-latest'] });
      void queryClient.invalidateQueries({ queryKey: ['home-posts-mine'] });
    },
    onError: (e: Error) => {
      Alert.alert('좋아요', e.message ?? '처리하지 못했어요. post_likes 마이그레이션을 적용했는지 확인해 주세요.');
    },
  });

  const commentsQuery = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: () => fetchPostComments(postId),
    enabled: Boolean(postId) && Boolean(postQuery.data),
  });

  const deletePostMutation = useMutation({
    mutationFn: () => deletePost(postId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['community-best-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['home-posts-latest'] }),
        queryClient.invalidateQueries({ queryKey: ['home-posts-mine'] }),
      ]);
      router.back();
    },
    onError: (e: Error) => {
      Alert.alert('삭제', e.message ?? '글을 삭제하지 못했어요.');
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) => updatePostComment(commentId, body),
    onSuccess: async () => {
      setEditingCommentId(null);
      setEditCommentDraft('');
      await queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    },
    onError: (e: Error) => {
      Alert.alert('댓글', e.message ?? '수정하지 못했어요.');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deletePostComment(commentId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post-comments', postId] }),
        queryClient.invalidateQueries({ queryKey: ['post-detail', postId] }),
        queryClient.invalidateQueries({ queryKey: ['community-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['community-best-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['home-posts-latest'] }),
        queryClient.invalidateQueries({ queryKey: ['home-posts-mine'] }),
      ]);
    },
    onError: (e: Error) => {
      Alert.alert('댓글', e.message ?? '삭제하지 못했어요.');
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => addPostComment(postId, commentDraft),
    onSuccess: async () => {
      Keyboard.dismiss();
      setCommentDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post-comments', postId] }),
        queryClient.invalidateQueries({ queryKey: ['post-detail', postId] }),
        queryClient.invalidateQueries({ queryKey: ['community-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['community-best-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['home-posts-latest'] }),
        queryClient.invalidateQueries({ queryKey: ['home-posts-mine'] }),
      ]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    onError: (e: Error) => {
      Alert.alert('댓글', e.message ?? '등록하지 못했어요. post_comments 마이그레이션을 적용했는지 확인해 주세요.');
    },
  });

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const row = postQuery.data;
  const postCatName = row ? pickCatName(row) : null;
  const galleryUrls = row ? normalizePostImageUrls(row.image_urls) : [];
  const isPostOwner = Boolean(selfId && row && row.user_id === selfId);
  const isEditingAnyComment = Boolean(editingCommentId);
  const composerEditable = !isEditingAnyComment && !commentMutation.isPending;
  /** 댓글 수정 중에는 입력 블록이 스크롤 안에서 커지므로 하단 여백을 조금 더 둠 + 키보드 스크롤 여유 */
  const scrollContentBottomPad =
    (isEditingAnyComment ? insets.bottom + 20 : 8) + scrollExtraBottom;

  const confirmDeletePost = () => {
    Alert.alert('글 삭제', '삭제하면 복구할 수 없어요. 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          if (deletePostMutation.isPending) return;
          void deletePostMutation.mutateAsync();
        },
      },
    ]);
  };

  const confirmDeleteComment = (commentId: string) => {
    Alert.alert('댓글 삭제', '이 댓글을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          if (deleteCommentMutation.isPending) return;
          void deleteCommentMutation.mutateAsync(commentId);
        },
      },
    ]);
  };

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-violet-100 bg-white px-4 py-3">
        <TouchableOpacity onPress={goBack} hitSlop={12} activeOpacity={0.75} className="flex-row items-center gap-1 py-1">
          <Ionicons name="chevron-back" size={22} color={PRIMARY} />
          <Text className="text-base font-semibold text-[#7F77DD]">뒤로</Text>
        </TouchableOpacity>
        <Text className="ml-2 flex-1 text-center text-base font-bold text-violet-950" numberOfLines={1}>
          게시글
        </Text>
        <View className="w-16" />
      </View>

      {postQuery.isPending ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : postQuery.isError ? (
        <View className="mx-4 mt-6 rounded-2xl bg-red-50 px-4 py-4">
          <Text className="text-sm text-red-700">{(postQuery.error as Error).message}</Text>
        </View>
      ) : !row ? (
        <View className="mx-4 mt-6 rounded-2xl border border-violet-100 bg-white px-4 py-6">
          <Text className="text-center text-base text-violet-600">
            글을 찾을 수 없어요. 관리자에 의해 비공개되었거나 삭제된 게시글일 수 있어요.
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <ScrollView
            ref={scrollRef}
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: scrollContentBottomPad }}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View className="mt-4 rounded-2xl border border-violet-100 bg-white p-4">
              <View style={postDetailStyles.postAuthorRow}>
                <View style={postDetailStyles.postAuthorBlock}>
                  <Text style={postDetailStyles.postAuthorLabel}>작성자</Text>
                  <View style={postDetailStyles.postAuthorNameRow}>
                    <Text style={postDetailStyles.postAuthorName} numberOfLines={1}>
                      {truncateUserNickname(pickNickname(row))}
                    </Text>
                    {postCatName ? (
                      <>
                        <Text style={postDetailStyles.postAuthorCatSep}>·</Text>
                        <Text style={postDetailStyles.postAuthorCatName} numberOfLines={1}>
                          {truncateCatName(postCatName)}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                <View style={postDetailStyles.postTagChip}>
                  <Text style={postDetailStyles.postTagChipText}>{channelLabel(row.channel)}</Text>
                </View>
              </View>
              <View className="mt-3" style={postDetailStyles.sharedTextSurface}>
                <View style={postDetailStyles.postBodyTopBar}>
                  <Text style={postDetailStyles.postBodyDate}>{formatPostDateTime(row.created_at)}</Text>
                  {isPostOwner ? (
                    <View style={postDetailStyles.postBodyActions}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => router.push(`/write?editPostId=${postId}`)}
                        style={postDetailStyles.linkActionEdit}
                      >
                        <Text style={postDetailStyles.linkActionEditText}>수정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={confirmDeletePost}
                        disabled={deletePostMutation.isPending}
                        style={[
                          postDetailStyles.linkActionDel,
                          postDetailStyles.commentActionBtnSpacer,
                          deletePostMutation.isPending ? { opacity: 0.45 } : null,
                        ]}
                      >
                        <Text style={postDetailStyles.linkActionDelText}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                <Text style={postDetailStyles.postBodyText}>{row.body}</Text>
              </View>
              {galleryUrls.length > 0 ? (
                <View className="mt-4 flex-row flex-wrap">
                  {galleryUrls.map((uri, i) => (
                    <TouchableOpacity
                      key={`${i}-${uri.slice(0, 48)}`}
                      onPress={() => setZoomGallery({ urls: galleryUrls, index: i })}
                      activeOpacity={0.9}
                      className="mb-2 mr-2 overflow-hidden rounded-xl"
                    >
                      <Image
                        source={{ uri }}
                        className="h-40 w-40 bg-violet-100"
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {row.video_url?.trim() ? (
                <TouchableOpacity
                  onPress={() => void openExternalHttpUrlWithAlert(row.video_url!)}
                  activeOpacity={0.85}
                  className="mt-4 self-start rounded-xl border border-violet-200 bg-violet-50 px-4 py-3"
                >
                  <Text className="text-sm font-semibold text-[#7F77DD]">동영상 링크 열기</Text>
                  <Text className="mt-1 text-xs text-violet-500" numberOfLines={2}>
                    {row.video_url.trim()}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {row.agent_summary ? (
                <View className="mt-4 rounded-xl px-3 py-2" style={{ backgroundColor: SUMMARY_BG }}>
                  <Text className="text-xs font-semibold text-slate-500">에이전트 요약</Text>
                  <Text className="mt-1 text-sm leading-6 text-slate-700">{row.agent_summary}</Text>
                </View>
              ) : null}
              <View className="mt-5 flex-row flex-wrap items-center gap-4 border-t border-violet-100 pt-4">
                <TouchableOpacity
                  onPress={() => {
                    if (likeMutation.isPending) return;
                    void likeMutation.mutateAsync();
                  }}
                  disabled={likeMutation.isPending || likedQuery.isPending}
                  activeOpacity={0.85}
                  className="flex-row items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-2"
                  hitSlop={8}
                >
                  <Ionicons
                    name={likedQuery.data ? 'heart' : 'heart-outline'}
                    size={22}
                    color={likedQuery.data ? '#e11d48' : '#7c3aed'}
                  />
                  <Text className="text-sm font-semibold text-violet-800">좋아요 {row.like_count}</Text>
                </TouchableOpacity>
                <Text className="text-sm font-medium text-violet-600">댓글 {row.comment_count}</Text>
              </View>
            </View>

            <View className="mt-4 rounded-2xl border border-violet-100 bg-white p-4">
              <View style={postDetailStyles.commentSectionHeaderRow}>
                <Text style={postDetailStyles.commentSectionHint}>함께 이야기해 주세요</Text>
                <Text style={postDetailStyles.commentSectionCount}>
                  총 {Number(row.comment_count ?? 0)}개의 댓글
                </Text>
              </View>

              {commentsQuery.isPending ? (
                <View className="mt-6 items-center py-6">
                  <ActivityIndicator color={PRIMARY} />
                </View>
              ) : commentsQuery.isError ? (
                <Text className="mt-4 text-sm text-red-600">{(commentsQuery.error as Error).message}</Text>
              ) : commentsQuery.data?.length === 0 ? (
                <View style={postDetailStyles.commentEmptyWrap}>
                  <Text style={postDetailStyles.commentEmptyText}>첫 댓글을 남겨보세요.</Text>
                </View>
              ) : (
                <View className="mt-4">
                  {commentsQuery.data?.map((c) => {
                    const mine = Boolean(selfId && c.user_id === selfId);
                    const editing = editingCommentId === c.id;
                    return (
                      <View
                        key={c.id}
                        className="border-b border-violet-100 py-3 last:border-b-0 last:pb-0 first:pt-0"
                      >
                        <View style={postDetailStyles.commentMetaRow}>
                          <Text style={postDetailStyles.commentAuthor} numberOfLines={1}>
                            {truncateUserNickname(c.author_nickname)}
                          </Text>
                          <Text style={postDetailStyles.commentTime} numberOfLines={1}>
                            {formatCommentTime(c.created_at)}
                          </Text>
                          {mine && !editing ? (
                            <View style={postDetailStyles.commentActions}>
                              <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => {
                                  Keyboard.dismiss();
                                  setEditingCommentId(c.id);
                                  setEditCommentDraft(c.body);
                                }}
                                disabled={deleteCommentMutation.isPending}
                                style={[
                                  postDetailStyles.linkActionEdit,
                                  deleteCommentMutation.isPending ? { opacity: 0.45 } : null,
                                ]}
                              >
                                <Text style={postDetailStyles.linkActionEditText}>수정</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => confirmDeleteComment(c.id)}
                                disabled={deleteCommentMutation.isPending}
                                style={[
                                  postDetailStyles.linkActionDel,
                                  postDetailStyles.commentActionBtnSpacer,
                                  deleteCommentMutation.isPending ? { opacity: 0.45 } : null,
                                ]}
                              >
                                <Text style={postDetailStyles.linkActionDelText}>삭제</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                        {editing ? (
                          <View style={postDetailStyles.sharedTextSurface}>
                            <Text style={postDetailStyles.commentBodyText}>{editCommentDraft}</Text>
                            <Text className="mt-1 text-[11px] font-semibold text-violet-400">
                              아래 입력란에서 수정해요
                            </Text>
                          </View>
                        ) : (
                          <View style={postDetailStyles.sharedTextSurface}>
                            <Text style={postDetailStyles.commentBodyText}>{c.body}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {isEditingAnyComment ? (
            <View
              className="border-t border-violet-200 bg-violet-100 px-4 pt-2"
              style={{
                paddingBottom:
                  scrollExtraBottom > 0 ? 8 : Math.max(insets.bottom, 6),
              }}
            >
              <Text className="mb-1 text-xs font-semibold text-violet-600">댓글 수정</Text>
              <View className="flex-row items-end gap-2">
                <TextInput
                  ref={editCommentInputRef}
                  value={editCommentDraft}
                  onChangeText={setEditCommentDraft}
                  onFocus={() => setFocusedField(editCommentInputRef.current)}
                  placeholder="댓글 내용"
                  placeholderTextColor="#8b7fd8"
                  multiline
                  maxLength={800}
                  editable={!updateCommentMutation.isPending}
                  className="max-h-28 min-h-12 flex-1 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 text-base text-violet-950"
                  style={{ opacity: updateCommentMutation.isPending ? 0.55 : 1 }}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={() => {
                    setEditingCommentId(null);
                    setEditCommentDraft('');
                  }}
                  disabled={updateCommentMutation.isPending}
                  activeOpacity={0.85}
                  className="mb-0.5 rounded-2xl border-2 border-violet-200 bg-white px-4 py-3 disabled:opacity-45"
                >
                  <Text className="text-sm font-bold text-violet-800">취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (updateCommentMutation.isPending || !editingCommentId || !editCommentDraft.trim()) return;
                    void updateCommentMutation.mutateAsync({
                      commentId: editingCommentId,
                      body: editCommentDraft,
                    });
                  }}
                  disabled={updateCommentMutation.isPending || !editCommentDraft.trim()}
                  activeOpacity={0.9}
                  style={{ backgroundColor: PRIMARY }}
                  className={`mb-0.5 rounded-2xl px-5 py-3 ${
                    updateCommentMutation.isPending || !editCommentDraft.trim() ? 'opacity-45' : ''
                  }`}
                >
                  {updateCommentMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-base font-bold text-white">저장</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View
              className="border-t border-violet-200 bg-violet-100 px-4 pt-2"
              style={{
                paddingBottom:
                  scrollExtraBottom > 0 ? 8 : Math.max(insets.bottom, 6),
              }}
            >
              <View className="flex-row items-end gap-2">
                <TextInput
                  ref={composerInputRef}
                  value={commentDraft}
                  onChangeText={setCommentDraft}
                  onFocus={() => setFocusedField(composerInputRef.current)}
                  placeholder="댓글을 입력해 주세요"
                  placeholderTextColor="#8b7fd8"
                  multiline
                  maxLength={800}
                  editable={composerEditable}
                  className="max-h-28 min-h-12 flex-1 rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 text-base text-violet-950"
                  style={{ opacity: composerEditable ? 1 : 0.55 }}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  onPress={() => {
                    if (commentMutation.isPending) return;
                    void commentMutation.mutateAsync();
                  }}
                  disabled={commentMutation.isPending || !commentDraft.trim()}
                  activeOpacity={0.9}
                  style={{ backgroundColor: PRIMARY }}
                  className={`mb-0.5 rounded-2xl px-5 py-3 ${
                    commentMutation.isPending || !commentDraft.trim() ? 'opacity-45' : ''
                  }`}
                >
                  {commentMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-base font-bold text-white">등록</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          <ImageZoomModal
            visible={zoomGallery !== null}
            onClose={() => setZoomGallery(null)}
            images={zoomGallery?.urls ?? []}
            initialIndex={zoomGallery?.index ?? 0}
          />
        </View>
      )}
    </View>
  );
}

export default function PostDetailScreen() {
  return (
    <SmartKeyboardScreen className="flex-1 bg-violet-50">
      <PostDetailScreenInner />
    </SmartKeyboardScreen>
  );
}
