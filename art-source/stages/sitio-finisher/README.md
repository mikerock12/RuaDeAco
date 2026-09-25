# Finalização do Sítio — fontes

Arte pixel autoral desenhada pixel a pixel em grades de texto, sem geração
por imagem. Cada caractere é uma cor de `palette.json`; `.` é transparente.

- `masked-farmer.txt` — mascarado do galpão, três poses de 32 × 72, vista lateral olhando para a direita.
- `trident.txt` — tridente vertical de 16 × 72, raiz na base do cabo, pontas para cima.
- `../cozinha-macabra/skull-bones.txt` — caveira e ossos que sobram no panelão (32 × 24).

`npm run assets:finisher` rasteriza as grades em PNG (`public/assets/stages/...`).
As portas do galpão não têm arquivo: são recortes da própria textura do fundo
(`sitio/background.png`), registrados em tempo de execução pelo `SitioStageView`.
