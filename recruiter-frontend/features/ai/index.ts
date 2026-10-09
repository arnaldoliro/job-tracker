/**
 * Superfície pública da feature. `api.ts` fica fora de propósito: é
 * `server-only`, e esta entrada é importada por componentes de cliente — as
 * páginas chamam `getAiStatus` pelo caminho direto.
 */
export { AiBadge } from "@/features/ai/components/ai-badge";
