import type { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from './metrics.service';

// Como nos outros specs de service: o PrismaService real puxa o
// `@nestjs/config` (ESM) e o cliente gerado, e aqui só importa a forma.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

/**
 * O service só junta consultas e funções puras. Este teste existe para o que
 * mora SÓ nele: quais linhas cada função recebe. É ali que um rascunho
 * escapava para `bySource` e `sourceYield.applied`.
 *
 * Fixtures sintéticas (§7): domínios e fontes inventados.
 */

type Row = {
  id: string;
  status: string;
  url: string;
  source: string;
  /** Histórico. Sem ele, só o status atual. */
  reached?: string[];
};

const ENVIO = new Date('2026-10-01T12:00:00Z');

/**
 * Como o app grava: rascunho nasce sem data de envio, candidatura enviada
 * nasce com ela.
 */
function application({ id, status, url, source, reached }: Row) {
  const history = reached ?? [status];

  return {
    id,
    status,
    appliedAt: history.some((step) => step !== 'rascunho') ? ENVIO : null,
    job: { source, url },
    statusEvents: history.map((toStatus) => ({ toStatus, occurredAt: ENVIO })),
  };
}

function serviceWith(rows: Row[], seenUrls: { url: string; source: string }[]) {
  const prisma = {
    application: {
      findMany: jest.fn().mockResolvedValue(rows.map(application)),
      count: jest.fn().mockResolvedValue(0),
    },
    discoveredJob: {
      findMany: jest.fn().mockResolvedValue(
        seenUrls.map((job) => ({
          ...job,
          firstSeenAt: new Date('2026-10-01T00:00:00Z'),
        })),
      ),
    },
    savedJob: {
      findMany: jest
        .fn()
        .mockResolvedValue(rows.map((row) => ({ job: { url: row.url } }))),
    },
    dismissedJob: { count: jest.fn().mockResolvedValue(0) },
    emailMessage: { findMany: jest.fn().mockResolvedValue([]) },
  };

  return new MetricsService(prisma as unknown as PrismaService);
}

describe('MetricsService', () => {
  const rows: Row[] = [
    {
      id: 'a1',
      status: 'aplicado',
      url: 'https://vagas.example/1',
      source: 'portal-a',
    },
    {
      id: 'a2',
      status: 'rascunho',
      url: 'https://vagas.example/2',
      source: 'portal-a',
    },
    {
      id: 'a3',
      status: 'rascunho',
      url: 'https://vagas.example/3',
      source: 'portal-b',
    },
  ];
  const seen = rows.map((row) => ({ url: row.url, source: row.source }));

  it('rascunho não conta por fonte', async () => {
    const metrics = await serviceWith(rows, seen).forProfile('perfil-1');

    expect(metrics.bySource).toEqual([{ source: 'portal-a', count: 1 }]);
    expect(metrics.drafts).toBe(2);
    expect(metrics.active).toBe(3);
  });

  it('rascunho não conta como candidatura no rendimento da fonte', async () => {
    const metrics = await serviceWith(rows, seen).forProfile('perfil-1');
    const byName = Object.fromEntries(
      metrics.sourceYield.map((row) => [row.source, row]),
    );

    // Salvar continua contando: rascunho é uma vaga salva, só não enviada.
    expect(byName['portal-a']).toEqual({
      source: 'portal-a',
      seen: 2,
      saved: 2,
      applied: 1,
    });
    expect(byName['portal-b']).toEqual({
      source: 'portal-b',
      seen: 1,
      saved: 1,
      applied: 0,
    });
  });

  it('enviada que voltou a rascunho continua contando na fonte', async () => {
    const voltou: Row[] = [
      {
        id: 'v1',
        status: 'rascunho',
        url: 'https://vagas.example/v1',
        source: 'portal-a',
        reached: ['aplicado', 'rejeitado', 'rascunho'],
      },
    ];
    const metrics = await serviceWith(voltou, [
      { url: 'https://vagas.example/v1', source: 'portal-a' },
    ]).forProfile('perfil-1');

    expect(metrics.bySource).toEqual([{ source: 'portal-a', count: 1 }]);
    expect(metrics.sourceYield[0].applied).toBe(1);
  });

  it('com poucas enviadas, a conversão vem nula mesmo com muitas linhas', async () => {
    const many: Row[] = [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `s${i}`,
        status: 'aplicado',
        url: `https://vagas.example/s${i}`,
        source: 'portal-a',
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `r${i}`,
        status: 'rascunho',
        url: `https://vagas.example/r${i}`,
        source: 'portal-a',
      })),
    ];
    const metrics = await serviceWith(many, []).forProfile('perfil-1');

    expect(metrics.funnel.every((step) => step.conversion === null)).toBe(true);
  });
});
