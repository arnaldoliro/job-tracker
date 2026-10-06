-- CreateTable
CREATE TABLE "DiscoveredJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveredJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveredJob_profileId_firstSeenAt_idx" ON "DiscoveredJob"("profileId", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredJob_profileId_url_key" ON "DiscoveredJob"("profileId", "url");

-- AddForeignKey
ALTER TABLE "DiscoveredJob" ADD CONSTRAINT "DiscoveredJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
