import { describe, expect, it } from 'vitest';
import { DEMO_PILL_MAX_FONT_SCALE, STACK_BELOW_WIDTH, STACK_FROM_FONT_SCALE, clampedLines, isStackedLayout } from '../src';

describe('letra grande (D-062 item 5)', () => {
  it('a linha empilha em tela estreita (menos de 360 px) ou com letra acima de 1,3; no limite, não', () => {
    expect(STACK_BELOW_WIDTH).toBe(360);
    expect(STACK_FROM_FONT_SCALE).toBe(1.3);
    expect(isStackedLayout(390, 1)).toBe(false);
    expect(isStackedLayout(360, 1)).toBe(false);
    expect(isStackedLayout(359, 1)).toBe(true);
    expect(isStackedLayout(320, 1)).toBe(true);
    expect(isStackedLayout(390, 1.3)).toBe(false);
    expect(isStackedLayout(390, 1.31)).toBe(true);
    expect(isStackedLayout(390, 2)).toBe(true);
  });

  it('o título de lista tem o limite de linhas com a letra normal e fica sem limite com letra grande', () => {
    expect(clampedLines(2, 1)).toBe(2);
    expect(clampedLines(2, 1.0001)).toBeUndefined();
    expect(clampedLines(2, 1.3)).toBeUndefined();
    expect(clampedLines(2, 2)).toBeUndefined();
    expect(clampedLines(1, 1)).toBe(1);
  });

  it('o selo da demonstração cresce só até 1,3 vez', () => {
    expect(DEMO_PILL_MAX_FONT_SCALE).toBe(1.3);
  });
});
