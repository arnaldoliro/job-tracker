import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Idempotente: só cria o perfil padrão se o banco estiver vazio. Rodar de novo
 * não duplica nada nem sobrescreve dados existentes.
 */
async function main(): Promise<void> {
  const existing = await prisma.profile.count();

  if (existing > 0) {
    console.log(`${existing} perfil(is) já cadastrado(s) — nada a fazer.`);
    return;
  }

  const profile = await prisma.profile.create({
    data: {
      name: process.env.SEED_PROFILE_NAME ?? 'Perfil principal',
      isDefault: true,
    },
  });

  console.log(`Perfil padrão criado: ${profile.name} (${profile.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
