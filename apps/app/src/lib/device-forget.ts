import { cancelAllReminders } from '@/lib/device';
import { forgetPrefs } from '@/lib/device-prefs';
import { forgetNotePrefs } from '@/lib/note-prefs';
import { forgetFirstSteps } from '@/lib/onboarding';

/**
 * Depois de excluir a conta (D-058): o que este aparelho guardava da pessoa sai também. As preferências (lembretes, ocultar valores,
 * biometria, a memória de categorias da importação), a memória de lojas e de nomes das notas e comprovantes, o fechamento do card
 * "Primeiros passos" e os lembretes já agendados no aparelho. Nunca falha: sem armazenamento, não há o que apagar.
 */
export async function forgetDevice(userId: string): Promise<void> {
  forgetPrefs(userId);
  forgetNotePrefs(userId);
  forgetFirstSteps(userId);
  try {
    await cancelAllReminders();
  } catch {
    // Sem permissão ou sem lembretes agendados: nada a cancelar.
  }
}
