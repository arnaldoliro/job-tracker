-- DropIndex
DROP INDEX "StatusEvent_applicationId_createdAt_idx";

-- AlterTable
ALTER TABLE "StatusEvent" ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill, escrito à mão: o Prisma gerou só o ALTER, e o DEFAULT acima
-- carimbaria TODO evento existente com o instante desta migration. Cada
-- transição do histórico passaria a ter acontecido hoje, e qualquer métrica de
-- tempo nasceria corrompida. `createdAt` é o melhor que se sabe desses eventos.
UPDATE "StatusEvent" SET "occurredAt" = "createdAt";

-- CreateIndex
CREATE INDEX "StatusEvent_applicationId_occurredAt_idx" ON "StatusEvent"("applicationId", "occurredAt");
