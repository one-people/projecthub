import { useCallback, useEffect, useState } from "react";
import { db } from "~/repositories/db";
import { zhCN, type Dict } from "~/locales/zh-CN";
import { en } from "~/locales/en";

export type Locale = "zh-CN" | "en";

const LOCALE_KEY = "locale";
const DICTS: Record<Locale, Dict> = { "zh-CN": zhCN, en };
const listeners = new Set<() => void>();
let current: Locale = "zh-CN";

function detectInitial(): Locale {
  if (typeof navigator !== "undefined" && !navigator.language.startsWith("zh")) {
    return "en";
  }
  return "zh-CN";
}

export async function initLocale(): Promise<void> {
  const pref = await db.preferences.get(LOCALE_KEY);
  current = (pref?.value as Locale | undefined) ?? detectInitial();
  listeners.forEach((fn) => fn());
}

export function getLocale(): Locale {
  return current;
}

export async function setLocale(locale: Locale): Promise<void> {
  current = locale;
  await db.preferences.put({ key: LOCALE_KEY, value: locale });
  listeners.forEach((fn) => fn());
}

export function t(key: keyof Dict, params?: Record<string, string | number>): string {
  let text: string = DICTS[current][key] ?? DICTS["zh-CN"][key] ?? key;
  for (const [k, v] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

// 订阅语言变化，配合 React 18 的 useSyncExternalStore
export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useI18n() {
  const [locale, setLocal] = useState(current);
  useEffect(() => {
    void initLocale().then(() => setLocal(current));
    return subscribeLocale(() => setLocal(current));
  }, []);
  const translate = useCallback(
    (key: keyof Dict, params?: Record<string, string | number>) => t(key, params),
    // 依赖 locale 以便语言切换时重建 translate，触发消费组件重渲染
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );
  return { t: translate, locale, setLocale };
}
