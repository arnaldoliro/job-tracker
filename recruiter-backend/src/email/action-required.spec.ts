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
    ).toEqual({ kind: 'entrevista', deadlineLabel: '28 de novembro de 2026' });
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
      deadlineLabel: '48 hours a partir do envio',
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
        ?.deadlineLabel,
    ).toBeNull();
  });
});
