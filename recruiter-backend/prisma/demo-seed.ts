import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type {
  ApplicationStatus,
  StatusEventSource,
  WorkModel,
} from '../src/generated/prisma/enums';

/**
 * Dados de demonstração num perfil: candidaturas, histórico, emails, vagas
 * vistas, salvas e descartadas, e um currículo. Para mostrar o app cheio —
 * num vídeo, num print — sem expor candidatura de verdade.
 *
 * Tudo é fictício: empresas, pessoas e links (`vagas.exemplo.dev`, domínio
 * inventado). As datas são relativas a hoje, então o painel parece vivo em
 * qualquer dia que o script rodar.
 *
 * Os emails já saem marcados como lidos pela IA: nenhuma sincronização gasta
 * chamada paga com eles.
 *
 * Uso:
 *   DEMO_PROFILE_ID=<id> npm run db:demo
 *   DEMO_PROFILE_ID=<id> DEMO_RESET=true npm run db:demo   # refaz do zero
 *
 * Só mexe no perfil indicado. Com dados de verdade nele, recusa — a não ser
 * com DEMO_RESET=true, que apaga TUDO desse perfil antes de recriar.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** `dias` atrás, num horário de expediente que varia por item. */
function ago(days: number, hour = 10, minute = 0): Date {
  const date = new Date(now - days * DAY);

  date.setHours(hour, minute, 0, 0);

  return date;
}

const BASE = 'https://vagas.exemplo.dev';

// ---------------------------------------------------------------------------
// Currículo
// ---------------------------------------------------------------------------

const RESUME = {
  birthDate: null,
  summary:
    'Tech lead com 9 anos de backend e 3 liderando times. Gosto de sistema distribuído que dá para operar às três da manhã sem susto, e de time que entrega sem herói.',
  experiences: [
    {
      company: 'Quasar Pagamentos',
      role: 'Tech Lead',
      location: 'São Paulo, SP',
      startDate: '2022-03',
      endDate: null,
      current: true,
      description:
        'Lidero um time de 7 pessoas no núcleo de liquidação. Conduzi a migração do monolito de cobrança para serviços em NestJS, com o tempo de deploy caindo de 40 para 8 minutos. Implantei revisão de arquitetura por RFC e plantão com runbooks, e o tempo médio de recuperação de incidentes caiu pela metade.',
    },
    {
      company: 'Orbitalis Logística',
      role: 'Engenheiro de Software Sênior',
      location: 'Remoto',
      startDate: '2019-01',
      endDate: '2022-02',
      current: false,
      description:
        'Criei o serviço de roteirização em Node.js e PostgreSQL que atende 3 mil entregas por hora. Introduzi filas com Kafka para desacoplar o rastreio, e mentorei 4 pessoas até o nível pleno.',
    },
    {
      company: 'Farolito Saúde',
      role: 'Desenvolvedor Backend',
      location: 'Campinas, SP',
      startDate: '2016-04',
      endDate: '2018-12',
      current: false,
      description:
        'APIs de agendamento e prontuário em Java e Spring. Integrei o sistema a três operadoras de convênio por mensageria.',
    },
  ],
  education: [
    {
      school: 'Universidade Estadual Fictícia',
      degree: 'Bacharelado',
      field: 'Ciência da Computação',
      startDate: '2012-02',
      endDate: '2015-12',
    },
  ],
  skills: [
    'Node.js',
    'TypeScript',
    'NestJS',
    'PostgreSQL',
    'Kafka',
    'Docker',
    'Kubernetes',
    'AWS',
    'Arquitetura de software',
    'Liderança técnica',
  ],
  projects: [
    {
      name: 'Toolkit de observabilidade interno',
      url: null,
      description:
        'Biblioteca de logs estruturados e tracing adotada por 12 serviços, que padronizou alertas e dashboards.',
    },
    {
      name: 'Guia de onboarding técnico',
      url: null,
      description:
        'Trilha de duas semanas para pessoas novas no time, com tarefas reais e pareamento.',
    },
  ],
  languages: [
    { name: 'Português', level: 'Nativo' },
    { name: 'Inglês', level: 'Avançado' },
  ],
  certifications: [
    { name: 'AWS Solutions Architect Associate', issuer: 'AWS', date: '2023-06' },
  ],
};

