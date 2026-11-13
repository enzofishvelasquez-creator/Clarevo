import { cancelAllReminders } from '@/lib/device';
import { forgetPrefs } from '@/lib/device-prefs';
import { forgetLevelSeen } from '@/lib/level-seen';
import { forgetNotePrefs } from '@/lib/note-prefs';
import { forgetFirstSteps } from '@/lib/onboarding';
import { forgetSignupSourcePrefs } from '@/lib/signup-source-prefs';
import { forgetStoreUse } from '@/lib/store-purchases';
import { queueWidget } from '@/lib/widget-sync';

/**
 * Depois de excluir a conta (D-058): o que este aparelho guardava da pessoa sai também. As preferências (lembretes, ocultar valores,
 * biometria, a memória de categorias da importação), a memória de lojas e de nomes das notas e comprovantes, o fechamento do card
 * "Primeiros passos", o último nível da conta já comemorado (D-095), o dia de uso e o "Agora não" de "Como você conheceu o Clarevo?", a marca de que a loja foi usada aqui (D-090), os lembretes já agendados no aparelho e o que o widget da tela inicial mostrava (passa a dizer "Entre no Clarevo
 * para ver"; D-063 item 3). Nunca falha: sem armazenamento, não há o que apagar.
 */
export async function forgetDevice(userId: string): Promise<void> {
  forgetPrefs(userId);
  forgetNotePrefs(userId);
  forgetFirstSteps(userId);
  forgetSignupSourcePrefs(userId);
  await forgetStoreUse(userId);
  await forgetLevelSeen(userId);
  queueWidget({ kind: 'signed-out' });
  try {
    await cancelAllReminders();
  } catch {
    // Sem permissão ou sem lembretes agendados: nada a cancelar.
  }
}
