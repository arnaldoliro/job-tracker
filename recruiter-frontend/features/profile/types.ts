import type { Profile } from "@recruit/shared";

/** Perfil já com o SVG do avatar renderizado no servidor. */
export type ProfileWithAvatar = Profile & { avatar: string };
