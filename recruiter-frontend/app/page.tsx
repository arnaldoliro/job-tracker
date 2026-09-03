import { ApplicationsPanel, listApplications } from "@/features/applications";
import { getSelectedProfile } from "@/features/profile/current-profile";

export default async function CandidaturasPage() {
  const profile = await getSelectedProfile();

  // Sem perfil o gate mostra o modal por cima; não há o que renderizar aqui.
  if (!profile) {
    return null;
  }

  const applications = await listApplications(profile.id);

  return (
    <ApplicationsPanel profileId={profile.id} applications={applications} />
  );
}
