/** Superfície pública da feature. `api.ts` e `actions.ts` são internos. */
export { JobSearch } from "@/features/jobs/components/job-search";
export { SavedJobsList } from "@/features/jobs/components/saved-jobs-list";
export { JobDetail } from "@/features/jobs/components/job-detail";
export { searchJobs, listSavedJobs, getJob } from "@/features/jobs/api";
export type { Job, JobSearchResult, SavedJob } from "@/features/jobs/types";
