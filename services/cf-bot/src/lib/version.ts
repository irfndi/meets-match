// Auto-generated version info. Build-time globals are injected by wrangler/esbuild.
declare const __VERSION__: string | undefined;
declare const __COMMIT__: string | undefined;
declare const __BUILT_AT__: string | undefined;
declare const __ENVIRONMENT__: string | undefined;

export const versionInfo = {
  version: typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev",
  commit: typeof __COMMIT__ !== "undefined" ? __COMMIT__ : "unknown",
  builtAt: typeof __BUILT_AT__ !== "undefined" ? __BUILT_AT__ : new Date().toISOString(),
  environment: typeof __ENVIRONMENT__ !== "undefined" ? __ENVIRONMENT__ : "development",
};

// Simple duration formatter (no external deps)
export function formatDuration(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}
