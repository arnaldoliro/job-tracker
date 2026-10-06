import {
  boardSlugFromUrl,
  isAtsBrand,
  isAtsDomain,
  isJobDigestSender,
  mentionsCompany,
  stripVia,
} from './ats';
import { classify, companyGuess } from './confirmation';
import {
  matchByCompany,
  matchByThread,
  type Candidate,
  type MailFacts,
} from './matcher';

/**
 * O vínculo é a parte que vai errar contra a caixa real, e a única que dá para
 * exercitar sem credencial. Cada caso aqui é um email que existe de verdade,
 * copiado da forma que Greenhouse, Lever, Gupy e LinkedIn usam.
 */

const ONTEM = new Date('2026-09-09T10:00:00Z');
const HOJE = new Date('2026-09-10T10:00:00Z');

function mail(overrides: Partial<MailFacts> = {}): MailFacts {
  return {
    fromAddress: 'no-reply@greenhouse.io',
    fromName: null,
    subject: '',
    bodyText: null,
    receivedAt: HOJE,
    references: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    applicationId: 'app-1',
    company: 'Aurora',
    title: 'Senior Backend Engineer',
    jobUrl: null,
    createdAt: ONTEM,
    appliedAt: null,
    ...overrides,
  };
}

describe('ats', () => {
  it('reconhece domínio de ATS por sufixo', () => {
    expect(isAtsDomain('greenhouse.io')).toBe(true);
    expect(isAtsDomain('mail.greenhouse.io')).toBe(true);
    expect(isAtsDomain('casanorte.gupy.io')).toBe(true);
    expect(isAtsDomain('gupy.com.br')).toBe(true);
    expect(isAtsDomain('us.greenhouse-mail.io')).toBe(true);
    expect(isAtsDomain('aurora.com.br')).toBe(false);
  });

  it('remove o "via <ATS>" do nome de exibição', () => {
    expect(stripVia('Aurora via Greenhouse')).toBe('Aurora');
    expect(stripVia('CasaNorte (via Lever)')).toBe('CasaNorte');
    expect(stripVia('Pedra')).toBe('Pedra');
  });

  it('extrai o slug da empresa da URL do board', () => {
    expect(
      boardSlugFromUrl('https://boards.greenhouse.io/aurora/jobs/123'),
    ).toBe('aurora');
    expect(boardSlugFromUrl('https://jobs.lever.co/ondasonora/abc')).toBe(
      'ondasonora',
    );
    expect(boardSlugFromUrl('https://casanorte.gupy.io/job/xyz')).toBe(
      'casanorte',
    );
    expect(boardSlugFromUrl('https://empresa.com/vagas/1')).toBeNull();
    expect(boardSlugFromUrl(null)).toBeNull();
  });

  it('reconhece remetente de digest de vagas', () => {
    // Estes nunca podem ser revinculados a uma candidatura: um alerta cita
    // seis empresas, e casar com uma delas colocaria 10 KB de digest na linha
    // do tempo da candidatura.
    expect(isJobDigestSender('jobalerts-noreply@linkedin.com')).toBe(true);
    expect(isJobDigestSender('JobAlerts-Noreply@LinkedIn.com')).toBe(true);
    // O remetente das CONFIRMAÇÕES não entra: candidatura de verdade vem dele.
    expect(isJobDigestSender('jobs-noreply@linkedin.com')).toBe(false);
    expect(isJobDigestSender('no-reply@greenhouse.io')).toBe(false);
  });

  it('exige fronteira de palavra ao comparar empresa', () => {
    // Sem \b, "Nu" casaria com "Menu" e a empresa apareceria em toda parte.
    expect(mentionsCompany('almoço no menu de hoje', 'Lua')).toBe(false);
    expect(mentionsCompany('vaga na Lua para você', 'Lua')).toBe(true);
    expect(mentionsCompany('trabalhe na AURORA', 'Aurora')).toBe(true);
  });
});

