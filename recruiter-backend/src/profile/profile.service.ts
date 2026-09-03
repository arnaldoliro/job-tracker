import { Injectable } from '@nestjs/common';
import type { CreateProfileInput, Profile } from '@recruit/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ProfileModel } from '../generated/prisma/models';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Perfil padrão primeiro; o resto por ordem de criação. */
  async list(): Promise<Profile[]> {
    const rows = await this.prisma.profile.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return rows.map(toProfileDto);
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    // O primeiro perfil do banco nasce como padrão — senão o app abriria
    // sem nenhum perfil pré-selecionado.
    const isFirst = (await this.prisma.profile.count()) === 0;

    const row = await this.prisma.profile.create({
      data: {
        name: input.name,
        headline: input.headline ?? null,
        isDefault: isFirst,
      },
    });

    return toProfileDto(row);
  }
}

/**
 * Fronteira entre a tabela e a API. `resume`, `links`, `phone` e `email`
 * existem na linha e não são expostos: o que a API mostra é decisão, não
 * espelho do schema.
 */
function toProfileDto(row: ProfileModel): Profile {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}
