import { getSelectedProfile } from "@/features/profile/current-profile";
import { getToday, TodayPanel } from "@/features/today";

export default async function HojePage() {
  const profile = await getSelectedProfile();

  // Sem perfil o gate mostra o modal por cima; não há o que renderizar aqui.
  if (!profile) {
    return null;
  }

  return <TodayPanel today={await getToday(profile.id)} />;
}
