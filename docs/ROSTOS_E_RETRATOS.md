# Rostos e retratos — revisão 09/10/2026

O elenco atual usa corpos completos inspirados no protótipo `RuaDeAco-spritesheets-v2-RASCUNHO/`.
Os rostos de Rafa, Noir, Astro, Dante e Léo são fictícios. Guto Barba é baseado no autor:
seu rosto, retrato e folhas de luta foram preservados. O acabamento discreto de luz fria
acontece na apresentação e não modifica os pixels originais.

| Lutador | Visual atual |
| --- | --- |
| Rafa Maré | cabelo castanho espetado, regata turquesa, bermuda azul-marinho, tatuagem de onda e tênis cinza/branco |
| Noir Reflexo | fedora preto, sobretudo carvão, camisa branca, gravata vermelha e sapatos pretos |
| Astro Riso | capuz de bobo roxo com estrelas douradas, jaqueta turquesa, calça roxa e botas douradas |
| Dante Sinal | capuz preto, visor verde, roupa escura e tênis com detalhes verdes; sem barba |
| Léo Violeta | cabelo preto, faixa e luvas roxas, regata preta, bermuda roxa e botas brancas/roxas |

Retratos de menu, seleção, HUD, versus e resultado são `PortraitAsset`. Eles são exportados
separadamente a partir do novo quadro idle, com recortes próprios em `assetManifest.ts`.
Nunca se usam retratos como corpos de luta ou vice-versa.

## Pipeline atual

`npm run assets:characters` exporta as fontes v4 com alpha binário, escala uniforme por
atlas e nearest-neighbor, atualiza o registro de poses aéreas, mede os pontos do agarrão
e suas inclinações e exporta os cinco retratos. Usa Python com Pillow/NumPy e Node.
Fontes, prompts e manifestos estão em `art-source/fighters/redesign-v4/`.

`scripts/faces/` e `art-source/fighters/faces-v3/` são históricos da revisão de 07/10.
Não executar o restyle antigo nos novos corpos. `npm run assets:grab` rejeita a exportação
legada quando existe o manifesto v4, impedindo que corpos antigos substituam os atuais.

Confira [REDESIGN_PERSONAGENS_V4.md](REDESIGN_PERSONAGENS_V4.md) para reprodução e validação.
