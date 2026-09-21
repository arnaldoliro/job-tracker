import { createHash } from 'node:crypto';
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Transporte: conecta, lê o rótulo, devolve objetos simples. Não conhece
 * Prisma nem candidatura.
 *
 * Duas escolhas aqui são silenciosas se erradas, e por isso estão comentadas
 * onde acontecem: abrir a caixa somente para leitura, e desligar o logger da
 * biblioteca.
 *
 * Conexão por execução, nunca persistente. IDLE traria reconexão, keepalive e
 * um socket pendurado no ciclo de vida do Nest para ganhar uma latência que
 * ninguém está esperando — e o Gmail limita conexões simultâneas por conta.
 */

export class ImapError extends Error {
  constructor(
    message: string,
    /** Erro de credencial não pode ser repetido: o Gmail bloqueia a conta. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
}

export interface FetchedMail {
  messageId: string;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  /** INTERNALDATE do servidor, NUNCA o cabeçalho `Date:`. Ver `sync`. */
  receivedAt: Date;
  bodyText: string | null;
  references: string[];
}

/** Mensagem acima disto entra sem corpo, em vez de ficar de fora. */
const MAX_BODY_BYTES = 1024 * 1024;

/** Corpo guardado com teto: o banco não é arquivo morto de email. */
const MAX_BODY_CHARS = 16_000;

const CONNECT_TIMEOUT_MS = 20_000;

export async function fetchSince(
  config: ImapConfig,
  since: Date,
): Promise<FetchedMail[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    // O logger padrão imprime envelope — assunto e endereço — no stdout. Seria
    // PII em log entregue por acidente (seções 5 e 7).
    logger: false,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: CONNECT_TIMEOUT_MS * 3,
  });

  try {
    await client.connect();
  } catch (error) {
    throw describe(error);
  }

  try {
    await assertMailboxExists(client, config.mailbox);

    // Somente leitura: o fetch padrão do imapflow marca \Seen, e sem isto cada
    // sincronização marcaria como lidos os emails da caixa pessoal.
    await client.mailboxOpen(config.mailbox, { readOnly: true });

    const found: FetchedMail[] = [];

    for await (const message of client.fetch(
      { since },
      {
        uid: true,
        envelope: true,
        internalDate: true,
        size: true,
        threadId: true,
      },
    )) {
      const mail = await readOne(client, message);

      if (mail) {
        found.push(mail);
      }
    }

    return found;
  } catch (error) {
    throw describe(error);
  } finally {
    // Em try próprio: logout lança quando o socket já morreu, e isso viraria
    // uma rejeição não tratada mascarando o erro real.
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

/**
 * Rótulo com nome errado é o erro de configuração mais provável, e o IMAP
 * responde com um `NONEXISTENT` seco. Listar o que existe transforma isso em
 * uma mensagem acionável — "zero emails" não pode ser indistinguível de
 * "nome errado".
 */
async function assertMailboxExists(
  client: ImapFlow,
  mailbox: string,
): Promise<void> {
  const boxes = await client.list();

  if (boxes.some((box) => box.path === mailbox)) {
    return;
  }

  const available = boxes
    .map((box) => box.path)
    .filter((path) => !path.startsWith('[Gmail]'))
    .slice(0, 20)
    .join(', ');

  throw new ImapError(
    `A pasta "${mailbox}" não existe na conta. Rótulos encontrados: ${available}`,
    false,
  );
}

async function readOne(
  client: ImapFlow,
  message: FetchMessageObject,
): Promise<FetchedMail | null> {
  const envelope = message.envelope;
  const from = envelope?.from?.[0];
  const fromAddress = from?.address?.trim().toLowerCase();

  if (!fromAddress) {
    return null;
  }

  // INTERNALDATE, e não o cabeçalho `Date:`. O header é o relógio de quem
  // enviou e vem errado com frequência — um email datado de 2027 elevaria a
  // marca d'água da sincronização e a ingestão pararia para sempre, sem erro.
  const receivedAt = toDate(message.internalDate);

  const heavy = (message.size ?? 0) > MAX_BODY_BYTES;
  let bodyText: string | null = null;
  let references: string[] = [];

  if (!heavy) {
    const parsed = await parseSource(client, message.uid);

    bodyText = parsed?.text ?? null;
    references = parsed?.references ?? [];
  }

  return {
    // O `Message-ID` é SHOULD, não MUST, e alguns ATS o reaproveitam entre
    // destinatários. A coluna é NOT NULL, então um id sintético entra no lugar
    // — com prefixo, para nunca ser confundido com cabeçalho real.
    messageId:
      envelope?.messageId?.trim() ||
      synthesize(fromAddress, envelope?.subject, receivedAt),
    threadId: message.threadId ?? null,
    fromAddress,
    fromName: from?.name?.trim() || null,
    subject: envelope?.subject?.trim() || '(sem assunto)',
    receivedAt,
    bodyText,
    references,
  };
}

async function parseSource(
  client: ImapFlow,
  uid: number,
): Promise<{ text: string | null; references: string[] } | null> {
  try {
    const message = await client.fetchOne(
      String(uid),
      { source: true },
      { uid: true },
    );

    if (!message || typeof message === 'boolean' || !message.source) {
      return null;
    }

    const parsed = await simpleParser(message.source);

    // `parsed.text` de um email só-HTML vem derivado do HTML pelo mailparser.
    // Nunca guardamos `parsed.html`: corpo é conteúdo não confiável (seção 5).
    const text = parsed.text?.trim();

    const references = Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [];

    if (parsed.inReplyTo) {
      references.push(parsed.inReplyTo);
    }

    return {
      text: text ? text.slice(0, MAX_BODY_CHARS) : null,
      references: references.map((value) => value.trim()).filter(Boolean),
    };
  } catch {
    // Uma mensagem ilegível não derruba a rodada — ela entra sem corpo.
    return null;
  }
}

/** `internalDate` chega como Date ou string, conforme o servidor. */
function toDate(value: Date | string | undefined): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

function synthesize(
  fromAddress: string,
  subject: string | undefined,
  receivedAt: Date,
): string {
  const digest = createHash('sha256')
    .update(`${fromAddress}|${subject ?? ''}|${receivedAt.toISOString()}`)
    .digest('hex')
    .slice(0, 32);

  return `synth:${digest}`;
}

function describe(error: unknown): ImapError {
  if (error instanceof ImapError) {
    return error;
  }

  const text = error instanceof Error ? error.message : String(error);

  // O Gmail devolve isto tanto para senha comum sob 2FA quanto para app
  // password revogada. Insistir bloqueia a conta temporariamente.
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(text)) {
    return new ImapError(
      'O servidor recusou as credenciais. Gere uma nova app password e atualize o .env.',
      false,
    );
  }

  if (
    /Too many simultaneous|OVERQUOTA|UNAVAILABLE|ETIMEDOUT|ECONNRESET/i.test(
      text,
    )
  ) {
    return new ImapError(`Servidor indisponível agora: ${text}`, true);
  }

  return new ImapError(text, true);
}
