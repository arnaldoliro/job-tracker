-- CreateTable
CREATE TABLE "DismissedJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobUrl" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DismissedJob_profileId_dismissedAt_idx" ON "DismissedJob"("profileId", "dismissedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedJob_profileId_jobUrl_key" ON "DismissedJob"("profileId", "jobUrl");

-- AddForeignKey
ALTER TABLE "DismissedJob" ADD CONSTRAINT "DismissedJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
