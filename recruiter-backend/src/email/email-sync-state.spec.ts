import { EMAIL_STALE_HOURS } from '@recruit/shared';
import { EmailService } from './email.service';
import { fetchSince, ImapError } from './imap.client';

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
 * O estado de sincronização que a tela Hoje mostra. IMAP e banco são falsos:
 * o que se testa é o registro de sucesso, parcial, falha e andamento.
 */

const fetchMock = fetchSince as jest.MockedFunction<typeof fetchSince>;

const env: Record<string, unknown> = {
  IMAP_HOST: 'imap.example.com',
  IMAP_USER: 'pessoa@example.com',
  IMAP_PASSWORD: 'senha-ficticia',
  IMAP_PORT: 993,
  IMAP_MAILBOX: 'job-tracker',
};

function setup(options: { failStore?: boolean } = {}) {
  let lookups = 0;
  const prisma = {
    emailMessage: {
      // A primeira consulta é a marca d'água; as seguintes são do `store`.
      findFirst: () => {
        lookups += 1;

        if (lookups > 1 && options.failStore) {
          return Promise.reject(new Error('falha de gravação'));
        }

        return Promise.resolve(null);
      },
      findMany: () => Promise.resolve([]),
    },
  };

  return new EmailService(
    prisma as never,
    {} as never,
    { configured: false } as never,
    {} as never,
    { get: (key: string) => env[key] } as never,
  );
}

const mail = {
  messageId: '<1@example.com>',
  subject: 'Assunto fictício',
  fromAddress: 'vagas@example.com',
  fromName: null,
  toAddress: 'pessoa@example.com',
  receivedAt: new Date('2026-11-16T12:00:00.000Z'),
  bodyText: 'Texto fictício.',
  inReplyTo: null,
  references: [],
};

describe('estado da sincronização', () => {
  beforeEach(() => fetchMock.mockReset());

  it('antes da primeira rodada: sem dados, com o rótulo lido', () => {
    expect(setup().syncState()).toEqual({
      configured: true,
      mailbox: 'job-tracker',
      runningSince: null,
      lastSuccessAt: null,
      lastAttempt: null,
      freshness: 'sem-dados',
    });
  });

  it('sem IMAP configurado, diz que não está configurado', () => {
    const service = new EmailService(
      {} as never,
      {} as never,
      { configured: false } as never,
      {} as never,
      { get: () => undefined } as never,
    );

    expect(service.syncState()).toMatchObject({
      configured: false,
      mailbox: null,
      freshness: 'sem-dados',
    });
  });

  it('rodada sem falhas fica em dia e envelhece depois do limite', async () => {
    fetchMock.mockResolvedValue([]);
    const service = setup();

    await service.sync();
    const state = service.syncState();

    expect(state).toMatchObject({
      freshness: 'em-dia',
      runningSince: null,
      lastAttempt: { outcome: 'ok', failed: 0, message: null },
    });

    const later = new Date(
      Date.parse(state.lastSuccessAt as string) +
        (EMAIL_STALE_HOURS + 1) * 3_600_000,
    );

    expect(service.syncState(later).freshness).toBe('desatualizado');
  });

  it('marca a rodada em andamento enquanto o IMAP responde', async () => {
    let release: (value: never[]) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const service = setup();

    const running = service.sync();
    await Promise.resolve();

    expect(service.syncState().runningSince).not.toBeNull();

    release([]);
    await running;

    expect(service.syncState().runningSince).toBeNull();
  });

  it('email que não grava deixa a rodada parcial, sem contar como sucesso', async () => {
    fetchMock.mockResolvedValue([mail] as never);
    const service = setup({ failStore: true });

    await service.sync();

    expect(service.syncState()).toMatchObject({
      lastSuccessAt: null,
      freshness: 'sem-dados',
      lastAttempt: {
        outcome: 'parcial',
        failed: 1,
        message: '1 de 1 emails não foram gravados.',
      },
    });
  });

  it('falha de IMAP depois de um sucesso deixa desatualizado e guarda o motivo', async () => {
    const service = setup();
    fetchMock.mockResolvedValueOnce([]);
    await service.sync();

    fetchMock.mockRejectedValueOnce(new ImapError('Login recusado', false));
    await expect(service.sync()).rejects.toThrow('Login recusado');

    expect(service.syncState()).toMatchObject({
      freshness: 'desatualizado',
      runningSince: null,
      lastAttempt: { outcome: 'falhou', message: 'Login recusado' },
    });
    expect(service.syncState().lastSuccessAt).not.toBeNull();
  });
});
