import { Injectable, NotFoundException } from '@nestjs/common';
import {
  defaultJobPreferences,
  resumeSchema,
  type DiscoverResult,
  type Job,
  type SaveJobInput,
  type SavedJob,
} from '@recruit/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JobModel } from '../generated/prisma/models';
import { DiscoveryService } from './discovery/discovery.service';

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
  ) {}

  /**
   * Descoberta: vagas reais dos portais, ordenadas por aderência ao currículo.
   *
   * Como a busca, não toca o banco para escrever — só lê o que já é seu, para
   * não reoferecer o que você já resolveu.
   */
  async discover(params: {
    profileId: string;
    cursor?: string;
    q?: string;
  }): Promise<DiscoverResult> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: params.profileId },
      select: { resume: true },
    });

    if (!profile) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Perfil não encontrado',
      });
    }

    const resume = resumeSchema.safeParse(profile.resume);

    return this.discoveryService.discover({
      q: params.q,
      skills: resume.success ? resume.data.skills : [],
      // Fase 1: preferências ainda não são editáveis nem persistidas.
      preferences: defaultJobPreferences,
      excludedUrls: await this.resolvedUrls(params.profileId),
      cursor: params.cursor,
    });
  }

  /**
   * URLs que este perfil já resolveu, e que não devem voltar na fila.
   *
   * Salvas NÃO bastam: `unsave` apaga só o `SavedJob`, e a `Application`
   * sobrevive (`onDelete: Restrict`). Sem o segundo braço, uma vaga em que
   * você já se candidatou e depois tirou das salvas volta como novidade — o
   * pior erro possível numa tela que promete só mostrar o que você não viu.
   */
  private async resolvedUrls(profileId: string): Promise<Set<string>> {
    const rows = await this.prisma.job.findMany({
      where: {
        url: { not: null },
        OR: [
          { savedBy: { some: { profileId } } },
          { applications: { some: { profileId, deletedAt: null } } },
        ],
      },
      select: { url: true },
    });

    return new Set(rows.map((row) => row.url).filter((url) => url !== null));
  }

  async findById(id: string): Promise<Job> {
    const row = await this.prisma.job.findUnique({ where: { id } });

    if (!row) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Vaga não encontrada',
      });
    }

    return toJobDto(row);
  }

  /**
   * Materializa o resultado externo. A vaga é deduplicada por `url`: se outro
   * perfil já salvou a mesma, os dois apontam para o mesmo `Job`.
   */
  async save({ profileId, result }: SaveJobInput): Promise<SavedJob> {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { id: true },
      });

      if (!profile) {
        throw new NotFoundException({
          error: 'Not Found',
          message: 'Perfil não encontrado',
        });
      }

      const existing = await tx.job.findUnique({ where: { url: result.url } });

      const job =
        existing ??
        (await tx.job.create({
          data: {
            company: result.company,
            title: result.title,
            url: result.url,
            source: result.source,
            description: result.description,
            stack: result.stack,
            requirements: result.requirements,
            benefits: result.benefits,
            seniority: result.seniority,
            workModel: result.workModel,
            contractType: result.contractType,
            location: result.location,
            salaryMin: result.salaryMin,
            salaryMax: result.salaryMax,
            salaryCurrency: result.salaryCurrency,
            weeklyHours: result.weeklyHours,
          },
        }));

      // Salvar duas vezes não duplica nem falha: o @@unique garante um por par.
      const saved = await tx.savedJob.upsert({
        where: { profileId_jobId: { profileId, jobId: job.id } },
        create: { profileId, jobId: job.id },
        update: {},
      });

      return {
        jobId: job.id,
        savedAt: saved.savedAt.toISOString(),
        job: toJobDto(job),
        application: null,
      };
    });
  }

  /**
   * A candidatura ativa vem junto, na mesma consulta. É ela que decide se a
   * tela mostra "Aplicar" ou "Acompanhar candidatura" — buscar por vaga seria
   * um N+1 para responder a mesma pergunta.
   */
  async listSaved(profileId: string): Promise<SavedJob[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { profileId },
      orderBy: { savedAt: 'desc' },
      include: {
        job: {
          include: {
            applications: {
              where: { profileId, deletedAt: null },
              select: { id: true, status: true },
              take: 1,
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      jobId: row.jobId,
      savedAt: row.savedAt.toISOString(),
      job: toJobDto(row.job),
      application: row.job.applications[0] ?? null,
    }));
  }

  async unsave(profileId: string, jobId: string): Promise<void> {
    const { count } = await this.prisma.savedJob.deleteMany({
      where: { profileId, jobId },
    });

    if (count === 0) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Vaga salva não encontrada',
      });
    }
  }
}

function toJobDto(row: JobModel): Job {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    url: row.url,
    source: row.source,
    description: row.description,
    stack: row.stack,
    requirements: row.requirements,
    benefits: row.benefits,
    seniority: row.seniority,
    workModel: row.workModel,
    contractType: row.contractType,
    location: row.location,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    weeklyHours: row.weeklyHours,
    extractedAt: row.extractedAt ? row.extractedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
