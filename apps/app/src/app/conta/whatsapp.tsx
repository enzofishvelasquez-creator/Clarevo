import { ChatLinkScreen } from '@/components/chat-link-screen';

/** Conta > WhatsApp (D-076): ligar o número da pessoa para anotar por mensagem escrita. A tela é a mesma do Telegram (chat-link-screen). */
export default function WhatsAppScreen() {
  return <ChatLinkScreen channel="whatsapp" />;
}
