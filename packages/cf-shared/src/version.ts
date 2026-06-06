export interface VersionInfo {
  version: string;
  commit: string;
  builtAt: string;
  environment: string;
  service: string;
}

export function formatDuration(isoDate: string): string {
  // ⚡ Bolt Optimization: Use Date.parse() instead of new Date().getTime()
  // to avoid allocating a full Date object, reducing GC overhead and improving speed.
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) return "unknown";
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
