import { daysSince, followUpDueAt, nextFollowUpAfter } from './follow-up';

const AGORA = new Date('2026-10-20T12:00:00.000Z');

function diasAtras(dias: number): Date {
  return new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000);
}

describe('followUpDueAt', () => {
  it('vence pelo prazo do status a partir da última mudança', () => {
    expect(
      followUpDueAt({
        status: 'aplicado',
        since: diasAtras(12),
        nextFollowUpAt: null,
      }),
    ).toEqual(diasAtras(2));
    expect(
      followUpDueAt({
        status: 'oferta',
        since: diasAtras(1),
        nextFollowUpAt: null,
      }),
    ).toEqual(new Date(AGORA.getTime() + 24 * 60 * 60 * 1000));
  });

  it('recusa não pede follow-up', () => {
    expect(
      followUpDueAt({
        status: 'rejeitado',
        since: diasAtras(30),
        nextFollowUpAt: null,
      }),
    ).toBeNull();
  });

  it('depois de agir sobre o lembrete, vale a data escolhida', () => {
    const adiado = new Date(AGORA.getTime() + 3 * 24 * 60 * 60 * 1000);

    expect(
      followUpDueAt({
        status: 'aplicado',
        since: diasAtras(20),
        nextFollowUpAt: adiado,
      }),
    ).toEqual(adiado);
  });

  it('recusa ignora até uma data antiga de lembrete', () => {
    expect(
      followUpDueAt({
        status: 'rejeitado',
        since: diasAtras(5),
        nextFollowUpAt: diasAtras(1),
      }),
    ).toBeNull();
  });
});

describe('daysSince', () => {
  it('conta dias inteiros e nunca fica negativo', () => {
    expect(daysSince(diasAtras(10.5), AGORA)).toBe(10);
    expect(daysSince(new Date(AGORA.getTime() + 60_000), AGORA)).toBe(0);
  });
});

describe('nextFollowUpAfter', () => {
  it('"feito" recomeça o prazo do status a partir de agora', () => {
    expect(nextFollowUpAfter('feito', 'aplicado', AGORA)).toEqual(
      new Date(AGORA.getTime() + 10 * 24 * 60 * 60 * 1000),
    );
  });

  it('"adiar" é curto e igual para todos', () => {
    expect(nextFollowUpAfter('adiar', 'aplicado', AGORA)).toEqual(
      new Date(AGORA.getTime() + 3 * 24 * 60 * 60 * 1000),
    );
    expect(nextFollowUpAfter('adiar', 'oferta', AGORA)).toEqual(
      new Date(AGORA.getTime() + 3 * 24 * 60 * 60 * 1000),
    );
  });

  it('recusa não ganha lembrete nem com "feito"', () => {
    expect(nextFollowUpAfter('feito', 'rejeitado', AGORA)).toBeNull();
  });
});
