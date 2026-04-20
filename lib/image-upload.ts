import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { uriToArrayBuffer } from './binary-for-upload';

/** 업로드·처리 후 바이트 상한 */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

const FULL_MAX_DIMENSION = 2048;
const THUMB_MAX_DIMENSION = 480;

/** Storage 객체 경로 `a/b.jpg` → `a/b_thumb.jpg` */
export function thumbnailStoragePathFromMainPath(mainPath: string): string {
  return mainPath.replace(/(\.[^.]+)$/, '_thumb$1');
}

/** 공개 URL의 파일명에 `_thumb` 삽입 (쿼리 문자열 유지) */
export function thumbnailPublicUrlFromFullPublicUrl(fullUrl: string): string {
  const qIndex = fullUrl.indexOf('?');
  const base = qIndex >= 0 ? fullUrl.slice(0, qIndex) : fullUrl;
  const query = qIndex >= 0 ? fullUrl.slice(qIndex) : '';
  const withThumb = base.replace(/(\.[^.]+)$/, '_thumb$1');
  return withThumb + query;
}

/** 썸네일 URL → 원본 URL (피드에서 썸네일 404 시 폴백) */
export function fullPublicUrlFromThumbnailPublicUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_thumb(\.[^.?#]+)/, '$1');
}

export type ProcessedImageBuffers = {
  mainBody: ArrayBuffer;
  thumbBody: ArrayBuffer;
  mime: string;
  ext: 'jpg';
};

/**
 * 갤러리 선택 1건 → 본문용(리사이즈·압축) + 썸네일 바이트.
 * 원본이 10MB 초과면(메타 제공 시) 즉시 거절.
 */
export async function processPickedImageForUpload(asset: ImagePickerAsset): Promise<ProcessedImageBuffers> {
  if (asset.fileSize != null && asset.fileSize > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(`이미지는 ${MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024}MB 이하만 올릴 수 있어요.`);
  }

  const w = asset.width ?? 4096;
  const h = asset.height ?? 4096;
  const maxDim = Math.max(w, h);

  const fullActions: ImageManipulator.Action[] = [];
  if (maxDim > FULL_MAX_DIMENSION) {
    if (w >= h) {
      fullActions.push({ resize: { width: FULL_MAX_DIMENSION } });
    } else {
      fullActions.push({ resize: { height: FULL_MAX_DIMENSION } });
    }
  }

  let full = await ImageManipulator.manipulateAsync(asset.uri, fullActions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  let mainBody = await uriToArrayBuffer(full.uri);

  let compress = 0.78;
  let shrink = 0;
  while (mainBody.byteLength > MAX_IMAGE_UPLOAD_BYTES && shrink < 8) {
    const dim = Math.max(720, FULL_MAX_DIMENSION - shrink * 220);
    const emergency: ImageManipulator.Action[] =
      w >= h ? [{ resize: { width: dim } }] : [{ resize: { height: dim } }];
    full = await ImageManipulator.manipulateAsync(asset.uri, emergency, {
      compress,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    mainBody = await uriToArrayBuffer(full.uri);
    compress = Math.max(0.45, compress - 0.08);
    shrink++;
  }

  if (mainBody.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    const last: ImageManipulator.Action[] =
      w >= h ? [{ resize: { width: 1024 } }] : [{ resize: { height: 1024 } }];
    full = await ImageManipulator.manipulateAsync(asset.uri, last, {
      compress: 0.65,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    mainBody = await uriToArrayBuffer(full.uri);
  }

  if (mainBody.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(`압축 후에도 ${MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024}MB를 넘어요. 다른 사진을 선택해 주세요.`);
  }

  const tw = asset.width ?? 1;
  const th = asset.height ?? 1;
  const thumbActions: ImageManipulator.Action[] =
    tw >= th
      ? [{ resize: { width: THUMB_MAX_DIMENSION } }]
      : [{ resize: { height: THUMB_MAX_DIMENSION } }];

  const thumbResult = await ImageManipulator.manipulateAsync(asset.uri, thumbActions, {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const thumbBody = await uriToArrayBuffer(thumbResult.uri);

  return { mainBody, thumbBody, mime: 'image/jpeg', ext: 'jpg' };
}
