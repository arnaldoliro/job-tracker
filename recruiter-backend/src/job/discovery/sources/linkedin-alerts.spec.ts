import { jobSearchResultSchema } from '@recruit/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import { LinkedInAlertsSource } from './linkedin-alerts';

/**
 * A fonte, com o banco dublado.
 *
 * O parser já é testado isolado; aqui interessa o que só existe entre emails:
 * a deduplicação por id, a data de primeira aparição, e o filtro de remetente.
 */

function corpo(
  ...vagas: [titulo: string, empresa: string, local: string, id: string][]
): string {
  return vagas
    .map(([titulo, empresa, local, id]) =>
      [
        titulo,
        empresa,
        local,
        `Visualizar vaga: https://www.linkedin.com/comm/jobs/view/${id}/?trk=x`,
      ].join('\n'),
    )
    .join('\n\n------------------------------\n\n');
}

interface Linha {
  fromAddress: string;
  receivedAt: Date;
  bodyText: string | null;
}

function fonte(linhas: Linha[]): LinkedInAlertsSource {
  const prisma = {
    emailMessage: { findMany: jest.fn().mockResolvedValue(linhas) },
  } as unknown as PrismaService;

  return new LinkedInAlertsSource(prisma);
}

const ALERTA = 'jobalerts-noreply@linkedin.com';

describe('LinkedInAlertsSource', () => {
  it('lê as vagas de um digest', async () => {
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-10T10:00:00Z'),
        bodyText: corpo(
          ['Desenvolvedor Node.js', 'Acme', 'Salvador, BA', '2001'],
          ['Fullstack Engineer', 'Globex', 'Brasil', '2002'],
        ),
      },
    ]).fetch();

    expect(vagas).toHaveLength(2);
    expect(vagas[0]).toMatchObject({
      company: 'Acme',
      title: 'Desenvolvedor Node.js',
      url: 'https://www.linkedin.com/jobs/view/2001',
      source: 'linkedin-alerts',
      description: null,
      location: 'Salvador, BA',
    });
  });

  it('a mesma vaga em dois digests mantém a data mais ANTIGA', async () => {
    // Usar a mais recente faria uma vaga republicada rejuvenescer a cada
    // aparição e flutuar no topo do lote para sempre.
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-03-01T10:00:00Z'),
        bodyText: corpo(['Dev', 'Acme', 'Brasil', '2003']),
      },
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-03-08T10:00:00Z'),
        bodyText: corpo(['Dev', 'Acme', 'Brasil', '2003']),
      },
    ]).fetch();

    expect(vagas).toHaveLength(1);
    expect(vagas[0].postedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('ignora remetente do LinkedIn que não é digest', async () => {
    // `jobs-noreply` traz as CONFIRMAÇÕES de candidatura. Se entrasse aqui,
    // um aviso de "sua candidatura foi enviada" viraria vaga no lote.
    const vagas = await fonte([
      {
        fromAddress: 'jobs-noreply@linkedin.com',
        receivedAt: new Date('2026-09-10T10:00:00Z'),
        bodyText: corpo(['Dev', 'Acme', 'Brasil', '2004']),
      },
    ]).fetch();

    expect(vagas).toHaveLength(0);
  });

  it('não quebra com corpo nulo', async () => {
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-10T10:00:00Z'),
        bodyText: null,
      },
    ]).fetch();

    expect(vagas).toHaveLength(0);
  });

  it('caixa vazia devolve lista vazia', async () => {
    expect(await fonte([]).fetch()).toEqual([]);
  });

  it('toda vaga emitida satisfaz o contrato compartilhado', async () => {
    // O frontend faz `discoverResultSchema.parse()`, que LANÇA. Um item
    // malformado apagaria a tela de vagas inteira, todas as fontes junto.
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-10T10:00:00Z'),
        bodyText: corpo(
          ['Desenvolvedor Node.js Sênior', 'Acme', 'São Paulo, SP', '2005'],
          ['Dev Júnior', 'Globex', 'Remoto', '2006'],
        ),
      },
    ]).fetch();

    expect(vagas).toHaveLength(2);

    for (const vaga of vagas) {
      expect(jobSearchResultSchema.safeParse(vaga).success).toBe(true);
    }
  });

  it('republicação vira uma vaga só, ficando a mais nova', async () => {
    // Medido no lote real: a mesma vaga relistada ganha id novo, e três
    // cards idênticos apareciam lado a lado.
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-09T10:00:00Z'),
        bodyText: corpo([
          'Backend Júnior — Go',
          'Selva Games',
          'Brasil',
          '3001',
        ]),
      },
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-18T10:00:00Z'),
        bodyText: corpo([
          'Backend Júnior — Go',
          'Selva Games',
          'Brasil',
          '3002',
        ]),
      },
    ]).fetch();

    expect(vagas).toHaveLength(1);
    // A mais nova: republicar sugere que a anterior expirou.
    expect(vagas[0].url).toBe('https://www.linkedin.com/jobs/view/3002');
    expect(vagas[0].postedAt).toBe('2026-09-18T10:00:00.000Z');
  });

  it('mesma vaga em cidades diferentes continua sendo duas', async () => {
    // O local faz parte da chave justamente para isto.
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-10T10:00:00Z'),
        bodyText: corpo(
          ['Desenvolvedor Júnior', 'Vagalume', 'Salvador, BA', '3003'],
          ['Desenvolvedor Júnior', 'Vagalume', 'São Paulo, SP', '3004'],
        ),
      },
    ]).fetch();

    expect(vagas).toHaveLength(2);
  });

  it('a stack vem do título, nunca da empresa', async () => {
    // Uma empresa chamada "Node Solutions" injetaria uma tag que depois
    // dirige a pontuação e a busca por texto.
    const vagas = await fonte([
      {
        fromAddress: ALERTA,
        receivedAt: new Date('2026-09-10T10:00:00Z'),
        bodyText: corpo([
          'Analista de Suporte',
          'Node Solutions',
          'Brasil',
          '2007',
        ]),
      },
    ]).fetch();

    expect(vagas[0].stack).toEqual([]);
  });
});
