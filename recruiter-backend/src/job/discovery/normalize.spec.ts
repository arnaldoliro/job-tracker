import { countryFromText } from './normalize';

/**
 * Localização brasileira.
 *
 * Existe porque `withinScope` trata localização não nula que não seja Brasil
 * como definitivamente estrangeira: classificar errado aqui não devolve uma
 * vaga com o país errado, **some com a vaga**. E some em silêncio — sem log e
 * sem entrar em `failedSources`.
 *
 * Os formatos abaixo são os que o LinkedIn usa de verdade, copiados dos
 * alertas reais.
 */
describe('countryFromText', () => {
  it.each([
    ['Salvador, BA'],
    ['São Paulo, SP'],
    ['Porto Alegre, RS'],
    ['São Paulo e Região'],
    ['Rio de Janeiro e Região'],
    ['Brasil'],
    ['Sorocaba, SP'],
    ['Greater São Paulo Area'],
  ])('reconhece %s como Brasil', (local) => {
    expect(countryFromText(local)).toBe('Brasil');
  });

  it.each([
    ['Caxias do Sul, RS'],
    ['Petrópolis, RJ'],
    ['Chapecó, SC'],
    ['Feira de Santana, BA'],
  ])('reconhece pela sigla de UF cidade fora da lista: %s', (local) => {
    // A lista de capitais não cobre o interior. Sem o padrão de UF, estas
    // saíam como `null` — o que ainda passava no filtro, mas por acidente:
    // "não sei onde é" em vez de "é no Brasil". Com `scope: 'internacional'`
    // a diferença deixa de ser acadêmica e a vaga brasileira vaza.
    expect(countryFromText(local)).toBe('Brasil');
  });

  it('cidade brasileira vence Portugal', () => {
    // O padrão português casa `\bporto\b`. Antes desta ordem, "Porto Alegre"
    // saía como Portugal e a vaga sumia com `scope: 'brasil'`.
    expect(countryFromText('Porto Alegre, RS')).toBe('Brasil');
    expect(countryFromText('Porto')).toBe('Portugal');
    expect(countryFromText('Lisboa')).toBe('Portugal');
  });

  it('cidade estrangeira vence a sigla de UF', () => {
    // MA, PA, SC, AL, MT e MS também são estados americanos. A sigla é testada
    // por último justamente para a cidade decidir primeiro.
    expect(countryFromText('Boston, MA')).toBe('Estados Unidos');
    expect(countryFromText('Austin, TX')).toBe('Estados Unidos');
    expect(countryFromText('Toronto, ON')).toBe('Canadá');
  });

  it('não chuta o que não reconhece', () => {
    // `null` é o que faz `withinScope` deixar passar. Um palpite aqui vira
    // vaga descartada.
    expect(countryFromText('Kraków')).toBeNull();
    expect(countryFromText('')).toBeNull();
    expect(countryFromText(null)).toBeNull();
  });
});
