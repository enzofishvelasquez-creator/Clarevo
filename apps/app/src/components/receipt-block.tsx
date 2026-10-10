import { NOTA_FLOW_TEXT, NOTA_TEXT, SEFAZ_TEXT, noteGaps, noteReadLine, type IsoDate, type ReceiptDraft } from '@clarevo/core';
import { QrCode } from 'lucide-react-native';
import { View } from 'react-native';

import { SefazStatus } from '@/components/receipt-scan';
import { Banner, LinkButton, Txt } from '@/components/ui';
import { colors, fonts, space } from '@/theme/tokens';

export type SefazState = 'idle' | 'reading' | 'done' | 'failed';

/**
 * O bloco "Nota lida" que ocupa o lugar da linha "Escanear nota fiscal" depois da leitura: o que foi lido (loja ou CNPJ, estado,
 * data ou mês), o que a nota não trouxe (valor e dia, ditos com clareza para a leitura não parecer falha), a nota de teste e a de mês
 * futuro, a leitura da página da Sefaz, os links "Ver a nota no site da Sefaz", "Ler outra nota" e "Desfazer leitura" e, para
 * NF-e, "Comprou no carnê ou crediário? Anotar como parcelamento". Nada foi salvo: o texto diz para conferir e tocar em Salvar.
 * É uma região viva: a leitura é anunciada ("Nota lida") por leitores de tela.
 */
export function NoteBlock({
  draft,
  issuedOn,
  amountEmpty,
  dayEmpty,
  descriptionEmpty,
  sefaz,
  sefazMessage,
  webLinkOnly,
  onOpenSefaz,
  onReadAnother,
  onUndo,
  onInstallments,
}: {
  draft: ReceiptDraft;
  issuedOn: IsoDate | null;
  /** O campo Valor está vazio: a mensagem do valor que falta vale. */
  amountEmpty: boolean;
  dayEmpty: boolean;
  descriptionEmpty: boolean;
  sefaz: SefazState;
  sefazMessage: string | null;
  /** Na web a página da Sefaz não pode ser lida (CORS): só o link oficial. */
  webLinkOnly: boolean;
  onOpenSefaz: () => void;
  onReadAnother: () => void;
  onUndo: () => void;
  onInstallments: () => void;
}) {
  const gaps = noteGaps(draft, issuedOn);
  return (
    <Banner tone="info" icon={QrCode}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
        {noteReadLine(draft, issuedOn)}
      </Txt>
      {!gaps.amount && !gaps.day ? <Txt variant="label">{NOTA_TEXT.filled}</Txt> : null}
      {draft.testNote ? <Txt variant="label">{draft.testNote}</Txt> : null}
      {draft.futureNote ? <Txt variant="label">{draft.futureNote}</Txt> : null}
      <SefazStatus state={sefaz} message={sefazMessage} />
      {amountEmpty && gaps.amount ? <Txt variant="label">{gaps.amount}</Txt> : null}
      {dayEmpty && gaps.day ? <Txt variant="label">{gaps.day}</Txt> : null}
      {gaps.dayAssumed ? <Txt variant="label">{gaps.dayAssumed}</Txt> : null}
      {descriptionEmpty && gaps.storeName ? <Txt variant="label">{gaps.storeName}</Txt> : null}
      {draft.officialUrl && webLinkOnly ? <Txt variant="caption" color={colors.textSecondary}>{SEFAZ_TEXT.webOnlyLink}</Txt> : null}
      {draft.officialUrl ? <LinkButton label={NOTA_TEXT.viewOnSefaz} style={linkStyle} onPress={onOpenSefaz} /> : null}
      {draft.model === '55' ? <LinkButton label={NOTA_TEXT.installmentsHint} style={linkStyle} onPress={onInstallments} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] }}>
        <LinkButton label={NOTA_FLOW_TEXT.readAgain} style={linkStyle} onPress={onReadAnother} />
        <LinkButton label={NOTA_FLOW_TEXT.undoRead} style={linkStyle} onPress={onUndo} />
      </View>
    </Banner>
  );
}

const linkStyle = { alignSelf: 'flex-start', paddingHorizontal: 0 } as const;
