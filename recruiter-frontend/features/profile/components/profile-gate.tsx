"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileModal } from "@/features/profile/components/profile-modal";
import {
  clearStoredProfileId,
  setStoredProfileId,
  useStoredProfileId,
} from "@/features/profile/use-stored-profile";
import type { ProfileWithAvatar } from "@/features/profile/types";

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
        <AppShell
          avatar={selected.avatar}
          name={selected.name}
          headline={selected.headline}
          onSwitch={() => setSwitching(true)}
        >
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Perfil ativo. A lista de candidaturas entra aqui na próxima etapa.
          </p>
        </AppShell>
      )}

      <ProfileModal
        open={showModal}
        profiles={profiles}
        dismissible={Boolean(selected)}
        onSelect={handleSelect}
        onDismiss={() => setSwitching(false)}
      />
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
