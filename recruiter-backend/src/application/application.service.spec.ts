import type { Resume } from '@recruit/shared';
import { ApplicationService } from './application.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

/**
 * Qual currículo fica registrado em cada candidatura, de ponta a ponta no
 * serviço. O banco é falso, em memória, e cobre só o que `create` e `update`
 * usam: a regra mora no serviço, e é ela que se quer ver.
 */

const resume = (summary: string): Resume => ({
  birthDate: null,
  summary,
  experiences: [],
  education: [],
  skills: ['TypeScript'],
  projects: [],
  languages: [],
  certifications: [],
});

interface Version {
  id: string;
  profileId: string;
  jobId: string | null;
  content: Resume;
  createdAt: Date;
}

interface Row {
  id: string;
  profileId: string;
  jobId: string;
  status: string;
  notes: string | null;
  appliedAt: Date | null;
  resumeVersionId: string | null;
  deletedAt: Date | null;
  nextFollowUpAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function fakeDb() {
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 10, 1) + clock++ * 1000);
  const profile = { id: 'perfil-1', resume: resume('Base v1') as unknown };
  const job = {
    id: 'vaga-1',
    company: 'Empresa Exemplo',
    title: 'Dev Front-end',
    url: null,
    seniority: null,
    workModel: null,
    location: null,
  };
  const versions: Version[] = [];
  const applications: Row[] = [];
  const events: { applicationId: string; toStatus: string }[] = [];

  const withRelations = (row: Row) => {
    const version = versions.find((v) => v.id === row.resumeVersionId);

    return {
      ...row,
      job,
      resumeVersion: version
        ? { id: version.id, label: version.id, createdAt: version.createdAt }
        : null,
    };
  };

  const newest = (list: Version[]) =>
    [...list].sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null;

  const tx = {
    profile: {
      findUnique: () => Promise.resolve(profile),
    },
    job: {
      findUnique: () => Promise.resolve(job),
    },
    resumeVersion: {
      findFirst: ({ where }: { where: { jobId: string | null } }) =>
        Promise.resolve(
          newest(versions.filter((v) => v.jobId === where.jobId)),
        ),
      create: ({ data }: { data: { profileId: string; content: Resume } }) => {
        const version: Version = {
          id: `versao-${versions.length + 1}`,
          profileId: data.profileId,
          jobId: null,
          content: data.content,
          createdAt: tick(),
        };

        versions.push(version);

        return Promise.resolve({ id: version.id });
      },
    },
    application: {
      findFirst: ({ where }: { where: { id?: string } }) => {
        const row = applications.find(
          (a) => a.deletedAt === null && (!where.id || a.id === where.id),
        );

        return Promise.resolve(
          row && where.id
            ? {
                ...row,
                statusEvents: events.filter((e) => e.applicationId === row.id),
              }
            : null,
        );
      },
      create: ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `cand-${applications.length + 1}`,
          profileId: data.profileId as string,
          jobId: data.jobId as string,
          status: data.status as string,
          notes: data.notes ?? null,
          appliedAt: data.appliedAt ?? null,
          resumeVersionId: data.resumeVersionId ?? null,
          deletedAt: null,
          nextFollowUpAt: null,
          createdAt: tick(),
          updatedAt: tick(),
        };

        applications.push(row);

        return Promise.resolve(withRelations(row));
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Row>;
      }) => {
        const row = applications.find((a) => a.id === where.id) as Row;

        Object.assign(row, data, { updatedAt: tick() });

        return Promise.resolve(withRelations(row));
      },
    },
    statusEvent: {
      create: ({
        data,
      }: {
        data: { applicationId: string; toStatus: string };
      }) => {
        events.push({
          applicationId: data.applicationId,
          toStatus: data.toStatus,
        });

        return Promise.resolve(data);
      },
    },
  };

  const prisma = {
    $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  };

  /** Uma versão adaptada salva para a vaga, como faz `tailored-resume`. */
  const tailor = (summary: string) => {
    versions.push({
      id: `adaptada-${versions.length + 1}`,
      profileId: profile.id,
      jobId: job.id,
      content: resume(summary),
      createdAt: tick(),
    });
  };

  const contentOf = (id: string | undefined) =>
    versions.find((v) => v.id === id)?.content.summary ?? null;

  return { prisma, tx, profile, tailor, contentOf };
}

const service = (db: ReturnType<typeof fakeDb>) =>
  new ApplicationService(db.prisma as never);