// ---------------------------------------------------------------------------
// Candidaturas
// ---------------------------------------------------------------------------

interface Step {
  to: ApplicationStatus;
  /** Dias depois do envio. */
  after: number;
  /** De onde veio a mudança; `email`/`ia` geram o email correspondente. */
  via: StatusEventSource;
}

interface DemoApplication {
  company: string;
  slug: string;
  title: string;
  source: string;
  workModel: WorkModel;
  location: string;
  seniority: string;
  stack: string[];
  salary?: [number, number];
  /** Dias atrás em que a candidatura foi enviada. Nulo = rascunho. */
  appliedDaysAgo: number | null;
  steps: Step[];
  notes?: string;
  /** Email recebido e ainda não confirmado: vira sugestão no card. */
  pending?: { status: ApplicationStatus; daysAgo: number; note: string };
}

const APPLICATIONS: DemoApplication[] = [
  { company: 'Aurora Fintech', slug: 'aurora-fintech', title: 'Tech Lead Backend', source: 'gupy', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS'], salary: [22000, 28000], appliedDaysAgo: 54,
    steps: [{ to: 'triagem', after: 3, via: 'email' }, { to: 'entrevista', after: 8, via: 'ia' }, { to: 'teste', after: 15, via: 'email' }, { to: 'oferta', after: 26, via: 'email' }],
    notes: 'Proposta acima da faixa. Responder até sexta.' },
  { company: 'Brisa Mobilidade', slug: 'brisa-mobilidade', title: 'Engineering Manager', source: 'greenhouse', workModel: 'hibrido', location: 'São Paulo, SP', seniority: 'lead', stack: ['Go', 'Kubernetes', 'GCP'], appliedDaysAgo: 51,
    steps: [{ to: 'triagem', after: 5, via: 'email' }, { to: 'entrevista', after: 11, via: 'manual' }, { to: 'rejeitado', after: 19, via: 'ia' }] },
  { company: 'Cobalto Seguros', slug: 'cobalto-seguros', title: 'Tech Lead Plataforma', source: 'linkedin-alerts', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Java', 'Spring', 'Kafka'], appliedDaysAgo: 49,
    steps: [{ to: 'rejeitado', after: 6, via: 'email' }] },
  { company: 'Duna Varejo Digital', slug: 'duna-varejo', title: 'Staff Engineer', source: 'ashby', workModel: 'remoto', location: 'Brasil', seniority: 'staff', stack: ['Node.js', 'React', 'PostgreSQL'], salary: [24000, 30000], appliedDaysAgo: 46,
    steps: [{ to: 'triagem', after: 2, via: 'email' }, { to: 'entrevista', after: 9, via: 'email' }, { to: 'teste', after: 14, via: 'manual' }] ,
    notes: 'Case de arquitetura para entregar até terça.' },
  { company: 'Estrela Polar Games', slug: 'estrela-polar', title: 'Tech Lead Backend', source: 'gupy', workModel: 'hibrido', location: 'Curitiba, PR', seniority: 'lead', stack: ['C#', '.NET', 'Redis'], appliedDaysAgo: 44,
    steps: [{ to: 'triagem', after: 7, via: 'email' }, { to: 'rejeitado', after: 16, via: 'email' }] },
  { company: 'Fóton Energia', slug: 'foton-energia', title: 'Coordenador de Engenharia', source: 'manual', workModel: 'presencial', location: 'Belo Horizonte, MG', seniority: 'lead', stack: ['Python', 'Django'], appliedDaysAgo: 41,
    steps: [] },
  { company: 'Granito Bank', slug: 'granito-bank', title: 'Tech Lead Pagamentos', source: 'greenhouse', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Kotlin', 'Kafka', 'AWS'], salary: [25000, 32000], appliedDaysAgo: 39,
    steps: [{ to: 'triagem', after: 4, via: 'email' }, { to: 'entrevista', after: 10, via: 'ia' }] ,
    notes: 'Segunda entrevista com o CTO marcada.' },
  { company: 'Horizonte EdTech', slug: 'horizonte-edtech', title: 'Engineering Manager', source: 'lever', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Ruby', 'Rails', 'PostgreSQL'], appliedDaysAgo: 37,
    steps: [{ to: 'rejeitado', after: 12, via: 'email' }] },
  { company: 'Íris Saúde', slug: 'iris-saude', title: 'Tech Lead', source: 'linkedin-alerts', workModel: 'hibrido', location: 'São Paulo, SP', seniority: 'lead', stack: ['Node.js', 'NestJS', 'PostgreSQL'], appliedDaysAgo: 34,
    steps: [{ to: 'triagem', after: 3, via: 'email' }] ,
    pending: { status: 'entrevista', daysAgo: 2, note: 'O email convida para uma entrevista técnica com o time de plataforma na próxima semana.' } },
  { company: 'Jade Logística', slug: 'jade-logistica', title: 'Staff Engineer', source: 'gupy', workModel: 'remoto', location: 'Brasil', seniority: 'staff', stack: ['Go', 'Kubernetes', 'Kafka'], appliedDaysAgo: 31,
    steps: [{ to: 'triagem', after: 6, via: 'email' }, { to: 'entrevista', after: 13, via: 'email' }] },
  { company: 'Kappa Analytics', slug: 'kappa-analytics', title: 'Tech Lead Dados', source: 'remoteok', workModel: 'remoto', location: 'Remote', seniority: 'lead', stack: ['Python', 'Spark', 'Airflow'], appliedDaysAgo: 29,
    steps: [{ to: 'rejeitado', after: 9, via: 'email' }] },
  { company: 'Lumen Agro', slug: 'lumen-agro', title: 'Tech Lead Backend', source: 'gupy', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Node.js', 'TypeScript', 'AWS'], appliedDaysAgo: 26,
    steps: [{ to: 'triagem', after: 5, via: 'email' }, { to: 'teste', after: 11, via: 'ia' }] },
  { company: 'Maré Cloud', slug: 'mare-cloud', title: 'Principal Engineer', source: 'ashby', workModel: 'remoto', location: 'Remote', seniority: 'staff', stack: ['Go', 'Terraform', 'AWS'], appliedDaysAgo: 23,
    steps: [] },
  { company: 'Nimbus RH', slug: 'nimbus-rh', title: 'Tech Lead Fullstack', source: 'linkedin-alerts', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Node.js', 'React', 'Next.js'], appliedDaysAgo: 20,
    steps: [{ to: 'triagem', after: 4, via: 'email' }, { to: 'rejeitado', after: 10, via: 'ia' }] },
  { company: 'Ônix Telecom', slug: 'onix-telecom', title: 'Gerente de Engenharia', source: 'manual', workModel: 'hibrido', location: 'Rio de Janeiro, RJ', seniority: 'lead', stack: ['Java', 'Spring', 'Oracle'], appliedDaysAgo: 18,
    steps: [] },
  { company: 'Pristina Labs', slug: 'pristina-labs', title: 'Tech Lead', source: 'greenhouse', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['TypeScript', 'NestJS', 'GraphQL'], salary: [20000, 26000], appliedDaysAgo: 15,
    steps: [{ to: 'triagem', after: 3, via: 'email' }] },
  { company: 'Quartzo Pay', slug: 'quartzo-pay', title: 'Staff Engineer Backend', source: 'gupy', workModel: 'remoto', location: 'Brasil', seniority: 'staff', stack: ['Node.js', 'PostgreSQL', 'Kafka'], appliedDaysAgo: 12,
    steps: [],
    pending: { status: 'rejeitado', daysAgo: 1, note: 'O email agradece a participação e informa que o processo seguiu com outro perfil.' } },
  { company: 'Rubi Marketplaces', slug: 'rubi-marketplaces', title: 'Tech Lead', source: 'lever', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Python', 'FastAPI', 'AWS'], appliedDaysAgo: 10,
    steps: [{ to: 'triagem', after: 2, via: 'email' }] },
  { company: 'Safira Travel', slug: 'safira-travel', title: 'Engineering Manager', source: 'linkedin-alerts', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Node.js', 'AWS'], appliedDaysAgo: 8,
    steps: [] },
  { company: 'Titânio Infra', slug: 'titanio-infra', title: 'Tech Lead SRE', source: 'remoteok', workModel: 'remoto', location: 'Remote', seniority: 'lead', stack: ['Kubernetes', 'Terraform', 'Observabilidade'], appliedDaysAgo: 6,
    steps: [] },
  { company: 'Urano Mídia', slug: 'urano-midia', title: 'Tech Lead Backend', source: 'gupy', workModel: 'hibrido', location: 'São Paulo, SP', seniority: 'lead', stack: ['Node.js', 'MongoDB'], appliedDaysAgo: 4,
    steps: [] },
  { company: 'Vértice Dados', slug: 'vertice-dados', title: 'Staff Engineer', source: 'ashby', workModel: 'remoto', location: 'Brasil', seniority: 'staff', stack: ['Python', 'Spark', 'Kubernetes'], appliedDaysAgo: 2,
    steps: [] },
  { company: 'Zênite Mobile', slug: 'zenite-mobile', title: 'Tech Lead Mobile', source: 'manual', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['Kotlin', 'Swift', 'React Native'], appliedDaysAgo: null,
    steps: [], notes: 'Revisar o currículo antes de enviar.' },
  { company: 'Âmbar Imóveis', slug: 'ambar-imoveis', title: 'Tech Lead Fullstack', source: 'gupy', workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: ['TypeScript', 'React', 'Node.js'], appliedDaysAgo: null,
    steps: [] },
];

