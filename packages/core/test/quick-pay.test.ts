import { describe, expect, it } from 'vitest';
import { DEMO_TODAY, QUICK_PAY_TEXT, createDemoRepository, quickPayAction, quickPayDraft } from '../src';

describe('"Já paguei" na lista de Contas a pagar', () => {
  it('conta a vencer com valor fixo: pagamento hoje com o valor previsto; estimada: "Informar valor e pagar"', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const oct = await repo.listCommitments(ctx, '2026-10');
    const internet = oct.find((c) => c.description === 'Internet')!;
    expect(quickPayDraft(internet, DEMO_TODAY)).toEqual({ amountCents: 15_000, paidOn: DEMO_TODAY, category: 'Moradia' });
    expect(quickPayAction(internet, DEMO_TODAY)).toBe('pagar');
    // Vence hoje também entra.
    expect(quickPayDraft(internet, '2026-10-15')).toEqual({ amountCents: 15_000, paidOn: '2026-10-15', category: 'Moradia' });
    // Vencida: fica com a revisão de vencidas.
    expect(quickPayDraft(internet, '2026-10-16')).toBeNull();
    expect(quickPayAction(internet, '2026-10-16')).toBeNull();
    // Paga (aluguel de outubro).
    const aluguel = oct.find((c) => c.description === 'Aluguel')!;
    expect(aluguel.status).toBe('quitado');
    expect(quickPayDraft(aluguel, DEMO_TODAY)).toBeNull();
    expect(quickPayAction(aluguel, DEMO_TODAY)).toBeNull();
    // Estimada (luz de novembro).
    const luz = (await repo.listCommitments(ctx, '2026-11')).find((c) => c.description === 'Luz')!;
    expect(luz.amountIsEstimate).toBe(true);
    expect(quickPayDraft(luz, DEMO_TODAY)).toBeNull();
    expect(quickPayAction(luz, DEMO_TODAY)).toBe('informar');
  });

  it('textos do diálogo e nomes acessíveis', () => {
    expect(QUICK_PAY_TEXT.title('Luz')).toBe('Marcar Luz como paga hoje?');
    expect(QUICK_PAY_TEXT.line(18_000, '2026-10-08')).toBe('R$ 180,00 em 08/10/2026');
    expect([QUICK_PAY_TEXT.confirm, QUICK_PAY_TEXT.change, QUICK_PAY_TEXT.cancel]).toEqual(['Confirmar pagamento', 'Mudar valor ou data', 'Cancelar']);
    expect(QUICK_PAY_TEXT.button).toBe('Já paguei');
    expect(QUICK_PAY_TEXT.estimateButton).toBe('Informar valor e pagar');
    expect(QUICK_PAY_TEXT.a11y('Luz', '2026-10-12', '2026-10-08')).toBe('Já paguei Luz, vence 12/10');
    expect(QUICK_PAY_TEXT.a11y('Luz', '2026-10-08', '2026-10-08')).toBe('Já paguei Luz, vence hoje');
    expect(QUICK_PAY_TEXT.estimateA11y('Luz', '2026-11-12', '2026-10-08')).toBe('Informar valor e pagar Luz, vence 12/11');
    expect(QUICK_PAY_TEXT.done('Internet')).toBe('Internet marcada como paga.');
  });
});
