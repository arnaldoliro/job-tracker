import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Job,
  JobSearchResult,
  SaveJobInput,
  SavedJob,
} from '@recruit/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JobModel } from '../generated/prisma/models';
import { JobSearchProvider, type JobSearchQuery } from './job-search.provider';

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchProvider: JobSearchProvider,
  ) {}

  /** Não toca o banco: resultado de busca só vira `Job` quando salvo. */
  search(query: JobSearchQuery): Promise<JobSearchResult[]> {
    return this.searchProvider.search(query);
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
