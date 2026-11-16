import {
  byUrgency,
  findDeadline,
  resolveDeadline,
  type Deadline,
} from './deadline';

/** 16/11/2026 às 12h em São Paulo (15h UTC). */
const NOW = new Date('2026-11-16T15:00:00.000Z');
const RECEIVED = new Date('2026-11-15T13:00:00.000Z');

const resolve = (text: string, receivedAt = RECEIVED, now = NOW) => {
  const mention = findDeadline(text);

  return mention && resolveDeadline(mention, receivedAt, now);
};

describe('prazo citado no email', () => {
  it('data por extenso vira prazo do dia, com o texto original', () => {
    expect(resolve('Prazo: até 28 de Novembro de 2026.')).toEqual({
      text: 'até 28 de Novembro de 2026',
      dueDate: '2026-11-28',
      dueAt: null,
      state: 'proximo',
      daysLeft: 12,
    });
  });

  it('data numérica brasileira', () => {
    expect(resolve('Responda até 20/11/2026, por favor.')).toMatchObject({
      text: 'até 20/11/2026',
      dueDate: '2026-11-20',
      state: 'proximo',
      daysLeft: 4,
    });
  });

  it('data em inglês por extenso', () => {
    expect(resolve('Please complete it by November 18th, 2026.')).toMatchObject(
      { dueDate: '2026-11-18', state: 'proximo' },
    );
  });

  it('data passada é vencida', () => {
    expect(resolve('Prazo final: 10/11/2026')).toMatchObject({
      state: 'vencido',
      daysLeft: -6,
    });
  });

  it('o próprio dia do prazo ainda é próximo, em qualquer hora de São Paulo', () => {
    // 23h de 20/11 em São Paulo já é 21/11 em UTC.
    const lateNight = new Date('2026-11-21T02:00:00.000Z');

    expect(resolve('até 20/11/2026', RECEIVED, lateNight)).toMatchObject({
      state: 'proximo',
      daysLeft: 0,
    });
  });

  it.each([
    ['sem ano', 'Responda até 28/11.'],
    ['sem ano por extenso', 'Prazo até 28 de novembro.'],
    ['data inválida', 'Prazo até 31/02/2026.'],
    ['mês inexistente', 'Prazo até 10/13/2026.'],
    ['numérica em inglês é ambígua', 'Complete it by 05/06/2026.'],
    ['dias úteis', 'O link expira em 5 dias úteis.'],
  ])('não inventa data: %s', (_case, text) => {
    expect(resolve(text)).toMatchObject({
      dueDate: null,
      dueAt: null,
      state: 'desconhecido',
      daysLeft: null,
    });
  });

  it('prazo relativo parte do recebimento, não de agora', () => {
    expect(resolve('This link will expire in 48 hours.')).toEqual({
      text: 'expire in 48 hours',
      dueDate: null,
      dueAt: '2026-11-17T13:00:00.000Z',
      state: 'proximo',
      daysLeft: 1,
    });
  });

  it('prazo relativo que já passou é vencido', () => {
    expect(
      resolve(
        'O teste fica disponível por 24 horas.',
        new Date('2026-11-10T12:00:00.000Z'),
      ),
    ).toMatchObject({ state: 'vencido', dueAt: '2026-11-11T12:00:00.000Z' });
  });

  it.each([
    'Nossa plataforma fica disponível 24 horas por dia.',
    'Suporte disponível 24h por dia.',
    'Atendimento available 24 hours a day.',
    'O sistema fica disponível 7 dias por semana.',
  ])('horário de atendimento não é prazo: %s', (text) => {
    expect(findDeadline(text)).toBeNull();
  });

  it('disponível com duração continua sendo prazo', () => {
    expect(resolve('O teste fica disponível por 48 horas.')).toMatchObject({
      text: 'disponível por 48 horas',
      state: 'proximo',
    });
  });

  it('recebimento inválido não vira data', () => {
    expect(resolve('expira em 3 dias', new Date('invalid'))).toMatchObject({
      state: 'desconhecido',
      dueAt: null,
    });
  });

  it('data sem palavra de prazo não é prazo', () => {
    expect(findDeadline('Recebemos sua candidatura em 10/11/2026.')).toBeNull();
  });
});

describe('ordem dos avisos', () => {
  const item = (
    id: string,
    receivedAt: string,
    deadline: Partial<Deadline> | null,
  ) => ({
    id,
    receivedAt,
    deadline: deadline && {
      text: '',
      dueDate: null,
      dueAt: null,
      daysLeft: null,
      state: 'desconhecido' as const,
      ...deadline,
    },
  });

  it('próximo antes de desconhecido, vencido por último', () => {
    const sorted = [
      item('vencido', '2026-11-15', {
        state: 'vencido',
        dueDate: '2026-11-01',
      }),
      item('sem-prazo', '2026-11-14', null),
      item('folgado', '2026-11-01', {
        state: 'proximo',
        dueDate: '2026-11-30',
      }),
      item('apertado', '2026-11-02', {
        state: 'proximo',
        dueAt: '2026-11-17T13:00:00.000Z',
      }),
      item('desconhecido', '2026-11-16', { state: 'desconhecido' }),
    ].sort(byUrgency);

    expect(sorted.map((entry) => entry.id)).toEqual([
      'apertado',
      'folgado',
      'desconhecido',
      'sem-prazo',
      'vencido',
    ]);
  });
});