/** Plataforma de onde os emails de cada fonte "vêm". */
const SENDER: Record<string, { address: string; name: (company: string) => string }> = {
  gupy: { address: 'no-reply@gupy.com.br', name: (c) => c },
  greenhouse: { address: 'no-reply@us.greenhouse-mail.io', name: (c) => `${c} via Greenhouse` },
  ashby: { address: 'no-reply@ashbyhq.com', name: (c) => `${c} Recruiting` },
  lever: { address: 'no-reply@hire.lever.co', name: (c) => c },
  'linkedin-alerts': { address: 'jobs-noreply@linkedin.com', name: () => 'LinkedIn' },
  remoteok: { address: 'talent@vagas.exemplo.dev', name: (c) => c },
  manual: { address: 'talentos@vagas.exemplo.dev', name: (c) => `Recrutamento ${c}` },
};

const STATUS_EMAIL: Record<string, (app: DemoApplication) => { subject: string; body: string }> = {
  aplicado: (a) => ({
    subject: `Recebemos sua candidatura para ${a.title}`,
    body: `Olá! Obrigado pelo interesse em fazer parte da ${a.company}. Recebemos sua candidatura para a vaga de ${a.title} e o time vai analisar o seu perfil nos próximos dias.`,
  }),
  triagem: (a) => ({
    subject: `${a.company}: próximos passos no processo de ${a.title}`,
    body: `Oi! Gostamos do seu perfil para a vaga de ${a.title}. Pode nos contar sua disponibilidade para uma conversa de 30 minutos com o time de recrutamento?`,
  }),
  entrevista: (a) => ({
    subject: `Convite para entrevista — ${a.title} na ${a.company}`,
    body: `Queremos seguir com você! Gostaríamos de marcar uma entrevista técnica com o time de engenharia da ${a.company}. Escolha um horário no link do convite.`,
  }),
  teste: (a) => ({
    subject: `Etapa de case técnico liberada — ${a.company}`,
    body: `Você avançou no processo de ${a.title}! A próxima etapa é um case de arquitetura. O enunciado está disponível na plataforma, com prazo de cinco dias.`,
  }),
  oferta: (a) => ({
    subject: `Proposta para ${a.title} — ${a.company}`,
    body: `Temos o prazer de fazer uma proposta para a posição de ${a.title}. Os detalhes de remuneração e benefícios estão no documento anexo.`,
  }),
  rejeitado: (a) => ({
    subject: `Atualização sobre o processo de ${a.title}`,
    body: `Agradecemos sua participação no processo da ${a.company}. Depois de analisar os perfis, decidimos seguir com outra pessoa candidata neste momento.`,
  }),
};

