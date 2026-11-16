import { EmailService } from './email.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./email-classifier.service', () => ({
  EmailClassifierService: class {},
  ClassifierUnavailableError: class extends Error {},
}));
jest.mock('./email-resolver.service', () => ({
  EmailResolverService: class {},
}));
jest.mock('../application/application.service', () => ({
  ApplicationService: class {},
}));
jest.mock('./imap.client', () => ({
  fetchSince: jest.fn(),
  ImapError: class extends Error {},
}));

/**
 * Os avisos de Hoje de ponta a ponta no serviço: a consulta que escolhe os
 * emails, o detector, dispensar e desfazer. O banco é falso e em memória, mas
 * interpreta o `where` que o serviço monta — é a combinação dos dois que
 * decide o que aparece, e testar só o detector deixaria a consulta de fora.
 *
 * Todos os dados são fictícios.
 */

type Where = Record<string, unknown>;

/** Subconjunto do `where` do Prisma que a consulta de avisos usa. */
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Where[]).some((branch) => matches(row, branch));
    }

    const value = row[key];

    if (condition === null || typeof condition !== 'object') {
      return value === condition;
    }

    if (condition instanceof Date) {
      return value instanceof Date && +value === +condition;
    }

    const operators = condition as Record<string, unknown>;

    if ('gte' in operators) {
      return value instanceof Date && value >= (operators.gte as Date);
    }

    if ('notIn' in operators) {
      return !(operators.notIn as unknown[]).includes(value);
    }

    // Relação: sem linha relacionada, o filtro sobre ela não casa.
    return (
      value !== null &&
      typeof value === 'object' &&
      matches(value as Record<string, unknown>, operators)
    );
  });
}

const NOW = new Date('2026-11-16T15:00:00.000Z');
const daysBefore = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000);

interface Mail {
  id: string;
  subject: string;
  bodyText: string | null;
  fromAddress: string;
  fromName: string | null;
  messageId: string;
  receivedAt: Date;
  senderVerified: boolean;
  dismissedAt: Date | null;
  profileId: string | null;
  applicationId: string | null;
  application: { deletedAt: Date | null; status: string } | null;
}

function mail(id: string, overrides: Partial<Mail> = {}): Mail {
  return {
    id,
    subject: 'Agende sua entrevista',
    bodyText: 'Escolha um horário no link.',
    fromAddress: 'recrutamento@empresa-exemplo.example',
    fromName: 'Recrutamento Exemplo',
    messageId: `<${id}@empresa-exemplo.example>`,
    receivedAt: daysBefore(2),
    senderVerified: true,
    dismissedAt: null,
    profileId: null,
    applicationId: null,
    application: null,
    ...overrides,
  };
}

function setup(rows: Mail[]) {
  const prisma = {
    emailMessage: {
      findMany: ({ where }: { where: Where }) =>
        Promise.resolve(
          rows
            .filter((row) => matches(row as never, where))
            .sort((a, b) => +b.receivedAt - +a.receivedAt),
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Mail>;
      }) => {
        const found = rows.filter((row) => row.id === where.id);

        found.forEach((row) => Object.assign(row, data));

        return Promise.resolve({ count: found.length });
      },
    },
  };
  const config = { get: () => undefined };
  const service = new EmailService(
    prisma as never,
    {} as never,
    { configured: false } as never,
    {} as never,
    config as never,
  );

  return {
    ids: async (profileId = 'perfil-a') =>
      (await service.actionItems(profileId, NOW)).map((item) => item.emailId),
    service,
  };
}

const linked = (
  profileId: string,
  status: string,
  deletedAt: Date | null = null,
): Partial<Mail> => ({
  profileId,
  applicationId: `cand-${profileId}-${status}`,
  application: { deletedAt, status },
});

describe('avisos de email em Hoje', () => {
  it('mostra convite sem vínculo e vinculado a candidatura ativa do perfil', async () => {
    const { ids } = setup([
      mail('solto'),
      mail('vinculado', linked('perfil-a', 'triagem')),
    ]);

    expect(await ids()).toEqual(['solto', 'vinculado']);
  });

  it('não mostra email vinculado a outro perfil', async () => {
    const { ids } = setup([mail('de-b', linked('perfil-b', 'triagem'))]);

    expect(await ids('perfil-a')).toEqual([]);
    expect(await ids('perfil-b')).toEqual(['de-b']);
  });

  it.each(['rejeitado', 'cancelado'])(
    'não mostra email de candidatura encerrada (%s)',
    async (status) => {
      const { ids } = setup([mail('encerrada', linked('perfil-a', status))]);

      expect(await ids()).toEqual([]);
    },
  );

  it('não mostra email de candidatura excluída', async () => {
    const { ids } = setup([
      mail('excluida', linked('perfil-a', 'triagem', daysBefore(1))),
    ]);

    expect(await ids()).toEqual([]);
  });

  it('ignora remetente não verificado, email antigo e email sem ação', async () => {
    const { ids } = setup([
      mail('forjado', { senderVerified: false }),
      mail('antigo', { receivedAt: daysBefore(91) }),
      mail('sem-acao', {
        subject: 'Candidatura recebida',
        bodyText: 'Obrigado pelo interesse. Entraremos em contato.',
      }),
      mail('dentro-da-janela', { receivedAt: daysBefore(89) }),
    ]);

    expect(await ids()).toEqual(['dentro-da-janela']);
  });

  it('dispensar tira o aviso, e desfazer devolve', async () => {
    const { ids, service } = setup([
      mail('convite'),
      mail('vinculado', linked('perfil-a', 'entrevista')),
    ]);

    await service.dismiss('vinculado');
    expect(await ids()).toEqual(['convite']);

    await service.undismiss('vinculado');
    expect(await ids()).toEqual(['convite', 'vinculado']);
  });

  it('dispensar email inexistente é erro', async () => {
    const { service } = setup([]);

    await expect(service.dismiss('nenhum')).rejects.toThrow(
      'Email não encontrado',
    );
  });
});
