import { cancelAllReminders } from '@/lib/device';
import { forgetPrefs } from '@/lib/device-prefs';
import { forgetNotePrefs } from '@/lib/note-prefs';
import { forgetFirstSteps } from '@/lib/onboarding';
import { queueWidget } from '@/lib/widget-sync';

/**
 * Depois de excluir a conta (D-058): o que este aparelho guardava da pessoa sai também. As preferências (lembretes, ocultar valores,
 * biometria, a memória de categorias da importação), a memória de lojas e de nomes das notas e comprovantes, o fechamento do card
 * "Primeiros passos", os lembretes já agendados no aparelho e o que o widget da tela inicial mostrava (passa a dizer "Entre no Clarevo
 * para ver"; D-063 item 3). Nunca falha: sem armazenamento, não há o que apagar.
 */
export async function forgetDevice(userId: string): Promise<void> {
  forgetPrefs(userId);
  forgetNotePrefs(userId);
  forgetFirstSteps(userId);
  queueWidget({ kind: 'signed-out' });
  try {
    await cancelAllReminders();
  } catch {
    // Sem permissão ou sem lembretes agendados: nada a cancelar.
  }
}
