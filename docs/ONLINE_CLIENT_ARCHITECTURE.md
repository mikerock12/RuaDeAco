# Arquitetura do cliente online — Fase 2

## Escopo

O modo online é uma beta privada de duas pessoas sobre o servidor Cloudflare
da Fase 1. Ele compartilha o mesmo `CombatWorld` do offline, mas entra por um
ramo explícito `mode: "online"` e usa lockstep com atraso fixo. Não há
rollback, estado autoritativo no servidor, ranking ou reconnect seguro durante
a luta.

```text
MainMenu → OnlineScene → sessão/sala WebSocket → seleção/ready
                                      │
                                      ▼ start comum
Input físico perfil 0 → bitmask → LockstepController → CombatWorld.step(P1,P2)
                                      │
                         hash canônico a cada 60 frames
                                      │
                                      ▼
                              relay / desync no GameRoom
```

## Configuração e ciclo de sessão

`VITE_MULTIPLAYER_URL` define a origem HTTP do Worker. Desenvolvimento usa
`http://127.0.0.1:8787` apenas como fallback; build de produção sem variável
mostra `SERVIDOR ONLINE NAO CONFIGURADO` e não tenta conectar.

`OnlineSession` é a única dona do `OnlineApiClient`, WebSocket, ping, offset do
relógio, estado de sala e listeners. O token convidado fica somente em
`sessionStorage`. O ticket de 45 segundos não entra no snapshot nem em hooks:
é usado em memória como `Sec-WebSocket-Protocol` e descartado. Requests usam
`no-store`, não incluem credenciais de navegador e têm timeout.

No lobby, queda inesperada tenta até três reconexões para a mesma sessão/slot.
Durante `starting`/`fighting`, a implementação não finge continuidade: sem
backlog persistido a partida termina como interrompida.

## OnlineScene

Estados visuais:

- home: saúde do serviço, criar sala, entrar com código ou voltar;
- join: código normalizado de dez caracteres e teclado virtual touch;
- lobby: código/cópia, P1/P2, conexão, quatro lutadores, seleção e ready.

O fundo é procedural e leve: estrelas fixas, Júpiter pixelado, estrada de aço
em perspectiva e um pool fixo de linhas binárias. A animação binária atualiza
aproximadamente a 4,5 Hz e para quando a página está oculta ou há preferência
por movimento reduzido. Não há asset online adicional.

## Contrato de input e lockstep

O protocolo representa `left`, `right`, `up`, `down`, `light`, `heavy`,
`special` e `block` em oito bits. `pressedMask` e `releasedMask` são derivados
da transição de `heldMask`; pause/confirm/cancel nunca seguem para o rival.
Cada lote contém de um a três frames consecutivos, com sequência e ACK.

O relógio de captura começa no `startAt` coordenado. Os primeiros
`inputDelay` frames são neutros; o default do servidor é 8 e o intervalo
aceito é 2–12. A simulação só avança quando os mapas local e remoto contêm o
mesmo frame elegível. Sem input rival, render e captura continuam, mas o mundo
estagna; com o lote faltante, retoma sem acumular passos de render.

O slot recebido no `start` define o mapeamento canônico:

| Slot local | argumento P1 de `CombatWorld.step` | argumento P2 |
|---|---|---|
| P1 | input local do perfil físico 0 | input remoto |
| P2 | input remoto | input local do perfil físico 0 |

## Determinismo e hashes

`CommandBuffer`, `FighterRuntime` e `CombatWorld` exportam estado competitivo
completo para hashing: relógios, round, posições/velocidades, vida/medidor,
estado e frames de animação, held/pressed/released, buffer de comandos, golpe e
instância de ataque, hits registrados, hit-stop/stuns, passivas, projéteis,
grabs, combos, sequências e eventos.

O serializador ordena chaves e normaliza números antes de FNV-1a 64-bit. O
cliente envia hash no frame 0 e depois a cada 60 frames simulados. Hashes
iguais avançam o checkpoint do servidor; um `desync`, lacuna de sequência,
transição impossível ou frame duplicado encerra sem vencedor.

O export ainda é unidirecional: não há restore. Por isso esta arquitetura
serve para input delay privado, não para rollback.

## Luta, pausa e resultado

`FightScene` mantém caminhos offline e online separados. Online:

- lê somente o perfil físico local 0;
- mostra slot, ping, frame, buffer e espera pelo rival;
- trata orientação/reload/background como interrupção segura;
- abre um overlay de pausa local que envia frames neutros e avisa que a luta
  continua;
- não concede vitória/derrota por abandono ou falha de rede.

`ResultScene` distingue partida concluída de interrupção neutra. O online não
oferece revanche nem grava estatísticas locais; permite voltar ao lobby ou ao
menu.

## Validação

Vitest cobre codec, batching/stall, papéis, duplicatas, desync, estado completo,
hashes longos nas 16 combinações do roster e cadências de render diferentes.
Playwright inicia Vite e Wrangler com secret efêmero, abre dois contexts
isolados do Chrome, exercita desktop e mobile touch, troca inputs reais,
confere fingerprint do mesmo start, ação dos dois slots, golpe, hash, pausa
local, reconexão/desconexão de lobby, erros seguros e abandono. Screenshots de
auditoria ficam somente em `tmp/online-audit/`.
