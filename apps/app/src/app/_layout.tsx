// Só os pesos usados (importar o pacote inteiro levaria todos os pesos para o app).
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { router, Stack, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DeviceFeatures } from '@/components/device-features';
import { afterLogin, restoreTarget, signOutIntent } from '@/lib/nav';
import { SessionProvider, useSession } from '@/state/session';
import { SpaceStatusContext, type SpaceStatus } from '@/state/space-status';
import { ViewProvider } from '@/state/view';
import { colors, fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * Telas do app que podem ser abertas direto pelo endereço (atalhos do ícone na versão web instalada, link salvo ou
 * página recarregada). As telas de entrada, de confirmação e de nova senha ficam fora.
 */
const ENTRY_PATH =
  /^\/(registro\/(novo|[^/]+(\/editar)?)|a-pagar(\/[^/]+(\/(editar|pagar))?)?|gastos-fixos(\/[^/]+(\/(editar|encerrar|informar))?)?|calcular(\/[a-z0-9-]+)?|retomar(\/(atualizar|pagar))?|composicao|renda-comprometida(\/referencia)?|cartoes(\/(novo|[^/]+(\/(editar|fatura\/\d{4}-\d{2}(\/(pagar|encargo|estorno))?))?))?|reserva|meta\/(nova|[^/]+(\/(editar|movimento))?)|guardar(\/minima)?|simular|conta|quem-ve|explicacao\/[a-z0-9-]+|movimentacoes|metas|aprender)\/?$/;

/**
 * Endereço pedido ao abrir a versão web. Sem sessão (ou enquanto a sessão é conferida), as rotas protegidas levam à
 * entrada ou à tela de carregamento, e o endereço se perderia. Ele fica só em memória (nunca no aparelho) e é retomado
 * quando o espaço da pessoa estiver pronto. Parâmetros de links de e-mail (código, token) nunca entram.
 */
function readEntryTarget(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return null;
  const { pathname, search } = window.location;
  if (!ENTRY_PATH.test(pathname)) return null;
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) if (/token|code|type|error/i.test(key)) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Lido uma vez, ao carregar o app, antes de a navegação trocar o endereço. */
let entryTarget = readEntryTarget();

/**
 * Devolve o endereço guardado uma única vez. Fica fora dos componentes de propósito: o React Compiler trata variáveis
 * do módulo como constantes dentro de componentes e efeitos, e leria o valor já apagado.
 */
function takeEntryTarget(): string | null {
  const target = entryTarget;
  entryTarget = null;
  return target;
}
const hasEntryTarget = () => entryTarget !== null;

/** Abas: substituem a pilha. As demais telas abrem por cima do Resumo, para que voltar, cancelar ou descartar cheguem a ele. */


export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 }, mutations: { retry: 0 } } }),
  );

  useEffect(() => {
    // Leitores de tela na web precisam do idioma da página.
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = 'pt-BR';
      // O anel de foco aparece ao navegar pelo teclado e some no toque ou clique.
      const style = document.createElement('style');
      style.textContent = '*:focus:not(:focus-visible) { outline: none !important; }';
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    // Se a fonte falhar, segue com a fonte do sistema (alternativa prevista no CL-V001).
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ViewProvider>
            <StatusBar style="light" />
            <Navigation />
          </ViewProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Rotas protegidas: sem sessão só a entrada existe; com sessão sem conta, só "Sua primeira conta";
 * com conta, o app. A autorização dos dados acontece no banco; aqui só organizamos a navegação.
 */
function Navigation() {
  const { ready, user, recovery, repo } = useSession();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const lastPath = useRef(pathname);
  const prevUser = useRef(user);

  const space = useQuery({
    queryKey: ['space', user?.id],
    queryFn: () => repo!.getSpace(),
    enabled: Boolean(user && repo && !recovery),
  });

  // Sessão encerrada sem a pessoa pedir (expirou): voltar à entrada e retomar o destino depois,
  // só se a mesma pessoa entrar de novo.
  useEffect(() => {
    if (prevUser.current && !user && !signOutIntent.consume()) {
      afterLogin.set(lastPath.current, prevUser.current.id);
      // As rotas protegidas já saíram da pilha; levar a pessoa direto para Entrar.
      setTimeout(() => router.replace('/entrar'), 0);
    }
    prevUser.current = user;
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
    ).toString();
    lastPath.current = query ? `${pathname}?${query}` : pathname;
  }, [pathname, params, user]);

  // Navegação entre telas respeita "reduzir movimento".
  const reduceMotion = useReducedMotion();

  // Dados já carregados prevalecem: uma falha de atualização em segundo plano não tira a pessoa da tela.
  const status: SpaceStatus = !ready
    ? 'pendente'
    : !user
      ? 'sem-sessao'
      : space.data
        ? 'pronto'
        : space.isPending
          ? 'pendente'
          : space.isError
            ? 'erro'
            : 'sem-conta';

  const signedOut = ready && !user;
  const inRecovery = Boolean(user && recovery);

  // Endereço pedido ao abrir a versão web: depois de entrar (ou de conferir a sessão), a pessoa chega à tela pedida.
  // Roda depois de "carregando" decidir o destino (efeitos do pai rodam depois dos do filho), então prevalece.
  useEffect(() => {
    if (!user || inRecovery || status !== 'pronto' || !hasEntryTarget()) return;
    const target = takeEntryTarget();
    if (!target) return;
    restoreTarget(target);
  }, [status, user, inRecovery]);

  return (
    <SpaceStatusContext value={{ status, retry: () => space.refetch() }}>
      <Stack
        screenOptions={{
          headerShown: false,
          headerTintColor: colors.brand,
          headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
          animation: reduceMotion ? 'none' : 'default',
        }}>
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="boas-vindas" />
          <Stack.Screen name="criar-conta" />
          <Stack.Screen name="confirmar-email" />
          <Stack.Screen name="entrar" />
          <Stack.Screen name="recuperar-acesso" />
        </Stack.Protected>
        <Stack.Protected guard={!inRecovery && status === 'sem-conta'}>
          <Stack.Screen name="primeira-conta" />
        </Stack.Protected>
        <Stack.Protected guard={!inRecovery && status === 'pronto'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="registro/novo" />
          <Stack.Screen name="registro/[id]/index" />
          <Stack.Screen name="registro/[id]/editar" />
          <Stack.Screen name="a-pagar/index" />
          <Stack.Screen name="a-pagar/nova" />
          {/* Rota estática: tem precedência sobre a-pagar/[id]. */}
          <Stack.Screen name="a-pagar/vencidas" />
          <Stack.Screen name="a-pagar/[id]/index" />
          <Stack.Screen name="a-pagar/[id]/editar" />
          <Stack.Screen name="a-pagar/[id]/pagar" />
          <Stack.Screen name="gastos-fixos/index" />
          <Stack.Screen name="gastos-fixos/novo" />
          <Stack.Screen name="gastos-fixos/[id]/index" />
          <Stack.Screen name="gastos-fixos/[id]/editar" />
          <Stack.Screen name="gastos-fixos/[id]/encerrar" />
          <Stack.Screen name="gastos-fixos/[id]/informar" />
          <Stack.Screen name="composicao" />
          <Stack.Screen name="quem-ve" />
          <Stack.Screen name="conta" />
          <Stack.Screen name="explicacao/[tema]" />
          <Stack.Screen name="calcular/index" />
          <Stack.Screen name="calcular/[slug]" />
          {/* Renda comprometida (D-026) e renda de referência. */}
          <Stack.Screen name="renda-comprometida/index" />
          <Stack.Screen name="renda-comprometida/referencia" />
          {/* Metas e reserva para imprevistos (D-027). /meta/nova é rota estática e tem precedência sobre /meta/[id]. */}
          <Stack.Screen name="reserva" />
          <Stack.Screen name="meta/nova" />
          <Stack.Screen name="meta/[id]/index" />
          <Stack.Screen name="meta/[id]/editar" />
          <Stack.Screen name="meta/[id]/movimento" />
          {/* Plano de guardar (D-036): "Sim, consigo" e a reserva mínima de "Agora não". */}
          <Stack.Screen name="guardar/index" />
          <Stack.Screen name="guardar/minima" />
          {/* Simulador (D-028): só conta, nada é gravado. */}
          <Stack.Screen name="simular" />
          {/* Cartões de crédito (D-037). /cartoes/novo é rota estática e tem precedência sobre /cartoes/[id]. */}
          <Stack.Screen name="cartoes/index" />
          <Stack.Screen name="cartoes/novo" />
          <Stack.Screen name="cartoes/[id]/index" />
          <Stack.Screen name="cartoes/[id]/editar" />
          <Stack.Screen name="cartoes/[id]/fatura/[mes]/index" />
          <Stack.Screen name="cartoes/[id]/fatura/[mes]/pagar" />
          <Stack.Screen name="cartoes/[id]/fatura/[mes]/encargo" />
          <Stack.Screen name="cartoes/[id]/fatura/[mes]/estorno" />
          {/* Seus últimos meses (D-030): resumo, passo a passo e registrar e pagar uma conta sem registro. */}
          <Stack.Screen name="retomar/index" />
          <Stack.Screen name="retomar/atualizar" />
          <Stack.Screen name="retomar/pagar" />
        </Stack.Protected>
        <Stack.Screen name="carregando" />
        <Stack.Screen name="confirmado" />
        <Stack.Protected guard={signedOut || inRecovery}>
          <Stack.Screen name="nova-senha" />
        </Stack.Protected>
      </Stack>
      {/* Lembretes, ocultar valores e biometria ao abrir (A2). */}
      <DeviceFeatures />
    </SpaceStatusContext>
  );
}
