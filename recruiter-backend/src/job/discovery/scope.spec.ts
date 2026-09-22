import type { JobPreferences, JobSearchResult } from '@recruit/shared';
import { matches } from './filters';

/**
 * O filtro de escopo, pelo caminho que a descoberta realmente usa.
 *
 * Separado de `normalize.spec.ts` de propósito: aquele prova que a localização
 * é reconhecida, este prova que reconhecê-la **mantém a vaga**. Eram duas
 * falhas independentes, e só a segunda fazia a vaga sumir.
 */

function preferences(over: Partial<JobPreferences> = {}): JobPreferences {
  return {
    scope: null,
    workModels: [],
    contractTypes: [],
    seniorities: [],
    stacks: [],
    titleIncludes: [],
    titleExcludes: [],
    ...over,
  };
}

function job(location: string | null): JobSearchResult {
  return {
    company: 'Acme',
    title: 'Desenvolvedor Back-end Node.js',
    url: 'https://www.linkedin.com/jobs/view/1',
    source: 'linkedin-alerts',
    description: null,
    stack: [],
    requirements: [],
    benefits: [],
    seniority: null,
    workModel: null,
    contractType: null,
    location,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: null,
  };
}

describe('escopo Brasil', () => {
  const brasil = preferences({ scope: 'brasil' });

  it.each([
    ['Salvador, BA'],
    ['São Paulo, SP'],
    ['Porto Alegre, RS'],
    ['São Paulo e Região'],
    ['Brasil'],
  ])('mantém a vaga em %s', (local) => {
    // Antes da correção, quatro destas cinco eram descartadas: qualquer
    // localização não nula sem a palavra "brasil" era tratada como
    // definitivamente estrangeira.
    expect(matches(job(local), brasil)).toBe(true);
  });

  it('descarta vaga estrangeira', () => {
    expect(matches(job('Boston, MA'), brasil)).toBe(false);
    expect(matches(job('Lisboa'), brasil)).toBe(false);
  });

  it('localização desconhecida passa', () => {
    // "Não sei onde é" não pode virar "não é aqui".
    expect(matches(job('Kraków'), brasil)).toBe(true);
    expect(matches(job(null), brasil)).toBe(true);
  });
});

describe('escopo internacional', () => {
  const fora = preferences({ scope: 'internacional' });

  it('mantém estrangeira e descarta brasileira', () => {
    expect(matches(job('Boston, MA'), fora)).toBe(true);
    expect(matches(job('Salvador, BA'), fora)).toBe(false);
    expect(matches(job('Porto Alegre, RS'), fora)).toBe(false);
  });

  it('localização desconhecida continua passando', () => {
    expect(matches(job('Kraków'), fora)).toBe(true);
  });
});

describe('sem escopo escolhido', () => {
  it('passa tudo', () => {
    const qualquer = preferences({ scope: null });

    expect(matches(job('Salvador, BA'), qualquer)).toBe(true);
    expect(matches(job('Boston, MA'), qualquer)).toBe(true);
  });
});
