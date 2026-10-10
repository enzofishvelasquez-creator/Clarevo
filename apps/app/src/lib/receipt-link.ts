import { Linking, Platform } from 'react-native';

/**
 * Endereço oficial da Sefaz de notas lidas nesta sessão, pelo resumo da chave (`receiptKey`). Fica SÓ em memória: o registro
 * guarda apenas o resumo da chave (o endereço leva a chave inteira, que numa nota de pessoa física carrega o CPF do emitente) e
 * o app não o grava em lugar nenhum. Por isso "Ver a nota no site da Sefaz" no detalhe do gasto salvo vale logo depois de
 * anotar, na mesma sessão; depois, é preciso ler o QR de novo.
 */
const links = new Map<string, string>();

export const receiptLinks = {
  remember(digest: string, officialUrl: string | null) {
    if (officialUrl) links.set(digest, officialUrl);
  },
  get(digest: string | null | undefined): string | null {
    return digest ? (links.get(digest) ?? null) : null;
  },
  clear() {
    links.clear();
  },
};

/**
 * Abre o endereço oficial no navegador (web: nova aba sem referência). Devolve false se não deu para abrir.
 * Na web, `window.open(..., 'noopener')` sempre devolve null (não dá para saber se abriu), então abre-se por um link com
 * `rel="noopener noreferrer"` e `target="_blank"`: sem mensagem de erro falsa. Se o navegador bloquear a aba, o botão continua ali.
 */
export async function openOfficialUrl(url: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
