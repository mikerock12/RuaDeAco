# Publicação na Google Play

Tudo o que a Play Console pede para o Rua de Aço, pronto para copiar.
Pacote: `com.mikerock12.ruadeaco` · versão `1.0.0` (versionCode 3).

## 1. Arquivos

| Arquivo | Uso |
| --- | --- |
| `rua-de-aco-1.0.0.aab` (assinado com a chave de upload) | Enviar na Play Console (Versões) |
| `rua-de-aco-1.0.0.apk` (assinado) | Instalar direto no celular para testar |
| `rua-de-aco-upload.jks` + senha | Chave de upload. Guardar em dois lugares seguros. Nunca no Git. |
| `play-store/graphics/icon-512.png` | Ícone do app (512 × 512) |
| `play-store/graphics/feature-graphic-1024x500.png` | Recurso gráfico |
| `play-store/screenshots/*.png` | Capturas de tela (1280 × 720, paisagem) |

Política de privacidade (URL pública):
`https://mikerock12.github.io/RuaDeAco/privacidade.html`

### Como os arquivos são gerados

O Android é compilado no GitHub Actions (`.github/workflows/android-release.yml`): em PR
só compila; em push no `master` (ou manualmente) também cria a tag `android-v<versionName>`
e um pré-lançamento na página de Releases. Sem segredos configurados, o AAB e o APK saem
**sem assinatura** e são assinados depois com a chave de upload:

```bash
# AAB
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore rua-de-aco-upload.jks \
  rua-de-aco-release.aab rua-de-aco-upload
# APK (apksigner do Android SDK; também serve a ferramenta SignApk baseada em apksig)
apksigner sign --ks rua-de-aco-upload.jks --ks-key-alias rua-de-aco-upload rua-de-aco-release.apk
```

Para o workflow já entregar assinado, crie em *Settings → Secrets and variables → Actions*:
`RUA_UPLOAD_KEYSTORE_B64` (o .jks em base64), `RUA_UPLOAD_STORE_PASSWORD` e
`RUA_UPLOAD_KEY_PASSWORD` (a mesma senha).

O pacote é otimizado: R8 e remoção de recursos no invólucro nativo, divisão do AAB por
densidade/idioma/ABI, música só em OGG no Android (o MP3 fica só como reserva da web), e as
ilustrações antigas e notas de design saíram de `public/`.

## 2. Ficha da loja (Presença na loja → Ficha principal)

**Nome do app** (até 30): `Rua de Aço`

**Descrição curta** (até 80):
`Luta 2D em pixel art 16-bit: 6 lutadores, 3 arenas, finalizações e online.`

**Descrição completa** (até 4000):

```
Rua de Aço é um jogo de luta 2D em pixel art no estilo dos fliperamas dos anos 90.

• 6 lutadores com golpes, especiais e agarrões próprios: Rafa Maré, Guto Barba, Noir Reflexo, Astro Riso, Dante Sinal e Léo Violeta.
• 3 arenas vivas: o Cais da Cidade à noite, a Cozinha Macabra da bruxa e o Sítio ensolarado.
• Finalizações de arena: vença a luta e agarre o rival para jogá-lo ao monstro do cais, no panelão da bruxa ou no tridente do mascarado do galpão.
• Melhor de três rounds, modo contra CPU, dois jogadores no mesmo aparelho e treinamento com caixas de colisão.
• Multiplayer online por sala privada com código: chame um amigo e lutem em tempo real.
• Controles de toque pensados para o celular, com suporte a teclado e controle (gamepad).
• Sem anúncios e sem compras.

Escolha seu lutador e domine a Rua de Aço.
```

**Categoria**: Jogo → Luta · **Tags**: Luta, Arcade, Pixel art, Multijogador
**E-mail de contato**: maicon.nunes11@gmail.com · **Site**: https://mikerock12.github.io/RuaDeAco/

## 3. Conteúdo do app (Política → Conteúdo do app)

**Política de privacidade**: a URL acima.

**Anúncios**: Não, o app não contém anúncios.

**Acesso ao app**: Todas as funcionalidades estão disponíveis sem restrições (sem login).

**Público-alvo**: 16–17 e 18+. Não é direcionado a crianças (a violência das finalizações
torna o jogo inadequado para menores). Isso também evita as exigências da política Famílias.

**Classificação de conteúdo (questionário IARC)** — responder com sinceridade:
- Categoria: Jogo.
- Violência: sim; personagens humanos lutando; violência com sangue; mortes retratadas
  nas finalizações (ser devorado, cozido em panelão, empalado num tridente), em pixel art.
- Medo/terror: sim, leve (bruxa, monstro, mascarado).
- Linguagem imprópria, sexo, drogas, apostas: não.
- Interação entre usuários: sim, multijogador online por código de sala, sem chat de texto ou voz.
- Compartilha localização: não. Compras digitais: não.

Classificação esperada: **16 anos (ClassInd)** / PEGI 16 / ESRB Mature 17+ (o resultado vem do questionário).

**Segurança dos dados**:
- O app coleta ou compartilha dados de usuário? **Sim** (somente no modo online opcional).
- Tipo: *Atividade no app → Outras ações do usuário* (comandos da partida online).
- Coletado: sim · Compartilhado com terceiros: não · Processado de forma temporária: sim
  (descartado ao fim da sala) · Obrigatório: não, opcional (só no modo online).
- Finalidade: Funcionalidade do app.
- Criptografado em trânsito: sim. Pedido de exclusão: os dados são apagados automaticamente.
- Nenhum outro tipo (localização, informações pessoais, financeiras, contatos, fotos,
  identificadores do dispositivo) é coletado.

**Apps de notícias, saúde, governo, financeiros**: não se aplica.

## 4. Versão

1. *Configurar → Assinatura de apps*: aceitar a Assinatura de apps do Google Play (a Google
   guarda a chave de distribuição; a nossa é a chave de upload).
2. Contas pessoais criadas depois de nov/2023 precisam de um **teste fechado com pelo menos
   12 testadores ativos por 14 dias seguidos** antes de liberar a Produção. Caminho:
   *Testar → Teste fechado → Criar faixa*, enviar o AAB, adicionar uma lista de e-mails de
   testadores e publicar. Depois dos 14 dias, *Produção → Solicitar acesso*.
   (Contas de organização podem ir direto para Produção.)
3. Notas da versão (pt-BR):

```
Primeira versão: 6 lutadores, 3 arenas com finalizações, modo contra CPU, dois jogadores, treinamento e online por sala privada.
```

4. *Países*: Brasil (e outros, se quiser). *Preço*: gratuito.
5. Revisar e lançar. A primeira análise da Google costuma levar de algumas horas a alguns dias.
