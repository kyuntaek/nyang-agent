import * as FileSystem from 'expo-file-system/legacy';

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = globalThis.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/** RN에서 ph:// / file:// 읽기: fetch 실패 시 expo-file-system base64로 폴백 */
export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  try {
    const r = await fetch(uri);
    if (r.ok) {
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 0) return ab;
    }
  } catch {
    /* fall through */
  }
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  return base64ToArrayBuffer(b64);
}
