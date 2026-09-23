import { parseLinkedInAlert } from './linkedin-alert';

/**
 * Fixtures SINTÉTICAS, reproduzindo a estrutura medida na caixa real.
 *
 * O digest de verdade não entra no repositório: ele carrega `midToken`,
 * `otpToken` e `eid`, que identificam a conta de quem recebeu (§7). Os ids e
 * tokens abaixo são inventados; a forma é a real.
 */

const TRACKING =
  '?trackingId=AAA%3D%3D&refId=BBB&lipi=urn%3Ali%3Apage%3Aemail&midToken=CCC&midSig=DDD&trk=eml-x&trkEmail=eml-y&eid=zzz-yyy-xx&otpToken=EEEE';

function bloco(
  titulo: string,
  empresa: string,
  local: string,
  id: string,
  extra?: string,
): string {
  return [
    titulo,
    empresa,
    local,
    ...(extra ? [extra] : []),
    `Visualizar vaga: https://www.linkedin.com/comm/jobs/view/${id}/${TRACKING}`,
  ].join('\n');
}

const SEPARADOR =
  '\n\n---------------------------------------------------------\n\n';

const RODAPE = [
  'Este e-mail foi enviado a Fulano de Tal (Desenvolvedor | Node.js)',
  'Saiba por que incluímos isso: https://www.linkedin.com/help/linkedin/answer/4788?lang=pt',
  'Você está recebendo e-mails de alerta de vaga.',
  'Gerencie seus alertas de vaga: https://www.linkedin.com/comm/jobs/alerts?trk=eml-footer',
  'Cancelar inscrição: https://www.linkedin.com/job-alert-email-unsubscribe?savedSearchId=123',
  '© 2026 LinkedIn Ireland Unlimited Company.',
].join('\n');

function digest(...blocos: string[]): string {
  return [
    'Seu alerta de vaga em: Brasil',
    'Novas vagas correspondem às suas preferências.',
    blocos.join(SEPARADOR),
    SEPARADOR,
    RODAPE,
  ].join('\n');
}

