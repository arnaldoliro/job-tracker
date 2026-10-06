import { buildDailySeries, buildSourceYield } from './series';

describe('buildSourceYield', () => {
  const seen = [
    { url: 'https://a.com/1', source: 'gupy' },
    { url: 'https://a.com/2', source: 'gupy' },
    { url: 'https://b.com/1', source: 'linkedin-alerts' },
  ];

  it('conta quanto cada fonte rendeu do que mostrou', () => {
    const yields = buildSourceYield(seen, ['https://a.com/1'], []);

    expect(yields).toEqual([
      { source: 'gupy', seen: 2, saved: 1, applied: 0 },
      { source: 'linkedin-alerts', seen: 1, saved: 0, applied: 0 },
    ]);
  });

  it('vaga salva que nunca foi mostrada NÃO entra no numerador', () => {
    // O defeito que a conta teria sem este recorte: 52 vagas salvas antes da
    // medição existir, contra um denominador que começou do zero — taxa acima
    // de 100%, sem nada acusar.
    const yields = buildSourceYield(seen, ['https://antiga.com/9'], []);

    expect(yields.every((y) => y.saved === 0)).toBe(true);
    expect(yields.every((y) => y.saved <= y.seen)).toBe(true);
  });

  it('a mesma vaga salva e candidatada não conta duas em cada campo', () => {
    const yields = buildSourceYield(
      seen,
      ['https://a.com/1', 'https://a.com/1'],
      ['https://a.com/1'],
    );

    expect(yields[0].saved).toBe(1);
    expect(yields[0].applied).toBe(1);
  });

  it('o numerador nunca ultrapassa o denominador', () => {
    const yields = buildSourceYield(
      seen,
      seen.map((j) => j.url),
      seen.map((j) => j.url),
    );

    expect(yields.every((y) => y.saved <= y.seen && y.applied <= y.seen)).toBe(
      true,
    );
  });

  it('sem exibição registrada, devolve vazio em vez de inventar fonte', () => {
    expect(buildSourceYield([], ['https://a.com/1'], [])).toEqual([]);
  });
});

describe('buildDailySeries', () => {
  const hoje = new Date('2026-09-23T12:00:00Z');

  it('preenche com zero os dias sem email', () => {
    // Omitir o dia vazio faria a linha ligar 21 a 23 como se fosse contínua —
    // o gráfico mentiria sobre o ritmo, que é o que ele existe para mostrar.
    const serie = buildDailySeries(
      [new Date('2026-09-21T10:00:00Z'), new Date('2026-09-23T10:00:00Z')],
      3,
      hoje,
    );

    expect(serie).toEqual([
      { date: '2026-09-21', count: 1 },
      { date: '2026-09-22', count: 0 },
      { date: '2026-09-23', count: 1 },
    ]);
  });

  it('agrupa vários emails do mesmo dia', () => {
    const serie = buildDailySeries(
      [
        new Date('2026-09-23T01:00:00Z'),
        new Date('2026-09-23T23:00:00Z'),
        new Date('2026-09-23T12:00:00Z'),
      ],
      1,
      hoje,
    );

    expect(serie).toEqual([{ date: '2026-09-23', count: 3 }]);
  });

  it('devolve sempre a janela inteira, mesmo sem dado nenhum', () => {
    const serie = buildDailySeries([], 7, hoje);

    expect(serie).toHaveLength(7);
    expect(serie.every((d) => d.count === 0)).toBe(true);
    expect(serie[6].date).toBe('2026-09-23');
  });

  it('ignora email anterior à janela em vez de empilhar na ponta', () => {
    const serie = buildDailySeries([new Date('2026-01-01T10:00:00Z')], 3, hoje);

    expect(serie.every((d) => d.count === 0)).toBe(true);
  });

  it('vem em ordem crescente de data', () => {
    const serie = buildDailySeries([], 5, hoje);
    const datas = serie.map((d) => d.date);

    expect(datas).toEqual([...datas].sort());
  });
});
