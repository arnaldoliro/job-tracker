import type { ProfileLinks, Resume } from '@recruit/shared';

/**
 * O que preencher, e por quais rótulos reconhecer cada campo.
 *
 * Puro e sem navegador: é a parte que decide, e decidir se testa sem abrir
 * Chrome. O módulo do navegador só executa este plano.
 *
 * **Reconhecimento por RÓTULO, e isso não é preferência — foi medido.**
 * Inspecionei um formulário real da Ashby: os campos do sistema têm nome
 * estável (`_systemfield_name`, `_systemfield_email`), mas toda pergunta
 * personalizada tem nome UUID (`a284132b-d133-...`), diferente a cada vaga.
 * E NENHUM campo declara `autocomplete` — o atributo que eu esperava usar como
 * segunda camada simplesmente não existe nesses formulários.
 *
 * O que sobra estável é o texto que a PESSOA lê. Um ATS troca o id de um campo
 * numa release qualquer; ele não para de escrever "E-mail" ao lado da caixa.
 */

export interface PlannedField {
  /** Só para log e para a tela dizer o que foi preenchido. */
  readonly what: string;
  /** Rótulos aceitáveis, em português e inglês. */
  readonly labels: RegExp;
  /** Nomes de campo conhecidos, como reforço — nunca como sinal principal. */
  readonly names?: RegExp;
  readonly value: string;
}

export interface FillSource {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: ProfileLinks | null;
  resume: Resume | null;
}

/**
 * Monta o plano a partir do perfil.
 *
 * Campo sem valor NÃO entra no plano. Preencher com string vazia apagaria algo
 * que o ATS já tivesse preenchido a partir da sua conta — e um campo em branco
 * que você não notou é pior que um campo que você viu vazio e preencheu.
 */
export function buildFieldPlan(source: FillSource): PlannedField[] {
  const [first, ...rest] = source.name.trim().split(/\s+/);
  const last = rest.join(' ');

  const candidates: (PlannedField | null)[] = [
    field(
      'nome completo',
      /^(nome completo|full name|name)$/i,
      source.name,
      /_systemfield_name|full.?name/i,
    ),
    field(
      'primeiro nome',
      /^(nome|first name|given name)$/i,
      first,
      /first.?name/i,
    ),
    field(
      'sobrenome',
      /^(sobrenome|last name|family name|surname)$/i,
      last || null,
      /last.?name/i,
    ),
    field('email', /e-?mail/i, source.email, /_systemfield_email|email/i),
    field(
      'telefone',
      /(telefone|celular|phone|mobile)/i,
      source.phone,
      /phone|tel/i,
    ),
    // NÃO casa pergunta de país: `Profile.location` é cidade e estado
    // ("São Paulo, SP"), e num formulário real isso foi parar em "What country
    // are you based in?". Campo vazio é melhor que resposta no nível errado.
    field(
      'localização',
      /(cidade|localiza(ção|cao)|location|city|where are you based)/i,
      source.location,
      /location|city/i,
    ),
    field(
      'LinkedIn',
      /linked-?in/i,
      source.links?.linkedin ?? null,
      /linkedin/i,
    ),
    field('GitHub', /git-?hub/i, source.links?.github ?? null, /github/i),
    field(
      'site',
      /(site|website|portf[oó]lio|portfolio|personal page)/i,
      source.links?.website ?? null,
      /website|portfolio/i,
    ),
  ];

  return candidates.filter((item): item is PlannedField => item !== null);
}

function field(
  what: string,
  labels: RegExp,
  value: string | null,
  names?: RegExp,
): PlannedField | null {
  const trimmed = value?.trim();

  return trimmed ? { what, labels, value: trimmed, names } : null;
}

/**
 * Rótulos que NUNCA devem ser preenchidos automaticamente.
 *
 * Carta de apresentação e pergunta aberta são específicas da vaga — resposta
 * genérica ali é pior que campo vazio, porque parece esforço e não é. Salário
 * e disponibilidade são decisão sua, não dado de cadastro.
 */
export const NEVER_FILL =
  /(carta|cover letter|por que|why do you|pretens|salary|expectativ|disponibilidade|availability|quando pode|notice period)/i;
