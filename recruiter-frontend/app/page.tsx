import { ProfileGate } from "@/components/profile-gate";
import { listProfiles } from "@/lib/api/profiles";
import { avatarSvg } from "@/lib/avatar";
import type { ProfileWithAvatar } from "@/lib/types";

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
