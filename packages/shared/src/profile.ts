import { z } from 'zod';

/**
 * Perfil como a API o devolve. Não é espelho da tabela: `resume`, `links` e
 * `phone` existem no banco e não são expostos aqui. O que a API mostra é uma
 * decisão, não um reflexo do schema do Prisma.
 */
export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type Profile = z.infer<typeof profileSchema>;

export const profileListSchema = z.array(profileSchema);

/**
 * Entrada da criação de perfil.
 *
 * `strictObject` e não `object`: o `object` comum descarta campo não declarado
 * em silêncio, então um POST com `isDefault: true` viraria um 201 que ignorou
 * metade do que o cliente mandou. Aqui isso é 400 com "Unrecognized key".
 */
export const createProfileSchema = z.strictObject({
  name: z.string().trim().min(1, 'Informe um nome').max(80, 'Máximo de 80 caracteres'),
  headline: z
    .string()
    .trim()
    .max(120, 'Máximo de 120 caracteres')
    .optional(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
