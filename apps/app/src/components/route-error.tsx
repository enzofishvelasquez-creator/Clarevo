import { SCREEN_ERROR_TEXT, screenFromSegments } from '@clarevo/core';
import { House, RotateCcw } from 'lucide-react-native';
import { useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FeedbackButton } from '@/components/feedback-button';
import { Button, Txt } from '@/components/ui';
import { APP_INFO } from '@/lib/app-info';
import { reportError } from '@/lib/crash-report';
import { colors, space } from '@/theme/tokens';

/**
 * Rede de segurança do app inteiro (teste com pessoas, 16/11/2026): o `ErrorBoundary` que `app/_layout.tsx` exporta para o expo-router.
 * Uma falha ao desenhar qualquer tela cai aqui, em vez de deixar a tela branca ou fechar o app.
 *
 * Fica no lugar do layout raiz inteiro, então desenha sem os provedores do app (sessão, dados, tema da navegação, área segura): só
 * componentes que não dependem deles. A falha vai para o relatório de falhas daqui (`reportError`), porque o erro pego por uma tela de erro
 * do React não passa pelo tratamento global. O caminho da tela sai dos segmentos da rota (`/orcamento/[categoria]`), nunca do endereço,
 * que pode ter o nome de uma categoria ou um código; é lido uma vez, quando a falha acontece.
 *
 * Os dois botões desenham o layout raiz de novo (`retry`). Quando o layout raiz cai aqui, a navegação desmonta e esquece as telas abertas,
 * então o app recomeça do início: confere a sessão em "carregando" e segue para o Resumo. Nada de `router.replace` daqui: com a navegação
 * desmontada, o pedido iria para fora de qualquer tela de erro e fecharia o app.
 */
/** Quando o app abriu (o módulo carrega com o layout raiz). */
const STARTED_AT = Date.now();
/** Uma falha nos primeiros segundos de uma atualização pelo ar baixada: o app fecha para o expo-updates voltar à versão anterior. */
const UPDATE_ROLLBACK_MS = 10_000;

export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const segments = useSegments();
  const [screen] = useState(() => screenFromSegments(segments));

  useEffect(() => {
    reportError(error, screen);
    // A falha no primeiro desenho deixaria a tela de abertura na frente desta (o expo-router só a esconde em falhas não tratadas).
    void SplashScreen.hideAsync().catch(() => {});
    // Uma atualização pelo ar que falha logo ao abrir: a falha segue como fatal, para o expo-updates voltar à versão que funcionava (com a
    // tela de erro, ele não perceberia). Só no celular, só com uma atualização baixada e só nos primeiros segundos.
    const g = globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void } };
    if (APP_INFO.native && APP_INFO.embedded === false && Date.now() - STARTED_AT < UPDATE_ROLLBACK_MS) g.ErrorUtils?.getGlobalHandler?.()(error, true);
  }, [error, screen]);

  const again = () => {
    void retry();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space[6], paddingVertical: space[10] }}>
      <View accessibilityRole="alert" style={{ gap: space[4], width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <Txt variant="title" accessibilityRole="header">
          {SCREEN_ERROR_TEXT.title}
        </Txt>
        <Txt color={colors.textSecondary}>{SCREEN_ERROR_TEXT.body}</Txt>
        <Button label={SCREEN_ERROR_TEXT.retry} icon={RotateCcw} onPress={again} />
        <Button label={SCREEN_ERROR_TEXT.home} icon={House} tone="soft" onPress={again} />
        <FeedbackButton label={SCREEN_ERROR_TEXT.report} screen={screen} tone="ghost" />
      </View>
    </ScrollView>
  );
}
