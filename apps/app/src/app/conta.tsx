import {
  BUSINESS_TEXT,
  COMPANY_TEXT,
  DELETE_TEXT,
  EXPORT_TEXT,
  FAMILY_ROLE_LABEL,
  FAMILY_TEXT,
  FEEDBACK_TEXT,
  LEGAL_TEXT,
  SUPPORT_TEXT,
  TELEGRAM_BOT,
  TELEGRAM_IN_ACCOUNT,
  TELEGRAM_TEXT,
  WHATSAPP_IN_ACCOUNT,
  WHATSAPP_NUMBER,
  WHATSAPP_TEXT,
  appVersionLine,
  type SitePage,
} from '@clarevo/core';
import {
  AlertCircle,
  Building2,
  Check,
  FileDown,
  FileText,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Store,
  Trash2,
  Users,
} from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { ConfirmDialog } from '@/components/dialog';
import { AccessCard } from '@/components/access-parts';
import { AccountsCard } from '@/components/accounts-card';
import { BenefitCard } from '@/components/benefit-card';
import { FeedbackButton } from '@/components/feedback-button';
import { PrivacyCard, RemindersCard, WidgetCard } from '@/components/device-settings';
import { FlashBanner, useFlash } from '@/components/flash';
import { SubHeader } from '@/components/header';
import { ProfileAvatar, ProfilePhotoActions } from '@/components/profile-photo';
import { LevelBadge, LevelCard } from '@/components/level-parts';
import { SignupSourceAccountCard } from '@/components/signup-source';
import { ThemeCard } from '@/components/theme-card';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, Screen, Txt } from '@/components/ui';
import { useWideLayout } from '@/lib/layout';
import { APP_INFO } from '@/lib/app-info';
import { AuthError, RESEND_INTERVAL_SECONDS } from '@/lib/auth';
import { signOutIntent } from '@/lib/nav';
import { SITE_URL, openLicensesPage, openSitePage, openSupportEmail } from '@/lib/site';
import { useCompanies } from '@/state/company';
import { useWork } from '@/state/data';
import { useBusiness } from '@/state/business';
import { useFamily } from '@/state/family';
import { useSession } from '@/state/session';
import { useAccountLevel } from '@/state/access';
import { colors, fonts, space } from '@/theme/tokens';

/** Os títulos das seções de Conta (auditoria visual de 18/11/2026): só texto, sem papel de título (os cards seguem no nível 2). */
const ACCOUNT_SECTIONS = { plan: 'Plano e espaços', device: 'Este aparelho', data: 'Dados e segurança', help: 'Ajuda e conta' } as const;

/** Título curto de uma seção de Conta, acima dos cards dela. */
function SectionTitle({ children }: { children: string }) {
  return (
    <Txt variant="label" color={colors.textSecondary} style={{ fontFamily: fonts.bold, marginTop: space[3], marginBottom: -space[1], letterSpacing: 0.3 }}>
      {children}
    </Txt>
  );
}

/** Computador: as notas pequenas dos cards param em 560 px (revisão visual de 23/11/2026: com 680 px, a linha passava de 110 letras). */
const NOTE_WIDE = { maxWidth: 560 } as const;

/** O botão da página de licenças (D5). O texto fica aqui, e não em LEGAL_TEXT, porque core/legal.ts vai nas funções do servidor. */
const LICENSES_LABEL = 'Licenças de código aberto';

type Msg = { tone: 'erro' | 'sucesso' | 'info'; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const color = msg.tone === 'erro' ? colors.error : msg.tone === 'sucesso' ? colors.successText : colors.text;
  return (
    <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Check}>
      <Txt variant="label" color={color}>
        {msg.text}
      </Txt>
    </Banner>
  );
}

