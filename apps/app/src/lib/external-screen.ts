import { AppState } from 'react-native';

/**
 * "O app abriu uma tela de fora": a câmera, a galeria e o recorte do sistema, o seletor de arquivos (inclusive o Google Drive), a folha de
 * compartilhar, a compra na loja, as configurações do aparelho e o pedido de biometria ou senha do sistema. No Android, essas telas
 * deixam o app "em segundo plano"; sem esta marca, a biometria ao abrir (components/device-features.tsx) travava o app na volta de uma
 * foto que levou mais de um minuto. Enquanto a contagem passa de zero, a ida para segundo plano não conta como sair do app. Só na memória.
 */
let open = 0;

/** Há uma tela de fora aberta pelo app agora? */
export function externalScreenOpen(): boolean {
  return open > 0;
}

/**
 * Para uma tela de fora cuja promessa só termina na volta ao app (seletores, câmera, compartilhar, compra, biometria): conta do começo ao
 * fim, mesmo se falhar.
 */
export async function withExternalScreen<T>(run: () => Promise<T>): Promise<T> {
  open += 1;
  try {
    return await run();
  } finally {
    open = Math.max(0, open - 1);
  }
}

/** Sem a ida para segundo plano neste tempo, a tela de fora não abriu (o pedido falhou ou o sistema não tinha o que mostrar). */
const NO_LEAVE_MS = 5_000;

/**
 * Para uma tela de fora aberta sem esperar a volta (as configurações do aparelho, cuja promessa termina assim que elas abrem): conta até o
 * app voltar ao primeiro plano depois de sair, ou por alguns segundos, se ele nem chegar a sair.
 */
export function openingExternalScreen(): void {
  open += 1;
  let left = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    open = Math.max(0, open - 1);
    clearTimeout(timer);
    sub.remove();
  };
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background') left = true;
    else if (state === 'active' && left) finish();
  });
  const timer = setTimeout(() => {
    if (!left) finish();
  }, NO_LEAVE_MS);
}
