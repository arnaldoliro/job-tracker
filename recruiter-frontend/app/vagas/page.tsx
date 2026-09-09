import { listSavedJobs } from "@/features/jobs";
import { JobDiscovery } from "@/features/jobs/components/job-discovery";
import { getSelectedProfile } from "@/features/profile/current-profile";

/**
 * A página não busca vaga nenhuma no servidor — os lotes chegam por Server
 * Action, a partir do clique. Buscar aqui faria cada revalidação da rota
 * refazer o fan-out nos portais, e a primeira pintura esperaria segundos por
 * uma lista que o usuário talvez nem queira.
 *
 * O que ela precisa saber é só o que já é do perfil, para o card nascer
 * mostrando "Salva" em vez de oferecer salvar de novo.
 */
export default async function BuscarVagasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [profile, params] = await Promise.all([
    getSelectedProfile(),
    searchParams,
  ]);

  if (!profile) {
    return null;
  }

  const saved = await listSavedJobs(profile.id);

  return (
    <JobDiscovery
      profileId={profile.id}
      query={params.q ?? ""}
      savedUrls={saved
        .map((item) => item.job.url)
        .filter((url) => url !== null)}
      savedCount={saved.length}
    />
  );
}
