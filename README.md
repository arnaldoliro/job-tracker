# job-tracker

Rastreador pessoal de candidaturas a vagas de emprego. Descobre vagas, lê os
emails dos processos seletivos, preenche formulário de candidatura e mede o
que acontece depois que você se candidata.

Feito para **uma pessoa, rodando na própria máquina**. Não é um produto
multiusuário, e várias decisões abaixo só fazem sentido por causa disso.

## O problema

O gargalo de procurar emprego não é a ferramenta, é o atrito de registrar cada
candidatura. Se cadastrar uma vaga levar mais de trinta segundos, a planilha é
abandonada na terceira semana — e com ela a única forma de saber o que está
funcionando.

Então o objetivo aqui é registrar **sem** digitar: a vaga vem da descoberta, e
a confirmação de candidatura vem do email. O passo seguinte — o status andar
sozinho quando a empresa responde — ainda não existe: ler o *sentido* de um
email de recrutador exige um modelo, e é a próxima etapa.

## Estado

Funciona hoje, sem chave de IA: descoberta de vagas, ingestão de email,
currículo com PDF e versões, preenchimento de formulário e painel.

Depende de chave da Anthropic com crédito: a extração de vaga por URL.

Ainda não existe: classificação automática de status a partir do email, e
sugestões de reescrita do currículo para cada vaga.

## O que ele faz

**Descoberta de vagas.** Lê Greenhouse, Lever, Ashby e Gupy pelas APIs
públicas, portais brasileiros por JSON-LD, e os **alertas de vaga do
LinkedIn que chegam no seu email**. Ranqueia tudo por aderência ao currículo
e deixa você salvar ou dispensar.

**Ingestão de email.** Conecta por IMAP num rótulo dedicado do Gmail, vincula
cada email à candidatura certa e monta a linha do tempo de cada processo. Um
email de confirmação de uma vaga que você esqueceu de registrar vira a
candidatura com um clique.

**Currículo como dado.** O CV é estruturado — experiências, skills, projetos
—, vira PDF pela impressão do navegador, e cada candidatura **congela** a
versão enviada. Seis meses e três edições depois, dá para saber o que você
mandou para cada empresa.

**Preenchimento de formulário.** Abre o formulário da vaga num Chrome, preenche
nome, email, telefone e links, e **para**. Você revisa e envia.

**Painel.** Funil de candidaturas, tempo até a primeira resposta, aproveitamento
de cada fonte de vaga, e o ritmo dos emails.

**Extração por URL.** Cole o link de uma vaga e o Claude extrai empresa, cargo,
stack e requisitos. É a única parte que usa IA hoje, e exige chave da
Anthropic com crédito.

## Decisões que valem a leitura

**O LinkedIn entra sem raspar o LinkedIn.** O `robots.txt` dele é `Disallow: /`
e o contrato proíbe acesso automatizado — e o custo de um banimento seria a
rede profissional inteira. Mas o LinkedIn **manda as vagas por email**, e ler
a própria caixa não é raspagem. O parser lê os alertas; a página da vaga nunca
é aberta pelo sistema.

**Formulário nunca é enviado automaticamente.** Candidatura enviada não tem
desfazer, e as perguntas que decidem são as abertas, que o sistema se recusa a
responder. O contrato da API afirma isso: o campo `submitted` é `false`
literal, não booleano — não existe forma de expressar um envio.

**O funil conta quem já chegou, não quem está.** Uma candidatura que foi a
entrevista, teste e oferta tem status atual `oferta`. Contar o status atual
apagaria que ela passou pelas outras etapas. O funil vem do histórico de
transições, conta candidaturas distintas e é monotônico por construção.

**A data da mudança não é a data do clique.** A entrevista é marcada na
segunda, você registra na quarta. Sem distinguir as duas, "tempo até a
primeira resposta" mediria o seu hábito de registro, não a velocidade da
empresa.

