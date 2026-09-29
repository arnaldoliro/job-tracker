import type { ApplicationStatus } from '@recruit/shared';
import {
  isActionable,
  pickSuggestions,
  type SuggestionFacts,
} from './suggestion';

const EMAIL = new Date('2026-08-27T12:00:00Z');
const ANTES = new Date('2026-08-20T12:00:00Z');
const DEPOIS = new Date('2026-08-28T12:00:00Z');

function fato(
  suggested: ApplicationStatus,
  current: ApplicationStatus,
  extra: Partial<SuggestionFacts> = {},
): SuggestionFacts {
  return {
    emailId: 'e1',
    applicationId: 'a1',
    suggested,
    current,
    receivedAt: EMAIL,
    lastTransitionAt: null,
    ...extra,
  };
}

describe('isActionable', () => {
  it('recusa de uma candidatura em aplicado é notícia', () => {
    // O caso real que motivou a feature: a recusa chegou e nada mudou.
    expect(isActionable(fato('rejeitado', 'aplicado'))).toBe(true);
  });

  it('sugerir o status em que ela já está não é notícia', () => {
    expect(isActionable(fato('entrevista', 'entrevista'))).toBe(false);
  });

  it('não reabre candidatura encerrada', () => {
    expect(isActionable(fato('entrevista', 'rejeitado'))).toBe(false);
  });

  it('some quando você mudou o status depois do email', () => {
    expect(
      isActionable(fato('rejeitado', 'triagem', { lastTransitionAt: DEPOIS })),
    ).toBe(false);
  });

  it('continua quando a última mudança foi antes do email', () => {
    expect(
      isActionable(fato('rejeitado', 'triagem', { lastTransitionAt: ANTES })),
    ).toBe(true);
  });

  it('email antigo não puxa a candidatura para trás no funil', () => {
    expect(isActionable(fato('triagem', 'entrevista'))).toBe(false);
  });

  it('avançar no funil é notícia', () => {
    expect(isActionable(fato('entrevista', 'triagem'))).toBe(true);
  });

  it('rejeição vale a partir de qualquer etapa, até da oferta', () => {
    expect(isActionable(fato('rejeitado', 'oferta'))).toBe(true);
  });
});

describe('pickSuggestions', () => {
  it('uma por candidatura, a do email mais recente', () => {
    const picked = pickSuggestions([
      fato('triagem', 'aplicado', { emailId: 'velho', receivedAt: ANTES }),
      fato('entrevista', 'aplicado', { emailId: 'novo', receivedAt: DEPOIS }),
    ]);

    expect(picked.map((row) => row.emailId)).toEqual(['novo']);
  });

  it('um email novo que não vale não esconde um antigo que vale', () => {
    // Filtrar depois de escolher perderia a recusa: o email mais novo repete
    // o status atual e seria o escolhido.
    const picked = pickSuggestions([
      fato('rejeitado', 'triagem', { emailId: 'recusa', receivedAt: ANTES }),
      fato('triagem', 'triagem', { emailId: 'lembrete', receivedAt: DEPOIS }),
    ]);

    expect(picked.map((row) => row.emailId)).toEqual(['recusa']);
  });

  it('candidaturas diferentes não competem entre si', () => {
    const picked = pickSuggestions([
      fato('rejeitado', 'aplicado', { emailId: 'e1', applicationId: 'a1' }),
      fato('entrevista', 'aplicado', { emailId: 'e2', applicationId: 'a2' }),
    ]);

    expect(picked).toHaveLength(2);
  });
});