describe('matchByThread', () => {
  it('vincula pela conversa, sem olhar mais nada', () => {
    const conhecidos = new Map([['<abc@greenhouse.io>', 'app-7']]);

    const resultado = matchByThread(
      ['<xyz@x.com>', '<abc@greenhouse.io>'],
      conhecidos,
    );

    expect(resultado?.applicationId).toBe('app-7');
    expect(resultado?.reason).toContain('resposta');
  });

  it('não inventa vínculo quando a conversa é desconhecida', () => {
    expect(matchByThread(['<nunca-visto@x.com>'], new Map())).toBeNull();
  });
});

describe('matchByCompany', () => {
  it('vincula pelo nome de exibição do ATS', () => {
    const resultado = matchByCompany(
      mail({ fromName: 'Aurora via Greenhouse', subject: 'Sua candidatura' }),
      [candidate()],
    );

    expect(resultado?.applicationId).toBe('app-1');
    expect(resultado?.reason).toContain('Aurora');
  });

  it('vincula pelo slug do board quando o email cita o slug', () => {
    // O cadastro diz "Grupo Exemplo 💚", o email diz só "Exemplo": o nome
    // não casa, o slug do board casa.
    const resultado = matchByCompany(
      mail({
        fromName: 'Greenhouse',
        subject: 'Your application to Exemplo',
      }),
      [
        candidate({
          company: 'Grupo Exemplo 💚',
          jobUrl: 'https://boards.greenhouse.io/exemplo/jobs/1',
        }),
      ],
    );

    expect(resultado?.applicationId).toBe('app-1');
  });

  it('o slug do board sozinho não qualifica: o email precisa citá-lo', () => {
    // O defeito antigo: comparava o slug com a empresa da própria
    // candidatura, que é sempre verdade. Uma candidatura com URL de board
    // capturava qualquer email de ATS, de qualquer empresa.
    const resultado = matchByCompany(
      mail({
        fromName: 'Greenhouse',
        subject: 'Thank you for applying to Outra Empresa!',
      }),
      [candidate({ jobUrl: 'https://boards.greenhouse.io/aurora/jobs/1' })],
    );

    expect(resultado).toBeNull();
  });

  it('vincula email de ATS sem nome de exibição pela empresa no assunto', () => {
    // A forma real do Greenhouse: sem nome, de um subdomínio regional.
    const resultado = matchByCompany(
      mail({
        fromAddress: 'no-reply@us.greenhouse-mail.io',
        fromName: null,
        subject: 'Thank you for applying to Aurora!',
      }),
      [
        candidate({ applicationId: 'app-1', company: 'Aurora' }),
        candidate({ applicationId: 'app-2', company: 'Pedra' }),
      ],
    );

    expect(resultado?.applicationId).toBe('app-1');
  });

  it('vincula email da Gupy pela empresa no topo do corpo', () => {
    // A forma real da Gupy: assina "Gupy", o assunto cita só o cargo, e a
    // empresa vem no cabeçalho do corpo.
    const resultado = matchByCompany(
      mail({
        fromAddress: 'no-reply@gupy.com.br',
        fromName: 'Gupy',
        subject: 'Etapa Fit Cultural desbloqueada para a vaga Dev Backend PL',
        bodyText:
          'Pedra\n12345 - Dev Backend PL\n\nUma nova etapa do processo seletivo está disponível pra você!',
      }),
      [
        candidate({ applicationId: 'app-1', company: 'Aurora' }),
        candidate({ applicationId: 'app-2', company: 'Pedra' }),
      ],
    );

    expect(resultado?.applicationId).toBe('app-2');
  });

  it('empresa citada só no fim do corpo não qualifica', () => {
    // Rodapé e "outras vagas" citam empresas que não são a do email.
    const resultado = matchByCompany(
      mail({
        fromAddress: 'no-reply@gupy.com.br',
        fromName: 'Gupy',
        subject: 'Atualização da sua candidatura',
        bodyText: `${'Texto do email sobre outra empresa. '.repeat(30)}Veja também vagas na Aurora.`,
      }),
      [candidate()],
    );

    expect(resultado).toBeNull();
  });

  it('alerta de vaga não vincula, mesmo citando a empresa no assunto', () => {
    // Convite para se candidatar na empresa X não é notícia da candidatura
    // que você já tem na empresa X.
    const resultado = matchByCompany(
      mail({
        fromAddress: 'jobs-noreply@linkedin.com',
        fromName: 'LinkedIn',
        subject: 'Candidate-se agora à vaga de Dev Backend na Aurora',
      }),
      [candidate()],
    );

    expect(resultado).toBeNull();
  });

  it('texto não qualifica quando o remetente não é um ATS', () => {
    // Fora de ATS vale o domínio próprio. Um email qualquer citando a
    // empresa no assunto não é dela.
    const resultado = matchByCompany(
      mail({
        fromAddress: 'amigo@gmail.com',
        fromName: 'Amigo',
        subject: 'Vi que a Aurora está contratando gente',
      }),
      [candidate()],
    );

    expect(resultado).toBeNull();
  });

  it('NÃO vincula só porque o remetente é o mesmo ATS de várias candidaturas', () => {
    // O caso que quebraria tudo: greenhouse.io é o remetente de todas as
    // candidaturas feitas por Greenhouse. O domínio não pode qualificar.
    const resultado = matchByCompany(mail({ fromName: 'Greenhouse' }), [
      candidate({ applicationId: 'app-1', company: 'Aurora' }),
      candidate({ applicationId: 'app-2', company: 'Pedra' }),
    ]);

    expect(resultado).toBeNull();
  });

  it('vincula por domínio próprio da empresa', () => {
    const resultado = matchByCompany(
      mail({ fromAddress: 'talentos@aurora.com.br', fromName: 'Recrutamento' }),
      [candidate()],
    );

    expect(resultado?.reason).toContain('aurora.com.br');
  });

  it('não vincula quando duas empresas diferentes qualificam', () => {
    const resultado = matchByCompany(mail({ fromName: 'Aurora e Pedra' }), [
      candidate({ applicationId: 'app-1', company: 'Aurora' }),
      candidate({ applicationId: 'app-2', company: 'Pedra' }),
    ]);

    expect(resultado).toBeNull();
  });

  it('desempata pelo cargo quando a empresa tem duas candidaturas', () => {
    const resultado = matchByCompany(
      mail({
        fromName: 'Aurora via Greenhouse',
        subject: 'Sua candidatura para Android Engineer',
      }),
      [
        candidate({ applicationId: 'app-1', title: 'Senior Backend Engineer' }),
        candidate({ applicationId: 'app-2', title: 'Android Engineer' }),
      ],
    );

    expect(resultado?.applicationId).toBe('app-2');
    expect(resultado?.reason).toContain('cargo');
  });

  it('descarta candidatura registrada depois do email', () => {
    const resultado = matchByCompany(
      mail({
        fromName: 'Aurora',
        receivedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      [candidate({ createdAt: HOJE })],
    );

    expect(resultado).toBeNull();
  });

  it('email pessoal não casa com nada', () => {
    const resultado = matchByCompany(
      mail({
        fromAddress: 'amigo@gmail.com',
        fromName: 'João',
        subject: 'almoço amanhã?',
      }),
      [candidate()],
    );

    expect(resultado).toBeNull();
  });
});

describe('classify', () => {
  it('reconhece confirmação em português e inglês', () => {
    expect(classify('Recebemos sua candidatura', null)).toBe('confirmacao');
    expect(classify('We received your application', null)).toBe('confirmacao');
    expect(classify('Thank you for applying to Aurora', null)).toBe(
      'confirmacao',
    );
  });

  it('alerta vence confirmação: digest cita "candidatura" no rodapé', () => {
    expect(
      classify('Novas vagas para você', 'gerencie sua candidatura aqui'),
    ).toBe('alerta');
  });

  it('reconhece movimento sem afirmar para onde', () => {
    // "infelizmente" e "entrevista" são ambos atualizacao: dizer qual é
    // rejeição e qual é avanço é trabalho do modelo, na etapa seguinte.
    expect(classify('Convite para entrevista', null)).toBe('atualizacao');
    expect(classify('Infelizmente seguimos com outro candidato', null)).toBe(
      'atualizacao',
    );
  });

  it('email comum fica desconhecido', () => {
    expect(classify('almoço amanhã?', 'bora?')).toBe('desconhecido');
  });

  /**
   * "Candidate-se agora" é CONVITE — você ainda não se candidatou —, e vem do
   * mesmo remetente que a confirmação (`jobs-noreply@linkedin.com`). Filtrar
   * por remetente não separa os dois; só o texto separa.
   */
  it.each([
    'Fulano, candidate-se agora à vaga de Desenvolvedor Node.js na Lumina Tech',
    'A empresa Laboratório Delta está contratando para um cargo de Remota',
  ])('convite para se candidatar é alerta, não candidatura: %s', (subject) => {
    expect(classify(subject, null)).toBe('alerta');
  });

  it('reconhece a confirmação sem verbo do LinkedIn', () => {
    expect(
      classify(
        'Sua candidatura a Desenvolvedor full stack (Node.JS) na Aurora',
        null,
      ),
    ).toBe('confirmacao');
  });

  it('a forma sem verbo perde para sinal de que o processo andou', () => {
    // Ela é o sinal mais fraco: no corpo de uma rejeição a mesma frase
    // apareceria em rodapé, dizendo o oposto do que o email diz.
    expect(
      classify(
        'Sua candidatura a Backend na Pedra',
        'infelizmente seguimos com outro',
      ),
    ).toBe('atualizacao');
  });

  it('só vale no começo do assunto', () => {
    expect(classify('Atualização sobre sua candidatura a Backend', null)).toBe(
      'desconhecido',
    );
  });
});

describe('companyGuess', () => {
  it('prefere o nome de exibição sem o via', () => {
    expect(companyGuess('Aurora via Greenhouse', 'x@greenhouse.io', '')).toBe(
      'Aurora',
    );
  });

  it('ignora remetente robô e cai no domínio próprio', () => {
    expect(companyGuess('No-Reply', 'no-reply@pedra.com.br', '')).toBe('Pedra');
  });

  it('não chuta o ATS como empresa', () => {
    expect(
      companyGuess('Recrutamento', 'no-reply@greenhouse.io', ''),
    ).toBeNull();
  });

  /**
   * Os quatro emails abaixo são os únicos de candidatura que existem na caixa
   * real — todos do LinkedIn, que é por onde as candidaturas foram feitas.
   *
   * Antes destes testes os quatro caíam como `desconhecido` com empresa
   * "LinkedIn": nenhuma oferta de criar candidatura, e empresa errada se você
   * criasse assim mesmo. A ingestão funcionava e não servia para nada.
   */
  it.each([
    ['Fulano, sua candidatura foi enviada à Zx9 Exemplo', 'Zx9 Exemplo'],
    [
      'Fulano, sua candidatura foi enviada à Exemplo Consultoria Global',
      'Exemplo Consultoria Global',
    ],
    ['Fulano, sua candidatura foi enviada à Trampoex', 'Trampoex'],
    [
      'Fulano, sua candidatura foi enviada à Exemplo Tecnologia',
      'Exemplo Tecnologia',
    ],
  ])('lê a empresa do aviso do LinkedIn: %s', (subject, empresa) => {
    expect(classify(subject, null)).toBe('confirmacao');
    expect(companyGuess('LinkedIn', 'jobs-noreply@linkedin.com', subject)).toBe(
      empresa,
    );
  });

  it('o nome do portal não qualifica como empresa', () => {
    // `stripVia` resolve "Aurora via Greenhouse", onde há sufixo a remover.
    // Não resolve "LinkedIn", que manda em nome próprio.
    expect(isAtsBrand('LinkedIn')).toBe(true);
    expect(isAtsBrand('LinkedIn Job Alerts')).toBe(true);
    expect(isAtsBrand('Aurora')).toBe(false);
    // Por token, não por substring: "Leverage" não pode virar "lever".
    expect(isAtsBrand('Leverage')).toBe(false);
  });

  it('a âncora da preposição não pode ser \\b', () => {
    // `\b` é definido por [A-Za-z0-9_], então não existe fronteira antes de
    // "à" e a alternativa nunca casaria. Mesmo defeito que ".NET" teve.
    expect(
      companyGuess('LinkedIn', 'jobs-noreply@linkedin.com', 'enviada à Pedra'),
    ).toBe('Pedra');
  });
});
