import { notFound } from "next/navigation";
import { ApiError } from "@/features/jobs/api";
import { JobDetail, getJob } from "@/features/jobs";
import type { Job } from "@/features/jobs";

export default async function VagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Só a busca fica no try; o JSX sai de fora, senão o try/catch viraria um
  // limite de erro acidental para tudo que a árvore renderizar abaixo.
  let job: Job;

  try {
    job = await getJob(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return <JobDetail job={job} />;
}
