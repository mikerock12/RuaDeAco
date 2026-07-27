# Arquitetura do servidor multiplayer

## Escopo

As fases 1 e 2 formam uma base de coordenação, transporte e cliente lockstep,
não uma simulação autoritativa. O Worker autentica e roteia; um Durable Object
SQLite isolado é a autoridade sobre a ocupação e o ciclo de vida de cada sala.
Cada cliente simula o mesmo `CombatWorld` em 60 Hz somente quando possui os
inputs P1 e P2 do frame elegível.

```text
GitHub Pages / Capacitor / localhost
                  │
          HTTPS + WebSocket
                  │
       Worker rua-de-aco-game-server
       CORS · HMAC · rotas · ticket
                  │
       MATCH_ROOMS["room:" + code]
                  │
          GameRoom Durable Object
      SQLite · slots · nonce · alarm
      WebSocket Hibernation · relay
```

Não existe objeto global de matchmaking. Uma fila futura deverá ser
particionada por região, modo e faixa, evitando um gargalo global.

## Fronteiras de autoridade

O Worker é responsável por:

- allowlist de origin e métodos;
- emissão/verificação de sessão HMAC;
- verificação criptográfica do ticket WebSocket;
- escolha do Durable Object pelo código normalizado;
- respostas HTTP estáveis.

O `GameRoom` é responsável por:

- inicialização idempotente e reserva de P1/P2;
- emissão/invalidação e consumo atômico de nonce;
- substituição de socket somente para a mesma sessão;
- seleção, ready, início único e compatibilidade de versões;
- sequência e relay de inputs;
- comparação de hashes;
- reconexão, deadlines e fechamento;
- rate limit exato das invariantes da sala.

O cliente continua responsável pela simulação de combate. Vida, dano,
posição, vencedor e snapshots enviados pelo cliente não são aceitos como
verdade nesta fase.

## Modelo SQLite

`room` contém versão de schema/protocolo, fase, seed, `startAt`, input delay,
criação, expiração, prazo vazio, fechamento e último frame confirmado.

`slots` contém o dono da vaga, conexão, seleção, versões de conteúdo,
readiness, sequência/frame conservadores e prazo de reconexão.

`ticket_nonces` registra emissão, expiração, invalidação e consumo.
O consumo usa um único:

```sql
UPDATE ticket_nonces
SET consumed_at = ?
WHERE nonce = ?
  AND session_id = ?
  AND slot = ?
  AND expires_at > ?
  AND consumed_at IS NULL
  AND invalidated_at IS NULL
RETURNING nonce;
```

`state_hashes` guarda somente hashes por frame/slot; `desyncs` garante um
único alerta por frame. `session_rates` persiste a janela de abuso da sessão.
`active_connections` identifica o único socket vigente de cada slot, evitando
que uma mensagem atrasada do socket substituído altere a sala.
`input_states` guarda somente a última máscara mantida para validar
`pressedMask`/`releasedMask` entre lotes. Inputs por frame não são armazenados.

## Hibernação

O lado servidor é aceito por `ctx.acceptWebSocket(server, tags)`. Cada
attachment contém somente sessão, slot, protocolo, sequência/frame,
timestamp de entrada e pequena janela de rate limit. Após evicção, o runtime
restaura sockets e attachments; o restante vem do SQLite.

Não são usados `server.accept()`, listeners convencionais dentro do Durable
Object, timers de 60 FPS, WebSocket de saída ou estado crítico somente em
memória. `ctx.getWebSockets()` e tags recuperam o par conectado. O par textual
`ping/pong` é auto-response de transporte.

## Máquina de estados

```text
waiting ── dois selecionados ──> ready
   ▲                                │
   └──── seleção alterada ──────────┘
                                    │ dois conectados + ready
                                    │ versões compatíveis
                                    ▼
                                  active
                                    │ expiração/grace/abandono
                                    ▼
                                  closed
```

O update que entra em `active` só funciona se a sala ainda não iniciou. Seed
vem de `crypto.getRandomValues`; `startAt` é coordenado e o mesmo evento é
enviado aos dois slots.

## Protocolo de input

O envelope `input_batch` carrega `sequence`, `ackSequence`, `startFrame` e
até três frames consecutivos. Cada frame possui máscaras de oito bits:

```text
0 left · 1 right · 2 up · 3 down
4 light · 5 heavy · 6 special · 7 block
```

`pressedMask` deve estar contido em `heldMask`; `releasedMask` não pode
intersectar `heldMask` ou `pressedMask`. As arestas também devem corresponder
exatamente à transição da última máscara persistida para a máscara atual.
Duplicatas da última sequência são descartadas. Lacunas, regressões, frames
não consecutivos e futuro absurdo são recusados. O lote válido segue somente
para o outro slot.

## Hashes

O cliente exporta de forma canônica todo o estado competitivo do
`CombatWorld`/`FighterRuntime` e publica `{ frame, hash }` a cada 60 frames
simulados. Quando os dois hashes do frame:

