import { z } from 'zod';
import { applicationStatusSchema } from './application-status';

/**
 * Origem de uma transição de status. Espelha o enum StatusEventSource do Prisma.
 *
 * `ia` marca uma transição *sugerida* por modelo. A sugestão só vira estado
 * depois de confirmação humana — ver seção 4 do CLAUDE.md.
 */
export const statusEventSourceSchema = z.enum(['manual', 'email', 'ia']);

export type StatusEventSource = z.infer<typeof statusEventSourceSchema>;

export const STATUS_EVENT_SOURCES = statusEventSourceSchema.options;

/**
 * Uma transição registrada. O `StatusEvent` era gravado desde o início e nunca
 * lido — sem DTO, sem endpoint, sem tela. É o que a linha do tempo passa a
 * mostrar, e é a base das métricas prometidas na seção 3.
 */
export const statusEventSchema = z.object({
  id: z.string(),
  fromStatus: applicationStatusSchema.nullable(),
  toStatus: applicationStatusSchema,
  source: statusEventSourceSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type StatusEvent = z.infer<typeof statusEventSchema>;
