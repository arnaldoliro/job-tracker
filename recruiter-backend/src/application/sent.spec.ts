import { hasBeenSent, isSending } from './sent';

const facts = (
  status: Parameters<typeof hasBeenSent>[0]['status'],
  extra: Partial<Parameters<typeof hasBeenSent>[0]> = {},
) => ({ status, appliedAt: null, reached: [], ...extra });

describe('quando a candidatura conta como enviada', () => {
  it('rascunho sem data e sem histórico não foi enviado', () => {
    expect(hasBeenSent(facts('rascunho'))).toBe(false);
  });

  it('rascunho cancelado não foi enviado', () => {
    expect(hasBeenSent(facts('cancelado', { reached: ['rascunho'] }))).toBe(
      false,
    );
  });

  it('status de envio, data de envio ou histórico contam', () => {
    expect(hasBeenSent(facts('aplicado'))).toBe(true);
    expect(hasBeenSent(facts('rejeitado'))).toBe(true);
    expect(hasBeenSent(facts('rascunho', { appliedAt: new Date() }))).toBe(
      true,
    );
    expect(hasBeenSent(facts('rascunho', { reached: ['aplicado'] }))).toBe(
      true,
    );
  });

  it('o envio é só a primeira passagem', () => {
    expect(isSending(facts('rascunho'), facts('aplicado'))).toBe(true);
    expect(
      isSending(
        facts('rascunho', { reached: ['aplicado'] }),
        facts('aplicado', { reached: ['aplicado'] }),
      ),
    ).toBe(false);
    expect(isSending(facts('aplicado'), facts('triagem'))).toBe(false);
  });
});