**Conteúdo de terceiros é dado, nunca instrução.** Descrição de vaga, corpo de
email e página web podem conter texto tentando manipular o modelo. A saída do
Claude sobre esse conteúdo é sempre um campo estruturado validado com Zod —
nunca algo que o sistema execute.

**Número vazio é melhor que número inventado.** Com poucas candidaturas, as
taxas de conversão são omitidas em vez de mostrar "75%" sobre quatro casos.
Campo de formulário que o sistema não reconhece fica em branco em vez de
receber um palpite.

## Stack

TypeScript em tudo, num monorepo com npm workspaces.

| Camada     | Tecnologia                                       |
| ---------- | ------------------------------------------------ |
| Frontend   | Next.js 16 (App Router), React 19, Tailwind 4    |
| Backend    | Nest.js 11, `@nestjs/schedule`                   |
| Banco      | PostgreSQL 16 + Prisma 7                         |
| Contratos  | Zod 4, compartilhados em `packages/shared`       |
| Email      | `imapflow` + `mailparser`                        |
| Navegador  | `playwright-core` com o Chrome do sistema        |
| IA         | `@anthropic-ai/sdk`, com tool use                |

```
recruiter-frontend/   Next.js — telas; fala com a API só por HTTP
recruiter-backend/    Nest — API, banco, IMAP, navegador, Claude
packages/shared/      Schemas Zod usados pelos dois lados
docker-compose.yml    Postgres local
```

Só o backend fala com o banco. Todo contrato que cruza os dois apps vive em
`packages/shared`, e o backend revalida toda entrada mesmo quando o frontend já
validou — validação no cliente é conforto, não controle.

## Rodando

Precisa de Node 20.9 ou mais novo, Docker, e Google Chrome instalado se for
usar o preenchimento de formulário.

```bash
npm install

cp .env.example .env
cp recruiter-backend/.env.example recruiter-backend/.env
cp recruiter-frontend/.env.example recruiter-frontend/.env.local

npm run infra:up          # sobe o Postgres
npm run build:shared      # os dois apps importam o dist deste pacote
npm run db:migrate
npm run db:seed           # opcional: dados de exemplo

npm run dev:worker        # backend em http://127.0.0.1:3333
npm run dev:web           # frontend em http://127.0.0.1:3000
```

Rode `npm run build:shared` de novo sempre que mexer em `packages/shared`.

### Email

A ingestão lê **um rótulo** do Gmail, nunca a caixa de entrada inteira — o
Gmail garante esse limite antes de qualquer código ver um email.

1. Ative a verificação em duas etapas na conta Google.
2. Gere uma **senha de app** em `myaccount.google.com/apppasswords` — nunca use
   a senha principal da conta.
3. Crie o rótulo `job-tracker` e, em Configurações → Marcadores, marque
   **Mostrar no IMAP**. Sem isso o rótulo existe na web e fica invisível para o
   app.
4. Crie um filtro que aplique o rótulo aos remetentes de ATS e a
   `jobalerts-noreply@linkedin.com`.
5. Preencha `IMAP_HOST`, `IMAP_USER` e `IMAP_PASSWORD` no
   `recruiter-backend/.env`.

A sincronização roda a cada 15 minutos. Para buscar emails anteriores ao
último sincronizado — depois de ampliar o filtro, por exemplo —, use
`POST /emails/sync?days=45`.

## Segurança

**Tudo escuta só em `127.0.0.1`** — a API, o frontend e o Postgres. A API não
tem autenticação, e isso é deliberado para um app pessoal: é seguro porque
ninguém mais a alcança. Com as portas abertas na rede, qualquer pessoa no
mesmo Wi-Fi leria seu currículo e seus emails.

Por isso **não publique este app num servidor** sem antes adicionar
autenticação. Não é uma mudança de configuração.

Credenciais ficam só nos arquivos `.env`, que estão no `.gitignore`. O perfil
do Chrome usado no preenchimento guarda sessões logadas e fica fora da pasta
do projeto, em `~/.local/share/job-tracker/`.
