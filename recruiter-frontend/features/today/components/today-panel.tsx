"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  APPLICATION_STATUSES,
  FOLLOW_UP_DAYS,
  FOLLOW_UP_SNOOZE_DAYS,
} from "@recruit/shared";
import type {
  ApplicationStatus,
  EmailAction,
  EmailDeadline,
  EmailSyncState,
  DueFollowUp,
  FollowUpAction,
  Today,
} from "@recruit/shared";
import {
  dismissEmailAction,
  syncEmailsAction,
  undismissEmailAction,
} from "@/features/emails/actions";
import { StatusBadge } from "@/features/applications/components/status-badge";
import { followUpAction } from "@/features/today/actions";

/**
 * O que pede ação hoje. Cada bloco leva para onde a ação acontece; só o
 * follow-up se resolve aqui mesmo, porque "fiz" e "adiar" não têm outro lugar.
 */
export function TodayPanel({ today }: { today: Today }) {
  const nothing =
    today.emailActions.length === 0 &&
    today.followUps.length === 0 &&
    today.pendingSuggestions === 0 &&
    today.savedNotApplied.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Hoje</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          O que pede ação agora na sua busca.
        </p>
      </div>

      <SyncStatus sync={today.emailSync} />

      {/* Só com remetentes no .env do backend: a lista é da pessoa e não
          fica no código, e sem ela não há o que buscar. */}
      {today.rescueQuery && (
        <Section
          title="Confira também os emails fora do filtro"
          hint={`O app só lê o rótulo ${today.emailSync.mailbox ? `"${today.emailSync.mailbox}"` : "configurado"}, e o resgate de 90 dias também. Convites de outras plataformas ficam de fora até o filtro do Gmail colocá-los no rótulo.`}
        >
          <a
            href={`https://mail.google.com/mail/#search/${encodeURIComponent(today.rescueQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Buscar no Gmail os remetentes de recrutamento configurados ↗
          </a>
          <p className="text-xs text-zinc-400">
            Confira a conta aberta no Gmail. Inclua esses remetentes no filtro
            do seu rótulo e aplique às conversas existentes; depois sincronize
            os últimos 90 dias em Emails.
          </p>
        </Section>
      )}
      {today.emailActions.length > 0 && (
        <Section
          title={`Emails que podem exigir ação (${today.emailActions.length})`}
          hint="Convites e pendências dos últimos 90 dias, inclusive sem candidatura vinculada. Prazo mais próximo primeiro; vencidos no fim. Confirme no portal se a etapa ainda está disponível."
        >
          <ul className="flex flex-col gap-3">
            {today.emailActions.map((item) => (
              <EmailActionItem key={item.emailId} item={item} />
            ))}
          </ul>
        </Section>
      )}
      {nothing && (
        <p className="cine-glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {emptyMessage(today.emailSync)} Que tal{" "}
          <Link
            href="/vagas"
            className="font-medium underline underline-offset-4"
          >
            procurar vagas
          </Link>
          ?
        </p>
      )}

      {today.followUps.length > 0 && (
        <Section
          title={`Follow-ups (${today.followUps.length})`}
          hint="Candidaturas paradas além do prazo do status. Mudar o status em Candidaturas também tira daqui."
        >
          <ul className="flex flex-col gap-2">
            {today.followUps.map((item) => (
              <FollowUpItem key={item.applicationId} item={item} />
            ))}
          </ul>
        </Section>
      )}

      {today.pendingSuggestions > 0 && (
        <Section
          title="Emails com sugestão de status"
          hint="O Claude leu respostas das empresas e sugeriu um novo status. Nada muda sem o seu clique."
        >
          <Link
            href="/candidaturas"
            className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {today.pendingSuggestions}{" "}
            {today.pendingSuggestions === 1
              ? "sugestão esperando"
              : "sugestões esperando"}{" "}
            em Candidaturas →
          </Link>
        </Section>
      )}

      {today.savedNotApplied.length > 0 && (
        <Section
          title={`Vagas salvas sem candidatura (${today.savedNotApplied.length})`}
          hint="Você salvou e ainda não se candidatou. Vaga boa não fica aberta para sempre."
        >
          <ul className="flex flex-col gap-1.5">
            {today.savedNotApplied.slice(0, 8).map((job) => (
              <li
                key={job.jobId}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{job.company}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" "}
                    · {job.title}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  salva há {daysAgo(job.savedAt)}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/vagas/salvas"
            className="self-start text-sm font-medium underline underline-offset-4"
          >
            Ver e aplicar em Minhas vagas →
          </Link>
        </Section>
      )}

      <Section
        title="Candidaturas por status"
        hint="Distribuição dos registros não excluídos."
      >
        <div className="flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((status) => (
            <Link
              key={status}
              href="/candidaturas"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <StatusBadge status={status} />
              <span className="font-semibold tabular-nums">
                {today.pipeline[status] ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** O que fazer, dito por status: o mesmo "parado há N dias" pede coisas diferentes. */
const ADVICE: Record<ApplicationStatus, (days: number) => string> = {
  rascunho: (d) => `Rascunho parado há ${d} dias — envie ou descarte.`,
  aplicado: (d) =>
    `Sem resposta há ${d} dias — vale um follow-up com o recrutador.`,
  triagem: (d) =>
    `Na triagem há ${d} dias — pergunte sobre os próximos passos.`,
  entrevista: (d) =>
    `Entrevista há ${d} dias sem retorno — agradeça e peça um retorno.`,
  teste: (d) => `No teste há ${d} dias — confira o prazo ou peça retorno.`,
  oferta: (d) => `Proposta aberta há ${d} dias — responda à empresa.`,
  rejeitado: () => "",
  cancelado: () => "",
};

function FollowUpItem({ item }: { item: DueFollowUp }) {
  const [done, setDone] = useState<FollowUpAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (action: FollowUpAction) => {
    setError(null);
    startTransition(async () => {
      const outcome = await followUpAction(item.applicationId, action);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setDone(action);
    });
  };

  if (done) {
    const days =
      done === "adiar" ? FOLLOW_UP_SNOOZE_DAYS : FOLLOW_UP_DAYS[item.status];

    return (
      <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {item.company} — {done === "adiar" ? "adiado" : "follow-up registrado"};
        volta em {days} dias se nada mudar.
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.company}</span>
        <span className="min-w-0 truncate text-sm text-zinc-500 dark:text-zinc-400">
          {item.title}
        </span>
        <StatusBadge status={item.status} />
      </div>
      <p className="text-sm">{ADVICE[item.status](item.daysInStatus)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("feito")}
          className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Fiz o follow-up
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("adiar")}
          className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Adiar {FOLLOW_UP_SNOOZE_DAYS} dias
        </button>
        <Link
          href="/candidaturas"
          className="text-xs font-medium underline underline-offset-4"
        >
          Mudar status em Candidaturas
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

function EmailActionItem({ item }: { item: EmailAction }) {
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (undo: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await (undo ? undismissEmailAction : dismissEmailAction)(
        item.emailId,
      );
      if (result.status === "error") setError(result.message);
      else setDismissed(!undo);
    });
  const gmail =
    item.gmailUrl &&
    (() => {
      try {
        const url = new URL(item.gmailUrl);
        return url.protocol === "https:" && url.hostname === "mail.google.com"
          ? url.href
          : null;
      } catch {
        return null;
      }
    })();
  return (
    <li
      className={`rounded-xl border p-4 text-sm ${
        urgent(item.deadline)
          ? "border-red-400/60"
          : item.deadline?.state === "vencido"
            ? "border-zinc-300 dark:border-zinc-700"
            : "border-amber-400/30"
      }`}
    >
      {dismissed ? (
        <p>
          Aviso dispensado.{" "}
          <button
            disabled={pending}
            onClick={() => act(true)}
            className="underline"
          >
            Desfazer
          </button>
        </p>
      ) : (
        <>
          <p className="font-semibold">{item.subject}</p>
          <p className="text-xs text-zinc-400">
            {item.sender} · recebido em{" "}
            {new Date(item.receivedAt).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </p>
          <DeadlineNote deadline={item.deadline} />
          <div className="mt-3 flex flex-wrap gap-4">
            {gmail ? (
              <a
                href={gmail}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Abrir email ↗
              </a>
            ) : (
              <Link href="/emails" className="underline">
                Revisar em Emails
              </Link>
            )}
            <button
              disabled={pending}
              onClick={() => act(false)}
              className="underline disabled:opacity-50"
            >
              Dispensar aviso
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Dispensar oculta o email dos pendentes do app; não altera o Gmail
            nem o status da candidatura.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * "Nada a fazer" só vale sobre emails lidos. Sem sincronização recente, a
 * lista vazia pode ser só falta de leitura, e a tela precisa dizer qual dos
 * dois é.
 */
function emptyMessage(sync: EmailSyncState): string {
  if (!sync.configured) {
    return "Nenhuma pendência nos dados registrados. A leitura de emails não está configurada, então convites por email não aparecem aqui.";
  }

  if (sync.freshness === "em-dia") {
    return "Nenhuma pendência identificada: os emails estão sincronizados.";
  }

  return "Nenhuma pendência nos dados que o app tem, mas os emails não estão em dia: sincronize antes de concluir que não há nada.";
}

function time(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: SP,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * De quando são os dados de email desta tela, e o botão para trazê-los.
 *
 * Sincronizar é sempre um clique: cada rodada pode chamar o modelo, e por
 * isso não existe sincronização periódica (ver `email-boot-sync.ts`). Durante
 * uma rodada, "Atualizar" só relê esta tela, sem chamar nada pago.
 */
function SyncStatus({ sync }: { sync: EmailSyncState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!sync.configured) {
    return (
      <Section
        title="Emails não configurados"
        hint="Defina IMAP_HOST, IMAP_USER e IMAP_PASSWORD no .env do backend para Hoje mostrar convites e pendências vindos por email."
      >
        {null}
      </Section>
    );
  }

  const syncNow = () =>
    startTransition(async () => {
      setError(null);
      const result = await syncEmailsAction();

      if (result.status === "error") setError(result.message);
      router.refresh();
    });

  const last = sync.lastAttempt;
  const tone =
    sync.runningSince === null &&
    (sync.freshness !== "em-dia" || last?.outcome === "parcial")
      ? "border border-amber-400/40"
      : "";

  return (
    <section
      className={`cine-glass flex flex-col gap-2 rounded-2xl p-5 text-sm ${tone}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Emails</h2>
          <p>
            {sync.runningSince
              ? `Sincronização em andamento desde ${time(sync.runningSince)}.`
              : sync.lastSuccessAt
                ? `Última sincronização bem-sucedida: ${time(sync.lastSuccessAt)}.`
                : "Sem sincronização bem-sucedida desde que a API iniciou."}
            {!sync.runningSince &&
              sync.freshness === "desatualizado" &&
              " Os dados podem estar desatualizados."}
          </p>
        </div>
        {sync.runningSince ? (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Atualizar
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={syncNow}
            className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {pending ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        )}
      </div>

      {!sync.runningSince && last?.outcome === "falhou" && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          A última tentativa falhou em {time(last.finishedAt)}
          {last.message ? `: ${last.message}` : "."}
        </p>
      )}
      {!sync.runningSince && last?.outcome === "parcial" && (
        <p className="text-amber-700 dark:text-amber-300">
          A última rodada ({time(last.finishedAt)}) foi parcial: {last.message}{" "}
          A próxima sincronização tenta de novo.
        </p>
      )}
      {/* A falha do clique já volta no estado da sincronização acima; repetir
          a mesma frase só a mostraria duas vezes. */}
      {error && error !== last?.message && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        O app lê só o rótulo{" "}
        {sync.mailbox ? <q>{sync.mailbox}</q> : "configurado"} do Gmail; o
        resgate de 90 dias, em Emails, relê esse mesmo rótulo e não busca fora
        dele. Não há sincronização periódica: só esta, a de Emails e, se
        ligada, a que roda quando a API inicia.
      </p>
    </section>
  );
}

/** Prazo de até dois dias: o que some se você deixar para amanhã. */
function urgent(deadline: EmailDeadline | null): boolean {
  return (
    deadline?.state === "proximo" &&
    deadline.daysLeft !== null &&
    deadline.daysLeft <= 2
  );
}

const SP = "America/Sao_Paulo";

/**
 * O prazo dito com a precisão que o email deu, e só ela: data sem hora sai sem
 * hora. O trecho original vai junto, para você conferir o que foi entendido.
 */
function DeadlineNote({ deadline }: { deadline: EmailDeadline | null }) {
  if (!deadline) {
    return (
      <p className="mt-2">
        Nenhum prazo identificado no email: confira a mensagem. O portal pode
        ter prazo próprio.
      </p>
    );
  }

  const quote = <q className="italic">{deadline.text}</q>;

  if (deadline.state === "desconhecido") {
    return (
      <p className="mt-2">
        O email cita um prazo ({quote}), mas sem data completa para calcular.
        Confira na mensagem.
      </p>
    );
  }

  const when = deadline.dueAt
    ? new Date(deadline.dueAt).toLocaleString("pt-BR", {
        timeZone: SP,
        dateStyle: "short",
        timeStyle: "short",
      })
    : new Date(`${deadline.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR", {
        timeZone: "UTC",
      });

  if (deadline.state === "vencido") {
    return (
      <p className="mt-2 text-zinc-500 dark:text-zinc-400">
        O prazo citado no email ({quote}) passou em {when}. Isso não prova que a
        etapa fechou no portal: confira antes de descartar.
      </p>
    );
  }

  return (
    <p className="mt-2">
      <span
        className={
          urgent(deadline) ? "font-semibold text-red-600 dark:text-red-400" : ""
        }
      >
        {relativeDay(deadline.daysLeft)}: {when}
      </span>
      {deadline.dueAt && " (contado de quando o email chegou)"}. Trecho do
      email: {quote}. O prazo não garante que a vaga continue aberta.
    </p>
  );
}

function relativeDay(daysLeft: number | null): string {
  if (daysLeft === null) return "Prazo";
  if (daysLeft <= 0) return "Vence hoje";
  if (daysLeft === 1) return "Vence amanhã";

  return `Vence em ${daysLeft} dias`;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cine-glass flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function daysAgo(iso: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)),
  );

  return days === 0 ? "menos de um dia" : days === 1 ? "1 dia" : `${days} dias`;
}
