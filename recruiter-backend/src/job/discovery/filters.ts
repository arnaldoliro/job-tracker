import type {
  JobPreferences,
  JobSearchResult,
  Seniority,
} from '@recruit/shared';
import { countryFromText, fold } from './normalize';

/**
 * Os cortes que decidem se uma vaga existe para você.
 *
 * Em arquivo próprio, e não dentro do serviço, por dois motivos: são funções
 * puras e é onde os defeitos silenciosos moram — o escopo já descartou quatro
 * de cada cinco vagas brasileiras sem dizer nada. Separado, dá para exercitar
 * sem subir o Nest, que arrasta `@nestjs/config` e quebra o Jest.
 */

/**
 * O texto digitado também FILTRA, e não só orienta as fontes.
 *
 * Gupy e os portais aceitam termo de busca; Greenhouse, Ashby e Lever devolvem
 * o board inteiro e ignoram. Sem este corte, digitar "clojure" trazia 518
 * vagas — a caixa dizia "filtrar" e não filtrava.
 */
export function matchesTerm(job: JobSearchResult, term?: string): boolean {
  const wanted = fold(term ?? '');

  if (wanted === '') {
    return true;
  }

  const haystack = fold(
    [job.title, job.company, job.stack.join(' '), job.location].join(' '),
  );

  // Todas as palavras precisam aparecer: "backend go" não pode trazer toda
  // vaga que tenha "backend" OU "go".
  return wanted.split(' ').every((word) => haystack.includes(word));
}

/**
 * Corte pelas preferências.
 *
 * Preferência ELIMINA, currículo ORDENA — são coisas diferentes de propósito.
 * E campo que a vaga não declarou PASSA: cortar em silêncio esconde vaga boa
 * por defeito do portal, e o usuário não fica sabendo do que perdeu.
 */
export function matches(
  job: JobSearchResult,
  preferences: JobPreferences,
): boolean {
  const title = fold(job.title);

  if (preferences.titleExcludes.some((term) => title.includes(fold(term)))) {
    return false;
  }

  if (
    preferences.titleIncludes.length > 0 &&
    !preferences.titleIncludes.some((term) => title.includes(fold(term)))
  ) {
    return false;
  }

  if (
    job.workModel !== null &&
    preferences.workModels.length > 0 &&
    !preferences.workModels.includes(job.workModel)
  ) {
    return false;
  }

  if (
    job.contractType !== null &&
    preferences.contractTypes.length > 0 &&
    !preferences.contractTypes.includes(job.contractType)
  ) {
    return false;
  }

  if (
    job.seniority !== null &&
    preferences.seniorities.length > 0 &&
    !preferences.seniorities.includes(job.seniority as Seniority)
  ) {
    return false;
  }

  return withinScope(job, preferences);
}

function withinScope(
  job: JobSearchResult,
  preferences: JobPreferences,
): boolean {
  // Nenhum lado escolhido é tanto faz: o estado neutro é a ausência de opção,
  // não um terceiro valor.
  if (preferences.scope === null) {
    return true;
  }

  // `countryFromText` e não um teste por "brasil" no texto: o teste literal
  // tratava QUALQUER localização não nula sem a palavra "brasil" como
  // definitivamente estrangeira. Das formas que o LinkedIn usa — "Salvador,
  // BA", "São Paulo, SP", "Porto Alegre, RS", "São Paulo e Região" — quatro em
  // cinco eram descartadas, sem log e sem entrar em `failedSources`.
  const country = countryFromText(job.location);

  // Localização não reconhecida passa, pela mesma regra acima — agora de
  // verdade, porque `countryFromText` devolve `null` quando não sabe em vez de
  // afirmar "não é Brasil".
  if (country === null) {
    return true;
  }

  return preferences.scope === 'brasil'
    ? country === 'Brasil'
    : country !== 'Brasil';
}