/** Conta: perfil, suas contas (origem do dinheiro, D-043), segurança, lembretes, privacidade neste aparelho e situação do acesso ao plano. */
export default function ContaScreen() {
  const { user, auth, signOut } = useSession();
  const level = useAccountLevel();
  const personal = useWork().data;
  const family = useFamily();
  const business = useBusiness();
  const companies = useCompanies();
  // Avisos das telas de contas ("Conta adicionada.", "Conta salva."): lidos uma única vez, quando esta tela abre.
  const [notice] = useFlash();
  const [securityMsg, setSecurityMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'senha' | 'sessoes' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [confirmAll, setConfirmAll] = useState(false);
  const [siteFailed, setSiteFailed] = useState(false);
  const [supportFailed, setSupportFailed] = useState(false);
  // ?secao=lembretes (vindo de Contas a pagar) ou ?secao=contas (o atalho "Gerenciar contas de origem" dos seletores): rola até o card.
  const { secao } = useLocalSearchParams<{ secao?: string }>();
  const note = useWideLayout() ? NOTE_WIDE : undefined;
  const scroll = useRef<ScrollView>(null);
  const [remindersY, setRemindersY] = useState<number | null>(null);
  const [accountsY, setAccountsY] = useState<number | null>(null);
  useEffect(() => {
    const y = secao === 'lembretes' ? remindersY : secao === 'contas' ? accountsY : null;
    if (y !== null) scroll.current?.scrollTo({ y: Math.max(0, y - space[4]), animated: false });
  }, [secao, remindersY, accountsY]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Alterar a senha pelo mesmo caminho seguro da recuperação: link no e-mail da conta. */
  const changePassword = async () => {
    if (!user || busy || cooldown > 0) return;
    setBusy('senha');
    setSecurityMsg(null);
    try {
      await auth.requestPasswordReset(user.email);
      setCooldown(RESEND_INTERVAL_SECONDS);
      setSecurityMsg({
        tone: 'info',
        text: auth.mode === 'demo' ? 'Demonstração: nenhum e-mail é enviado.' : `A Clarevo enviou um link para ${user.email}. Abra o link para definir a nova senha.`,
      });
    } catch (e) {
      if (e instanceof AuthError && e.code === 'aguarde' && e.retryAfterSeconds) setCooldown(e.retryAfterSeconds);
      else setSecurityMsg({ tone: 'erro', text: 'Não foi possível enviar agora. Tente de novo em instantes.' });
    } finally {
      setBusy(null);
    }
  };

  /** "Privacidade e termos" (D-064): abre a página do site no navegador; se não abrir, avisa no próprio card. */
  const openSite = async (page: SitePage) => {
    setSiteFailed(false);
    if (!(await openSitePage(page))) setSiteFailed(true);
  };

  /** "Ajuda e contato": abre o e-mail com o endereço do suporte; se não abrir, avisa no próprio card (o endereço já está escrito nele). */
  const writeSupport = async () => {
    setSupportFailed(false);
    if (!(await openSupportEmail())) setSupportFailed(true);
  };

  const signOutEverywhere = async () => {
    setBusy('sessoes');
    signOutIntent.mark();
    try {
      await signOut('global');
    } catch {
      // A saída não aconteceu: a marca de "saída pedida" não pode valer para um fim de sessão futuro.
      signOutIntent.consume();
      setBusy(null);
      setConfirmAll(false);
      setSecurityMsg({ tone: 'erro', text: 'Não foi possível sair em todos os aparelhos agora. Confira a internet e tente de novo.' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Conta" />
      <Screen scrollRef={scroll} contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        {/* O perfil, com as iniciais no círculo e, no canto, o selo pequeno do nível da conta (D-095), como no gov.br. */}
        <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[4] }}>
          <View style={{ width: 56, height: 56 }} aria-hidden>
            <ProfileAvatar size={56} />
            {level ? (
              <View style={{ position: 'absolute', right: -4, bottom: -4, borderRadius: 12, borderWidth: 2, borderColor: colors.surface }}>
                <LevelBadge level={level} size={20} />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
          <Txt variant="title">{user?.displayName}</Txt>
          <Txt color={colors.textSecondary}>{user?.email}</Txt>
          <ProfilePhotoActions />
          {auth.mode === 'demo' ? (
            <>
              <Txt variant="caption" color={colors.textSecondary} style={note}>
                Demonstração: acesso simulado e dados fictícios, guardados só neste aparelho enquanto o app está aberto.
              </Txt>
              <TopicLink slug="demonstracao" label="O que é a demonstração?" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            </>
          ) : null}
        </View>
        </Card>
        {/* Sugestão ou problema (teste com pessoas, 16/11/2026): logo abaixo do perfil, para quem testa achar sem procurar. O e-mail vai com a
            versão do app e o aparelho, sem nada da conta (FEEDBACK_TEXT, lib/feedback.ts). */}
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {FEEDBACK_TEXT.title}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {FEEDBACK_TEXT.hint}
          </Txt>
          <FeedbackButton label={FEEDBACK_TEXT.button} screen="/conta" />
        </Card>
        <LevelCard />

        {/* Ordem de Conta (docs/10 A23; auditoria visual de 18/11/2026: 17 cards numa coluna só), em seções com títulos curtos: o perfil,
            "Enviar sugestão ou problema" e o nível; "Plano e espaços" (a assinatura e, logo depois dela, o Espaço Negócio e a Família, D-113b,
            o benefício e o painel da empresa); "Este aparelho" (lembretes, privacidade, tema e, só no celular, o widget); "Dados e segurança"
            (segurança, Telegram e WhatsApp, bancos e carteira, exportar e a origem do cadastro); e "Ajuda e conta" (ajuda, termos, sair e
            excluir). */}
        <SectionTitle>{ACCOUNT_SECTIONS.plan}</SectionTitle>
        {/* Assinatura (D-083): a situação do acesso (teste, só ver e exportar, plano, benefício ou Família) e a tela com os planos. */}
        <AccessCard />

        {/* Espaço Negócio (D-113): para quem tem CNPJ ou trabalha por conta; criar, ver o negócio (Seu negócio), mudar o nome e encerrar. */}
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {BUSINESS_TEXT.accountTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {business.data ? BUSINESS_TEXT.accountHintIn(business.data.name) : BUSINESS_TEXT.accountHintNone}
          </Txt>
          <Button
            label={business.data ? BUSINESS_TEXT.accountOpen : BUSINESS_TEXT.accountCreate}
            icon={Store}
            tone="soft"
            accessibilityLabel={business.data ? `${BUSINESS_TEXT.accountOpen}, ${business.data.name}` : undefined}
            onPress={() => router.push(business.data ? '/negocio' : '/negocio/novo')}
          />
        </Card>

        {/* Família (D-055): criar, convidar e administrar; abre a tela Família. */}
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {FAMILY_TEXT.accountTitle}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {family.data ? FAMILY_TEXT.accountHintIn(family.data.context.name, family.data.role) : FAMILY_TEXT.accountHintNone}
          </Txt>
          <Button
            label={family.data ? FAMILY_TEXT.accountOpen : FAMILY_TEXT.accountCreate}
            icon={Users}
            tone="soft"
            accessibilityLabel={family.data ? `${FAMILY_TEXT.accountOpen}, ${FAMILY_ROLE_LABEL[family.data.role]}` : undefined}
            onPress={() => router.push('/familia')}
          />
        </Card>

        {/* Benefício pela empresa (D-056): o que a empresa oferece, ou onde colar o link do convite. */}
        <BenefitCard />

        {/* Painel da empresa (D-056): só na web e só para quem administra uma organização; no celular nada aparece. */}
        {Platform.OS === 'web' && (companies.data?.length ?? 0) > 0 ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {COMPANY_TEXT.accountTitle}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary} style={note}>
              {COMPANY_TEXT.accountHint}
            </Txt>
            <Button label={COMPANY_TEXT.accountOpen} icon={Building2} tone="soft" onPress={() => router.push('/empresa')} />
          </Card>
        ) : null}

        <SectionTitle>{ACCOUNT_SECTIONS.device}</SectionTitle>
        <View onLayout={(e) => setRemindersY(e.nativeEvent.layout.y)}>
          <RemindersCard />
        </View>
        <PrivacyCard />
        {/* Tema (D-112): Igual ao aparelho, Claro ou Escuro, só neste aparelho. */}
        <ThemeCard />
        {/* Sem widget no navegador: o card só aparece no app para celular (auditoria de 18/11/2026). */}
        {Platform.OS === 'web' ? null : <WidgetCard />}
        <SectionTitle>{ACCOUNT_SECTIONS.data}</SectionTitle>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Segurança
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {LEGAL_TEXT.whoSees.security}
          </Txt>
          <Message msg={securityMsg} />
          <Button
            label={cooldown > 0 ? `Alterar senha (novo envio em ${cooldown} s)` : 'Alterar senha'}
            icon={KeyRound}
            tone="soft"
            disabled={cooldown > 0}
            busy={busy === 'senha'}
            busyLabel="Enviando…"
            onPress={changePassword}
          />
          <Button label="Sair em todos os aparelhos" icon={MonitorSmartphone} tone="soft" onPress={() => setConfirmAll(true)} />
        </Card>

        {/* Telegram (D-080): o mesmo, com o bot da Clarevo. Só em conta real, com o bot, e só depois do piloto fechado (no piloto, a tela
            abre pelo link /conta/telegram). */}
        {auth.mode !== 'demo' && TELEGRAM_BOT !== null && TELEGRAM_IN_ACCOUNT ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {TELEGRAM_TEXT.cardTitle}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary} style={note}>
              {TELEGRAM_TEXT.cardBody}
            </Txt>
            <Button label={TELEGRAM_TEXT.cardOpen} icon={MessageCircle} tone="soft" onPress={() => router.push('/conta/telegram')} />
          </Card>
        ) : null}

        {/* WhatsApp (D-076): anotar por mensagem escrita. Só em conta real, com o número da Clarevo, e só depois do piloto fechado (no
            piloto, a tela abre pelo link /conta/whatsapp). */}
        {auth.mode !== 'demo' && WHATSAPP_NUMBER !== null && WHATSAPP_IN_ACCOUNT ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {WHATSAPP_TEXT.cardTitle}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary} style={note}>
              {WHATSAPP_TEXT.cardBody}
            </Txt>
            <Button label={WHATSAPP_TEXT.cardOpen} icon={MessageCircle} tone="soft" onPress={() => router.push('/conta/whatsapp')} />
          </Card>
        ) : null}

        <View onLayout={(e) => setAccountsY(e.nativeEvent.layout.y)}>
          <AccountsCard contextId={personal?.contextId} canWrite={personal?.canWrite ?? true} />
        </View>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {EXPORT_TEXT.entry}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {EXPORT_TEXT.entryHint}
          </Txt>
          <Button label={EXPORT_TEXT.entryButton} icon={FileDown} tone="soft" accessibilityLabel={EXPORT_TEXT.entryA11y} onPress={() => router.push('/conta/exportar')} />
        </Card>

        {/* "Como você conheceu o Clarevo?" (D-067): opcional, só em conta real; a pessoa vê e muda a resposta. */}
        <SignupSourceAccountCard />

        <SectionTitle>{ACCOUNT_SECTIONS.help}</SectionTitle>
        {/* Ajuda e contato: o canal para dúvidas, problemas e pedidos sobre os dados, com ou sem o site publicado. */}
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {SUPPORT_TEXT.title}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {SUPPORT_TEXT.hint}
          </Txt>
          {supportFailed ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error}>
                {SUPPORT_TEXT.writeFailed}
              </Txt>
            </Banner>
          ) : null}
          <Button label={SUPPORT_TEXT.write} icon={Mail} tone="soft" onPress={writeSupport} />
        </Card>

        {/* Privacidade e termos (D-064): só quando `EXPO_PUBLIC_SITE_URL` aponta para o site publicado; sem endereço, nada é desenhado. */}
        {SITE_URL ? (
          <Card style={{ gap: space[3] }}>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {LEGAL_TEXT.account.title}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary} style={note}>
              {LEGAL_TEXT.account.hint}
            </Txt>
            {siteFailed ? (
              <Banner tone="erro" icon={AlertCircle}>
                <Txt variant="label" color={colors.error}>
                  {LEGAL_TEXT.account.openFailed}
                </Txt>
              </Banner>
            ) : null}
            <Button label={LEGAL_TEXT.account.privacy} icon={ShieldCheck} tone="soft" onPress={() => openSite('privacidade')} />
            <Button label={LEGAL_TEXT.account.terms} icon={FileText} tone="soft" onPress={() => openSite('termos')} />
            <Button label={LEGAL_TEXT.account.deletion} icon={Trash2} tone="soft" onPress={() => openSite('exclusao')} />
            {/* Licenças de código aberto (D5): a página do site com a lista dos pacotes do app. */}
            <Button
              label={LICENSES_LABEL}
              icon={FileText}
              tone="soft"
              onPress={async () => {
                setSiteFailed(false);
                if (!(await openLicensesPage())) setSiteFailed(true);
              }}
            />
          </Card>
        ) : null}

        <Button
          label="Sair da conta"
          icon={LogOut}
          tone="soft"
          onPress={() => {
            signOutIntent.mark();
            signOut();
          }}
        />
        <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          Você sai só neste aparelho. Seus registros continuam guardados.
        </Txt>

        {/* Excluir minha conta (D-058): o último item de Conta, sem destaque de alerta. A tela seguinte explica o que é apagado. */}
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {DELETE_TEXT.entry}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={note}>
            {DELETE_TEXT.entryHint}
          </Txt>
          <Button label={DELETE_TEXT.entryButton} icon={Trash2} tone="soft" accessibilityLabel={DELETE_TEXT.entryA11y} onPress={() => router.push('/conta/excluir')} />
        </Card>
        {/* A versão do app, para quem testa dizer qual está usando (docs/50_ATUALIZACOES.md): no celular, com o build e a atualização. */}
        <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }} selectable>
          {appVersionLine(APP_INFO, APP_INFO.native)}
        </Txt>
      </Screen>

      <ConfirmDialog
        visible={confirmAll}
        title="Sair em todos os aparelhos?"
        cancelLabel="Cancelar"
        confirmLabel="Sair de todos"
        confirmTone="brand"
        busy={busy === 'sessoes'}
        onCancel={() => setConfirmAll(false)}
        onConfirm={signOutEverywhere}>
        <Txt color={colors.textSecondary}>Você vai precisar entrar de novo em todos os aparelhos, inclusive neste. Seus registros continuam guardados.</Txt>
      </ConfirmDialog>
    </View>
  );
}
