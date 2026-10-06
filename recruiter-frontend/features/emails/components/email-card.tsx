"use client";

import { useState, useTransition } from "react";
import type { Application, EmailKind, EmailMessage } from "@recruit/shared";
import { IconExternalLink, IconX } from "@/components/icons";
import {
  createFromEmailAction,
  dismissEmailAction,
  linkEmailAction,
  undismissEmailAction,
} from "@/features/emails/actions";
import { LinkMenu } from "@/features/emails/components/link-menu";

const kindLabel: Record<EmailKind, string> = {
  confirmacao: "confirmação de candidatura",
  atualizacao: "atualização do processo",
  alerta: "alerta de vagas",
  desconhecido: "não identificado",
};

const kindTone: Record<EmailKind, string> = {
  confirmacao: "bg-emerald-950 text-emerald-300",
  atualizacao: "bg-blue-950 text-blue-300",
  alerta: "bg-zinc-800 text-zinc-400",
  desconhecido: "bg-zinc-800 text-zinc-400",
};

/**
 * O que cada tipo de email é, em uma frase. O rótulo sozinho não dizia o que
 * fazer com o card; isto diz — inclusive que o "não identificado" fica de
 * fora da IA, para o botão não parecer quebrado quando ela o pula.
 */
const kindMeaning: Record<EmailKind, string> = {
  confirmacao:
    "A empresa ou a plataforma confirmou que recebeu a sua candidatura. É a prova de que você se candidatou; não muda o andamento do processo.",
  atualizacao:
    "O processo andou: pode ser convite para entrevista, teste, proposta ou recusa. Vale ler.",
  alerta:
    "Divulgação de vagas. Não é resposta a uma candidatura sua.",
  desconhecido:
    "O app não reconheceu este email como parte de um processo seletivo. A IA não age sobre ele; se for de uma candidatura, vincule ou crie à mão.",
};

/**
 * Um email pendente.
 *
 * Tudo que vem do email — assunto, remetente, trecho — é texto de terceiro e
 * vai para a tela como texto. O único link é o do Gmail, montado pelo backend
 * com origem fixa e conferido de novo aqui antes de virar `href`.
 *
 * Sem inclinação 3D: o card tem caixa de seleção, menu e formulário, e um
 * alvo que balança sob o cursor erra clique.
 */
