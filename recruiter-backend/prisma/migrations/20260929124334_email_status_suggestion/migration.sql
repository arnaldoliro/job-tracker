-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "suggestedStatus" "ApplicationStatus",
ADD COLUMN     "suggestionNote" TEXT,
ADD COLUMN     "suggestionResolvedAt" TIMESTAMP(3);
