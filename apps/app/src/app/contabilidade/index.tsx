import { ACCOUNTING_TEXT, ERROR_TEXT, BUSINESS_PROFILE_LABEL, deviceTimeZone, todayIn, type AccountingBusiness } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight, Store } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AccountingNeutral, AccountingPending, AccountingShell } from '@/components/accounting-parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ErrorState } from '@/components/states';
import { Txt, styles as ui } from '@/components/ui';
import { useAccounting } from '@/state/business';
import { colors, fonts, radius, space } from '@/theme/tokens';

const A = ACCOUNTING_TEXT;

/**
 * "Negócios que você acompanha" (D-123, Clarevo Plus; pronto e desligado): os negócios em que a pessoa é da Contabilidade, fora dos espaços
 * dela (não entram no seletor). Cada linha diz o nome, quem administra (primeiro nome) e desde quando, e abre o negócio
 * (/contabilidade/[id]). Com o Plus fechado, ou sem negócio acompanhado, o estado vazio neutro e a volta para Conta.
 */
export default function ContabilidadeScreen() {
  const accounting = useAccounting();
  const [notice] = useFlash();

  // Enquanto a chave do Plus não chega (ou a lista guardada está vazia e está sendo lida de novo), o quadro neutro.
  if (accounting.isPending || (accounting.isFetching && (accounting.data?.businesses.length ?? 0) === 0)) return <AccountingPending />;
  if (accounting.isError) {
    // A falha também fica no quadro neutro: a tela pode ter sido aberta pelo endereço com o Plus fechado.
    return (
      <AccountingShell title={A.pendingTitle} pill={false}>
        <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => accounting.refetch()} />
      </AccountingShell>
    );
  }
  const list = accounting.data.businesses;
  if (!accounting.data.plusOpen || list.length === 0) return <AccountingNeutral />;

  return (
    <AccountingShell title={A.title}>
      <FlashBanner message={notice} />
      <Txt color={colors.textSecondary}>{A.intro}</Txt>
      <View style={{ gap: space[3] }}>
        {list.map((b) => (
          <AccountingRow key={b.id} business={b} />
        ))}
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {A.privacy}
      </Txt>
    </AccountingShell>
  );
}

/** Uma linha: o nome, quem administra, o tipo (se houver) e desde quando a pessoa acompanha; abre o negócio. */
function AccountingRow({ business }: { business: AccountingBusiness }) {
  const since = todayIn(deviceTimeZone(), new Date(business.since));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={A.rowA11y(business.name, business.adminName, since)}
      onPress={() => router.push({ pathname: '/contabilidade/[id]', params: { id: business.id } })}
      style={(st) => [ui.card, styles.row, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={styles.icon}>
        <Store size={20} color={colors.brandText} aria-hidden />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
          {business.name}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {A.rowAdmin(business.adminName)}
        </Txt>
        {business.businessProfile ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {BUSINESS_PROFILE_LABEL[business.businessProfile]}
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textSecondary}>
          {A.rowSince(since)}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 72 },
  icon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
