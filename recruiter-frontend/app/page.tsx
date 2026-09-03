import { cookies } from "next/headers";
import { ApplicationsPanel, listApplications } from "@/features/applications";
import {
  ProfileGate,
  SELECTED_PROFILE_COOKIE,
  listProfiles,
} from "@/features/profile";
import type { ProfileWithAvatar } from "@/features/profile";
import { avatarSvg } from "@/lib/avatar";

export default async function Home() {
  const [profiles, cookieStore] = await Promise.all([
    listProfiles(),
    cookies(),
  ]);

  // Avatar gerado no servidor: o DiceBear não vai para o bundle do cliente.
  const withAvatars: ProfileWithAvatar[] = profiles.map((profile) => ({
    ...profile,
    avatar: avatarSvg(profile.id),
  }));

  // O cookie pode apontar para um perfil apagado direto no banco. Resolver
  // contra a lista real, em vez de confiar no valor, evita a tela sem dono.
  const storedId = cookieStore.get(SELECTED_PROFILE_COOKIE)?.value;
  const selected = withAvatars.find((p) => p.id === storedId) ?? null;

  const applications = selected ? await listApplications(selected.id) : [];

  return (
    <ProfileGate profiles={withAvatars} selected={selected}>
      {selected && (
        <ApplicationsPanel
          profileId={selected.id}
          applications={applications}
        />
      )}
    </ProfileGate>
  );
}
