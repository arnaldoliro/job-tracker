import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
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
 * Leitura com resposta fechada, como a classificação: Haiku na Anthropic
 * (seção 4) ou o modelo local, conforme o `.env`. O que volta é validado com
 * Zod e convertido em plano por `toResolution`; este serviço não grava nada.
 */

const TOOL = {
  name: 'decidir_email',
  description: 'Registra a decisão sobre o email.',
};

@Injectable()
export class EmailResolverService {
  constructor(private readonly ai: AiService) {}

  get configured(): boolean {
    return this.ai.isConfigured('resolve');
  }

  /** O que falta para funcionar, com o nome da variável do `.env`. */
  get unavailableMessage(): string {
    return this.ai.unavailableMessage('resolve');
  }

  /**
   * `null` quando a resposta veio fora do schema. Lança
   * `AiUnavailableError` quando o provedor não respondeu.
   */
  decide(
    email: EmailToResolve,
    applications: ListedApplication[],
  ): Promise<ResolveVerdict | null> {
    return this.ai.complete('resolve', {
      system: RESOLVE_SYSTEM,
      user: resolvePrompt(email, applications),
      schema: resolveVerdictSchema,
      tool: TOOL,
      maxTokens: 512,
      timeoutMs: 30_000,
    });
  }
}
