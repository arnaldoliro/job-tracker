import type { ProfileWithAvatar } from "@/features/profile/types";

interface ProfileCardProps {
  profile: ProfileWithAvatar;
  onSelect: (id: string) => void;
}

export function ProfileCard({ profile, onSelect }: ProfileCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      className="group flex w-36 cursor-pointer flex-col items-center gap-3 rounded-xl border border-transparent p-4 transition hover:border-zinc-200 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
    >
      <span
        aria-hidden
        className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-transparent transition group-hover:ring-zinc-300 dark:group-hover:ring-zinc-600 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: profile.avatar }}
      />
      <span className="flex flex-col items-center gap-0.5">
        <span className="line-clamp-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {profile.name}
        </span>
        {profile.headline ? (
          <span className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
            {profile.headline}
          </span>
        ) : null}
      </span>
    </button>
  );
}
