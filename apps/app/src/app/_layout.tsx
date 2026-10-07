import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { afterLogin, signOutIntent } from '@/lib/nav';
import { SessionProvider, useSession } from '@/state/session';
import { SpaceStatusContext, type SpaceStatus } from '@/state/space-status';
import { ViewProvider } from '@/state/view';
import { colors, fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();


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
  const lastPath = useRef(pathname);
  const prevUser = useRef(user);

  const space = useQuery({
    queryKey: ['space', user?.id],
    queryFn: () => repo!.getSpace(),
    enabled: Boolean(user && repo && !recovery),
  });

  // Sessão encerrada sem a pessoa pedir (expirou): voltar à entrada e retomar o destino depois.
  useEffect(() => {
    if (prevUser.current && !user && !signOutIntent.consume()) afterLogin.set(lastPath.current);
    prevUser.current = user;
  }, [user]);
  useEffect(() => {
    if (user) lastPath.current = pathname;
  }, [pathname, user]);

  const status: SpaceStatus = !ready
    ? 'pendente'
    : !user
      ? 'sem-sessao'
      : space.isPending
        ? 'pendente'
        : space.isError
          ? 'erro'
          : space.data
            ? 'pronto'
            : 'sem-conta';

  const signedOut = ready && !user;
  const inRecovery = Boolean(user && recovery);

  return (
    <SpaceStatusContext value={{ status, retry: () => space.refetch() }}>
      <Stack
        screenOptions={{
          headerShown: false,
          headerTintColor: colors.brand,
          headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
          animation: 'default',
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
          <Stack.Screen name="composicao" options={{ headerShown: true, title: 'Composição' }} />
          <Stack.Screen name="quem-ve" options={{ headerShown: true, title: 'Quem vê estes dados?' }} />
          <Stack.Screen name="conta" options={{ headerShown: true, title: 'Conta' }} />
          <Stack.Screen name="explicacao/[tema]" options={{ headerShown: true, title: 'Aprender' }} />
        </Stack.Protected>
        <Stack.Screen name="carregando" />
        <Stack.Screen name="confirmado" />
        <Stack.Protected guard={signedOut || inRecovery}>
          <Stack.Screen name="nova-senha" />
        </Stack.Protected>
      </Stack>
    </SpaceStatusContext>
  );
}
