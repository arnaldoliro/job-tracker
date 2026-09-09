/**
 * Reduz HTML a texto legível.
 *
 * Sem biblioteca, mas com cuidado explícito com ReDoS: toda expressão aqui usa
 * quantificador preguiçoso com terminador obrigatório e **sem aninhamento**.
 * Um `(<[^>]*>)+` da vida trava a CPU em HTML malformado, e a entrada aqui vem
 * de página de terceiro. A entrada também já chega limitada a 2 MB pelo
 * `safe-fetch`, o que limita o trabalho no pior caso.
 */

const STRIP_BLOCKS = [
  /<script\b[^<>]*>[\s\S]*?<\/script\s*>/gi,
  /<style\b[^<>]*>[\s\S]*?<\/style\s*>/gi,
  /<noscript\b[^<>]*>[\s\S]*?<\/noscript\s*>/gi,
  /<svg\b[^<>]*>[\s\S]*?<\/svg\s*>/gi,
  /<head\b[^<>]*>[\s\S]*?<\/head\s*>/gi,
  /<!--[\s\S]*?-->/g,
];

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '\u2019',
  '&lsquo;': '\u2018',
  '&ldquo;': '"',
  '&rdquo;': '"',
};

/** Acentuação em entidade nomeada, comum em página em português. */
const ACCENTS = 'aeiouAEIOU';
const ACCENT_FORMS: [string, string][] = [
  ['acute', '\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da'],
  ['grave', '\u00e0\u00e8\u00ec\u00f2\u00f9\u00c0\u00c8\u00cc\u00d2\u00d9'],
  ['circ', '\u00e2\u00ea\u00ee\u00f4\u00fb\u00c2\u00ca\u00ce\u00d4\u00db'],
  ['tilde', '\u00e3\u1ebd\u0129\u00f5\u0169\u00c3\u1ebc\u0128\u00d5\u0168'],
  ['uml', '\u00e4\u00eb\u00ef\u00f6\u00fc\u00c4\u00cb\u00cf\u00d6\u00dc'],
];

for (const [form, chars] of ACCENT_FORMS) {
  for (let i = 0; i < ACCENTS.length; i += 1) {
    ENTITIES[`&${ACCENTS[i]}${form};`] = chars[i];
  }
}

ENTITIES['&ccedil;'] = '\u00e7';
ENTITIES['&Ccedil;'] = '\u00c7';
ENTITIES['&ntilde;'] = '\u00f1';

/**
 * Teto de entrada antes de qualquer expressão rodar. Mesmo linear, processar
 * megabytes de HTML degenerado custa tempo — e vaga nenhuma precisa de mais
 * que isso de marcação.
 */
const MAX_INPUT = 400_000;

export function htmlToText(html: string, maxChars: number): string {
  let text = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;

  for (const pattern of STRIP_BLOCKS) {
    text = text.replace(pattern, ' ');
  }

  // Tags de bloco viram quebra de linha, para a estrutura da vaga sobreviver.
  text = text.replace(
    /<\/?(?:p|div|section|article|li|ul|ol|br|h[1-6]|tr|table)\b[^<>]*>/gi,
    '\n',
  );

  text = text.replace(/<[^<>]*>/g, ' ');

  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }

  text = text.replace(/&#(\d{1,6});/g, (_match, code: string) =>
    String.fromCodePoint(Number(code)),
  );

  text = text
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…]` : text;
}
