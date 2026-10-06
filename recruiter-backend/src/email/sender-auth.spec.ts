import { isSenderVerified, organizationalDomain } from './sender-auth';

/** A forma que o Gmail grava, com a quebra de linha que ele usa. */
function gmail(results: string): string {
  return `Authentication-Results: mx.google.com;\r\n       ${results}\r\n`;
}

describe('isSenderVerified', () => {
  it('aceita DMARC pass para o domínio do remetente', () => {
    const headers = gmail(
      'dkim=pass header.i=@gupy.com.br header.s=s1 header.b=AbC;\r\n' +
        '       spf=pass (google.com: domain of bounce@mail.gupy.com.br designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@mail.gupy.com.br;\r\n' +
        '       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=gupy.com.br',
    );

    expect(isSenderVerified(headers, 'no-reply@gupy.com.br')).toBe(true);
  });

  it('aceita DKIM alinhado quando o domínio não publica DMARC', () => {
    // Subdomínio regional assinando pelo domínio pai: o caso do Greenhouse.
    const headers = gmail(
      'dkim=pass header.i=@greenhouse-mail.io header.s=k1 header.b=XyZ',
    );

    expect(isSenderVerified(headers, 'no-reply@us.greenhouse-mail.io')).toBe(
      true,
    );
  });

  it('recusa DKIM pass de OUTRO domínio: o atacante assina com o dele', () => {
    // O ataque: "De" forjado como Gupy, assinatura válida do domínio dele.
    const headers = gmail(
      'dkim=pass header.i=@atacante.example header.s=s1;\r\n' +
        '       spf=pass smtp.mailfrom=x@atacante.example;\r\n' +
        '       dmarc=fail (p=REJECT) header.from=gupy.com.br',
    );

    expect(isSenderVerified(headers, 'no-reply@gupy.com.br')).toBe(false);
  });

  it('recusa quando tudo falhou', () => {
    const headers = gmail(
      'dkim=fail header.i=@gupy.com.br; spf=softfail smtp.mailfrom=x@gupy.com.br; dmarc=fail header.from=gupy.com.br',
    );

    expect(isSenderVerified(headers, 'no-reply@gupy.com.br')).toBe(false);
  });

  it('só o primeiro cabeçalho conta: o de baixo veio com a mensagem', () => {
    // O atacante escreve um Authentication-Results "aprovado" no próprio
    // email. O do Gmail, verdadeiro, fica acima dele.
    const headers =
      gmail('dmarc=fail (p=NONE) header.from=gupy.com.br') +
      'Authentication-Results: mx.google.com;\r\n' +
      '       dmarc=pass header.from=gupy.com.br\r\n';

    expect(isSenderVerified(headers, 'no-reply@gupy.com.br')).toBe(false);
  });

  it('um "pass" dentro de comentário não engana a leitura', () => {
    const headers = gmail(
      'spf=fail (dmarc=pass header.from=gupy.com.br) smtp.mailfrom=x@atacante.example',
    );

    expect(isSenderVerified(headers, 'no-reply@gupy.com.br')).toBe(false);
  });

  it('sem cabeçalho nenhum, não está verificado', () => {
    expect(isSenderVerified('', 'no-reply@gupy.com.br')).toBe(false);
    expect(isSenderVerified(null, 'no-reply@gupy.com.br')).toBe(false);
    expect(isSenderVerified('Subject: oi\r\n', 'no-reply@gupy.com.br')).toBe(
      false,
    );
  });

  it('domínio parecido não é o mesmo domínio', () => {
    const headers = gmail(
      'dmarc=pass header.from=gupy.com.br.atacante.example',
    );

    expect(isSenderVerified(headers, 'no-reply@gupy.com.br')).toBe(false);
  });
});

describe('organizationalDomain', () => {
  it.each([
    ['us.greenhouse-mail.io', 'greenhouse-mail.io'],
    ['ses-mail.inhire.app', 'inhire.app'],
    ['mail.gupy.com.br', 'gupy.com.br'],
    ['gupy.com.br', 'gupy.com.br'],
    ['linkedin.com', 'linkedin.com'],
  ])('%s → %s', (domain, expected) => {
    expect(organizationalDomain(domain)).toBe(expected);
  });
});
