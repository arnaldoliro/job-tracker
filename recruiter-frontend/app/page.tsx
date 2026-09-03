import { ProfileGate, listProfiles } from "@/features/profile";
import type { ProfileWithAvatar } from "@/features/profile";
import { avatarSvg } from "@/lib/avatar";

export default async function Home() {
  const profiles = await listProfiles();

  // Avatar gerado aqui, no servidor: o DiceBear não vai para o bundle do
  // cliente e o card recebe o SVG pronto.
  const withAvatars: ProfileWithAvatar[] = profiles.map((profile) => ({
    ...profile,
    avatar: avatarSvg(profile.id),
  }));

  return <ProfileGate profiles={withAvatars} />;
}
