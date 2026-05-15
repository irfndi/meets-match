const MEDIA_CDN_BASE = "https://media.meetsmatch.irfndi.workers.dev";

export function buildMediaKey(userId: string, ext: string): string {
  return `${userId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
}

export function buildMediaPublicUrl(key: string): string {
  return `${MEDIA_CDN_BASE}/${key}`;
}

export function extractMediaKeyFromUrl(url: string): string | null {
  if (!url.startsWith(MEDIA_CDN_BASE + "/")) return null;
  return url.slice(MEDIA_CDN_BASE.length + 1);
}
