import {
  COMPROVANTE_TEXT,
  NOTA_FLOW_TEXT,
  NOTA_TEXT,
  SEFAZ_TEXT,
  comprovanteGaps,
  comprovanteReadLine,
  noteGaps,
  noteReadLine,
  sefazPhoneHint,
  type ComprovanteDraft,
  type IsoDate,
  type LookalikeRecord,
  type ReceiptDraft,
} from '@clarevo/core';
import { FileText, Info, QrCode } from 'lucide-react-native';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { SefazStatus } from '@/components/receipt-scan';
import { Banner, Button, LinkButton, Txt } from '@/components/ui';
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
  readAnotherDisabled = false,
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
  /** A leitura de um PDF está em andamento: "Ler outra nota" espera. */
  readAnotherDisabled?: boolean;
  onUndo: () => void;
  onInstallments: () => void;
}) {
  const gaps = noteGaps(draft, issuedOn);
  const phoneHint = sefazPhoneHint(draft, issuedOn, webLinkOnly);
  return (
    <Banner tone="info" icon={QrCode}>
      {/* "Nota lida: Loja · RJ · R$ 87,40 · 06/10/2026 · Pix" (D-042): o valor segue "Ocultar valores". */}
      <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
        {noteReadLine(draft, issuedOn)}
      </MoneyTxt>
      {!gaps.amount && !gaps.day ? <Txt variant="label">{NOTA_TEXT.filled}</Txt> : null}
      {draft.testNote ? <Txt variant="label">{draft.testNote}</Txt> : null}
      {draft.futureNote ? <Txt variant="label">{draft.futureNote}</Txt> : null}
      <SefazStatus state={sefaz} message={sefazMessage} />
      {amountEmpty && gaps.amount ? <Txt variant="label">{gaps.amount}</Txt> : null}
      {dayEmpty && gaps.day ? <Txt variant="label">{gaps.day}</Txt> : null}
      {gaps.dayAssumed ? <Txt variant="label">{gaps.dayAssumed}</Txt> : null}
      {descriptionEmpty && gaps.storeName ? <Txt variant="label">{gaps.storeName}</Txt> : null}
      {draft.officialUrl && webLinkOnly ? <Txt variant="caption" color={colors.textSecondary}>{SEFAZ_TEXT.webOnlyLink}</Txt> : null}
      {phoneHint ? <Txt variant="caption" color={colors.textSecondary}>{phoneHint}</Txt> : null}
      {draft.officialUrl ? <LinkButton label={NOTA_TEXT.viewOnSefaz} style={linkStyle} onPress={onOpenSefaz} /> : null}
      {draft.model === '55' ? <LinkButton label={NOTA_TEXT.installmentsHint} style={linkStyle} onPress={onInstallments} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] }}>
        <LinkButton
          label={NOTA_FLOW_TEXT.readAgain}
          style={[linkStyle, readAnotherDisabled && { opacity: 0.45 }]}
          disabled={readAnotherDisabled}
          accessibilityState={{ disabled: readAnotherDisabled }}
          onPress={onReadAnother}
        />
        <LinkButton label={NOTA_FLOW_TEXT.undoRead} style={linkStyle} onPress={onUndo} />
      </View>
    </Banner>
  );
}

const linkStyle = { alignSelf: 'flex-start', paddingHorizontal: 0 } as const;

/**
 * O bloco "Comprovante lido" (D-051) que ocupa o lugar da linha de leitura depois de ler o PDF de um comprovante de Pix ou de
 * pagamento: "Comprovante lido: Pix enviado · Maria Souza · R$ 85,00 · 05/10/2026 às 14:32", o que o comprovante não trouxe (valor,
 * dia, nome), a mensagem que a pessoa escreveu nele, a frase de privacidade, "Ler outro comprovante" e "Desfazer leitura". Quando o
 * comprovante é do outro lado (um Pix recebido em Anotar gasto, um Pix enviado em Registrar recebimento), nada foi preenchido: o
 * bloco avisa e oferece a troca. Região viva: a leitura é anunciada. Nada foi salvo.
 */
export function ProofBlock({
  draft,
  mismatch,
  amountEmpty,
  dayEmpty,
  descriptionEmpty,
  onSwitch,
  onReadAnother,
  readAnotherDisabled = false,
  onUndo,
}: {
  draft: ComprovanteDraft;
  /** O comprovante é do outro lado: a frase, o botão de trocar e o tipo para onde vai. */
  mismatch: { text: string; action: string } | null;
  amountEmpty: boolean;
  dayEmpty: boolean;
  descriptionEmpty: boolean;
  onSwitch: () => void;
  onReadAnother: () => void;
  readAnotherDisabled?: boolean;
  onUndo: () => void;
}) {
  const gaps = comprovanteGaps(draft);
  return (
    <Banner tone="info" icon={FileText}>
      <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
        {comprovanteReadLine(draft)}
      </MoneyTxt>
      {mismatch ? (
        <>
          <Txt variant="label">{mismatch.text}</Txt>
          <Button label={mismatch.action} onPress={onSwitch} />
        </>
      ) : (
        <>
          {!gaps.amount && !gaps.day ? <Txt variant="label">{COMPROVANTE_TEXT.filled}</Txt> : null}
          {gaps.guessed ? <Txt variant="label">{gaps.guessed}</Txt> : null}
          {amountEmpty && gaps.amount ? <Txt variant="label">{gaps.amount}</Txt> : null}
          {dayEmpty && gaps.day ? <Txt variant="label">{gaps.day}</Txt> : null}
          {descriptionEmpty && gaps.name ? <Txt variant="label">{gaps.name}</Txt> : null}
          {draft.message ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {`${COMPROVANTE_TEXT.messageLabel}: ${draft.message}`}
            </Txt>
          ) : null}
        </>
      )}
      <Txt variant="caption" color={colors.textSecondary}>
        {COMPROVANTE_TEXT.privacy}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] }}>
        <LinkButton
          label={COMPROVANTE_TEXT.readAgain}
          style={[linkStyle, readAnotherDisabled && { opacity: 0.45 }]}
          disabled={readAnotherDisabled}
          accessibilityState={{ disabled: readAnotherDisabled }}
          onPress={onReadAnother}
        />
        <LinkButton label={COMPROVANTE_TEXT.undoRead} style={linkStyle} onPress={onUndo} />
      </View>
    </Banner>
  );
}

/**
 * "Parece já anotado em 05/10/2026: Padaria, R$ 85,00." com "Abrir registro" (D-051). Aviso por semelhança (mesmo valor e data a até
 * um dia de um registro do mesmo tipo): não bloqueia o salvamento. Os valores seguem "Ocultar valores".
 */
export function LookalikeBanner({ record, onOpen }: { record: LookalikeRecord; onOpen: () => void }) {
  return (
    <Banner tone="info" icon={Info}>
      <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
        {COMPROVANTE_TEXT.looksNoted(record.occurredOn, record.description, record.amountCents)}
      </MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {COMPROVANTE_TEXT.looksNotedHint}
      </Txt>
      <LinkButton label={NOTA_TEXT.openRecord} style={linkStyle} onPress={onOpen} />
    </Banner>
  );
}
