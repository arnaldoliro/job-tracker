import { emptyLinks, emptyResume } from '@recruit/shared';
import { buildFieldPlan, NEVER_FILL, type FillSource } from './field-plan';

function source(over: Partial<FillSource> = {}): FillSource {
  return {
    name: 'Fulano de Tal',
    email: 'fulano@exemplo.com',
    phone: '+55 11 90000-0000',
    location: 'São Paulo, SP',
    links: { ...emptyLinks, linkedin: 'https://linkedin.com/in/fulano' },
    resume: emptyResume,
    ...over,
  };
}

function plan(over?: Partial<FillSource>) {
  return buildFieldPlan(source(over));
}

function find(what: string) {
  return plan().find((f) => f.what === what);
}

describe('buildFieldPlan', () => {
  it('separa primeiro nome e sobrenome', () => {
    expect(find('primeiro nome')?.value).toBe('Fulano');
    expect(find('sobrenome')?.value).toBe('de Tal');
    expect(find('nome completo')?.value).toBe('Fulano de Tal');
  });

  it('nome de uma palavra não inventa sobrenome', () => {
    // Campo em branco é melhor que campo com valor errado que você não viu.
    const único = buildFieldPlan(source({ name: 'Madonna' }));

    expect(único.find((f) => f.what === 'sobrenome')).toBeUndefined();
    expect(único.find((f) => f.what === 'primeiro nome')?.value).toBe(
      'Madonna',
    );
  });

  it('campo sem valor não entra no plano', () => {
    // Preencher com vazio apagaria o que o ATS já tivesse da sua conta.
    const semTelefone = buildFieldPlan(source({ phone: null, location: null }));

    expect(semTelefone.find((f) => f.what === 'telefone')).toBeUndefined();
    expect(semTelefone.find((f) => f.what === 'localização')).toBeUndefined();
  });

  it('link ausente não entra', () => {
    const semLinks = buildFieldPlan(source({ links: null }));

    expect(semLinks.find((f) => f.what === 'LinkedIn')).toBeUndefined();
    expect(semLinks.find((f) => f.what === 'GitHub')).toBeUndefined();
  });

  it.each([
    ['nome completo', 'Full name'],
    ['nome completo', 'Name'],
    ['email', 'E-mail'],
    ['email', 'Email'],
    ['telefone', 'Telefone celular'],
    ['telefone', 'Phone'],
    ['LinkedIn', 'LinkedIn profile'],
    ['localização', 'Cidade'],
    ['localização', 'Where are you based?'],
  ])('reconhece %s pelo rótulo "%s"', (what, rotulo) => {
    // Os rótulos acima saíram de um formulário real da Ashby.
    expect(find(what)?.labels.test(rotulo)).toBe(true);
  });

  it('pergunta de PAÍS não recebe cidade', () => {
    // Medido num formulário real: "What country are you based in?" recebeu
    // "São Paulo, SP". Campo vazio é melhor que resposta no nível errado.
    expect(
      find('localização')?.labels.test('What country are you based in?'),
    ).toBe(false);
    expect(find('localização')?.labels.test('País')).toBe(false);
  });

  it('"nome" sozinho não casa com "nome completo"', () => {
    // Os dois existem no mesmo formulário; casar os dois preencheria o campo
    // de primeiro nome com o nome inteiro.
    expect(find('primeiro nome')?.labels.test('Nome completo')).toBe(false);
    expect(find('primeiro nome')?.labels.test('Nome')).toBe(true);
  });
});

describe('NEVER_FILL', () => {
  it.each([
    'Cover letter',
    'Carta de apresentação',
    'Por que você quer trabalhar aqui?',
    'Why do you want to work at Linear?',
    'Pretensão salarial',
    'Salary expectation',
    'Disponibilidade para início',
  ])('recusa preencher "%s"', (rotulo) => {
    // Resposta genérica numa pergunta aberta é pior que campo vazio: parece
    // esforço e não é. Salário e disponibilidade são decisão, não cadastro.
    expect(NEVER_FILL.test(rotulo)).toBe(true);
  });

  it.each(['E-mail', 'Telefone', 'LinkedIn profile', 'Nome completo'])(
    'não bloqueia o campo de cadastro "%s"',
    (rotulo) => {
      expect(NEVER_FILL.test(rotulo)).toBe(false);
    },
  );
});
