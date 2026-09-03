/*
  Warnings:

  - You are about to drop the column `salaryRange` on the `Job` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('clt', 'pj', 'estagio', 'temporario');

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "salaryRange",
ADD COLUMN     "benefits" TEXT[],
ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "salaryCurrency" TEXT DEFAULT 'BRL',
ADD COLUMN     "salaryMax" INTEGER,
ADD COLUMN     "salaryMin" INTEGER,
ADD COLUMN     "weeklyHours" INTEGER;

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedJob_profileId_savedAt_idx" ON "SavedJob"("profileId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_profileId_jobId_key" ON "SavedJob"("profileId", "jobId");

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
