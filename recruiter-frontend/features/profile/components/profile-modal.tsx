"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { IconPlus } from "@/components/icons";
import {
  createProfileAction,
  type CreateProfileState,
} from "@/features/profile/actions";
import { ProfileCard } from "@/features/profile/components/profile-card";
import type { ProfileWithAvatar } from "@/features/profile/types";

interface ProfileModalProps {
  open: boolean;
  profiles: ProfileWithAvatar[];
  /** Sem perfil escolhido não há tela útil atrás — o modal não pode fechar. */
  dismissible: boolean;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

const initialState: CreateProfileState = { status: "idle" };

export function ProfileModal({
  open,
  profiles,
  dismissible,
  onSelect,
  onDismiss,
}: ProfileModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(profiles.length === 0);
  const [state, formAction, pending] = useActionState(
    createProfileAction,
    initialState,
  );

  // O <dialog> fica sempre montado e só alterna aberto/fechado. Se ele
  // desmontasse ao fechar, o nó sairia do DOM no primeiro frame e não haveria
  // o que animar na saída.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Esc no modal obrigatório, em duas camadas.
  //
  // `cancel` não borbulha, então a delegação do React não o intercepta de
  // forma confiável — daí o listener nativo. Mas o preventDefault sozinho não
  // basta: o CloseWatcher do Chrome só torna o `cancel` cancelável depois que
  // a página recebeu ativação do usuário. Verificado no Chrome 151 — sem
  // nenhum clique antes, `cancel` chega com `cancelable: false` e o Esc fecha
  // o modal de qualquer jeito, deixando a tela vazia e sem volta.
  //
  // Por isso o `close` reabre: é a rede que pega justamente o caso em que o
  // navegador se recusa a deixar a página impedir o fechamento.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const handleCancel = (event: Event) => {
      if (!dismissible) {
        event.preventDefault();
        return;
      }

      onDismiss();
    };

    const handleClose = () => {
      if (!dismissible && !dialog.open) {
        dialog.showModal();
        return;
      }

      // Reset aqui, e não num efeito: é callback de evento, então não gera
      // render em cascata. Reabrir o seletor não deve trazer o form aberto.
      setCreating(profiles.length === 0);
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, [dismissible, onDismiss, profiles.length]);

  // Quem acabou de criar um perfil quer usar aquele.
  useEffect(() => {
    if (state.status === "success") {
      onSelect(state.profile.id);
    }
  }, [state, onSelect]);

  return (
    <dialog
      ref={dialogRef}
      data-animated
      className="m-auto w-[min(90vw,34rem)] rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <h1 className="text-center text-xl font-semibold tracking-tight">
        Quem está se candidatando?
      </h1>
      <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {profiles.length === 0
          ? "Crie seu primeiro perfil para começar."
          : "Escolha um perfil para continuar."}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {profiles.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} onSelect={onSelect} />
        ))}

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-36 cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-4 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-300 dark:focus-visible:outline-zinc-100"
          >
            <span
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-current"
            >
              <IconPlus size={24} />
            </span>
            <span className="text-sm font-medium">Criar perfil</span>
          </button>
        )}
      </div>

      {creating && (
        <form
          action={formAction}
          className="mt-6 flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
        >
          <Field
            label="Nome"
            name="name"
            placeholder="Como você quer chamar este perfil"
            required
            autoFocus
            error={
              state.status === "error" ? state.fieldErrors?.name : undefined
            }
          />
          <Field
            label="Descrição"
            name="headline"
            placeholder="Backend Sênior (opcional)"
            error={
              state.status === "error" ? state.fieldErrors?.headline : undefined
            }
          />

          {state.status === "error" && !state.fieldErrors && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? "Criando…" : "Criar perfil"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

interface FieldProps {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  error?: string;
}

function Field({ label, name, error, ...rest }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        aria-invalid={error ? true : undefined}
        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 aria-[invalid]:border-red-500 dark:border-zinc-700 dark:focus:border-zinc-100"
        {...rest}
      />
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}
