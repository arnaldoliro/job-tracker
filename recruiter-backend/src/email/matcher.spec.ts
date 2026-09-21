import {
  boardSlugFromUrl,
  isAtsDomain,
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
    company: 'Nubank',
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
    expect(isAtsDomain('quintoandar.gupy.io')).toBe(true);
    expect(isAtsDomain('nubank.com.br')).toBe(false);
  });

  it('remove o "via <ATS>" do nome de exibição', () => {
    expect(stripVia('Nubank via Greenhouse')).toBe('Nubank');
    expect(stripVia('QuintoAndar (via Lever)')).toBe('QuintoAndar');
    expect(stripVia('Stone')).toBe('Stone');
  });

  it('extrai o slug da empresa da URL do board', () => {
    expect(
      boardSlugFromUrl('https://boards.greenhouse.io/nubank/jobs/123'),
    ).toBe('nubank');
    expect(boardSlugFromUrl('https://jobs.lever.co/spotify/abc')).toBe(
      'spotify',
    );
    expect(boardSlugFromUrl('https://quintoandar.gupy.io/job/xyz')).toBe(
      'quintoandar',
    );
    expect(boardSlugFromUrl('https://empresa.com/vagas/1')).toBeNull();
    expect(boardSlugFromUrl(null)).toBeNull();
  });

  it('exige fronteira de palavra ao comparar empresa', () => {
    // Sem \b, "Nu" casaria com "Menu" e a empresa apareceria em toda parte.
    expect(mentionsCompany('almoço no menu de hoje', 'Nu')).toBe(false);
    expect(mentionsCompany('vaga no Nu para você', 'Nu')).toBe(true);
    expect(mentionsCompany('trabalhe na NUBANK', 'Nubank')).toBe(true);
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
      mail({ fromName: 'Nubank via Greenhouse', subject: 'Sua candidatura' }),
      [candidate()],
    );

    expect(resultado?.applicationId).toBe('app-1');
    expect(resultado?.reason).toContain('Nubank');
  });

  it('vincula pelo slug do board quando o remetente é genérico', () => {
    const resultado = matchByCompany(mail({ fromName: 'Greenhouse' }), [
      candidate({ jobUrl: 'https://boards.greenhouse.io/nubank/jobs/1' }),
    ]);

    expect(resultado?.applicationId).toBe('app-1');
  });

  it('NÃO vincula só porque o remetente é o mesmo ATS de várias candidaturas', () => {
    // O caso que quebraria tudo: greenhouse.io é o remetente de todas as
    // candidaturas feitas por Greenhouse. O domínio não pode qualificar.
    const resultado = matchByCompany(mail({ fromName: 'Greenhouse' }), [
      candidate({ applicationId: 'app-1', company: 'Nubank' }),
      candidate({ applicationId: 'app-2', company: 'Stone' }),
    ]);

    expect(resultado).toBeNull();
  });

  it('vincula por domínio próprio da empresa', () => {
    const resultado = matchByCompany(
      mail({ fromAddress: 'talentos@nubank.com.br', fromName: 'Recrutamento' }),
      [candidate()],
    );

    expect(resultado?.reason).toContain('nubank.com.br');
  });

  it('não vincula quando duas empresas diferentes qualificam', () => {
    const resultado = matchByCompany(mail({ fromName: 'Nubank e Stone' }), [
      candidate({ applicationId: 'app-1', company: 'Nubank' }),
      candidate({ applicationId: 'app-2', company: 'Stone' }),
    ]);

    expect(resultado).toBeNull();
  });

  it('desempata pelo cargo quando a empresa tem duas candidaturas', () => {
    const resultado = matchByCompany(
      mail({
        fromName: 'Nubank via Greenhouse',
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
        fromName: 'Nubank',
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
    expect(classify('Thank you for applying to Nubank', null)).toBe(
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
});

describe('companyGuess', () => {
  it('prefere o nome de exibição sem o via', () => {
    expect(companyGuess('Nubank via Greenhouse', 'x@greenhouse.io', '')).toBe(
      'Nubank',
    );
  });

  it('ignora remetente robô e cai no domínio próprio', () => {
    expect(companyGuess('No-Reply', 'no-reply@stone.com.br', '')).toBe('Stone');
  });

  it('não chuta o ATS como empresa', () => {
    expect(
      companyGuess('Recrutamento', 'no-reply@greenhouse.io', ''),
    ).toBeNull();
  });
});