describe('currículo efetivamente enviado', () => {
  it('criada já como aplicada congela o currículo base do momento', async () => {
    const db = fakeDb();

    const created = await service(db).create({
      profileId: 'perfil-1',
      jobId: 'vaga-1',
      status: 'aplicado',
      appliedAt: '2026-11-10T12:00:00.000Z',
    });

    expect(db.contentOf(created.resumeVersion?.id)).toBe('Base v1');
  });

  it('criada já como aplicada leva a versão adaptada da vaga', async () => {
    const db = fakeDb();
    db.tailor('Adaptado para a vaga');

    const created = await service(db).create({
      profileId: 'perfil-1',
      jobId: 'vaga-1',
      status: 'aplicado',
    });

    expect(db.contentOf(created.resumeVersion?.id)).toBe(
      'Adaptado para a vaga',
    );
  });

  it('rascunho não congela: nada foi enviado ainda', async () => {
    const db = fakeDb();

    const draft = await service(db).create({
      profileId: 'perfil-1',
      jobId: 'vaga-1',
    });

    expect(draft.status).toBe('rascunho');
    expect(draft.resumeVersion).toBeNull();
  });

  it('rascunho editado antes do envio leva a versão do momento do envio', async () => {
    const db = fakeDb();
    const app = service(db);
    const draft = await app.create({ profileId: 'perfil-1', jobId: 'vaga-1' });

    // Entre anotar a vaga e enviar, o currículo foi adaptado para ela.
    db.profile.resume = resume('Base v2');
    db.tailor('Adaptado depois do rascunho');
    await app.update(draft.id, { notes: 'revisar requisitos' });

    const sent = await app.update(draft.id, { status: 'aplicado' });

    expect(db.contentOf(sent.resumeVersion?.id)).toBe(
      'Adaptado depois do rascunho',
    );
  });

  it('sem versão adaptada, o envio do rascunho congela o currículo base atual', async () => {
    const db = fakeDb();
    const app = service(db);
    const draft = await app.create({ profileId: 'perfil-1', jobId: 'vaga-1' });

    db.profile.resume = resume('Base v2');
    const sent = await app.update(draft.id, { status: 'aplicado' });

    expect(db.contentOf(sent.resumeVersion?.id)).toBe('Base v2');
  });

  it('preencher a data de envio também é o envio', async () => {
    const db = fakeDb();
    const app = service(db);
    const draft = await app.create({ profileId: 'perfil-1', jobId: 'vaga-1' });

    const sent = await app.update(draft.id, {
      appliedAt: '2026-11-12T12:00:00.000Z',
    });

    expect(db.contentOf(sent.resumeVersion?.id)).toBe('Base v1');
  });

  it('mudanças depois do envio preservam a versão enviada', async () => {
    const db = fakeDb();
    const app = service(db);
    const created = await app.create({
      profileId: 'perfil-1',
      jobId: 'vaga-1',
      status: 'aplicado',
    });
    const sentVersion = created.resumeVersion?.id;

    db.profile.resume = resume('Base v3');
    db.tailor('Adaptado tarde demais');

    for (const status of [
      'triagem',
      'entrevista',
      'rascunho',
      'aplicado',
    ] as const) {
      const updated = await app.update(created.id, { status });

      expect(updated.resumeVersion?.id).toBe(sentVersion);
    }
  });

  it('rascunho cancelado não congela: a vaga sumiu antes do envio', async () => {
    const db = fakeDb();
    const app = service(db);
    const draft = await app.create({ profileId: 'perfil-1', jobId: 'vaga-1' });

    const cancelled = await app.update(draft.id, { status: 'cancelado' });

    expect(cancelled.resumeVersion).toBeNull();
  });

  it('rascunho antigo, congelado na criação, troca de versão no envio', async () => {
    const db = fakeDb();
    const app = service(db);
    const draft = await app.create({ profileId: 'perfil-1', jobId: 'vaga-1' });
    const legacy = await db.tx.resumeVersion.create({
      data: { profileId: 'perfil-1', content: resume('Base v1') },
    });
    await db.tx.application.update({
      where: { id: draft.id },
      data: { resumeVersionId: legacy.id },
    });

    db.profile.resume = resume('Base v2');
    const sent = await app.update(draft.id, { status: 'aplicado' });

    expect(db.contentOf(sent.resumeVersion?.id)).toBe('Base v2');
  });

  it('sem currículo no envio, não apaga a versão que já havia', async () => {
    const db = fakeDb();
    const app = service(db);
    const draft = await app.create({ profileId: 'perfil-1', jobId: 'vaga-1' });
    const legacy = await db.tx.resumeVersion.create({
      data: { profileId: 'perfil-1', content: resume('Base v1') },
    });
    await db.tx.application.update({
      where: { id: draft.id },
      data: { resumeVersionId: legacy.id },
    });

    db.profile.resume = null;
    const sent = await app.update(draft.id, { status: 'aplicado' });

    expect(sent.resumeVersion?.id).toBe(legacy.id);
  });
});
