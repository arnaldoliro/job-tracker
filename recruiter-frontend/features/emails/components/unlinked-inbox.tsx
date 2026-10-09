"use client";

import { useState, useTransition } from "react";
import { RESOLVE_BATCH } from "@recruit/shared";
import type {
  AiStatus,
  Application,
  EmailMessage,
  EmailResolution,
  EmailStatus,
} from "@recruit/shared";
import { IconMail } from "@/components/icons";
import { AiBadge } from "@/features/ai";
import {
  resolveEmailsAction,
  syncEmailsAction,
  type SyncState,
} from "@/features/emails/actions";
import { EmailCard } from "@/features/emails/components/email-card";
import { ResolvePanel } from "@/features/emails/components/resolve-panel";

/**
 * Os emails que chegaram e não deu para dizer de qual candidatura são.
 *
 * Não filtra por perfil de propósito: existe uma conta de email e vários
 * perfis. Filtrar aqui esconderia email de um perfil enquanto você estivesse
 * em outro, e você nunca saberia que ele existe.
 *
 * Nada acontece sozinho. Vincular, criar e remover são cliques seus; a IA
 * só entra quando você seleciona emails e pede, e mesmo aí ela propõe um
 * plano que você confere antes de aplicar.
 */

interface UnlinkedInboxProps {
  profileId: string;
  emails: EmailMessage[];
  applications: Application[];
  status: EmailStatus;
  /** Quem vai ler os emails no "Resolver por IA". `null` = não deu para saber. */
  ai: AiStatus | null;
}

export function UnlinkedInbox({
  profileId,
  emails,
  applications,
  status,
  ai,
}: UnlinkedInboxProps) {
  const [sync, setSync] = useState<SyncState>({ status: "idle" });
  const [syncing, startSync] = useTransition();
  const [resolving, startResolve] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<EmailResolution[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A lista muda por baixo (sincronização, vínculo): só conta o que ainda
  // está na tela.
  const present = emails.filter((email) => selected.has(email.id));
  const allSelected = emails.length > 0 && present.length === emails.length;
  const tooMany = present.length > RESOLVE_BATCH;

  const runSync = () =>
    startSync(async () => {
      setSync(await syncEmailsAction());
    });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);

      if (!next.delete(id)) {
        next.add(id);
      }

      return next;
    });

  const drop = (id: string) =>
    setSelected((current) => {
      if (!current.has(id)) {
        return current;
      }

      const next = new Set(current);

      next.delete(id);

      return next;
    });

  const resolve = () => {
    setError(null);
    setNotice(null);
    startResolve(async () => {
      const outcome = await resolveEmailsAction(
        profileId,
        present.map((email) => email.id),
      );

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setPlan(outcome.plan);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Emails</h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            Emails de processo seletivo que ainda não pertencem a nenhuma
            candidatura. Os que foram reconhecidos aparecem no histórico da
            candidatura.
          </p>
        </div>

        <button
          type="button"
          onClick={runSync}
          disabled={syncing || !status.configured}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_8px_30px_-8px] shadow-accent/70 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          <IconMail />
          {syncing ? "Sincronizando…" : "Sincronizar agora"}
        </button>
      </header>

      {!status.configured ? (
        <p className="cine-glass rounded-2xl px-5 py-4 text-sm text-zinc-400">
          Email não configurado. Defina <code>IMAP_HOST</code>,{" "}
          <code>IMAP_USER</code> e <code>IMAP_PASSWORD</code> no <code>.env</code>{" "}
          do backend, com uma app password — nunca a senha principal da conta.
        </p>
      ) : (
        <p className="text-xs text-zinc-400">
          Lendo o rótulo <code>{status.mailbox}</code> do Gmail.
        </p>
      )}

      {sync.status === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {sync.message}
        </p>
      )}

      {sync.status === "success" && (
        <p className="text-sm text-zinc-400">
          {sync.result.fetched} lidos · {sync.result.stored} novos ·{" "}
          {sync.result.linked} vinculados · {sync.result.relinked} revinculados
          {sync.result.classified > 0 &&
            ` · ${sync.result.classified} lidos pela IA`}
          {sync.result.failed.length > 0 &&
            ` · ${sync.result.failed.length} falharam`}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      )}

      {plan ? (
        <ResolvePanel
          // Um plano novo é um painel novo: marcações e edições do anterior
          // não podem vazar para este.
          key={plan.map((item) => item.emailId).join(",")}
          profileId={profileId}
          plan={plan}
          emails={emails}
          onClose={() => setPlan(null)}
          onApplied={(message) => {
            setPlan(null);
            setSelected(new Set());
            setNotice(message);
          }}
        />
      ) : (
        emails.length > 0 && (
          <div className="cine-glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-5 py-3">
            <button
              type="button"
              onClick={() =>
                setSelected(
                  allSelected
                    ? new Set()
                    : new Set(emails.map((email) => email.id)),
                )
              }
              className="cursor-pointer text-sm font-medium text-zinc-200 underline underline-offset-4 transition hover:text-white"
            >
              {allSelected ? "Limpar seleção" : "Selecionar todos"}
            </button>

            <span className="text-sm text-zinc-400">
              {present.length === 0
                ? "Selecione emails para a IA resolver."
                : `${present.length} ${present.length === 1 ? "selecionado" : "selecionados"}`}
            </span>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <AiBadge status={ai} task="resolve" />
              <button
                type="button"
                onClick={resolve}
                disabled={resolving || present.length === 0 || tooMany}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[0_8px_30px_-8px] shadow-accent/70 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <SparkIcon />
                {resolving ? "A IA está lendo…" : "Resolver por IA"}
              </button>
            </div>

            <p className="w-full text-xs leading-relaxed text-zinc-500">
              {tooMany
                ? `No máximo ${RESOLVE_BATCH} emails por vez — cada um é uma leitura paga.`
                : "A IA lê só os emails selecionados e propõe o que fazer com cada um: vincular a uma candidatura, atualizar o status ou criar a candidatura. Nada muda antes de você conferir e aplicar. Emails não identificados ficam de fora."}
            </p>
          </div>
        )
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {emails.length === 0 ? (
        <p className="cine-glass rounded-2xl px-6 py-14 text-center text-sm text-zinc-400">
          Nenhum email pendente.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {emails.map((email, index) => (
            <EmailCard
              key={email.id}
              index={index}
              profileId={profileId}
              email={email}
              applications={applications}
              selected={selected.has(email.id)}
              onToggle={() => toggle(email.id)}
              onGone={() => drop(email.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <path d="M8 1.5l1.3 3.9a1.5 1.5 0 0 0 .95.95L14.2 7.6l-3.95 1.3a1.5 1.5 0 0 0-.95.95L8 13.8l-1.3-3.95a1.5 1.5 0 0 0-.95-.95L1.8 7.6l3.95-1.25a1.5 1.5 0 0 0 .95-.95z" />
    </svg>
  );
}
