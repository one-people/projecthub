const CHANNEL = "projecthub-sync";

export interface ChangeEvent {
  table: string;
  ids: string[];
}

const supported = typeof BroadcastChannel !== "undefined";
const channel = supported ? new BroadcastChannel(CHANNEL) : null;
const storageFallbackListeners = new Set<(e: ChangeEvent) => void>();

if (!supported && typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CHANNEL && e.newValue) {
      const event = JSON.parse(e.newValue) as ChangeEvent;
      storageFallbackListeners.forEach((fn) => fn(event));
    }
  });
}

export function broadcastChange(event: ChangeEvent) {
  channel?.postMessage(event);
  if (!supported && typeof localStorage !== "undefined") {
    localStorage.setItem(CHANNEL, JSON.stringify({ ...event, t: Date.now() }));
  }
}

export function subscribeChanges(fn: (e: ChangeEvent) => void): () => void {
  if (channel) {
    channel.addEventListener("message", (e) => fn(e.data as ChangeEvent));
    return () => channel.close();
  }
  storageFallbackListeners.add(fn);
  return () => storageFallbackListeners.delete(fn);
}