const DESCRIPTION = (a: DemoApplication) =>
  `A ${a.company} está procurando uma pessoa para ${a.title}. Você vai liderar tecnicamente um time de 5 a 8 pessoas, definir arquitetura junto com produto e acompanhar a operação dos serviços em produção.\n\nRequisitos: experiência com ${a.stack.join(', ')}; vivência com sistemas distribuídos; experiência liderando pessoas desenvolvedoras; comunicação clara com áreas de negócio.\n\nDiferenciais: inglês avançado; experiência com observabilidade e plantão.`;

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const profileId = process.env.DEMO_PROFILE_ID;

  if (!profileId) {
    throw new Error('Informe DEMO_PROFILE_ID com o id do perfil de demonstração.');
  }

  const profile = await prisma.profile.findUnique({ where: { id: profileId } });

  if (!profile) {
    throw new Error(`Perfil ${profileId} não encontrado.`);
  }

  const existing = await prisma.application.count({ where: { profileId } });

  if (existing > 0 && process.env.DEMO_RESET !== 'true') {
    throw new Error(
      `O perfil "${profile.name}" já tem ${existing} candidatura(s). Nada foi alterado. Use DEMO_RESET=true para apagar os dados DESTE perfil e recriar.`,
    );
  }

  if (process.env.DEMO_RESET === 'true') {
    await reset(profileId);
  }

  await prisma.profile.update({
    where: { id: profileId },
    data: {
      email: 'demo@example.com',
      phone: '+55 11 90000-0000',
      location: 'São Paulo, SP',
      links: { linkedin: null, github: null, website: 'https://example.com/portfolio' },
      resume: RESUME,
    },
  });

  // Duas versões do currículo: a candidatura guarda a que foi enviada.
  const v1 = await prisma.resumeVersion.create({
    data: { profileId, label: label(ago(56)), content: RESUME, createdAt: ago(56) },
  });
  const v2 = await prisma.resumeVersion.create({
    data: { profileId, label: label(ago(25)), content: RESUME, createdAt: ago(25) },
  });

  let emails = 0;
  let events = 0;

  for (const [index, app] of APPLICATIONS.entries()) {
    const url = `${BASE}/${app.source}/${app.slug}`;
    const appliedAt = app.appliedDaysAgo === null ? null : ago(app.appliedDaysAgo, 9 + (index % 8), (index * 7) % 60);
    const createdAt = appliedAt ?? ago(3 + index % 3, 20);
    const sender = SENDER[app.source];

    const job = await prisma.job.create({
      data: {
        url,
        company: app.company,
        title: app.title,
        description: DESCRIPTION(app),
        stack: app.stack,
        requirements: [`Experiência com ${app.stack[0]}`, 'Liderança técnica de times', 'Sistemas distribuídos'],
        benefits: ['Plano de saúde', 'Auxílio home office'],
        seniority: app.seniority,
        workModel: app.workModel,
        location: app.location,
        salaryMin: app.salary?.[0] ?? null,
        salaryMax: app.salary?.[1] ?? null,
        source: app.source,
        createdAt,
      },
    });

    const statuses = app.steps.map((step) => step.to);
    const current: ApplicationStatus =
      appliedAt === null ? 'rascunho' : (statuses[statuses.length - 1] ?? 'aplicado');

    const application = await prisma.application.create({
      data: {
        profileId,
        jobId: job.id,
        status: current,
        notes: app.notes ?? null,
        appliedAt,
        createdAt,
        resumeVersionId: appliedAt === null ? null : (app.appliedDaysAgo! > 25 ? v1.id : v2.id),
      },
    });

    // Criação: o primeiro evento, datado de quando a candidatura foi enviada.
    await prisma.statusEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: null,
        toStatus: appliedAt === null ? 'rascunho' : 'aplicado',
        source: 'manual',
        occurredAt: createdAt,
        createdAt,
      },
    });
    events += 1;

    if (appliedAt === null) {
      continue;
    }

    // Confirmação de candidatura, minutos depois do envio.
    const confirmation = STATUS_EMAIL.aplicado(app);
    await email(profileId, application.id, sender, app, confirmation, new Date(appliedAt.getTime() + 4 * 60_000), null);
    emails += 1;

    let previous: ApplicationStatus = 'aplicado';

    for (const step of app.steps) {
      const at = new Date(appliedAt.getTime() + step.after * DAY + 3 * 60 * 60_000);
      let emailId: string | null = null;

      if (step.via !== 'manual') {
        emailId = await email(profileId, application.id, sender, app, STATUS_EMAIL[step.to](app), at, step.via === 'ia' ? step.to : null);
        emails += 1;
      }

      await prisma.statusEvent.create({
        data: {
          applicationId: application.id,
          fromStatus: previous,
          toStatus: step.to,
          source: step.via,
          emailMessageId: emailId,
          occurredAt: at,
          createdAt: new Date(at.getTime() + 2 * 60 * 60_000),
        },
      });
      events += 1;
      previous = step.to;
    }

    if (app.pending) {
      const content = STATUS_EMAIL[app.pending.status](app);

      await prisma.emailMessage.create({
        data: {
          profileId,
          applicationId: application.id,
          messageId: `<demo-${app.slug}-pendente@vagas.exemplo.dev>`,
          fromAddress: sender.address,
          fromName: sender.name(app.company),
          subject: content.subject,
          bodyText: content.body,
          receivedAt: ago(app.pending.daysAgo, 11, 20),
          senderVerified: true,
          processedAt: ago(app.pending.daysAgo, 11, 25),
          suggestedStatus: app.pending.status,
          suggestionNote: app.pending.note,
        },
      });
      emails += 1;
    }
  }

  // Emails pendentes, de empresas que não estão nas candidaturas: material
  // para o "Resolver por IA".
  const pendentes = [
    { company: 'Kairós Sistemas', subject: 'Confirmação de inscrição — Tech Lead Backend', body: 'Olá! Sua inscrição para a vaga de Tech Lead Backend na Kairós Sistemas foi confirmada. Vamos analisar seu perfil e retornamos em breve.', days: 3 },
    { company: 'Lótus Finanças', subject: 'Você avançou no processo seletivo — Engineering Manager', body: 'Você avançou para a próxima fase do processo de Engineering Manager na Lótus Finanças. A próxima etapa é uma entrevista com a liderança de engenharia.', days: 2 },
    { company: 'Mirante Seguros', subject: 'Temos atualizações sobre o processo seletivo | Tech Lead', body: 'Agradecemos sua participação no processo seletivo para Tech Lead na Mirante Seguros. Optamos por seguir com outro perfil neste momento.', days: 1 },
  ];

  for (const [index, item] of pendentes.entries()) {
    await prisma.emailMessage.create({
      data: {
        profileId,
        applicationId: null,
        messageId: `<demo-pendente-${index}@vagas.exemplo.dev>`,
        fromAddress: 'no-reply@gupy.com.br',
        fromName: item.company,
        subject: item.subject,
        bodyText: item.body,
        receivedAt: ago(item.days, 15, 10),
        senderVerified: true,
      },
    });
    emails += 1;
  }

  // Vagas que a descoberta "mostrou": dão o gráfico de vagas por dia e o
  // aproveitamento por fonte. As das candidaturas entram, senão a taxa de
  // aproveitamento passaria de 100%.
  const mix: [string, number][] = [
    ['gupy', 52], ['linkedin-alerts', 46], ['greenhouse', 34], ['ashby', 20],
    ['remoteok', 16], ['lever', 9], ['remotive', 6],
  ];
  const seen: { url: string; source: string; firstSeenAt: Date }[] = [];

  for (const [source, total] of mix) {
    for (let n = 0; n < total; n += 1) {
      // Mais vagas no começo da semana, como na vida real.
      const day = (n * 7 + source.length * 3) % 30;

      seen.push({ url: `${BASE}/${source}/vaga-${1000 + n}`, source, firstSeenAt: ago(day, 8 + (n % 10), (n * 13) % 60) });
    }
  }

  for (const app of APPLICATIONS) {
    // `manual` não é fonte da descoberta: vaga cadastrada à mão nunca foi "mostrada".
    if (app.appliedDaysAgo !== null && app.appliedDaysAgo <= 30 && app.source !== 'manual') {
      seen.push({ url: `${BASE}/${app.source}/${app.slug}`, source: app.source, firstSeenAt: ago(app.appliedDaysAgo + 1, 9) });
    }
  }

  await prisma.discoveredJob.createMany({
    data: seen.map((job) => ({ profileId, ...job })),
    skipDuplicates: true,
  });

  // Salvas: algumas candidaturas recentes (salvou, depois aplicou) e algumas
  // que ainda esperam.
  const savedUrls = [
    ...APPLICATIONS.filter((app) => app.appliedDaysAgo !== null && app.appliedDaysAgo <= 15).map((app) => `${BASE}/${app.source}/${app.slug}`),
  ];
  const extras = [
    { company: 'Cristal Educação', title: 'Tech Lead', source: 'gupy', stack: ['Node.js', 'PostgreSQL'] },
    { company: 'Delta Fretes', title: 'Engineering Manager', source: 'greenhouse', stack: ['Go', 'AWS'] },
    { company: 'Eco Varejo', title: 'Staff Engineer', source: 'ashby', stack: ['TypeScript', 'Kafka'] },
    { company: 'Faísca Energia', title: 'Tech Lead Backend', source: 'linkedin-alerts', stack: ['Java', 'Spring'] },
  ];

  for (const [index, extra] of extras.entries()) {
    const url = `${BASE}/${extra.source}/vaga-${1000 + index}`;
    const fake: DemoApplication = { company: extra.company, slug: '', title: extra.title, source: extra.source, workModel: 'remoto', location: 'Brasil', seniority: 'lead', stack: extra.stack, appliedDaysAgo: null, steps: [] };

    await prisma.job.create({
      data: {
        url,
        company: extra.company,
        title: extra.title,
        description: DESCRIPTION(fake),
        stack: extra.stack,
        requirements: [`Experiência com ${extra.stack[0]}`, 'Liderança técnica de times'],
        benefits: ['Plano de saúde'],
        seniority: 'lead',
        workModel: 'remoto',
        location: 'Brasil',
        source: extra.source,
        createdAt: ago(5 + index),
      },
    });
    savedUrls.push(url);
  }

  const savedJobs = await prisma.job.findMany({ where: { url: { in: savedUrls } }, select: { id: true } });

  await prisma.savedJob.createMany({
    data: savedJobs.map((job, index) => ({ profileId, jobId: job.id, savedAt: ago(20 - index, 14) })),
    skipDuplicates: true,
  });

  // Descartadas, entre as vistas.
  const dismissed = seen.filter((_, index) => index % 7 === 3).slice(0, 25);

  await prisma.dismissedJob.createMany({
    data: dismissed.map((job, index) => ({
      profileId,
      jobUrl: job.url,
      company: `Empresa Descartada ${index + 1}`,
      title: 'Vaga fora do perfil',
      source: job.source,
      dismissedAt: job.firstSeenAt,
    })),
    skipDuplicates: true,
  });

  console.log(
    `Perfil "${profile.name}": ${APPLICATIONS.length} candidaturas, ${events} eventos de status, ${emails} emails, ${seen.length} vagas vistas, ${savedJobs.length} salvas, ${dismissed.length} descartadas.`,
  );
}

