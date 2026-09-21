"use client";

import { useState, useTransition } from "react";
import type {
  Application,
  EmailKind,
  EmailMessage,
  EmailStatus,
} from "@recruit/shared";
import { IconMail } from "@/components/icons";
import {
  createFromEmailAction,
  linkEmailAction,
  syncEmailsAction,
  type SyncState,
} from "@/features/emails/actions";

/**
 * Os emails que chegaram e não deu para dizer de qual candidatura são.
 *
 * Não filtra por perfil de propósito: existe uma conta de email e vários
 * perfis. Filtrar aqui esconderia email de um perfil enquanto você estivesse
 * em outro, e você nunca saberia que ele existe.
 *
 * Nada acontece sozinho — vincular e criar candidatura são cliques seus.
 */

interface UnlinkedInboxProps {
  profileId: string;
  emails: EmailMessage[];
  applications: Application[];
  status: EmailStatus;
}

const kindLabel: Record<EmailKind, string> = {
  confirmacao: "confirmação de candidatura",
  atualizacao: "atualização do processo",
  alerta: "alerta de vagas",
  desconhecido: "não identificado",
};

const kindTone: Record<EmailKind, string> = {
  confirmacao:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  atualizacao: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  alerta: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  desconhecido: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function UnlinkedInbox({
  profileId,
  emails,
  applications,
  status,
}: UnlinkedInboxProps) {
  const [sync, setSync] = useState<SyncState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setSync(await syncEmailsAction());
    });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Emails</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Emails de processo seletivo que ainda não pertencem a nenhuma
            candidatura. Os que foram reconhecidos aparecem no histórico da
            candidatura.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending || !status.configured}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <IconMail />
          {pending ? "Sincronizando…" : "Sincronizar agora"}
        </button>
      </header>

      {!status.configured ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Email não configurado. Defina <code>IMAP_HOST</code>,{" "}
          <code>IMAP_USER</code> e <code>IMAP_PASSWORD</code> no <code>.env</code>{" "}
          do backend, com uma app password — nunca a senha principal da conta.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Lendo o rótulo <code>{status.mailbox}</code> do Gmail.
        </p>
      )}

      {sync.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {sync.message}
        </p>
      )}

      {sync.status === "success" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {sync.result.fetched} lidos · {sync.result.stored} novos ·{" "}
          {sync.result.linked} vinculados · {sync.result.relinked} revinculados
          {sync.result.failed.length > 0 &&
            ` · ${sync.result.failed.length} falharam`}
        </p>
      )}

      {emails.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Nenhum email pendente.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {emails.map((email) => (
            <EmailCard
              key={email.id}
              profileId={profileId}
              email={email}
              applications={applications}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmailCard({
  profileId,
  email,
  applications,
}: {
  profileId: string;
  email: EmailMessage;
  applications: Application[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [company, setCompany] = useState(email.companyGuess ?? "");
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ status: string; message?: string }>, ok: string) => {
    setError(null);
    startTransition(async () => {
      const outcome = await action();

      if (outcome.status === "error") {
        setError(outcome.message ?? "Algo deu errado.");

        return;
      }

      setDone(ok);
    });
  };

  if (done) {
    return (
      <li className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {done}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {/* Assunto e remetente são texto de terceiro: vão como texto. */}
          <span className="text-sm font-medium">{email.subject}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {email.fromName ? `${email.fromName} · ` : ""}
            {email.fromAddress} · {formatDate(email.receivedAt)}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${kindTone[email.kind]}`}
        >
          {kindLabel[email.kind]}
        </span>
      </div>

      {email.preview && (
        <p className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
          {email.preview}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {creating ? (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Confira antes de registrar — empresa e cargo são um palpite do texto
            do email.
          </p>
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Empresa"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Cargo"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
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
              className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? "Criando…" : "Registrar candidatura"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
            className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Criar candidatura
          </button>

          {applications.length > 0 && (
            <select
              defaultValue=""
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value;

                if (value) {
                  run(
                    () => linkEmailAction(email.id, value),
                    "Vinculado à candidatura.",
                  );
                }
              }}
              className="cursor-pointer rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-zinc-700"
            >
              <option value="">Vincular a uma candidatura…</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.job.company} — {application.job.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </li>
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
