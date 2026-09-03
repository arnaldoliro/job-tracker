"use client";

import { SELECTED_PROFILE_COOKIE } from "@/features/profile/selected-profile";

/**
 * A seleção vive num cookie, e não no localStorage, por um motivo concreto: o
 * servidor precisa dela. A lista de candidaturas é buscada no Server Component,
 * e para isso ele tem que saber qual perfil está ativo antes de renderizar.
 * `localStorage` só existe depois da hidratação — o servidor nunca o veria.
 *
 * A troca também eliminou o skeleton de hidratação: a decisão entre mostrar a
 * shell ou o modal passou a ser tomada no servidor, sem piscar.
 *
 * Não é sessão nem autenticação: é preferência de UI, daí `SameSite=Lax` e
 * nada de `HttpOnly` — o cliente precisa escrever.
 */
const ONE_YEAR = 60 * 60 * 24 * 365;

export function setStoredProfileId(id: string): void {
  document.cookie = `${SELECTED_PROFILE_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function clearStoredProfileId(): void {
  document.cookie = `${SELECTED_PROFILE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
