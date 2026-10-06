import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida o body contra um schema Zod antes de o controller ver o dado.
 *
 * Existe para que validação seja mecanismo e não disciplina: nenhum controller
 * precisa lembrar de chamar `parse`, e o que chega ao service já está no
 * formato declarado. Ver "Nunca confiar no frontend" na seção 5 do CLAUDE.md.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: 'Dados inválidos',
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(raiz)',
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
