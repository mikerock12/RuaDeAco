# Rua de Aço - Beta Android

Este diretório contém o primeiro APK Beta do jogo Rua de Aço para dispositivos Android.

## O que é este APK?
Este arquivo (`Rua-de-Aco-Beta-0.2.0.apk`) é um aplicativo Android nativo construído usando Capacitor. Ele encapsula a versão web do jogo, permitindo que ele rode localmente no seu celular sem precisar de internet (offline), de forma idêntica a um aplicativo baixado na loja.

## Onde ele está?
O arquivo pode ser encontrado em: `release-android/Rua-de-Aco-Beta-0.2.0.apk`

## Como enviar ao celular?
1. Conecte seu dispositivo Android ao computador com um cabo USB e copie o arquivo para a memória do celular (ex: pasta `Downloads`).
2. Alternativamente, você pode usar serviços de nuvem como Google Drive, enviar por e-mail ou via Telegram/WhatsApp para si mesmo e baixar o arquivo no celular.

## Como instalar manualmente?
1. Abra um Gerenciador de Arquivos no seu Android e navegue até a pasta onde salvou o APK.
2. Toque no arquivo `Rua-de-Aco-Beta-0.2.0.apk`.
3. Siga as instruções do instalador na tela.

## Como autorizar temporariamente "instalar apps desconhecidos"?
Se o Android bloquear a instalação com a mensagem "Para sua segurança, o smartphone não tem permissão para instalar apps desconhecidos dessa fonte":
1. Toque em **Configurações** no alerta que aparecer.
2. Ative a opção **Permitir desta fonte** (ou similar).
3. Volte para a tela anterior e toque em **Instalar**.

## Como desinstalar?
Para desinstalar, proceda como qualquer outro aplicativo:
1. Pressione e segure o ícone do **Rua de Aço** na gaveta de aplicativos.
2. Toque em **Desinstalar** ou **Informações do App** e depois em **Desinstalar**.
3. Confirme a exclusão.

## Como atualizar para outro beta?
1. Caso receba uma nova versão com a mesma assinatura (como este APK de debug), basta baixar o novo APK e instalar por cima. Os dados salvos (como configurações de áudio no localStorage) não devem ser apagados.
2. Se houver problemas ao instalar por cima (ex: erro de assinatura divergente), desinstale a versão antiga antes de instalar a nova.

## Como gerar novamente?
Para compilar uma nova versão do APK, utilize o comando:
```bash
npm run android:apk
```

## Limitações deste APK
* **Assinatura de Debug**: Este APK está assinado automaticamente com uma chave de depuração. Ele é perfeito para testar em seu próprio aparelho e compartilhar com testadores internos, mas não será aceito para publicação oficial.
* **Não é o AAB**: O Google Play hoje em dia exige o formato `.aab` (Android App Bundle). O APK é útil principalmente para instalação manual.

## Diferença entre Debug, Release e AAB
* **Debug (este arquivo)**: Feito para testar rapidamente. Pode ser instalado diretamente no aparelho sem chaves complexas e permite fácil depuração.
* **Release (futuro)**: Versão polida, otimizada, e com log removido. Usa uma chave de assinatura de segurança permanente.
* **AAB**: É o formato de pacote que o Google Play Store requer para gerar APKs otimizados para diferentes aparelhos. Não pode ser instalado diretamente sem a ajuda do Google Play ou da ferramenta `bundletool`.

## Futura Assinatura de Produção
Antes de publicar o jogo final, será necessário gerar uma chave (Keystore) de produção com ferramentas como o `keytool`, guardá-la em segurança e configurar o `build.gradle` para realizar o `assembleRelease` ou `bundleRelease`. Nunca inclua essa chave no Git!
