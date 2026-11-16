# Convites e pendências em Hoje

A tela Hoje sinaliza emails com remetente verificado dos últimos 90 dias que mencionam entrevista, etapa de teste ou candidatura incompleta. A regra é local e não chama IA. Inclui emails ainda sem vínculo (compartilhados entre os perfis) e os vinculados ao perfil selecionado, exceto candidaturas excluídas, rejeitadas ou canceladas.

O prazo exibido é texto extraído do email, não confirmação de que o portal está aberto. Ausência de aviso não prova ausência de pendências. A detecção é heurística e pode precisar de revisão manual. Convites antigos podem continuar aparecendo até serem dispensados ou a candidatura ser encerrada. Dispensar oculta o aviso e o email da lista de pendentes do app, preservando o Gmail e a linha do tempo; Desfazer restaura enquanto o card está na tela.

## Recuperar mensagens fora do filtro

No Gmail, acrescente ao filtro de recrutamento, além dos remetentes já configurados:

```text
{from:noreplyhiring@ciandt.com from:fcinterview.fcamara.com.br from:micro1.ai from:mailer.digai.ai}
```

Aplique o mesmo rótulo configurado em IMAP_MAILBOX e marque a opção de aplicar às conversas existentes. Em Emails, use **Resgatar últimos 90 dias**. O botão é necessário porque a sincronização habitual usa a data do último email e pode não recuperar mensagens antigas recém-rotuladas. A sincronização mantém o comportamento existente de classificação por IA para emails vinculados e verificados quando há chave configurada.

A busca complementar em Hoje abre o Gmail e não muda filtros. Confira a conta aberta no navegador. O aplicativo não consulta automaticamente a caixa de entrada inteira e não verifica os portais de entrevistas.

Depois de atualizar o código: execute `npm run build:shared` e reinicie backend e frontend. Não há migration nova.