describe('parseLinkedInAlert', () => {
  it('lê as seis vagas de um digest', () => {
    const corpo = digest(
      bloco('Desenvolvedor Júnior', 'Vagalume', 'Salvador, BA', '1001'),
      bloco('Fullstack Engineer', 'Kaizen', 'Rio de Janeiro e Região', '1002'),
      bloco('Support Engineer', 'BragaSousa', 'Brasil', '1003'),
      bloco('Desenvolvedor full stack', 'tecnorio', 'Sorocaba, SP', '1004'),
      bloco('Programador (RPA)', 'Clinipar', 'Brasil', '1005'),
      bloco('Desenvolvedor Web', 'Prisma Tech', 'Porto Alegre, RS', '1006'),
    );

    const saida = parseLinkedInAlert(corpo);

    expect(saida.anchors).toBe(6);
    expect(saida.jobs).toHaveLength(6);
    expect(saida.dropped).toBe(0);
    expect(saida.uncertain).toBe(0);
  });

  it('o primeiro bloco ignora as linhas de cabeçalho', () => {
    // Lendo de baixo para cima, "Seu alerta de vaga em: Brasil" fica fora de
    // alcance. Caminhar para frente colocaria o cabeçalho no título.
    const saida = parseLinkedInAlert(
      digest(bloco('Desenvolvedor Júnior', 'Vagalume', 'Salvador, BA', '1001')),
    );

    expect(saida.jobs[0]).toEqual({
      id: '1001',
      url: 'https://www.linkedin.com/jobs/view/1001',
      title: 'Desenvolvedor Júnior',
      company: 'Vagalume',
      location: 'Salvador, BA',
    });
  });

  it('o rodapé não produz vaga', () => {
    // Ele tem links do LinkedIn — /help/, /comm/jobs/alerts, unsubscribe —,
    // mas nenhum é /jobs/view/<dígitos>. A âncora o exclui sozinha.
    const saida = parseLinkedInAlert(RODAPE);

    expect(saida.anchors).toBe(0);
    expect(saida.jobs).toHaveLength(0);
  });

  it.each([
    ['Esta empresa está contratando'],
    ['Candidate-se com currículo e perfil'],
    ['Candidatura simplificada'],
    ['12 candidatos'],
    ['Promovida'],
  ])('a linha de ruído "%s" não vira local', (ruido) => {
    const saida = parseLinkedInAlert(
      digest(
        bloco(
          'Desenvolvedor Back-end Node.js',
          'nivelmax',
          'São Paulo e Região',
          '1007',
          ruido,
        ),
      ),
    );

    expect(saida.jobs[0].location).toBe('São Paulo e Região');
    expect(saida.jobs[0].company).toBe('nivelmax');
    expect(saida.jobs[0].title).toBe('Desenvolvedor Back-end Node.js');
  });

  it('se auto-corrige quando uma linha de ruído NÃO prevista aparece', () => {
    // A defesa que importa: a lista de ruído nunca vai estar completa, e uma
    // linha nova desloca tudo em um. A checagem positiva de local pega isso.
    const saida = parseLinkedInAlert(
      digest(
        bloco(
          'Desenvolvedor Node.js',
          'Acme',
          'Curitiba, PR',
          '1008',
          'Frase nova que o LinkedIn inventou',
        ),
      ),
    );

    expect(saida.jobs[0].location).toBe('Curitiba, PR');
    expect(saida.jobs[0].company).toBe('Acme');
  });

  it('linha separadora invisível não desloca o bloco', () => {
    // `\u200b` é o espaço de largura zero — o único invisível que `\s` e
    // `trim()` do JavaScript NÃO removem. Sem normalizar, ele vira linha de
    // conteúdo e a empresa sai errada, em silêncio.
    const corpo = [
      'Desenvolvedor Node.js',
      '\u200b',
      'Acme',
      '\u200b',
      'Curitiba, PR',
      'Visualizar vaga: https://www.linkedin.com/comm/jobs/view/1009/',
    ].join('\n');

    const saida = parseLinkedInAlert(corpo);

    expect(saida.jobs[0].company).toBe('Acme');
    expect(saida.jobs[0].location).toBe('Curitiba, PR');
  });

  it('aceita quebra de linha do Windows', () => {
    const corpo = [
      'Desenvolvedor Node.js',
      'Acme',
      'Curitiba, PR',
      'Visualizar vaga: https://www.linkedin.com/comm/jobs/view/1010/',
    ].join('\r\n');

    expect(parseLinkedInAlert(corpo).jobs).toHaveLength(1);
  });

  it('ruído não ocupa o lugar de um local ausente', () => {
    // Aqui a lista de ruído é o que segura: a auto-correção precisa de 4
    // linhas para deslocar, e este bloco só tem 3. Sem o filtro, "Esta
    // empresa está contratando" viraria a localização da vaga.
    const corpo = [
      'Desenvolvedor Node.js',
      'Acme',
      'Esta empresa está contratando',
      'Visualizar vaga: https://www.linkedin.com/comm/jobs/view/1020/',
    ].join('\n');

    const saida = parseLinkedInAlert(corpo);

    expect(saida.jobs).toHaveLength(0);
    expect(saida.dropped).toBe(1);
  });

  it('descarta o bloco incompleto e mantém os outros', () => {
    const corpo = digest(
      bloco('Desenvolvedor Júnior', 'Vagalume', 'Salvador, BA', '1011'),
      'Só um título\nVisualizar vaga: https://www.linkedin.com/comm/jobs/view/1012/',
      bloco('Fullstack Engineer', 'Kaizen', 'Brasil', '1013'),
    );

    const saida = parseLinkedInAlert(corpo);

    expect(saida.anchors).toBe(3);
    expect(saida.jobs).toHaveLength(2);
    expect(saida.dropped).toBe(1);
    expect(saida.jobs.map((j) => j.id)).toEqual(['1011', '1013']);
  });

  it('bloco curto não rouba linhas da vaga anterior', () => {
    // Sem o piso, o caminhar para trás atravessaria o separador e montaria
    // uma vaga com os campos da anterior — pior que descartar.
    const corpo = digest(
      bloco('Desenvolvedor Júnior', 'Vagalume', 'Salvador, BA', '1014'),
      'Visualizar vaga: https://www.linkedin.com/comm/jobs/view/1015/',
    );

    const saida = parseLinkedInAlert(corpo);

    expect(saida.jobs).toHaveLength(1);
    expect(saida.jobs[0].id).toBe('1014');
    expect(saida.dropped).toBe(1);
  });

  it('a URL emitida não carrega rastreio nem token de conta', () => {
    const saida = parseLinkedInAlert(
      digest(bloco('Dev', 'Acme', 'Brasil', '1016')),
    );

    const url = saida.jobs[0].url;

    expect(url).toBe('https://www.linkedin.com/jobs/view/1016');
    expect(url).not.toContain('?');
    expect(url).not.toContain('otpToken');
    expect(url).not.toContain('midToken');
    expect(url).not.toContain('/comm/');
  });

  it('avisa quando o corpo está no teto', () => {
    const enchimento = 'x'.repeat(16_000);

    expect(parseLinkedInAlert(enchimento).truncated).toBe(true);
    expect(parseLinkedInAlert('curto').truncated).toBe(false);
  });

  it('corpo vazio não quebra', () => {
    const saida = parseLinkedInAlert('');

    expect(saida.jobs).toHaveLength(0);
    expect(saida.anchors).toBe(0);
  });
});
