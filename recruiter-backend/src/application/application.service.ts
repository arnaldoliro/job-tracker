import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '@recruit/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplicationModel, JobModel } from '../generated/prisma/models';

/**
 * Filtro obrigatório em toda query. Candidatura com `deletedAt` preenchido não
 * existe para o negócio — nem na lista, nem nas métricas.
 *
 * Enquanto este for o único service que lê `Application`, repetir a condição
 * aqui basta. Se a leitura se espalhar, vale uma extensão do Prisma Client para
 * o filtro deixar de depender de alguém lembrar.
 */
const active = { deletedAt: null };

/** O que a API expõe da vaga. Menos que a tabela, de propósito. */
const jobSelect = {
  id: true,
  company: true,
  title: true,
  url: true,
  seniority: true,
  workModel: true,
  location: true,
} as const;

type ApplicationRow = ApplicationModel & {
  job: Pick<JobModel, keyof typeof jobSelect>;
};

@Injectable()
export class ApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(profileId: string): Promise<Application[]> {
    const rows = await this.prisma.application.findMany({
      where: { profileId, ...active },
      orderBy: { updatedAt: 'desc' },
      include: { job: { select: jobSelect } },
    });

    return rows.map(toApplicationDto);
  }

  async findById(id: string): Promise<Application> {
    const row = await this.prisma.application.findFirst({
      where: { id, ...active },
      include: { job: { select: jobSelect } },
    });

    if (!row) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }

    return toApplicationDto(row);
  }

  /**
   * Vaga, candidatura e o primeiro StatusEvent numa transação só: ou os três
   * existem, ou nenhum. Uma candidatura sem evento inicial já nasceria com o
   * histórico furado, e as métricas dependem dele.
   */
  async create(input: CreateApplicationInput): Promise<Application> {
    const status = input.status ?? 'rascunho';

    const row = await this.prisma.$transaction(async (tx) => {
      // O profileId vem do body, e o ZodValidationPipe só garante o formato.
      // Sem esta checagem a violação de chave estrangeira viraria um 500 sem
      // explicação. Dentro da transação porque só assim é de fato atômico com
      // o insert — conferir antes deixaria uma janela entre checar e gravar.
      const profile = await tx.profile.findUnique({
        where: { id: input.profileId },
        select: { id: true },
      });

      if (!profile) {
        throw new NotFoundException({
          error: 'Not Found',
          message: 'Perfil não encontrado',
        });
      }

      // Dois caminhos, garantidos pelo schema: ou vem `jobId` (aplicar a uma
      // vaga salva), ou vêm empresa e cargo (registrar do zero).
      let job: { id: string };

      if (input.jobId) {
        const saved = await tx.job.findUnique({
          where: { id: input.jobId },
          select: { id: true },
        });

        if (!saved) {
          throw new NotFoundException({
            error: 'Not Found',
            message: 'Vaga não encontrada',
          });
        }

        job = saved;
      } else {
        // Mesma URL é a mesma vaga: colar o link duas vezes não cria duplicata.
        const existingJob = input.url
          ? await tx.job.findUnique({ where: { url: input.url } })
          : null;

        job =
          existingJob ??
          (await tx.job.create({
            data: {
              company: input.company as string,
              title: input.title as string,
              url: input.url ?? null,
              source: 'manual',
            },
          }));
      }

      // Substitui o antigo @@unique([profileId, jobId]), que o soft delete
      // tornou inviável — ver o comentário no schema.prisma.
      const duplicate = await tx.application.findFirst({
        where: { profileId: input.profileId, jobId: job.id, ...active },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException({
          error: 'Conflict',
          message: 'Este perfil já tem uma candidatura ativa para esta vaga',
        });
      }

      const application = await tx.application.create({
        data: {
          profileId: input.profileId,
          jobId: job.id,
          status,
          notes: input.notes ?? null,
          appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
        },
        include: { job: { select: jobSelect } },
      });

      await tx.statusEvent.create({
        data: {
          applicationId: application.id,
          fromStatus: null,
          toStatus: status,
          source: 'manual',
        },
      });

      return application;
    });

    return toApplicationDto(row);
  }

  /**
   * Único lugar do código que altera `Application.status`. A mudança e o
   * StatusEvent saem na mesma transação — é o que sustenta a regra da seção 3
   * do CLAUDE.md ("nunca sobrescrever status sem gravar o evento") e o que faz
   * as métricas serem confiáveis depois.
   */
  async update(
    id: string,
    input: UpdateApplicationInput,
  ): Promise<Application> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.application.findFirst({
        where: { id, ...active },
        select: { id: true, jobId: true, status: true },
      });

      if (!current) {
        throw new NotFoundException({
          error: 'Not Found',
          message: 'Candidatura não encontrada',
        });
      }

      const touchesJob =
        input.company !== undefined ||
        input.title !== undefined ||
        input.url !== undefined;

      if (touchesJob) {
        await tx.job.update({
          where: { id: current.jobId },
          data: {
            ...(input.company !== undefined && { company: input.company }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.url !== undefined && { url: input.url }),
          },
        });
      }

      const application = await tx.application.update({
        where: { id },
        data: {
          ...(input.status !== undefined && { status: input.status }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.appliedAt !== undefined && {
            appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
          }),
        },
        include: { job: { select: jobSelect } },
      });

      if (input.status !== undefined && input.status !== current.status) {
        await tx.statusEvent.create({
          data: {
            applicationId: id,
            fromStatus: current.status,
            toStatus: input.status,
            source: 'manual',
          },
        });
      }

      return application;
    });

    return toApplicationDto(row);
  }

  /** Soft delete: a linha fica, o negócio deixa de enxergá-la. */
  async softDelete(id: string): Promise<void> {
    const { count } = await this.prisma.application.updateMany({
      where: { id, ...active },
      data: { deletedAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }
  }
}

function toApplicationDto(row: ApplicationRow): Application {
  return {
    id: row.id,
    profileId: row.profileId,
    status: row.status,
    notes: row.notes,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    job: {
      id: row.job.id,
      company: row.job.company,
      title: row.job.title,
      url: row.job.url,
      seniority: row.job.seniority,
      workModel: row.job.workModel,
      location: row.job.location,
    },
  };
}
