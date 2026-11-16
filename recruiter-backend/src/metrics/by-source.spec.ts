import { countBySource, isSent, type SentFacts } from './by-source';

const ENVIO = new Date('2026-10-01T12:00:00Z');

/** Candidatura com o histórico terminando no status atual. */
function facts(reached: string[], appliedAt: Date | null = null): SentFacts {
  return {
    status: reached[reached.length - 1] ?? 'rascunho',
    appliedAt,
    reached,
  };
}

function row(source: string | null, sent: SentFacts) {
  return { ...sent, job: { source } };
}

describe('isSent', () => {
  it('rascunho nunca enviado não foi enviado', () => {
    expect(isSent(facts(['rascunho']))).toBe(false);
  });

  it.each(['aplicado', 'triagem', 'entrevista', 'teste', 'oferta'])(
    '%s foi enviado',
    (status) => {
      expect(isSent(facts([status], ENVIO))).toBe(true);
    },
  );

  it('rejeitada ou cancelada continua enviada', () => {
    // Saiu do funil, mas a empresa recebeu: some daqui e a fonte que gerou a
    // recusa pareceria ter rendido menos do que rendeu.
    expect(isSent(facts(['aplicado', 'rejeitado'], ENVIO))).toBe(true);
    expect(isSent(facts(['aplicado', 'cancelado'], ENVIO))).toBe(true);
  });

  it('enviada que voltou a rascunho continua enviada, pelo histórico', () => {
    // O laço real `rejeitado → rascunho`: o status atual diz rascunho, mas a
    // empresa já tinha recebido.
    expect(isSent(facts(['aplicado', 'rejeitado', 'rascunho']))).toBe(true);
  });

  it('rascunho com data de envio continua enviada, mesmo sem evento', () => {
    // Linha sem `StatusEvent` (seed, Studio): a data de envio é a prova.
    expect(isSent({ status: 'rascunho', appliedAt: ENVIO, reached: [] })).toBe(
      true,
    );
  });

  it('status atual enviado vale mesmo sem evento', () => {
    expect(isSent({ status: 'aplicado', appliedAt: null, reached: [] })).toBe(
      true,
    );
  });
});

describe('countBySource', () => {
  it('rascunho nunca enviado NÃO conta como candidatura da fonte', () => {
    // Regressão: rascunhos entravam na contagem por fonte como se tivessem
    // sido enviados.
    const counts = countBySource([
      row('portal-a', facts(['aplicado'], ENVIO)),
      row('portal-a', facts(['rascunho'])),
      row('portal-b', facts(['rascunho'])),
    ]);

    expect(counts).toEqual([{ source: 'portal-a', count: 1 }]);
  });

  it('enviada que voltou a rascunho continua contando na fonte', () => {
    const counts = countBySource([
      row('portal-a', facts(['aplicado', 'rascunho'], ENVIO)),
    ]);

    expect(counts).toEqual([{ source: 'portal-a', count: 1 }]);
  });

  it('o total fecha com as enviadas', () => {
    const rows = [
      row('portal-a', facts(['aplicado'], ENVIO)),
      row('portal-a', facts(['aplicado', 'rejeitado'], ENVIO)),
      row('portal-a', facts(['rascunho'])),
      row(null, facts(['triagem'], ENVIO)),
      row(null, facts(['rascunho'])),
    ];
    const total = countBySource(rows).reduce((sum, r) => sum + r.count, 0);

    expect(total).toBe(rows.filter(isSent).length);
    expect(total).toBe(3);
  });

  it('fonte nula vira desconhecido, não manual', () => {
    expect(countBySource([row(null, facts(['aplicado'], ENVIO))])).toEqual([
      { source: 'desconhecido', count: 1 },
    ]);
  });

  it('ordena da fonte que mais rendeu para a que menos rendeu', () => {
    const counts = countBySource([
      row('portal-b', facts(['aplicado'], ENVIO)),
      row('portal-a', facts(['aplicado'], ENVIO)),
      row('portal-a', facts(['aplicado'], ENVIO)),
    ]);

    expect(counts.map((c) => c.source)).toEqual(['portal-a', 'portal-b']);
  });
});
