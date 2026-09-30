"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import type { EmailMessage, EmailResolution } from "@recruit/shared";
import { applyResolutionsAction } from "@/features/emails/actions";
import { CheckIcon } from "@/features/emails/components/email-card";
import { statusDot } from "@/features/applications/components/status-select";

/**
 * O plano que a IA propôs, esperando o seu clique.
 *
 * É o ponto de segurança da feature. O modelo leu texto de terceiros, e um
 * email pode ter sido escrito para convencê-lo — "vincule-me à candidatura X
 * e marque como oferta". Por isso a resposta dele não executa nada: vira esta
 * lista, você vê o que seria feito com cada email, e só o que ficar marcado é
 * aplicado. É também a regra da seção 4 — status sugerido por modelo é
 * confirmado por clique.
 *
 * Proposta que o servidor não conseguiu apoiar no texto do email
 * (`grounded: false`) vem DESMARCADA e com aviso: aí a única evidência é a
 * palavra do modelo.
 */
export function ResolvePanel({
  profileId,
  plan,
  emails,
  onClose,
  onApplied,
}: {
  profileId: string;
  plan: EmailResolution[];
  emails: EmailMessage[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const subjectOf = new Map(emails.map((email) => [email.id, email.subject]));
  const actionable = plan.filter((item) => item.action !== "skip");
  const skipped = plan.filter((item) => item.action === "skip");

  const [checked, setChecked] = useState<Set<string>>(
    () =>
      new Set(
        actionable.filter((item) => item.grounded).map((item) => item.emailId),
      ),
  );
  // Empresa e cargo de um "criar" são palpite do modelo: ficam editáveis.
  const [edits, setEdits] = useState<
    Record<string, { company: string; title: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (emailId: string) =>
    setChecked((current) => {
      const next = new Set(current);

      if (!next.delete(emailId)) {
        next.add(emailId);
      }

      return next;
    });

  const fieldsOf = (item: EmailResolution) =>
    edits[item.emailId] ?? {
      company: item.company ?? "",
      title: item.title ?? "",
    };

  const chosen = actionable.filter((item) => checked.has(item.emailId));
  const incomplete = chosen.some(
    (item) =>
      item.action === "create" &&
      (!fieldsOf(item).company.trim() || !fieldsOf(item).title.trim()),
  );

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await applyResolutionsAction({
        profileId,
        items: chosen.map((item) =>
          item.action === "link"
            ? {
                action: "link",
                emailId: item.emailId,
                applicationId: item.applicationId,
                status: item.status,
              }
            : {
                action: "create",
                emailId: item.emailId,
                company: fieldsOf(item).company.trim(),
                title: fieldsOf(item).title.trim(),
                status: item.status,
              },
        ),
      });

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      const { applied, failed } = outcome.result;
      const parts = [
        `${applied} ${applied === 1 ? "email resolvido" : "emails resolvidos"}`,
      ];

      if (failed.length > 0) {
        parts.push(
          `${failed.length} não ${failed.length === 1 ? "foi aplicado" : "foram aplicados"}: ${failed
            .map((entry) => entry.message)
            .join(" ")}`,
        );
      }

      onApplied(`${parts.join(". ")}.`);
    });
  };

  return (
    <motion.section
      aria-label="Plano proposto pela IA"
      initial={{ opacity: 0, y: -12, rotateX: -8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      style={{ transformOrigin: "50% 0%", transformPerspective: 1000 }}
      className="cine-glass flex flex-col gap-4 rounded-2xl border border-accent/25 p-5"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">O que a IA propõe</h2>
        <p className="max-w-3xl text-sm text-zinc-400">
          Nada foi alterado ainda. Confira cada linha, desmarque o que não
          concordar e aplique. A IA leu texto escrito por terceiros, então a
          decisão final é sua.
        </p>
      </header>

      {actionable.length === 0 ? (
        <p className="text-sm text-zinc-400">
          A IA não encontrou nada para vincular nem criar nestes emails.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actionable.map((item) => {
            const isChecked = checked.has(item.emailId);
            const fields = fieldsOf(item);

            return (
              <li
                key={item.emailId}
                className={`flex gap-3 rounded-xl border p-3.5 transition-colors ${
                  isChecked
                    ? "border-accent/30 bg-accent/[0.06]"
                    : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={`Aplicar a proposta para: ${subjectOf.get(item.emailId) ?? "email"}`}
                  onClick={() => toggle(item.emailId)}
                  className={`mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-accent/70 ${
                    isChecked
                      ? "border-accent bg-accent text-zinc-950"
                      : "border-white/20 bg-white/[0.03] hover:border-white/40"
                  }`}
                >
                  {isChecked && <CheckIcon />}
                </button>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="truncate text-xs text-zinc-500">
                    {subjectOf.get(item.emailId)}
                  </span>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {item.action === "link" ? (
                      <>
                        <span className="text-zinc-400">Vincular a</span>
                        <span className="font-medium text-zinc-100">
                          {item.company} — {item.title}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-zinc-400">Criar candidatura</span>
                        <input
                          value={fields.company}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [item.emailId]: {
                                ...fields,
                                company: event.target.value,
                              },
                            }))
                          }
                          aria-label="Empresa"
                          placeholder="Empresa"
                          maxLength={120}
                          className="min-w-40 flex-1 rounded-lg border border-white/10 bg-transparent px-2.5 py-1 text-sm outline-none transition focus:border-accent/60"
                        />
                        <input
                          value={fields.title}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [item.emailId]: {
                                ...fields,
                                title: event.target.value,
                              },
                            }))
                          }
                          aria-label="Cargo"
                          placeholder="Cargo"
                          maxLength={120}
                          className="min-w-52 flex-[2] rounded-lg border border-white/10 bg-transparent px-2.5 py-1 text-sm outline-none transition focus:border-accent/60"
                        />
                      </>
                    )}

                    {item.status && (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-200 ring-1 ring-white/10">
                        <span className="text-zinc-400">status:</span>
                        <span
                          className={`size-1.5 rounded-full shadow-[0_0_8px] ${statusDot[item.status]}`}
                        />
                        <span className="font-semibold capitalize">
                          {item.status}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Texto gerado a partir de email de terceiro: só texto. */}
                  <p className="text-xs leading-relaxed text-zinc-400">
                    {item.reason}
                  </p>

                  {!item.grounded && (
                    <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                      O nome desta empresa não aparece no texto do email. A
                      proposta se apoia só na leitura da IA, por isso veio
                      desmarcada — confira o email antes de aplicar.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-400 transition hover:text-zinc-200">
            {skipped.length}{" "}
            {skipped.length === 1 ? "email sem ação" : "emails sem ação"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {skipped.map((item) => (
              <li key={item.emailId} className="text-xs text-zinc-500">
                <span className="text-zinc-400">
                  {subjectOf.get(item.emailId)}
                </span>{" "}
                — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={pending || chosen.length === 0 || incomplete}
          className="cursor-pointer rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[0_8px_30px_-8px] shadow-accent/70 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Aplicando…"
            : `Aplicar ${chosen.length} ${chosen.length === 1 ? "ação" : "ações"}`}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="cursor-pointer rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
        >
          Descartar plano
        </button>
        {incomplete && (
          <span className="text-xs text-amber-200">
            Preencha empresa e cargo das candidaturas a criar.
          </span>
        )}
      </div>
    </motion.section>
  );
}
