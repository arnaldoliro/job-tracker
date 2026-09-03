"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "selectedProfileId";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // `storage` só dispara em outras abas; o emit acima cobre esta.
  window.addEventListener("storage", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

/**
 * `undefined` significa "ainda não sei" — no servidor e durante a hidratação
 * não há `localStorage`. É o que permite mostrar um skeleton em vez de piscar
 * o modal para quem já escolheu um perfil.
 */
function getServerSnapshot(): undefined {
  return undefined;
}

export function useStoredProfileId(): string | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setStoredProfileId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
  emit();
}

export function clearStoredProfileId(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  emit();
}
