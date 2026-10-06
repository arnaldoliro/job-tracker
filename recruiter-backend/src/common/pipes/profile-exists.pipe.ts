import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ProfileService } from '../../profile/profile.service';

/**
 * Confere contra o banco um `profileId` que veio do cliente.
 *
 * Hoje não há autorização por usuário, mas o id chega de fora e é suspeito por
 * definição (seção 5 do CLAUDE.md). Sem isto, um id inventado viraria uma lista
 * vazia sem explicação, ou um 500 na violação de chave estrangeira. Tratar o id
 * como não confiável desde já é o que torna o login futuro barato.
 */
@Injectable()
export class ProfileExistsPipe implements PipeTransform<
  string,
  Promise<string>
> {
  constructor(private readonly profileService: ProfileService) {}

  async transform(profileId: string): Promise<string> {
    if (!profileId) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Informe o profileId',
      });
    }

    const profile = await this.profileService.findById(profileId);

    if (!profile) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Perfil não encontrado',
      });
    }

    return profileId;
  }
}
