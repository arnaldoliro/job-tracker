import { z } from 'zod';

/**
 * Origem de uma transição de status. Espelha o enum StatusEventSource do Prisma.
 *
 * `ia` marca uma transição *sugerida* por modelo. A sugestão só vira estado
 * depois de confirmação humana — ver seção 4 do CLAUDE.md.
 */
export const statusEventSourceSchema = z.enum(['manual', 'email', 'ia']);

export type StatusEventSource = z.infer<typeof statusEventSourceSchema>;

export const STATUS_EVENT_SOURCES = statusEventSourceSchema.options;
