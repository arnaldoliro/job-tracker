import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { listProfiles } from "@/features/profile/api";
import { SELECTED_PROFILE_COOKIE } from "@/features/profile/selected-profile";
import type { ProfileWithAvatar } from "@/features/profile/types";
import { avatarSvg } from "@/lib/avatar";

/**
 * O layout e cada página precisam do perfil ativo. `cache` do React deduplica
 * dentro da mesma requisição: uma chamada à API, por mais que seja pedido em
 * vários lugares da árvore.
 */
export const getProfiles = cache(async (): Promise<ProfileWithAvatar[]> => {
  const profiles = await listProfiles();

  // Avatar gerado no servidor: o DiceBear não vai para o bundle do cliente.
  return profiles.map((profile) => ({
    ...profile,
    avatar: avatarSvg(profile.id),
  }));
});

/**
 * O cookie pode apontar para um perfil apagado direto no banco. Resolver
 * contra a lista real, em vez de confiar no valor, evita a tela sem dono.
 */
export const getSelectedProfile = cache(
  async (): Promise<ProfileWithAvatar | null> => {
    const [profiles, cookieStore] = await Promise.all([getProfiles(), cookies()]);
    const storedId = cookieStore.get(SELECTED_PROFILE_COOKIE)?.value;

    return profiles.find((profile) => profile.id === storedId) ?? null;
  },
);
