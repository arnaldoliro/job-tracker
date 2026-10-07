import { Injectable } from '@nestjs/common';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type DueFollowUp,
  type Today,
} from '@recruit/shared';
import { active } from '../application/active';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { daysSince, followUpDueAt } from '../application/follow-up';

/**
 * Junta o que pede ação agora. Só leitura: as ações (follow-up feito, aplicar,
 * aceitar sugestão) continuam nas rotas de cada coisa.
 */
@Injectable()
export class TodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
  ) {}

  async today(profileId: string, now: Date = new Date()): Promise<Today> {
    const [applications, saved, suggestions] = await Promise.all([
      this.prisma.application.findMany({
        where: { profileId, ...active },
        select: {
          id: true,
          status: true,
          appliedAt: true,
          createdAt: true,
          nextFollowUpAt: true,
          job: { select: { company: true, title: true } },
          // Só o último: é ele que diz desde quando está neste status.
          statusEvents: {
            select: { occurredAt: true },
            orderBy: { occurredAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.savedJob.findMany({
        where: {
          profileId,
          // Salva e ainda sem candidatura ATIVA deste perfil.
          job: { applications: { none: { profileId, ...active } } },
        },
        orderBy: { savedAt: 'desc' },
        select: {
          savedAt: true,
          job: { select: { id: true, company: true, title: true, url: true } },
        },
      }),
      this.emails.suggestions(profileId),
    ]);

    const pipeline = Object.fromEntries(
      APPLICATION_STATUSES.map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;

    const followUps: DueFollowUp[] = [];

    for (const application of applications) {
      pipeline[application.status] += 1;

      // Candidatura sem evento é anterior ao histórico; a melhor data que se
      // sabe dela é o envio, ou a criação.
      const since =
        application.statusEvents[0]?.occurredAt ??
        application.appliedAt ??
        application.createdAt;

      const dueAt = followUpDueAt({
        status: application.status,
        since,
        nextFollowUpAt: application.nextFollowUpAt,
      });

      if (dueAt && dueAt <= now) {
        followUps.push({
          applicationId: application.id,
          company: application.job.company,
          title: application.job.title,
          status: application.status,
          since: since.toISOString(),
          dueAt: dueAt.toISOString(),
          daysInStatus: daysSince(since, now),
        });
      }
    }

    // O mais atrasado primeiro: é o que mais arrisca ter esfriado.
    followUps.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));

    return {
      followUps,
      pendingSuggestions: suggestions.length,
      savedNotApplied: saved.map((row) => ({
        jobId: row.job.id,
        company: row.job.company,
        title: row.job.title,
        url: row.job.url,
        savedAt: row.savedAt.toISOString(),
      })),
      pipeline,
    };
  }
}
