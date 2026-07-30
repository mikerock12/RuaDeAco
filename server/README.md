# Rua de Aço — servidor multiplayer (fases 1 e 2)

Fundação de salas multiplayer em Cloudflare Workers, integrada ao cliente web
beta local. O servidor entrega sessões, salas, tickets, WebSockets
hibernáveis, coordenação de início, transporte de inputs e detecção de
divergência. O cliente da fase 2 usa esses contratos em uma luta privada por
lockstep com atraso; o servidor continua **não autoritativo** sobre dano, vida,
vitória ou resultado.

## Requisitos e instalação

- Node.js 22 ou superior (o projeto foi validado com Node 24);
- npm;
- uma conta Cloudflare somente quando staging/deploy forem autorizados.

No PowerShell, a partir da raiz do repositório:

```powershell
npm.cmd --prefix server ci
npm.cmd --prefix server run cf:typegen
npm.cmd --prefix server run typecheck
npm.cmd --prefix server test
npm.cmd --prefix server run deploy:dry
```

O pacote e o lockfile são independentes do `node_modules` do jogo.

## Secret local

Copie `server/.dev.vars.example` para `server/.dev.vars` e substitua o
placeholder por pelo menos 32 bytes criptograficamente aleatórios. Exemplo
PowerShell que não escreve o valor no console:

```powershell
$bytes = [byte[]]::new(48)
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$value = [Convert]::ToBase64String($bytes)
"TICKET_SECRET=`"$value`"" | Set-Content -LiteralPath server/.dev.vars -Encoding utf8
Remove-Variable bytes, value
```

`.dev.vars` é ignorado pelo Git. Nunca copie esse valor para
`wrangler.jsonc`, logs, screenshots ou arquivos de contexto.

Para iniciar o Worker local:

```powershell
npm.cmd --prefix server run dev
```

O endereço padrão é `http://127.0.0.1:8787`.

## Smoke local

O smoke inicia seu próprio Wrangler na porta 8787, aguarda `/health`, cria
dois jogadores, mede RTT, inicia uma partida, testa relay e reconexão, e
encerra somente o processo que criou:

```powershell
npm.cmd --prefix server run smoke
```

Se já houver um Wrangler controlado pelo operador, o script pode apenas
conectar nele:

```powershell
$env:SMOKE_BASE_URL = "http://127.0.0.1:8787"
npm.cmd --prefix server run smoke
Remove-Item Env:SMOKE_BASE_URL
```

O smoke nunca imprime sessões, tickets ou secrets.

Com um Wrangler já iniciado, os casos HTTP/WebSocket negativos podem ser
repetidos sem interação manual:

```powershell
$env:SMOKE_BASE_URL = "http://127.0.0.1:8787"
npm.cmd --prefix server run smoke:negative
Remove-Item Env:SMOKE_BASE_URL
```

O dry run apenas empacota e valida o Worker, gravando a saída ignorada em
`server/.wrangler/dry-run`; ele não publica:

```powershell
npm.cmd --prefix server run deploy:dry
```

## API HTTP

Todos os corpos seguem `{ "ok": true, "data": ... }` ou
`{ "ok": false, "error": { "code", "message" } }`. Respostas são
`no-store`.

| Método | Rota | Função |
|---|---|---|
| `GET` | `/health` | Saúde, versões e timestamp; não acessa Durable Object |
| `GET` | `/v1/ping` | Timestamp e colo, quando disponível, para RTT |
| `POST` | `/v1/sessions` | Sessão convidada HMAC com expiração |
| `POST` | `/v1/rooms` | Cria sala, reserva P1 e emite ticket |
| `POST` | `/v1/rooms/:code/join` | Reserva/retoma P2 de forma idempotente |
| `POST` | `/v1/rooms/:code/reconnect` | Novo ticket para o mesmo dono do slot |
| `GET` | `/v1/rooms/:code/ws` | Upgrade WebSocket autenticado |

As rotas de sala usam `Authorization: Bearer <sessionToken>`. O WebSocket
não recebe ticket na URL; o cliente oferece:

```text
Sec-WebSocket-Protocol: rua-de-aco.v1, ticket.<socketTicket>
```

O servidor seleciona somente `rua-de-aco.v1`. O ticket expira em 45 segundos
por padrão, é invalidado por uma nova emissão e seu nonce é consumido uma
única vez dentro do `GameRoom`.

## Origins

A allowlist é exata:

```text
https://mikerock12.github.io
http://127.0.0.1:5173
http://localhost:5173
https://localhost
capacitor://localhost
```

`https://localhost` é o origin atual do app Capacitor Android empacotado.
`capacitor://localhost` preserva compatibilidade futura com iOS. Origins
ausentes são aceitos apenas em `/health`.

## Protocolo WebSocket v1

Toda mensagem é JSON textual, contém `protocolVersion: 1`, tem schema
estrito e no máximo 16 KiB. Binário é recusado.

Cliente → servidor:

```text
select, ready, input_batch, state_hash, leave, latency_ping
```

Servidor → cliente:

```text
welcome, room_state, peer_joined, peer_connected, peer_disconnected,
selection, selection_ack, ready, start, input_batch, state_hash,
desync, latency_pong, error, player_removed, room_closed
```

Estados da sala: `waiting → ready → active → closed`. O `start` ocorre uma
única vez quando os dois slots estão conectados, selecionados e prontos, e
quando build, engine, revisão de assets e arena coincidem.

`room_state.players` inclui, para cada slot, `connected`, `selected`, `ready`,
`fighterId` e `arenaId`. O roster online aceito nesta fase contém somente
`rafa-mare`, `guto-barba`, `astro-riso`, `dante-sinal`, `leo-violeta` e
`noir-reflexo`; a arena é
`cais-da-cidade`.

