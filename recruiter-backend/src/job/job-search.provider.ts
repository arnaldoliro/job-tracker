import { Injectable } from '@nestjs/common';
import type { JobSearchResult } from '@recruit/shared';

export interface JobSearchQuery {
  q?: string;
  source?: string;
}

/**
 * Ponto de troca da busca.
 *
 * A implementação de hoje devolve dados fictícios. Quando a busca real em
 * portais entrar (a ordem de preferência do CLAUDE.md é job alerts por email >
 * feeds públicos > scraping), só esta classe muda — o service, o controller e
 * a tela continuam iguais, porque nenhum deles sabe de onde o resultado veio.
 *
 * Nada aqui toca o banco: resultado de busca é dado externo, e só vira `Job`
 * quando o usuário salva.
 */
export abstract class JobSearchProvider {
  abstract search(query: JobSearchQuery): Promise<JobSearchResult[]>;
}

const fixtures: JobSearchResult[] = [
  {
    company: 'Nubank',
    title: 'Engenheiro de Software Backend Sênior',
    url: 'https://jobs.example.com/nubank/backend-senior',
    source: 'greenhouse',
    description:
      'Time de plataforma de pagamentos. Serviços em Clojure e Go processando alto volume transacional.',
    stack: ['Clojure', 'Go', 'Kafka', 'PostgreSQL'],
    requirements: [
      '5+ anos com backend distribuído',
      'Experiência com filas e mensageria',
      'Inglês para leitura',
    ],
    benefits: ['Plano de saúde', 'Auxílio home office', 'PLR'],
    seniority: 'senior',
    workModel: 'remoto',
    contractType: 'clt',
    location: 'São Paulo, SP',
    salaryMin: 18000,
    salaryMax: 25000,
    salaryCurrency: 'BRL',
    weeklyHours: 40,
    postedAt: '2026-08-28T12:00:00.000Z',
  },
  {
    company: 'Stone',
    title: 'Tech Lead — Plataforma',
    url: 'https://jobs.example.com/stone/tech-lead-plataforma',
    source: 'gupy',
    description:
      'Liderança técnica de um time de 6 pessoas responsável pela plataforma interna de deploy.',
    stack: ['TypeScript', 'Node.js', 'Kubernetes', 'Terraform'],
    requirements: [
      'Experiência prévia liderando times',
      'Kubernetes em produção',
      'Cultura de observabilidade',
    ],
    benefits: ['Vale refeição', 'Gympass', 'Stock options'],
    seniority: 'lead',
    workModel: 'hibrido',
    contractType: 'clt',
    location: 'Rio de Janeiro, RJ',
    salaryMin: 22000,
    salaryMax: 30000,
    salaryCurrency: 'BRL',
    weeklyHours: 40,
    postedAt: '2026-08-30T09:30:00.000Z',
  },
  {
    company: 'iFood',
    title: 'Staff Engineer — Logística',
    url: 'https://jobs.example.com/ifood/staff-logistica',
    source: 'lever',
    description:
      'Arquitetura dos sistemas de roteirização e alocação de entregadores em tempo real.',
    stack: ['Kotlin', 'Java', 'Kafka', 'Redis'],
    requirements: [
      'Sistemas de alta escala',
      'Modelagem de problemas de otimização',
      'Mentoria técnica',
    ],
    benefits: [
      'Plano de saúde',
      'Auxílio creche',
      'Licença parental estendida',
    ],
    seniority: 'staff',
    workModel: 'remoto',
    contractType: 'clt',
    location: 'Campinas, SP',
    salaryMin: 28000,
    salaryMax: 38000,
    salaryCurrency: 'BRL',
    weeklyHours: 40,
    postedAt: '2026-09-01T15:00:00.000Z',
  },
  {
    company: 'Mercado Livre',
    title: 'Desenvolvedor Backend Pleno',
    url: 'https://jobs.example.com/meli/backend-pleno',
    source: 'linkedin',
    description:
      'Time de catálogo. APIs de alto tráfego servindo o marketplace da América Latina.',
    stack: ['Java', 'Spring', 'MySQL', 'AWS'],
    requirements: ['3+ anos com Java', 'REST', 'Espanhol desejável'],
    benefits: ['Plano de saúde', 'Vale refeição'],
    seniority: 'pleno',
    workModel: 'presencial',
    contractType: 'clt',
    location: 'São Paulo, SP',
    salaryMin: 12000,
    salaryMax: 16000,
    salaryCurrency: 'BRL',
    weeklyHours: 40,
    postedAt: '2026-08-25T10:00:00.000Z',
  },
  {
    company: 'Conta Simples',
    title: 'Engenheiro de Software (PJ)',
    url: 'https://jobs.example.com/contasimples/eng-pj',
    source: 'greenhouse',
    description: 'Produto financeiro para PMEs. Time pequeno, autonomia alta.',
    stack: ['TypeScript', 'React', 'NestJS', 'PostgreSQL'],
    requirements: [
      'Full stack',
      'Autonomia',
      'Experiência com fintech é um plus',
    ],
    benefits: ['Horário flexível', 'Equipamento'],
    seniority: 'pleno',
    workModel: 'remoto',
    contractType: 'pj',
    location: 'Remoto',
    salaryMin: 15000,
    salaryMax: 20000,
    salaryCurrency: 'BRL',
    weeklyHours: 40,
    postedAt: '2026-09-02T08:00:00.000Z',
  },
];

/** Implementação de desenvolvimento: filtra uma lista fixa em memória. */
@Injectable()
export class FixtureJobSearchProvider extends JobSearchProvider {
  search(query: JobSearchQuery): Promise<JobSearchResult[]> {
    const term = query.q?.trim().toLowerCase();

    const results = fixtures.filter((job) => {
      if (query.source && job.source !== query.source) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        job.company,
        job.title,
        job.location ?? '',
        ...job.stack,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });

    return Promise.resolve(results);
  }
}
