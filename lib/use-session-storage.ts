"use client";

import { useEffect, useState } from "react";

/**
 * A useState that persists to sessionStorage under `key`. SSR-safe (reads/writes only
 * in the browser) and never throws (storage access is wrapped). Shared by the Admin and
 * Super-Admin consoles, which previously each carried their own identical copy.
 */
export function useSessionStorage<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage.getItem(key);
        if (saved !== null) {
          return JSON.parse(saved) as T;
        }
      } catch (err) {
        console.warn("Failed to read from sessionStorage", err);
      }
    }
    return initialValue;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to write to sessionStorage", err);
      }
    }
  }, [key, state]);

  return [state, setState] as const;
}
