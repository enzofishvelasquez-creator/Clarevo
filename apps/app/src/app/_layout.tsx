import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FinanceProvider } from '@/state/finance';
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

  useEffect(() => {
    // Se a fonte falhar, segue com a fonte do sistema (alternativa prevista no CL-V001).
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <FinanceProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerTintColor: colors.brand,
            headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
            contentStyle: { backgroundColor: colors.background },
            headerBackButtonDisplayMode: 'minimal',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="anotar" options={{ title: 'Anotar gasto', presentation: 'modal' }} />
          <Stack.Screen name="composicao" options={{ title: 'Composição' }} />
          <Stack.Screen name="quem-ve" options={{ title: 'Quem vê estes dados?', presentation: 'modal' }} />
          <Stack.Screen name="fatura" options={{ title: 'Fatura sem contar duas vezes' }} />
        </Stack>
      </FinanceProvider>
    </SafeAreaProvider>
  );
}
