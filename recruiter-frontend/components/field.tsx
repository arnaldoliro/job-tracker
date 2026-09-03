import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  defaultValue?: string;
  type?: "text" | "url" | "date";
  error?: string;
  /** Textarea no lugar do input, para notas. */
  multiline?: boolean;
  /** Select no lugar do input; as opções vêm daqui. */
  children?: ReactNode;
}

/**
 * Campo de formulário compartilhado.
 *
 * Subiu de dentro do `profile-modal.tsx` quando o formulário de candidatura
 * virou o segundo consumidor — é a regra de promover no segundo caso, não no
 * primeiro. As variantes `multiline` e `children` nasceram desse segundo uso,
 * com dois exemplos reais em vez de um palpite.
 */
export function Field({
  label,
  name,
  error,
  multiline,
  children,
  ...rest
}: FieldProps) {
  const className =
    "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 aria-[invalid]:border-red-500 dark:border-zinc-700 dark:focus:border-zinc-100";

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>

      {children ? (
        <select
          name={name}
          aria-invalid={error ? true : undefined}
          className={className}
          defaultValue={rest.defaultValue}
        >
          {children}
        </select>
      ) : multiline ? (
        <textarea
          name={name}
          rows={3}
          aria-invalid={error ? true : undefined}
          className={`${className} resize-y`}
          {...rest}
        />
      ) : (
        <input
          name={name}
          aria-invalid={error ? true : undefined}
          className={className}
          {...rest}
        />
      )}

      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}