async function email(
  profileId: string,
  applicationId: string,
  sender: { address: string; name: (company: string) => string },
  app: DemoApplication,
  content: { subject: string; body: string },
  receivedAt: Date,
  confirmedStatus: ApplicationStatus | null,
): Promise<string> {
  const created = await prisma.emailMessage.create({
    data: {
      profileId,
      applicationId,
      messageId: `<demo-${app.slug}-${receivedAt.getTime()}@vagas.exemplo.dev>`,
      fromAddress: sender.address,
      fromName: sender.name(app.company),
      subject: content.subject,
      bodyText: content.body,
      receivedAt,
      senderVerified: true,
      // Já "lido": a sincronização não paga para ler email de demonstração.
      processedAt: new Date(receivedAt.getTime() + 5 * 60_000),
      suggestedStatus: confirmedStatus,
      suggestionResolvedAt: confirmedStatus ? new Date(receivedAt.getTime() + 60 * 60_000) : null,
    },
  });

  return created.id;
}

/** Apaga só o que é deste perfil — e as vagas de demonstração que sobrarem. */
async function reset(profileId: string): Promise<void> {
  await prisma.emailMessage.deleteMany({ where: { profileId } });
  await prisma.application.deleteMany({ where: { profileId } });
  await prisma.savedJob.deleteMany({ where: { profileId } });
  await prisma.dismissedJob.deleteMany({ where: { profileId } });
  await prisma.discoveredJob.deleteMany({ where: { profileId } });
  await prisma.resumeVersion.deleteMany({ where: { profileId } });
  await prisma.job.deleteMany({
    where: { url: { startsWith: BASE }, applications: { none: {} }, savedBy: { none: {} } },
  });
}

function label(date: Date): string {
  return `Currículo de ${date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
