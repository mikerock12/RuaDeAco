# Sítio

Arena ensolarada adaptada da foto fornecida. Selecionável em CPU, versus local, treino e online. P1 escolhe a fase compartilhada; trocar cancela o pronto dos dois. Publicar o Worker com as três arenas antes de publicar o cliente.

## Vida no cenário

Duas galinhas, dois patos, uma cobra e um lagarto estão sempre presentes. Galinhas param para botar ovos. Cobra e lagarto procuram e comem ovos, alternando a preferência para garantir a participação dos dois. Os répteis se encontram, se enfrentam brevemente e se afastam. A fauna não causa dano aos lutadores.

São seis animais, seis posições reutilizáveis de ovos e cinco partículas de poeira. Não são criados objetos continuamente. O tempo e o sorteio são separados da simulação de combate e do hash online. A ambientação congela na pausa offline e é descartada ao sair. Cada cliente online pode ter detalhes decorativos diferentes sem alterar a luta.

## Arte e áudio

Método: imagegen integrado, com a foto como referência. [Prompts completos](../art-source/stages/sitio/prompts.json). A adaptação preserva o galpão e a vegetação, abre o terreiro para a luta e usa luz clara, quente e pixel art. Animais gerados em folhas transparentes separadas.

- Foto original: `art-source/stages/sitio/reference.jpg`.
- Fontes: `background-source.png`, `birds-source.png`, `reptiles-source.png`, na mesma pasta.
- Exportação técnica: `npm run assets:sitio`; recorte por célula, alinhamento dos pés, escala uniforme por espécie e nearest-neighbor.
- Finais: `public/assets/stages/sitio/`, fundo 640 × 360 e quatro folhas de quatro quadros 64 × 48. Cerca de 695 KiB de PNGs.
- Trilha original: `art-source/audio/sitio-original.mp3`, cerca de 139,6 segundos.
- Jogo: `public/assets/audio/music/sitio.mp3` e `sitio.ogg`, em loop. MP3 preserva o áudio e remove a capa; OGG usa Vorbis qualidade 4. Originais ficam fora do precache.

## Validação

Unitários simulam dez minutos e verificam presença, postura, alimentação, encontro, briga e limites dos objetos. E2E de computador e celular observam as interações reais, trilha, pausa e saída sem resíduos. Online verifica as duas arenas novas, confirmação compartilhada e hashes iguais entre jogadores.
