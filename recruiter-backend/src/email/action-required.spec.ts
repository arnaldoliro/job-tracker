import { actionRequired } from './action-required';
const mail = (subject: string, bodyText = '') => ({
  subject,
  bodyText,
  fromAddress: 'recrutamento@example.com',
});
describe('avisos de ação por email', () => {
  it('reconhece entrevista e preserva prazo como texto', () => {
    expect(
      actionRequired(
        mail(
          'Convite para entrevista',
          'Você foi convidado para realizar uma entrevista técnica. Prazo Até 28 de novembro de 2026.',
        ),
      ),
    ).toEqual({
      kind: 'entrevista',
      deadline: {
        text: 'Até 28 de novembro de 2026',
        day: { year: 2026, month: 11, day: 28 },
        offsetMs: null,
      },
    });
  });
  it('reconhece triagem e candidatura incompleta', () => {
    expect(
      actionRequired(mail('Última chamada', 'Responda a 4 perguntas técnicas.'))
        ?.kind,
    ).toBe('pendencia');
    expect(
      actionRequired(
        mail(
          'Inscrição recebida',
          'Você ainda não finalizou a sua candidatura.',
        ),
      )?.kind,
    ).toBe('pendencia');
  });
  it('reconhece inglês e prazo relativo sem garantir validade', () => {
    expect(
      actionRequired(
        mail('AI interview invite', 'This link will expire in 48 hours.'),
      ),
    ).toEqual({
      kind: 'entrevista',
      deadline: {
        text: 'expire in 48 hours',
        day: null,
        offsetMs: 48 * 3_600_000,
      },
    });
  });
  it('reconhece etapa desbloqueada', () => {
    expect(
      actionRequired(mail('Etapa Avaliação Comportamental desbloqueada'))?.kind,
    ).toBe('teste');
  });
  it.each([
    'vaga foi encerrada',
    'posição foi cancelada',
    'não seguiremos com sua candidatura',
    'optamos por seguir com outro candidato',
  ])('não reabre convite encerrado: %s', (closing) => {
    expect(
      actionRequired(
        mail(
          'Retorno da entrevista',
          `${closing}. Você foi convidado para entrevista anteriormente.`,
        ),
      ),
    ).toBeNull();
  });
  it('não confunde descrição de etapas futuras com convite', () => {
    expect(
      actionRequired(
        mail(
          'Candidatura recebida',
          'As etapas são triagem, entrevista e teste. Entraremos em contato.',
        ),
      ),
    ).toBeNull();
  });
  it('ignora digest', () => {
    expect(
      actionRequired({
        ...mail('Convite para entrevista'),
        fromAddress: 'jobalerts-noreply@linkedin.com',
      }),
    ).toBeNull();
  });
  it('ignora convite citado em resposta', () => {
    expect(
      actionRequired(
        mail(
          'Atualização',
          'Obrigado.\nOn Monday wrote:\nConvite para entrevista',
        ),
      ),
    ).toBeNull();
  });
  it('não inventa prazo ausente', () => {
    expect(
      actionRequired(mail('Entrevista para a vaga de desenvolvimento'))
        ?.deadline,
    ).toBeNull();
  });
  it.each([
    ['Agende sua entrevista', 'Escolha o melhor horário no link abaixo.'],
    ['Próximos passos', 'Por favor, agende a entrevista técnica até sexta.'],
    ['Agendamento de entrevista', 'Selecione um horário disponível.'],
    [
      'Processo seletivo',
      'Escolha um horário para a sua entrevista com o time.',
    ],
    ['Schedule your interview', 'Use the link below to pick a slot.'],
    [
      'Next steps',
      'We would like to invite you to an interview with the team.',
    ],
    ['Book your technical interview', ''],
    ['Interview invitation: Frontend Engineer', ''],
  ])('reconhece convite para agendar entrevista: %s', (subject, body) => {
    expect(actionRequired(mail(subject, body))?.kind).toBe('entrevista');
  });

  it.each([
    ['Desafio técnico', 'Realize o desafio técnico pelo link até o prazo.'],
    ['Próxima etapa', 'Seu teste técnico está disponível na plataforma.'],
    [
      'Avaliação online',
      'Você foi convidado para fazer a avaliação de lógica.',
    ],
    ['Convite para o teste', ''],
    ['Next step', 'Please complete the online assessment within 5 days.'],
    ['Your coding challenge', 'Start the coding challenge when you are ready.'],
    ['Take-home exercise', 'Attached you will find the take-home.'],
  ])('reconhece teste ou avaliação: %s', (subject, body) => {
    expect(actionRequired(mail(subject, body))?.kind).toBe('teste');
  });

  it.each([
    [
      'Webinar: como se sair bem na entrevista',
      'Agende sua entrevista simulada.',
    ],
    [
      'Dicas para sua próxima entrevista',
      'Schedule your interview with confidence.',
    ],
    ['Novas vagas para você', 'Complete the online assessment to stand out.'],
    ['Newsletter de carreira', 'Realize o teste de perfil gratuito.'],
  ])('ignora divulgação: %s', (subject, body) => {
    expect(actionRequired(mail(subject, body))).toBeNull();
  });

  it.each([
    'Unfortunately, we have decided to move forward with other candidates.',
    'We will not be moving forward. Schedule your interview link is no longer valid.',
    'Decidimos seguir com outros candidatos. Agende sua entrevista não está mais disponível.',
    'Você não foi selecionado para a próxima etapa do desafio técnico.',
  ])('ignora negativa mesmo citando convite: %s', (body) => {
    expect(actionRequired(mail('Atualização do processo', body))).toBeNull();
  });

  it.each([
    'Obrigado!\n> Agende sua entrevista pelo link',
    'Obrigado!\n-----Original Message-----\nSchedule your interview',
    'Obrigado!\nDe: Recrutamento <vagas@example.com>\nRealize o desafio técnico',
    'Obrigado!\nEm seg., 10 de nov. de 2026, Recrutamento escreveu:\nAgende sua entrevista',
  ])('ignora convite citado em resposta: %j', (body) => {
    expect(actionRequired(mail('Re: Processo seletivo', body))).toBeNull();
  });

  it.each([
    'Obrigado!\nDe: Recrutamento\nEnviado: segunda-feira\nAgende sua entrevista',
    'Obrigado!\n---------- Forwarded message ---------\nSchedule your interview',
  ])('ignora convite citado em cabeçalho de resposta: %j', (body) => {
    expect(actionRequired(mail('Re: Processo seletivo', body))).toBeNull();
  });

  it('"De:" comum no corpo não corta o email nem o prazo', () => {
    expect(
      actionRequired(
        mail(
          'Agende sua entrevista',
          'Horários\nDe: segunda a sexta, das 9h às 18h.\nAgende até 25/11/2026.',
        ),
      )?.deadline?.text,
    ).toBe('até 25/11/2026');
  });

  it('não confunde menção futura a teste com convite', () => {
    expect(
      actionRequired(
        mail(
          'Candidatura recebida',
          'Se aprovado na triagem, haverá um teste técnico e uma entrevista.',
        ),
      ),
    ).toBeNull();
  });
});
