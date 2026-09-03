import { JobSearch, listSavedJobs, searchJobs } from "@/features/jobs";
import type { SearchResultItem } from "@/features/jobs/components/job-search";
import { getSelectedProfile } from "@/features/profile/current-profile";

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

  const query = params.q ?? "";
  const [results, saved] = await Promise.all([
    searchJobs({ q: query }),
    listSavedJobs(profile.id),
  ]);

  // O resultado da busca não conhece o seu banco. Casar por URL aqui é o que
  // permite mostrar "Salva" em vez de oferecer salvar de novo.
  const savedUrls = new Set(saved.map((item) => item.job.url));

  const items: SearchResultItem[] = results.map((result) => ({
    result,
    saved: savedUrls.has(result.url),
  }));

  return (
    <JobSearch
      profileId={profile.id}
      query={query}
      items={items}
      savedCount={saved.length}
    />
  );
}
