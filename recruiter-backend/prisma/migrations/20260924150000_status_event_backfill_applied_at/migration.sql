-- O evento de CRIAÇÃO de uma candidatura com data de envio aconteceu naquela
-- data, não quando foi registrado.
--
-- É a mesma regra que `ApplicationService.create()` passou a aplicar às
-- candidaturas novas. A migration anterior preencheu `occurredAt` com
-- `createdAt` para todo evento existente — correto para as transições, mas
-- não para a criação de uma candidatura vinda de email de confirmação, que
-- carrega o `appliedAt` real. Sem isto, a linha do tempo mostraria como
-- enviada em setembro uma candidatura enviada em agosto.
--
-- Só eventos de criação (`fromStatus` nulo), e só quando há `appliedAt`.
UPDATE "StatusEvent" AS e
SET "occurredAt" = a."appliedAt"
FROM "Application" AS a
WHERE e."applicationId" = a.id
  AND e."fromStatus" IS NULL
  AND a."appliedAt" IS NOT NULL;
