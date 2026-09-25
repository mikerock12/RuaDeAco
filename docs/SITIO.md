# Sítio

Arena ensolarada adaptada da foto fornecida. Selecionável em CPU, versus local, treino e online. P1 escolhe a fase compartilhada; trocar cancela o pronto dos dois. Publicar o Worker com as três arenas antes de publicar o cliente.

## Vida no cenário

Duas galinhas, dois patos, uma cobra e um lagarto estão sempre presentes. Galinhas param para botar ovos. Cobra e lagarto procuram e comem ovos, alternando a preferência para garantir a participação dos dois. Os répteis se encontram, se enfrentam brevemente e se afastam. A fauna não causa dano aos lutadores.

São seis animais, seis posições reutilizáveis de ovos e cinco partículas de poeira. Não são criados objetos continuamente. O tempo e o sorteio são separados da simulação de combate e do hash online. A ambientação congela na pausa offline e é descartada ao sair. Cada cliente online pode ter detalhes decorativos diferentes sem alterar a luta.

## Finalização

Adicionada em 25/09/2026, no mesmo estilo das outras arenas: na segunda derrota o perdedor fica tonto e o vencedor tem oito segundos para agarrar com fraco + forte. Sequência, em frames desde o agarrão:

| Frames | Acontece |
| --- | --- |
| 0–59 | levantamento do agarrão; no 30 as portas do galpão começam a ranger e a abrir para dentro |
| 62 | o mascarado com tridente aparece na abertura escura, encarando o vencedor |
| 60–112 | o corpo é arremessado em arco, dá uma cambalhota e cai de costas sobre as pontas do tridente |
| 112–150 | estocada: respingos, espasmos, o mascarado firma o peso |
| 150–232 | o corpo cede e pende de leve; sangue escorre pelo cabo |
| 232–282 | o mascarado recua para a sombra do galpão e as portas se fecham; batida no 282 |

O vencedor recua alguns passos entre os frames 84 e 132 quando está a menos de 150 px do galpão, para não cobrir a cena. Faixa final: "A COLHEITA ESTA FEITA". A fauna congela durante a cena.

As portas não têm arquivo próprio: `SitioStageView` registra dois recortes da parede do galpão na textura do fundo (`SHED` em `stageFinisher.ts`, x 271–384, y 129–216) e os abre encolhendo cada folha para a dobradiça enquanto escurecem. O mascarado (três poses de 32 × 72) e o tridente (16 × 56) são arte pixel autoral desenhada em grades de texto em `art-source/stages/sitio-finisher/`; `npm run assets:finisher` rasteriza `public/assets/stages/sitio/masked-farmer.png` e `trident.png`. O corpo empalado é o sprite `grabbed-lifted` da própria vítima em escala 0,42, desenhado entre o mascarado e as pontas.

Sons sintetizados: rangido de madeira, estocada e porta batendo. Detalhes comuns e validação em [AGARRAO_FINALIZACAO_CAIS.md](AGARRAO_FINALIZACAO_CAIS.md).

## Arte e áudio

Método: imagegen integrado, com a foto como referência. [Prompts completos](../art-source/stages/sitio/prompts.json). A adaptação preserva o galpão e a vegetação, abre o terreiro para a luta e usa luz clara, quente e pixel art. Animais gerados em folhas transparentes separadas.

- Foto original: `art-source/stages/sitio/reference.jpg`.
- Fontes: `background-source.png`, `birds-source.png`, `reptiles-source.png`, na mesma pasta.
- Exportação técnica: `npm run assets:sitio`; recorte por célula, alinhamento dos pés, escala uniforme por espécie e nearest-neighbor.
- Finais: `public/assets/stages/sitio/`, fundo 640 × 360, quatro folhas de quatro quadros 64 × 48 e os adereços da finalização (`masked-farmer.png`, `trident.png`). Cerca de 696 KiB de PNGs.
- Trilha original: `art-source/audio/sitio-original.mp3`, cerca de 139,6 segundos.
- Jogo: `public/assets/audio/music/sitio.mp3` e `sitio.ogg`, em loop. MP3 preserva o áudio e remove a capa; OGG usa Vorbis qualidade 4. Originais ficam fora do precache.

## Validação

Unitários simulam dez minutos e verificam presença, postura, alimentação, encontro, briga e limites dos objetos. E2E de computador e celular observam as interações reais, trilha, pausa e saída sem resíduos. Online verifica as duas arenas novas, confirmação compartilhada e hashes iguais entre jogadores.
