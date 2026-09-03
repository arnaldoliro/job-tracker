/**
 * Sem "use client" de propósito: a constante é lida dos DOIS lados — pelo
 * Server Component, que resolve o perfil ativo antes de renderizar, e pelo
 * cliente, que escreve o cookie. Exports de um módulo marcado como client
 * viram referência no servidor e não chegam como valor.
 */
export const SELECTED_PROFILE_COOKIE = "selectedProfileId";
