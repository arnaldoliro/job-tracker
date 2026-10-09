import { HttpException } from '@nestjs/common';
import type { AiTask } from '@recruit/shared';
import { httpMessage, type AiUnavailableError } from './ai-errors';

const ERROR_NAME = {
  429: 'Too Many Requests',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
} as const;

/**
 * `AiUnavailableError` → a resposta HTTP que a tela já sabe mostrar.
 *
 * Camada fina sobre `httpMessage`, que é pura e testada: aqui só se monta o
 * objeto do Nest, no mesmo formato `{ error, message }` das outras exceções.
 */
export function toHttpException(
  error: AiUnavailableError,
  task: AiTask,
): HttpException {
  const { status, message } = httpMessage(error, task);

  return new HttpException({ error: ERROR_NAME[status], message }, status);
}
