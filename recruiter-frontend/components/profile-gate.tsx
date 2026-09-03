"use client";

import { useCallback, useEffect, useState } from "react";
import { ProfileModal } from "@/components/profile-modal";
import {
  clearStoredProfileId,
  setStoredProfileId,
  useStoredProfileId,
} from "@/lib/stored-profile";
import type { ProfileWithAvatar } from "@/lib/types";

export function ProfileGate({ profiles }: { profiles: ProfileWithAvatar[] }) {
  const storedId = useStoredProfileId();
  const [switching, setSwitching] = useState(false);

  const selected = storedId
    ? profiles.find((profile) => profile.id === storedId)
    : undefined;

  // O id guardado pode apontar para um perfil apagado direto no banco. O
  // efeito só mexe no store externo (localStorage), sem setState — quem
  // re-renderiza é o useSyncExternalStore.
  useEffect(() => {
    if (storedId && !selected) {
      clearStoredProfileId();
    }
  }, [storedId, selected]);

  const handleSelect = useCallback((id: string) => {
    setStoredProfileId(id);
    setSwitching(false);
  }, []);

  // Ainda não hidratou: sem isso o modal piscaria para quem já escolheu.
  if (storedId === undefined) {
    return <Skeleton />;
  }

  const showModal = !selected || switching;

  return (
    <>
      {selected && (
        <Shell profile={selected} onSwitch={() => setSwitching(true)} />
      )}

      {showModal && (
        <ProfileModal
          key={switching ? "switching" : "initial"}
          profiles={profiles}
          dismissible={Boolean(selected)}
          onSelect={handleSelect}
          onDismiss={() => setSwitching(false)}
        />
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-20 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

interface ShellProps {
  profile: ProfileWithAvatar;
  onSwitch: () => void;
}

/** Casca mínima só para provar a seleção. A lista de candidaturas vem depois. */
function Shell({ profile, onSwitch }: ShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-9 w-9 overflow-hidden rounded-full [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: profile.avatar }}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{profile.name}</span>
            {profile.headline && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {profile.headline}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onSwitch}
          className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Trocar perfil
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Perfil ativo. A lista de candidaturas entra aqui na próxima etapa.
        </p>
      </main>
    </div>
  );
}
