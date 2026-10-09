/**
 * `claude-haiku-4-5-20251001` → "Claude Haiku 4.5". Nome de modelo local
 * (`qwen2.5:3b`) fica como está: é como a pessoa o digitou no `.env`.
 */
export function aiModelLabel(model: string): string {
  const claude = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model);

  if (!claude) {
    return model;
  }

  const [, family, major, minor] = claude;

  return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`;
}
