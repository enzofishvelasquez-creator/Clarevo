import { ERROR_TEXT, formatMonthBR, sortNewestFirst } from '@clarevo/core';
import { router } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { FamilyNotLinked } from '@/components/family-state';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextSwitch, MonthSwitcher } from '@/components/header';
import { RecordRow } from '@/components/record-row';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, TopInset, Txt } from '@/components/ui';
import { useMonthRecords, useSpace, useView } from '@/state/data';
import { colors, radius, space } from '@/theme/tokens';

export default function MovimentacoesScreen() {
  const { space: kind, month } = useView();
  const personal = useSpace().data;
  const contextId = kind === 'pessoal' ? personal?.personalContextId : undefined;
  const records = useMonthRecords(contextId, month);
  const list = records.data ? sortNewestFirst(records.data) : [];
  const [notice] = useFlash();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.brand} />
      <Screen>
        <View style={styles.head}>
          <Txt variant="title" color={colors.textOnBrand} style={{ fontSize: 24, lineHeight: 32, marginBottom: space[4] }} accessibilityRole="header">
            Movimentações
          </Txt>
          <ContextSwitch />
          <MonthSwitcher />
        </View>
        <View style={{ padding: space[6], gap: space[3] }}>
          <FlashBanner message={notice} />
          {kind === 'familia' ? (
            <FamilyNotLinked />
          ) : (
            <>
              <Button label="Anotar gasto" icon={Minus} onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa' } })} />
              <Button
                label="Registrar recebimento"
                icon={Plus}
                tone="soft"
                onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'receita' } })}
              />
              <Card style={{ marginTop: space[2] }}>
                {records.isPending ? (
                  <LoadingState />
                ) : records.isError ? (
                  <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => records.refetch()} />
                ) : list.length === 0 ? (
                  <EmptyState title={`Nenhum registro em ${formatMonthBR(month).toLowerCase()}`}>
                    Recebimentos e gastos já realizados aparecem aqui, do mais recente para o mais antigo.
                  </EmptyState>
                ) : (
                  list.map((r, i) => <RecordRow key={r.id} record={r} last={i === list.length - 1} onPress={() => router.push(`/registro/${r.id}`)} />)
                )}
              </Card>
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: colors.brand, padding: space[6], paddingBottom: space[4], borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
});
