import { envSchema } from '../config/env';
import { rescueQuery } from './rescue-query';

/** Fixtures fictícias (§7): nenhum remetente real. */

describe('rescueQuery', () => {
  it('sem remetentes não monta busca', () => {
    // Uma busca vazia no Gmail traria a caixa de entrada inteira.
    expect(rescueQuery([])).toBeNull();
  });

  it('junta os remetentes numa busca dos últimos 90 dias', () => {
    expect(
      rescueQuery(['vagas@empresa-um.example', 'empresa-dois.example']),
    ).toBe(
      'newer_than:90d {from:vagas@empresa-um.example from:empresa-dois.example}',
    );
  });

  it('não repete remetente', () => {
    expect(rescueQuery(['empresa.example', 'empresa.example'])).toBe(
      'newer_than:90d {from:empresa.example}',
    );
  });
});

describe('RECRUITING_RESCUE_SENDERS', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  function parse(value: string | undefined) {
    return envSchema.safeParse({ ...base, RECRUITING_RESCUE_SENDERS: value });
  }

  it('vazio ou ausente vira lista vazia', () => {
    expect(parse(undefined).data?.RECRUITING_RESCUE_SENDERS).toEqual([]);
    expect(parse('').data?.RECRUITING_RESCUE_SENDERS).toEqual([]);
  });

  it('aceita endereço e domínio, normalizando caixa e espaços', () => {
    expect(
      parse(' Vagas@Empresa.example , outra.example.br ,').data
        ?.RECRUITING_RESCUE_SENDERS,
    ).toEqual(['vagas@empresa.example', 'outra.example.br']);
  });

  it.each([
    'empresa.example} OR from:*',
    'empresa example',
    'from:empresa.example',
    '(empresa.example)',
    'semponto',
  ])('recusa o que mudaria a busca: %s', (value) => {
    expect(parse(value).success).toBe(false);
  });
});