O `inputDelay` enviado no `start` vem de `INPUT_DELAY_FRAMES`: default 8,
mínimo 2 e máximo 12. Um valor ausente, inválido ou fora do intervalo volta
para 8.

### Inputs

O lote usa:

```json
{
  "protocolVersion": 1,
  "type": "input_batch",
  "sequence": 0,
  "ackSequence": -1,
  "startFrame": 0,
  "frames": [
    {
      "frame": 0,
      "heldMask": 17,
      "pressedMask": 17,
      "releasedMask": 0
    }
  ]
}
```

Há no máximo três frames consecutivos por lote:

| Bit | Ação |
|---:|---|
| 0 | `left` |
| 1 | `right` |
| 2 | `up` |
| 3 | `down` |
| 4 | `light` |
| 5 | `heavy` |
| 6 | `special` |
| 7 | `block` |

`pause`, `confirm` e `cancel` não são inputs remotos. O servidor valida
sequência, intervalo, transições e frames futuros, mas apenas retransmite o
lote ao outro slot.

## Persistência, hibernação e expiração

Cada código resolve para um Durable Object `GameRoom` separado, com SQLite.
São persistidos schema/protocolo, slots, seleção, ready, seed, início,
nonces, hashes, checkpoints, deadlines e motivo de fechamento. Inputs de
cada frame não são persistidos.

Os sockets usam `ctx.acceptWebSocket`, tags e attachments pequenos. Estado
competitivo não fica em `Map`; o objeto pode hibernar e ser reativado sem
perder sala ou identidade do socket. O auto-response textual `ping → pong`
evita acordar o objeto para heartbeat simples.

Defaults:

- sessão: 6 horas;
- ticket WebSocket: 45 segundos;
- sala: 2 horas;
- sala vazia/abandonada: 10 minutos;
- grace period de reconexão: 30 segundos.

Um único alarm é sempre agendado para o deadline persistido mais próximo.
Ele trata reconexão vencida, abandono e cleanup de forma idempotente; não é
relógio de combate.

## Segurança e observabilidade

- HMAC-SHA-256 via Web Crypto e verificação constante quando praticável;
- códigos de sala aleatórios não são credenciais;
- nonce descartável consumido atomicamente;
- codificação base64url canônica, sem aliases por bits de padding;
- dois jogadores, sem espectadores;
- limite HTTP/WebSocket de 16 KiB;
- schema exato, sem campos extras e sem objetos arbitrários;
- rate limit por socket e por sessão no Durable Object;
- fechamento progressivo após abuso;
- ID persistido da conexão ativa impede mensagens atrasadas do socket
  substituído;
- logs JSON apenas de eventos relevantes, com hash abreviado da sala;
- nenhum token, ticket, secret, IP completo ou stream de inputs em logs.

`wrangler tail` e métricas deverão ser configurados separadamente em
staging. O sampling atual está em 100% para a fase de medição; revise-o antes
de tráfego real.

## Staging e produção futuros

Nenhum deploy é necessário para desenvolvimento local. Quando houver
autorização para staging:

1. declarar `env.staging` no Wrangler com nome/binding próprios;
2. manter namespaces e secrets separados de produção;
3. configurar o secret sem colocá-lo em arquivo:

   ```powershell
   npm.cmd --prefix server exec wrangler -- secret put TICKET_SECRET --env staging
   ```

4. executar a validação local e então:

   ```powershell
   npm.cmd --prefix server exec wrangler -- deploy --env staging
   ```

5. medir RTT P50/P95 no Brasil antes de escolher o netcode.

Produção deve ter outro ambiente, outro secret e outro namespace. A rotação
atual troca o secret e invalida sessões/tickets antigos; suporte a duas chaves
durante uma janela de rotação fica para uma fase futura.

O hint `sam` é usado na primeira obtenção do objeto, mas atualmente pode
instanciar o Durable Object no leste da América do Norte; ele não garante
execução na América do Sul.

## GitHub Pages, Capacitor e PWA

O Worker é independente do build estático. O cliente lê
`VITE_MULTIPLAYER_URL`; em desenvolvimento usa
`http://127.0.0.1:8787` como fallback e, em produção, desabilita o modo online
quando a variável não estiver definida. Token de sessão fica apenas no
`sessionStorage`; ticket de socket permanece em memória e segue apenas no
subprotocolo.

Uma PWA antiga pode permanecer em cache com protocolo incompatível. O cliente
futuro deve enviar versão/build/assets, recusar mismatch claramente e prever
atualização forçada do service worker antes de entrar em uma sala.

## Limites atuais e roadmap

`CombatWorld` e `FighterRuntime` exportam o estado competitivo completo
necessário ao hash canônico da fase 2: posições, velocidades, vida, rounds,
timers, comandos, golpe ativo, hit-stop/stun, projéteis, grabs, sequências e
eventos. Execuções repetidas e diferentes cadências de render foram validadas.
Ainda não existe import/restore desse estado, replay persistido ou rollback.
Como inputs por frame também não são persistidos no Durable Object, uma perda
de backlog durante a luta encerra a partida de forma neutra.

Roadmap:

1. servidor-base, protocolo e cliente lockstep beta local — concluídos;
2. staging privado e medição de RTT P50/P95 no Brasil;
3. restauração integral, checkpoints e replay persistido;
4. decisão medida entre input delay adaptativo e rollback;
5. autoridade, anticheat e resultado competitivo;
6. matchmaking, observabilidade e operação pública.

Veja também [a arquitetura detalhada](../docs/MULTIPLAYER_SERVER_ARCHITECTURE.md).
