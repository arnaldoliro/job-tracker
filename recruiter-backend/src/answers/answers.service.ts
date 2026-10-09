import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resumeSchema } from '@recruit/shared';
import type { AnswerDraft, AnswerLanguage, AnswerMode } from '@recruit/shared';
import { AiUnavailableError, classifyAnthropicError } from '../ai/ai-errors';
import { toHttpException } from '../ai/ai-http';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANSWER_SYSTEM,
  answerPrompt,
  finalize,
  isResumeEmpty,
  modelAnswerSchema,
  renderResume,
  type JobContext,
  type ModelAnswer,
} from './answer-plan';

/**
 * Sonnet, e não Haiku: é escrita, e a seção 4 reserva Sonnet/Opus para isso.
 * A versão atual da linha.
 */
const MODEL = 'claude-sonnet-5-5';

/**
 * Cada rascunho é uma chamada paga, e a API não tem autenticação — escuta só
 * em 127.0.0.1, mas um laço acidental no próprio navegador ainda geraria
 * fatura. Dez por minuto é mais do que alguém escreve à mão.
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/** Quanto da janela do modelo local fica para a resposta. */
const LOCAL_OUTPUT_RESERVE = 2_048;

/** Menos que isto de vaga e o modelo responde sem saber para o que é. */
const MIN_JOB_CHARS = 2_000;

const LOCAL_TOOL = {
  name: 'responder_pergunta',
  description: 'Registra a resposta para a pergunta do formulário.',
};

export interface DraftRequest {
  profileId: string;
  jobId?: string;
  jobText?: string;
  question: string;
  notes?: string;
  maxChars?: number;
  language: AnswerLanguage;
  mode: AnswerMode;
}