export function EmailCard({
  index,
  profileId,
  email,
  applications,
  selected,
  onToggle,
  onGone,
}: {
  /** Posição na lista, para a cascata de entrada. */
  index: number;
  profileId: string;
  email: EmailMessage;
  applications: Application[];
  selected: boolean;
  onToggle: () => void;
  /** O email saiu da lista de pendentes: tira-o da seleção. */
  onGone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [company, setCompany] = useState(email.companyGuess ?? "");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (
    action: () => Promise<{ status: string; message?: string }>,
    ok: string,
  ) => {
    setError(null);
    startTransition(async () => {
      const outcome = await action();

      if (outcome.status === "error") {
        setError(outcome.message ?? "Algo deu errado.");

        return;
      }

      onGone();
      setDone(ok);
    });
  };

  const dismiss = () => {
    setError(null);
    // Some no clique e volta se der erro: remover é um gesto rápido, e
    // esperar o servidor para o card reagir pareceria travado.
    setDismissed(true);
    onGone();
    startTransition(async () => {
      const outcome = await dismissEmailAction(email.id);

      if (outcome.status === "error") {
        setDismissed(false);
        setError(outcome.message);
      }
    });
  };

  const undo = () => {
    startTransition(async () => {
      const outcome = await undismissEmailAction(email.id);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setDismissed(false);
    });
  };

  if (done) {
    return (
      <li className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        {done}
      </li>
    );
  }

  // O card não some da grade: sumir reflui as colunas a cada clique, e o
  // desfazer teria que morar em outro lugar. Ele encolhe e fica.
  if (dismissed) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 px-5 py-4 text-sm text-zinc-400">
        <span className="min-w-0 truncate">Removido — {email.subject}</span>
        <button
          type="button"
          onClick={undo}
          disabled={pending}
          className="shrink-0 cursor-pointer font-medium text-zinc-200 underline underline-offset-4 transition hover:text-white disabled:opacity-50"
        >
          Desfazer
        </button>
      </li>
    );
  }

  const gmailUrl = trustedGmailUrl(email.gmailUrl);
  // Só oferece "ver mais" quando há o que mostrar além das três linhas.
  const long = (email.preview?.length ?? 0) > 180;

  return (
    <li
      className={`cine-reveal cine-glass relative flex flex-col gap-3 rounded-2xl p-5 transition-shadow ${
        selected ? "ring-2 ring-accent/60" : ""
      }`}
      style={{ ["--i" as string]: index }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Selecionar o email: ${email.subject}`}
          onClick={onToggle}
          className={`mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-accent/70 ${
            selected
              ? "border-accent bg-accent text-zinc-950"
              : "border-white/20 bg-white/[0.03] hover:border-white/40"
          }`}
        >
          {selected && <CheckIcon />}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Assunto e remetente são texto de terceiro: vão como texto. */}
          <span className="text-sm font-medium text-zinc-100">
            {email.subject}
          </span>
          <span className="text-xs text-zinc-400">
            {email.fromName ? `${email.fromName} · ` : ""}
            {email.fromAddress} · {formatDate(email.receivedAt)}
          </span>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${kindTone[email.kind]}`}
        >
          {kindLabel[email.kind]}
        </span>

        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          aria-label="Remover este email da lista"
          title="Remover da lista"
          className="-mr-1.5 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
        >
          <IconX />
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3">
        <p className="text-xs leading-relaxed text-zinc-300">
          {kindMeaning[email.kind]}
        </p>

        {email.companyGuess && (
          <p className="text-xs text-zinc-400">
            Empresa provável:{" "}
            <span className="font-medium text-zinc-200">
              {email.companyGuess}
            </span>
          </p>
        )}

        {email.preview && (
          <p
            className={`text-sm leading-relaxed text-zinc-400 ${expanded ? "" : "line-clamp-3"}`}
          >
            {email.preview}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="cursor-pointer text-xs font-medium text-zinc-300 underline underline-offset-4 transition hover:text-white"
            >
              {expanded ? "Ver menos" : "Ver mais"}
            </button>
          )}

          {gmailUrl && (
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-accent transition hover:brightness-125"
            >
              <IconExternalLink />
              Abrir no Gmail
            </a>
          )}
        </div>
      </div>

      {!email.senderVerified && (
        // Não é acusação de golpe: é o que o app não conseguiu confirmar. O
        // "De" de um email é texto livre, e só o servidor sabe se é verdade.
        <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          Remetente não confirmado. O servidor de email não atestou que esta
          mensagem veio mesmo de {email.fromAddress.split("@").pop()}, então
          ela não foi vinculada sozinha nem lida pela IA. Confira no Gmail
          antes de vincular.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {creating ? (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 p-3">
          <p className="text-xs text-zinc-400">
            Confira antes de registrar — empresa e cargo são um palpite do texto
            do email.
          </p>
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Empresa"
            aria-label="Empresa"
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-accent/60"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Cargo"
            aria-label="Cargo"
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-accent/60"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !company.trim() || !title.trim()}
              onClick={() =>
                run(
                  () =>
                    createFromEmailAction(email.id, {
                      profileId,
                      company: company.trim(),
                      title: title.trim(),
                    }),
                  "Candidatura criada a partir deste email.",
                )
              }
              className="cursor-pointer rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Criando…" : "Registrar candidatura"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="cursor-pointer rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-[0_6px_20px_-8px] shadow-accent/70 transition hover:brightness-110 active:scale-[0.98]"
          >
            Criar candidatura
          </button>

          {applications.length > 0 && (
            <LinkMenu
              applications={applications}
              disabled={pending}
              onChoose={(applicationId) =>
                run(
                  () => linkEmailAction(email.id, applicationId),
                  "Vinculado à candidatura.",
                )
              }
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * O link do Gmail só vira `href` se for mesmo do Gmail.
 *
 * O backend já o monta com origem fixa; a conferência aqui é a segunda
 * barreira, no ponto em que o valor vira um link clicável — se um dia o campo
 * passar a vir de outro lugar, um endereço de fora não entra.
 */
function trustedGmailUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin === "https://mail.google.com" ? url : null;
  } catch {
    return null;
  }
}

export function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
