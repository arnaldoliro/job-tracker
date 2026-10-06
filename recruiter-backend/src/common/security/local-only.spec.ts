import { isLoopbackHost } from '@recruit/shared';
import { rejectNonLocal } from './local-only';

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1:3333', 'localhost:3000', 'LOCALHOST', '[::1]:3000'])(
    'aceita %s',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each([
    // O caso do ataque: o domínio do site, resolvendo para 127.0.0.1.
    'evil.example:3333',
    // Um nome que COMEÇA com um nome local não é local.
    'localhost.evil.example',
    '127.0.0.1.nip.io:3333',
    // Aberto na rede: exatamente o que o bind em 127.0.0.1 evita.
    '192.168.0.10:3333',
    '0.0.0.0:3333',
    '',
    undefined,
  ])('recusa %s', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe('rejectNonLocal', () => {
  const local = { host: '127.0.0.1:3333', contentType: undefined };

  it('leitura local passa sem Content-Type', () => {
    expect(rejectNonLocal({ ...local, method: 'GET' })).toBeNull();
  });

  it('escrita local com JSON passa', () => {
    expect(
      rejectNonLocal({
        ...local,
        method: 'POST',
        contentType: 'application/json; charset=utf-8',
      }),
    ).toBeNull();
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded', undefined])(
    'escrita com %s é recusada: é o POST que qualquer site consegue mandar',
    (contentType) => {
      expect(
        rejectNonLocal({ ...local, method: 'POST', contentType })?.status,
      ).toBe(415);
    },
  );

  it('Host de fora é recusado mesmo numa leitura', () => {
    expect(
      rejectNonLocal({
        host: 'evil.example:3333',
        method: 'GET',
        contentType: undefined,
      })?.status,
    ).toBe(403);
  });
});