@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);
  private calls: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async draft(input: DraftRequest): Promise<AnswerDraft> {
    if (!this.ai.isConfigured('answers')) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: this.ai.unavailableMessage('answers'),
      });
    }

    const [resumeText, job] = await Promise.all([
      this.resumeOf(input.profileId),
      this.jobContext(input),
    ]);

    this.assertWithinRateLimit();

    const notes = input.notes?.trim() || null;
    const maxChars = input.maxChars ?? null;

    const { output, jobText } =
      this.ai.provider('answers') === 'local'
        ? await this.askLocal(resumeText, job, input, notes, maxChars)
        : await this.askAnthropic(resumeText, job, input, notes, maxChars);

    return finalize(output, {
      mode: input.mode,
      maxChars,
      resumeText,
      notes,
      question: input.question,
      jobText,
    });
  }

  /**
   * A chamada na Anthropic.
   *
   * O currículo vai no `system`, depois das regras, com o marcador de cache:
   * regras e currículo não mudam entre perguntas, então a segunda pergunta
   * paga só a vaga e a pergunta. Tudo que varia vai na mensagem do usuário,
   * depois do prefixo.
   *
   * Saída estruturada validada por Zod — o modelo não devolve texto solto que
   * o código precise interpretar (seção 4). `fallbacks: "default"` refaz a
   * chamada em outro modelo se a primeira for recusada por engano.
   *
   * Fica fora do `AiService.complete` de propósito: saída estruturada em beta,
   * `fallbacks`, `effort` e cache de prompt são recursos só da Anthropic.
   */
  private async askAnthropic(
    resumeText: string,
    job: JobContext,
    input: DraftRequest,
    notes: string | null,
    maxChars: number | null,
  ): Promise<{ output: ModelAnswer; jobText: string }> {
    let message: Awaited<ReturnType<typeof this.ask>>;

    try {
      message = await this.ask(resumeText, job, input, notes, maxChars);
    } catch (error) {
      // A mensagem crua da API fica só no log, sem o corpo da requisição —
      // ele carrega o seu currículo.
      const failure = classifyAnthropicError(error);

      this.logger.error(`Falha ao chamar a Anthropic: ${failure.detail}`);

      throw toHttpException(failure, 'answers');
    }

    // Recusa não é erro de rede: a API respondeu que não vai responder. Os
    // `fallbacks` já tentaram outro modelo antes de chegar aqui.
    if (message.stop_reason === 'refusal') {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'A IA não quis responder a esta pergunta. Reformule a pergunta ou escreva a resposta à mão.',
      });
    }

    const parsed = modelAnswerSchema.safeParse(message.parsed_output);

    if (!parsed.success) {
      this.logger.warn(
        `Resposta fora do formato para o perfil ${input.profileId} (stop: ${message.stop_reason})`,
      );

      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'A IA devolveu uma resposta incompleta. Tente de novo.',
      });
    }

    // Só uso e ids no log: pergunta, vaga e currículo são conteúdo seu.
    this.logger.log(
      `Rascunho (${input.mode}) para o perfil ${input.profileId}: ${message.usage.input_tokens} entrada, ${message.usage.cache_read_input_tokens ?? 0} do cache, ${message.usage.output_tokens} saída`,
    );

    return { output: parsed.data, jobText: job.text };
  }

  private ask(
    resumeText: string,
    job: JobContext,
    input: DraftRequest,
    notes: string | null,
    maxChars: number | null,
  ) {
    return this.ai.anthropic!.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 8_000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          // Escrita curta sobre fatos dados: `medium` basta, e é mais rápido.
          effort: 'medium',
          format: betaZodOutputFormat(modelAnswerSchema),
        },
        system: [
          { type: 'text', text: ANSWER_SYSTEM },
          {
            type: 'text',
            text: `<curriculo>\n${resumeText}\n</curriculo>`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: answerPrompt({
              job,
              question: input.question,
              notes,
              maxChars,
              language: input.language,
              mode: input.mode,
            }),
          },
        ],
      },
      // Tem uma tela esperando. Mais que isto é requisição pendurada.
      { timeout: 90_000, maxRetries: 1 },
    );
  }

  /**
   * A chamada no modelo local.
   *
   * Mesmas regras, mesmo currículo no `system`, mesmo schema — pelo
   * `AiService.complete`, que manda o schema em `format` e os campos no
   * prompt. Sem cache de prompt (o `keep_alive` do Ollama faz as vezes) e sem
   * recusa: o modelo local não tem esse sinal.
   *
   * O que muda é a janela: currículo, regras e pergunta já ocupam parte dela,
   * e a vaga é cortada para caber no que sobra — pelo fim, onde ficam os
   * benefícios, e não pelo começo, onde está o cargo.
   */
  private async askLocal(
    resumeText: string,
    job: JobContext,
    input: DraftRequest,
    notes: string | null,
    maxChars: number | null,
  ): Promise<{ output: ModelAnswer; jobText: string }> {
    const budget = this.ai.textBudget('answers', LOCAL_OUTPUT_RESERVE) ?? 0;
    const taken =
      ANSWER_SYSTEM.length +
      resumeText.length +
      input.question.length +
      (notes?.length ?? 0);
    const jobText = job.text.slice(0, Math.max(MIN_JOB_CHARS, budget - taken));

    let output: ModelAnswer | null;

    try {
      output = await this.ai.complete('answers', {
        system: `${ANSWER_SYSTEM}\n\n<curriculo>\n${resumeText}\n</curriculo>`,
        user: answerPrompt({
          job: { ...job, text: jobText },
          question: input.question,
          notes,
          maxChars,
          language: input.language,
          mode: input.mode,
        }),
        schema: modelAnswerSchema,
        tool: LOCAL_TOOL,
        maxTokens: 8_000,
        timeoutMs: 90_000,
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        throw toHttpException(error, 'answers');
      }

      throw error;
    }

    if (output === null) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'A IA devolveu uma resposta incompleta. Tente de novo.',
      });
    }

    return { output, jobText };
  }

  /** O currículo do perfil, já validado e renderizado, ou 400 se vazio. */
  private async resumeOf(profileId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { resume: true },
    });

    if (!profile) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Perfil não encontrado',
      });
    }

    const resume = resumeSchema.safeParse(profile.resume);

    if (!resume.success || isResumeEmpty(resume.data)) {
      throw new BadRequestException({
        error: 'Bad Request',
        message:
          'Preencha o currículo antes: a resposta é montada a partir das suas experiências, e sem elas a IA só teria o que inventar.',
      });
    }

    return renderResume(resume.data);
  }

  private async jobContext(input: DraftRequest): Promise<JobContext> {
    if (!input.jobId) {
      return { company: null, title: null, text: input.jobText ?? '' };
    }

    const job = await this.prisma.job.findUnique({
      where: { id: input.jobId },
      select: {
        company: true,
        title: true,
        description: true,
        requirements: true,
        stack: true,
        seniority: true,
      },
    });

    if (!job) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Vaga não encontrada',
      });
    }

    const text = [
      job.seniority ? `Senioridade: ${job.seniority}` : '',
      job.stack.length > 0 ? `Stack: ${job.stack.join(', ')}` : '',
      job.requirements.length > 0
        ? `Requisitos:\n${job.requirements.map((item) => `- ${item}`).join('\n')}`
        : '',
      job.description ?? '',
      // Texto colado junto com uma vaga salva: complementa, não substitui.
      input.jobText ?? '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return { company: job.company, title: job.title, text };
  }

  private assertWithinRateLimit(): void {
    const now = Date.now();

    this.calls = this.calls.filter((at) => now - at < RATE_WINDOW_MS);

    if (this.calls.length >= RATE_LIMIT) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Muitas respostas seguidas. Espere um minuto.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.calls.push(now);
  }
}
