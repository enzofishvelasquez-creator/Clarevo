import { ACCOUNTS_TEXT, pickerShowsChips, pickerShownAccount, type FinancialAccount } from '@clarevo/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { ChoiceGroup } from '@/components/series-parts';
import { Chip, LinkButton, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/**
 * Seletor da conta de origem do dinheiro (D-043): "Saiu de" (gasto, pagamento de conta, pagamento de fatura e aporte), "Foi para"
 * (resgate) e "Entrou em" (recebimento). Mostra os chips das contas ativas, a principal primeiro e já marcada na abertura (quem
 * abre o formulário escolhe a inicial com `chooseAccountId`). Com uma conta só, mostra o nome como texto ("Saiu de: Conta principal"),
 * sem chip, a menos que haja o que escolher: `allowNone` junta "Sem conta" (aporte e resgate são informativos: a conta é opcional) e
 * um valor que não é a primeira conta (a arquivada de um registro antigo) também mostra os chips. O atalho "Gerenciar contas" leva
 * a Conta, onde se cadastra, renomeia, arquiva e escolhe a principal; os formulários abertos continuam como estão.
 * A conta só informa a origem: não existe saldo por conta, e nada aqui muda Recebido, Pago nem Ainda a pagar.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  label,
  error,
  allowNone = false,
  hideManage = false,
}: {
  /** As contas ativas (PersonalSpace.accounts). */
  accounts: readonly FinancialAccount[];
  /** Nulo = "Sem conta" (só com allowNone). */
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  error?: string;
  allowNone?: boolean;
  hideManage?: boolean;
}) {
  // Chips sempre que há o que escolher (mais de uma conta, "Sem conta" ou um valor que não é a primeira conta); senão, o nome como
  // texto, e o texto mostra a conta escolhida (value), não a primeira da lista.
  const showChips = pickerShowsChips(accounts, value, allowNone);
  const chosen = pickerShownAccount(accounts, value);
  return (
    <View style={{ gap: space[1] }}>
      {showChips ? (
        <ChoiceGroup label={label} error={error}>
          {allowNone ? <Chip label={ACCOUNTS_TEXT.none} selected={value === null} onPress={() => onChange(null)} /> : null}
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={value === a.id} onPress={() => onChange(a.id)} />
          ))}
        </ChoiceGroup>
      ) : (
        <View style={{ gap: space[1] }}>
          <Txt variant="label" accessibilityRole="text">
            {chosen ? ACCOUNTS_TEXT.single(label, chosen.name) : label}
          </Txt>
          {error ? (
            <Txt variant="label" color={colors.error} accessibilityRole="alert">
              {error}
            </Txt>
          ) : null}
        </View>
      )}
      {hideManage ? null : (
        <LinkButton
          label={ACCOUNTS_TEXT.manage}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          onPress={() => router.push({ pathname: '/conta', params: { secao: 'contas' } })}
        />
      )}
    </View>
  );
}
