/**
 * Reduz as várias URLs da mesma vaga a uma só.
 *
 * Isto não é higiene, é correção: a URL é a única identidade que uma vaga
 * externa tem — é a chave do `Job.url @unique`, do casamento com "já salva" e,
 * a partir da fase 2, do descarte permanente. Se a mesma vaga chega com duas
 * URLs, o descarte não pega e ela volta na próxima rodada.
 *
 * As divergências são reais e foram observadas nas fontes:
 *
 *   Greenhouse  job-boards.greenhouse.io/x/jobs/1  vs  boards.greenhouse.io/...
 *               e um `?gh_src=` grudado no fim
 *   Lever       hostedUrl  vs  applyUrl (= hostedUrl + "/apply")
 *   Ashby       jobUrl     vs  applyUrl (= jobUrl + "/application")
 *   Gupy        `?jobBoardSource=gupy_portal` no fim de todas
 */

/** Hosts que servem o mesmo board sob nomes diferentes. */
const HOST_ALIASES: Record<string, string> = {
  'job-boards.greenhouse.io': 'boards.greenhouse.io',
  'www.remoteok.com': 'remoteok.com',
  'remoteok.io': 'remoteok.com',
};

/** Sufixos que apontam para o formulário, não para a vaga. */
const APPLY_SUFFIXES = ['/apply', '/application'];

export function canonicalJobUrl(rawUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  // A query aqui é sempre rastreamento (`gh_src`, `jobBoardSource`); nenhuma
  // fonte identifica a vaga por parâmetro. Se alguma passar a identificar,
  // isto vira uma lista de parâmetros preservados.
  url.search = '';
  url.hash = '';
  url.protocol = 'https:';
  url.hostname =
    HOST_ALIASES[url.hostname.toLowerCase()] ?? url.hostname.toLowerCase();

  let path = url.pathname.replace(/\/+$/, '');

  for (const suffix of APPLY_SUFFIXES) {
    if (path.toLowerCase().endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }

  url.pathname = path;

  return url.toString();
}
