import { responseTime, type TimedApplication } from './response-time';

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

function app(
  appliedAt: string | null,
  events: [string, string][],
): TimedApplication {
  return {
    appliedAt: appliedAt ? d(appliedAt) : null,
    events: events.map(([toStatus, at]) => ({
      toStatus: toStatus as TimedApplication['events'][number]['toStatus'],
      occurredAt: d(at),
    })),
  };
}

describe('responseTime', () => {
  it('mede do envio até a primeira resposta', () => {
    const r = responseTime([
      app('2026-09-01', [
        ['aplicado', '2026-09-01'],
        ['triagem', '2026-09-05'],
      ]),
    ]);

    expect(r).toEqual({ medianDays: 4, sample: 1 });
  });

  it('recusa também é resposta', () => {
    // "Não" é uma resposta. Ignorá-la faria as empresas parecerem mais lentas
    // do que são — só contariam as que avançaram.
    const r = responseTime([app('2026-09-01', [['rejeitado', '2026-09-03']])]);

    expect(r.medianDays).toBe(2);
  });

  it('usa a PRIMEIRA resposta, não a mais recente', () => {
    const r = responseTime([
      app('2026-09-01', [
        ['entrevista', '2026-09-10'],
        ['triagem', '2026-09-03'],
        ['oferta', '2026-09-20'],
      ]),
    ]);

    expect(r.medianDays).toBe(2);
  });

  it('sem appliedAt, parte do primeiro evento aplicado', () => {
    const r = responseTime([
      app(null, [
        ['aplicado', '2026-09-02'],
        ['triagem', '2026-09-09'],
      ]),
    ]);

    expect(r.medianDays).toBe(7);
  });

  it('rascunho não tem relógio', () => {
    const r = responseTime([app(null, [['rascunho', '2026-09-01']])]);

    expect(r).toEqual({ medianDays: null, sample: 0 });
  });

  it('candidatura sem resposta não entra na amostra', () => {
    // Não é "zero dias": é "ainda não respondeu". Contar como zero puxaria a
    // mediana para baixo, e contar como infinito não cabe num número.
    const r = responseTime([
      app('2026-09-01', [['aplicado', '2026-09-01']]),
      app('2026-09-01', [['triagem', '2026-09-11']]),
    ]);

    expect(r).toEqual({ medianDays: 10, sample: 1 });
  });

  it('resposta antes do envio é dado errado, e fica fora', () => {
    const r = responseTime([app('2026-09-10', [['triagem', '2026-09-05']])]);

    expect(r).toEqual({ medianDays: null, sample: 0 });
  });

  it('é mediana, não média: um caso extremo não arrasta o número', () => {
    const r = responseTime([
      app('2026-09-01', [['triagem', '2026-09-03']]),
      app('2026-09-01', [['triagem', '2026-09-04']]),
      app('2026-09-01', [['triagem', '2026-12-01']]),
    ]);

    expect(r.medianDays).toBe(3);
  });

  it('amostra par tira a média dos dois do meio', () => {
    const r = responseTime([
      app('2026-09-01', [['triagem', '2026-09-03']]),
      app('2026-09-01', [['triagem', '2026-09-05']]),
    ]);

    expect(r.medianDays).toBe(3);
  });

  it('sem dado nenhum, devolve nulo e não zero', () => {
    expect(responseTime([])).toEqual({ medianDays: null, sample: 0 });
  });
});
