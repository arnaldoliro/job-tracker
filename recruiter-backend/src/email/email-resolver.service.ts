import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env';
import { ClassifierUnavailableError } from './email-classifier.service';
import {
  RESOLVE_SYSTEM,
  resolvePrompt,
  resolveVerdictSchema,
  type EmailToResolve,
  type ListedApplication,
  type ResolveVerdict,
} from './resolve-plan';

/**
 * Pergunta ao modelo o que fazer com UM email pendente.
 *
 * Um email por chamada, de propósito: numa chamada só com vários, o texto de
 * um email malicioso estaria no mesmo contexto dos outros e poderia pesar na
 * decisão sobre eles. Separados, o pior que um email consegue é uma proposta
 * errada para si mesmo — que ainda passa pela conferência do servidor e pelo
 * seu clique.
 *
 * Haiku, como a extração e a classificação (seção 4): é leitura com resposta
 * fechada. O que volta é validado com Zod e convertido em plano por
 * `toResolution`; este serviço não grava nada.
 */

const MODEL = 'claude-haiku-4-5-20251001';
const TOOL_NAME = 'decidir_email';

@Injectable()
export class EmailResolverService {
  private readonly logger = new Logger(EmailResolverService.name);
  private readonly client: Anthropic | null;

  constructor(config: ConfigService<Env, true>) {
    const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });

    this.client = apiKey
      ? new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 })
      : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /**
   * `null` quando a resposta veio fora do schema. Lança
   * `ClassifierUnavailableError` quando a API não respondeu.
   */
  async decide(
    email: EmailToResolve,
    applications: ListedApplication[],
  ): Promise<ResolveVerdict | null> {
    if (!this.client) {
      throw new ClassifierUnavailableError('ANTHROPIC_API_KEY não definida');
    }

    let message: Anthropic.Message;

    try {
      message = await this.client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: RESOLVE_SYSTEM,
        tools: [
          {
            name: TOOL_NAME,
            description: 'Registra a decisão sobre o email.',
            input_schema: z.toJSONSchema(
              resolveVerdictSchema,
            ) as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          { role: 'user', content: resolvePrompt(email, applications) },
        ],
      });
    } catch (error) {
      // Status e mensagem da API, nunca o corpo da requisição: ele carrega o
      // email inteiro.
      const status = error instanceof APIError ? String(error.status) : '-';

      throw new ClassifierUnavailableError(
        `Anthropic [${status}]: ${error instanceof Error ? error.message.slice(0, 200) : 'erro'}`,
      );
    }

    const block = message.content.find((item) => item.type === 'tool_use');
    const parsed = resolveVerdictSchema.safeParse(
      block?.type === 'tool_use' ? block.input : undefined,
    );

    if (!parsed.success) {
      this.logger.warn(
        `Decisão fora do schema para o email ${email.id}: ${parsed.error.issues
          .map((issue) => issue.path.join('.') || '(raiz)')
          .join(', ')}`,
      );

      return null;
    }

    return parsed.data;
  }
}
