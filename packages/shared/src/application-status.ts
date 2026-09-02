import { z } from 'zod';

/**
 * Status de uma candidatura. A ordem reflete o fluxo esperado:
 * rascunho -> aplicado -> triagem -> entrevista -> teste -> oferta | rejeitado
 *
 * `rejeitado` pode acontecer a partir de qualquer estágio, por isso não é
 * um passo linear.
 */
export const applicationStatusSchema = z.enum([
  'rascunho',
  'aplicado',
  'triagem',
  'entrevista',
  'teste',
  'oferta',
  'rejeitado',
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const APPLICATION_STATUSES = applicationStatusSchema.options;
