/**
 * Superfície pública da feature de perfil. O que não está aqui é interno —
 * `actions.ts` inclusive, consumida só pelo modal.
 */
export { ProfileGate } from "@/features/profile/components/profile-gate";
export { listProfiles, createProfile, ApiError } from "@/features/profile/api";
export { SELECTED_PROFILE_COOKIE } from "@/features/profile/selected-profile";
export type { ProfileWithAvatar } from "@/features/profile/types";
