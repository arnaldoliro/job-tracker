"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileModal } from "@/features/profile/components/profile-modal";
import { setStoredProfileId } from "@/features/profile/use-stored-profile";
import type { ProfileWithAvatar } from "@/features/profile/types";

interface ProfileGateProps {
  profiles: ProfileWithAvatar[];
  /** Resolvido no servidor a partir do cookie. `null` quando não há escolha. */
  selected: ProfileWithAvatar | null;
  children: ReactNode;
}

export function ProfileGate({ profiles, selected, children }: ProfileGateProps) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  const handleSelect = useCallback(
    (id: string) => {
      setStoredProfileId(id);
      setSwitching(false);
      // Rebusca a árvore do servidor: o perfil mudou, e com ele as
      // candidaturas que o Server Component precisa carregar.
      router.refresh();
    },
    [router],
  );

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
          {children}
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
