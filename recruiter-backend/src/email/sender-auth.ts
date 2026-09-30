import { domainOf } from './ats';

/**
 * O remetente é quem diz ser?
 *
 * O campo "De" de um email é texto livre: qualquer um escreve
 * `no-reply@gupy.com.br` nele. E é pelo "De" que o filtro do Gmail aplica o
 * marcador e que o app reconhece um ATS — então um email forjado entraria,
 * seria vinculado a uma candidatura e iria para o modelo com o texto que o
 * atacante quisesse.
 *
 * Quem sabe se o "De" é verdadeiro é o servidor que recebeu o email. Ele
 * confere SPF, DKIM e DMARC e grava o resultado no cabeçalho
 * `Authentication-Results`. Aqui só lemos esse resultado.
 *
 * Duas regras que fazem a leitura valer alguma coisa:
 *
 * 1. Só o PRIMEIRO `Authentication-Results` conta. Cada servidor acrescenta o
 *    seu no topo, então o primeiro é o do Gmail; qualquer outro, mais abaixo,
 *    veio com a mensagem e pode ter sido escrito pelo próprio atacante.
 *
 * 2. "pass" sozinho não basta: precisa ser pass PARA O DOMÍNIO DO "De".
 *    Um atacante passa em DKIM com o domínio dele sem esforço nenhum. O que
 *    ele não consegue é passar com o domínio da Gupy.
 *
 * Limite, para não prometer demais: isto barra remetente FORJADO. Não barra
 * quem abre uma conta de verdade numa plataforma e manda por ela — esse email
 * é autêntico. Para ele valem as outras barreiras: a saída do modelo é um
 * enum, e status só muda com clique.
 */
export function isSenderVerified(
  rawHeaders: string | null | undefined,
  fromAddress: string,
): boolean {
  const fromDomain = domainOf(fromAddress);
  const results = firstAuthenticationResults(rawHeaders);

  if (!fromDomain || !results) {
    return false;
  }

  const wanted = organizationalDomain(fromDomain);
  const aligned = (domain: string | undefined): boolean =>
    Boolean(domain) && organizationalDomain(domain!) === wanted;

  return results.some((result) => {
    if (result.verdict !== 'pass') {
      return false;
    }

    switch (result.method) {
      case 'dmarc':
        return aligned(result.properties['header.from']);
      case 'dkim':
        return (
          aligned(result.properties['header.d']) ||
          aligned(result.properties['header.i']?.split('@').pop())
        );
      case 'spf':
        return aligned(result.properties['smtp.mailfrom']?.split('@').pop());
      default:
        return false;
    }
  });
}

interface AuthResult {
  method: string;
  verdict: string;
  properties: Record<string, string>;
}

/**
 * Os resultados do primeiro `Authentication-Results` do bloco de cabeçalhos.
 *
 * O valor tem a forma
 * `mx.google.com; dkim=pass header.i=@x.com; spf=pass (...) smtp.mailfrom=y`.
 */
function firstAuthenticationResults(
  rawHeaders: string | null | undefined,
): AuthResult[] | null {
  if (!rawHeaders) {
    return null;
  }

  // Cabeçalho longo continua na linha seguinte, começando com espaço.
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const line = unfolded
    .split(/\r?\n/)
    .find((entry) => /^authentication-results\s*:/i.test(entry));

  if (!line) {
    return null;
  }

  const value = line
    .slice(line.indexOf(':') + 1)
    // Comentários entre parênteses são texto livre e podem conter `=` e `;`.
    .replace(/\([^)]*\)/g, ' ');

  return (
    value
      .split(';')
      // O primeiro trecho é o nome do servidor que conferiu, não um resultado.
      .slice(1)
      .map(parseResult)
      .filter((result): result is AuthResult => result !== null)
  );
}

function parseResult(chunk: string): AuthResult | null {
  const tokens = chunk.trim().split(/\s+/).filter(Boolean);
  const [head, ...rest] = tokens;
  const [method, verdict] = (head ?? '').split('=');

  if (!method || !verdict) {
    return null;
  }

  const properties: Record<string, string> = {};

  for (const token of rest) {
    const at = token.indexOf('=');

    if (at > 0) {
      properties[token.slice(0, at).toLowerCase()] = token
        .slice(at + 1)
        .toLowerCase();
    }
  }

  return {
    method: method.toLowerCase(),
    verdict: verdict.toLowerCase(),
    properties,
  };
}

/** Sufixos de dois níveis: em `gupy.com.br`, o domínio é `gupy.com.br`. */
const SECOND_LEVEL = new Set(['com', 'co', 'org', 'net', 'gov', 'edu']);

/**
 * `us.greenhouse-mail.io` → `greenhouse-mail.io`; `mail.gupy.com.br` →
 * `gupy.com.br`.
 *
 * Aproximação da Public Suffix List, de propósito: a lista inteira é uma
 * dependência para resolver os poucos sufixos que um ATS de verdade usa. O
 * erro possível é para o lado seguro — tratar como desalinhado um domínio
 * de sufixo exótico, que então fica para você vincular à mão.
 */
export function organizationalDomain(domain: string): string {
  const labels = domain.trim().toLowerCase().replace(/\.$/, '').split('.');
  const twoLevel =
    labels.length >= 3 &&
    labels[labels.length - 1].length === 2 &&
    SECOND_LEVEL.has(labels[labels.length - 2]);

  return labels.slice(twoLevel ? -3 : -2).join('.');
}
