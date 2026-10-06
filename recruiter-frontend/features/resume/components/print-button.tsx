"use client";

/**
 * O "gerar PDF".
 *
 * É o diálogo de impressão do próprio navegador, com "Salvar como PDF" no
 * destino. Sem dependência nova, com texto selecionável, e você vê o
 * resultado antes de salvar — o que nenhuma geração no servidor oferece.
 *
 * Em troca, o arquivo não fica guardado: quem escolhe onde salvar é você. O
 * registro do que foi enviado não depende disso — ele é o `ResumeVersion`, que
 * congela o CONTEÚDO e sobrevive a qualquer mudança no currículo base.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 print:hidden dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      Salvar PDF
    </button>
  );
}
