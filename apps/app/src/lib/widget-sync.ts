import { deviceTimeZone, monthOf, nextLocalMidnight, planWidgetSync, summarizeToPay, todayIn, type RecordsRepository } from '@clarevo/core';

import { widgetAvailable, writeWidget, type WidgetWrite } from '@/lib/widget-bridge';

/**
 * Widget da tela inicial (D-063 item 3, Ciclo AA): grava para o widget nativo o `WidgetSnapshot` do núcleo (`planWidgetSync`). Roda ao
 * abrir o app, ao voltar para ele, depois de cada escrita e da geração do dia dos gastos fixos, ao mudar "Mostrar valores no widget" e ao
 * entrar ou sair da conta (components/device-features.tsx, junto com os lembretes, D-025). O que vale é decidido no núcleo:
 * valores ocultos por padrão, sem o nome da conta quando ocultos, só o contexto Pessoal, e na demonstração nada é gravado.
 *
 * Sem widget nativo neste aparelho (web, Expo Go, build sem `CLAREVO_WIDGET=1`), nada acontece: não lê as contas, não grava, não pede
 * nada ao sistema e nunca lança erro.
 */

export type WidgetJob =
  /** Sem sessão (saiu da conta, a sessão expirou ou a conta foi excluída): o widget passa a dizer "Entre no Clarevo para ver". */
  | { kind: 'signed-out' }
  /** Conta de demonstração: nada é gravado. */
  | { kind: 'demo' }
  /** Com sessão: lê as contas a pagar do Pessoal e grava o resumo. */
  | { kind: 'signed-in'; repo: RecordsRepository; contextId: string; showValues: boolean };

/**
 * A última gravação feita com sucesso (o texto e a virada do dia do aparelho), só na memória. O mesmo par não é gravado de novo: o iOS
 * limita os recarregamentos do widget por dia, e o app pede a gravação a cada escrita. O texto leva o dia (`builtOn`), então o primeiro
 * pedido de cada dia sempre grava; a virada entra porque o iOS guarda a meia-noite do aparelho na linha do tempo, e uma troca de fuso no
 * mesmo dia a muda sem mudar o texto.
 */
let lastWritten: string | null = null;

async function write(plan: WidgetWrite, now: Date): Promise<void> {
  const key = `${plan.json}|${nextLocalMidnight(now).getTime()}`;
  if (key === lastWritten) return;
  await writeWidget(plan, now);
  lastWritten = key;
}

async function apply(job: WidgetJob): Promise<void> {
  if (job.kind === 'demo' || !widgetAvailable()) return;
  const now = new Date();
  const today = todayIn(deviceTimeZone(), now);
  if (job.kind === 'signed-out') {
    const plan = planWidgetSync({ today, signedIn: false, demo: false, showValues: false, toPay: null });
    if (plan.write) await write(plan, now);
    return;
  }
  // Mês de hoje: todas as contas com vencimento no mês e todas as abertas de outros meses (a mesma leitura dos lembretes).
  const month = monthOf(today);
  const list = await job.repo.listCommitments(job.contextId, month);
  const plan = planWidgetSync({
    today,
    signedIn: true,
    demo: false,
    showValues: job.showValues,
    toPay: summarizeToPay(list, job.contextId, month, today),
  });
  if (plan.write) await write(plan, now);
}

/** Uma execução por vez; pedidos que chegam durante uma execução viram um só, com o pedido mais recente. */
let running = false;
let queued: WidgetJob | null = null;

export function queueWidget(job: WidgetJob) {
  queued = job;
  if (running) return;
  running = true;
  void (async () => {
    while (queued) {
      const next = queued;
      queued = null;
      try {
        await apply(next);
      } catch {
        // Falha de rede ou do sistema: o widget fica como estava (e vira "sem dados" sozinho em outro dia); o próximo gatilho tenta de novo.
      }
    }
    running = false;
  })();
}
