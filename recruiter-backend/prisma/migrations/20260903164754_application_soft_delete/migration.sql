-- DropIndex
DROP INDEX "Application_profileId_jobId_key";

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Application_profileId_deletedAt_idx" ON "Application"("profileId", "deletedAt");