- coincidem, `last_confirmed_frame` avança;
- divergem, `desync` é persistido e emitido uma única vez.

Não há correção de estado. Uma divergência interrompe a luta sem vencedor.
O export e o hash canônico já são validados por testes longos, inclusive com
cadências de render diferentes; restauração, checkpoints importáveis e replay
persistido ainda são necessários antes de rollback.

## Reconexão e alarms

Ao desconectar, o slot continua reservado durante a grace period e o oponente
recebe o deadline. `reconnect` exige a mesma sessão, invalida tickets antigos
e substitui controladamente um socket anterior. Um `connectionId` novo é
persistido atomicamente; callbacks ou mensagens tardias da conexão anterior
não podem marcar a nova conexão como offline nem avançar o protocolo.

Há um único alarm por objeto. Todos os deadlines ficam no SQLite; o mais
próximo é agendado. O handler processa vencidos, encerra partida ativa quando
um jogador perde a janela, libera P2 de uma sala pré-partida, encerra
abandono/TTL e reagenda. Updates condicionais tornam chamadas repetidas
idempotentes.

## Ameaças e mitigação

| Ameaça | Mitigação atual |
|---|---|
| Código de sala descoberto | código não autentica; sessão e ticket assinados |
| Replay de ticket | nonce curto consumido atomicamente |
| Ticket na telemetria/URL | transportado como subprotocolo, nunca em query |
| Tomada de slot | session ID persistido e conferido no reconnect |
| Terceiro jogador/espectador | somente P1/P2; reserva atômica |
| Flood | 16 KiB, lotes de 3, rate limits e fechamento progressivo |
| Prototype pollution/campos ocultos | objetos planos e chaves exatas |
| Frame/sequence forjado | intervalos, monotonicidade e bitmasks coerentes |
| Cliente adulterando resultado | resultado competitivo não é aceito |
| Vazamento em log | sala por hash; sem token, secret, IP ou stream de input |

A proteção de criação de sessão é best-effort por isolate. Antes de exposição
ampla, pode ser complementada por Cloudflare Rate Limiting/WAF após confirmar
plano, disponibilidade e sem retirar os limites exatos do Durable Object.

## Compatibilidade e localização

Origins cobrem GitHub Pages, Vite local e os schemes Capacitor. O servidor não
depende do bundle do jogo. O cliente atual envia protocolo, build derivada do
conteúdo, versão do engine e revisão dos assets; a sala recusa peers
incompatíveis antes do início.

O lookup usa location hint `sam` apenas na primeira instanciação. A
documentação atual da Cloudflare indica que isso ainda pode colocar o objeto
no leste da América do Norte. Medir RTT P50/P95 com jogadores brasileiros é
um gate obrigatório antes de decidir input delay ou rollback.

## Limites e custos

WebSocket Hibernation evita cobrança de duração enquanto o objeto está ocioso,
mas mensagens, requests, storage SQLite, alarms e atividade continuam
contabilizados conforme o plano. O limite da aplicação é 16 KiB, bem abaixo
do máximo de mensagem da plataforma, e não há tick de 60 FPS no servidor.

Antes de staging público:

- confirmar quotas e preços vigentes do plano Workers/Durable Objects;
- estimar mensagens por luta e retenção de salas;
- reduzir sampling de logs se necessário;
- criar alertas para erros, desync, close codes e latência;
- executar teste de carga controlado, sem concentrar matchmaking.

## Cliente lockstep da fase 2

O cliente implementado:

- mantém sessão/ticket fora de URLs e caches;
- cria/entra/reconecta no lobby e sincroniza seleção/ready;
- usa o slot do servidor para mapear o input físico local sempre pelo perfil 0
  para o lutador canônico P1 ou P2;
- codifica oito ações em bitmask, preservando diagonais e simultâneas;
- envia lotes de até três frames e estagna sem o frame rival;
- aplica `inputDelay` 8 por padrão, autoritativo no evento `start`;
- mantém a pausa apenas como overlay local e continua enviando input neutro;
- encerra de forma neutra em desync, reload/background, sequência inválida ou
  perda de backlog.

Bloqueadores para uma fase competitiva pública:

- estado exportável ainda não importável/restaurável;
- inputs por frame não persistidos no servidor;
- ausência de rollback e reconexão comprovável durante luta;
- rollback e autoridade de resultado ausentes.

Roadmap:

1. servidor e cliente lockstep beta local — concluídos;
2. staging privado e medição de RTT;
3. restore, checkpoint e replay persistido;
4. netcode adaptativo/rollback conforme medições;
5. autoridade, anticheat, ranking e matchmaking.

## Referências Cloudflare verificadas em 26/07/2026

- [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [API WebSocket do Durable Object](https://developers.cloudflare.com/durable-objects/api/state/)
- [Lifecycle e exports de Durable Objects](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
