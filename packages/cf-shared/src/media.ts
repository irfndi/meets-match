const MEDIA_CDN_BASE = "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev";

const SAFE_USER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SAFE_EXT_RE = /^[a-zA-Z0-9]+$/;

export function buildMediaKey(userId: string, ext: string): string {
  if (!SAFE_USER_ID_RE.test(userId)) {
    throw new Error("Invalid userId for media key");
  }
  if (!SAFE_EXT_RE.test(ext)) {
    throw new Error("Invalid extension for media key");
  }
  return `${userId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
}

export function buildMediaPublicUrl(key: string): string {
  return `${MEDIA_CDN_BASE}/${key}`;
}

export function extractMediaKeyFromUrl(url: string): string | null {
  if (!url.startsWith(MEDIA_CDN_BASE + "/")) return null;
  const key = url.slice(MEDIA_CDN_BASE.length + 1);
  return key.length > 0 ? key : null;
}
