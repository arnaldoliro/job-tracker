import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env em vez do helper `env()` do Prisma: `env()` lança quando a
    // variável não existe, e isso quebraria o `postinstall` (prisma generate)
    // num clone novo, antes de o .env existir. Gerar o client não precisa de
    // conexão; os comandos que precisam falham com a própria mensagem.
    url: process.env.DATABASE_URL,
  },
});
