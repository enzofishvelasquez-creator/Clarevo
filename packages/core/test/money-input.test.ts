import { describe, expect, it } from 'vitest';
import { MAX_RECORD_CENTS, completeMoneyText, maskMoneyEdit, maskMoneyTyping, moneyEditSpan, moneyTextOnBlur, parseBRL } from '../src';

/**
 * Máscara de moeda dos campos com "R$" (sinal 26 do estudo de 25/11/2026; revisão de 26/11/2026). Testes do comportamento: digitar tecla a
 * tecla, colar por cima de um valor já preenchido, o ponto do teclado do computador, apagar junto de um ponto da máscara, a posição do
 * cursor e o valor completo ao sair do campo.
 */

/** Digita tecla a tecla no fim do campo, como o navegador entrega: o texto de antes e o texto com a tecla. */
const type = (keys: string, start = '') => [...keys].reduce((acc, k) => maskMoneyTyping(acc, acc + k), start);
/** Seleciona tudo e cola (ou o preenchimento automático troca o texto de uma vez). */
const paste = (before: string, text: string) => maskMoneyTyping(before, text);

describe('máscara de moeda: digitando', () => {
  it('agrupa os milhares durante a digitação e completa ao sair do campo', () => {
    expect(type('2000')).toBe('2.000');
    expect(type('1234567')).toBe('1.234.567');
    expect(type('2000,5')).toBe('2.000,5');
    expect(type('0500')).toBe('500');
    expect(completeMoneyText('2.000')).toBe('2.000,00');
    expect(completeMoneyText('400')).toBe('400,00');
    expect(completeMoneyText('12,5')).toBe('12,50');
    expect(completeMoneyText('abc')).toBe('abc');
    expect(completeMoneyText('')).toBe('');
  });

  it('o ponto do teclado do computador: seguido de três algarismos é o dos milhares ("1.500", "10.000,00"); antes, virava "1,500"', () => {
    expect(type('1.500')).toBe('1.500');
    expect(type('10.000,00')).toBe('10.000,00');
    expect(type('1.234,56')).toBe('1.234,56');
    expect(type('1.000.000')).toBe('1.000.000');
    for (const t of ['1.500', '10.000,00', '1.234,56', '1.000.000']) expect(parseBRL(type(t)), t).toBe(parseBRL(t));
    expect(completeMoneyText(type('1.500'))).toBe('1.500,00');
    expect(completeMoneyText(type('10.000,00'))).toBe('10.000,00');
  });

  it('o ponto do teclado numérico do celular: com um ou dois algarismos depois, fica como digitado e é lido como centavos', () => {
    expect(type('12.5')).toBe('12.5');
    expect(type('12.50')).toBe('12.50');
    expect(type('0.99')).toBe('0.99');
    // Os pontos da máscara saem com o ponto digitado, para o texto continuar lido: "1.234" mais um ponto vira "1234.".
    expect(type('1234.')).toBe('1234.');
    expect(type('1234.56')).toBe('1234.56');
    expect(parseBRL(type('12.5'))).toBe(1250);
    expect(parseBRL(type('1234.56'))).toBe(123456);
    expect(completeMoneyText(type('12.5'))).toBe('12,50');
    expect(completeMoneyText(type('1234.56'))).toBe('1.234,56');
    // O terceiro algarismo depois do ponto fecha o ponto como o dos milhares.
    expect(type('12.500')).toBe('12.500');
    expect(type('1234.567')).toBe('1.234.567');
  });

  it('o ponto é ignorado com a vírgula já digitada, com outro ponto em aberto ou onde não se lê de jeito nenhum', () => {
    expect(maskMoneyTyping('12,5', '12,5.')).toBe('12,5');
    expect(maskMoneyTyping('12.5', '12.5.')).toBe('12.5');
    // Ponto logo depois do primeiro algarismo de "12.345": quatro algarismos depois dele não são milhar nem centavos.
    expect(maskMoneyTyping('12.345', '1.2.345')).toBe('12.345');
  });

  it('apagar um algarismo reagrupa; apagar um algarismo depois de um ponto em aberto mantém o ponto', () => {
    expect(maskMoneyTyping('1.250', '1.25')).toBe('125');
    expect(maskMoneyTyping('12.345', '12.45')).toBe('1.245');
    expect(maskMoneyTyping('12.5', '12.')).toBe('12.');
    expect(maskMoneyTyping('12.', '12')).toBe('12');
    expect(maskMoneyTyping('1.234,5', '1.2345')).toBe('12.345');
  });

  it('o que não é algarismo, ponto ou vírgula, e duas vírgulas, ficam como estão', () => {
    expect(maskMoneyTyping('', 'R$ 80')).toBe('R$ 80');
    expect(maskMoneyTyping('1,2', '1,2,')).toBe('1,2,');
    expect(maskMoneyTyping('', '1,2,3')).toBe('1,2,3');
  });
});

describe('máscara de moeda: colando por cima de um valor (revisão de 26/11/2026)', () => {
  it('a colagem segue parseBRL também com o campo já preenchido (antes: "9.99" sobre "8,00" virava "999")', () => {
    expect(paste('8,00', '9.99')).toBe('9,99');
    expect(paste('45,90', '12.50')).toBe('12,50');
    expect(paste('45,90', '100.00')).toBe('100,00');
    expect(paste('500', '12.5')).toBe('12,5');
    expect(paste('1.234,56', '1.250')).toBe('1.250');
    expect(paste('2.000,00', '1234.56')).toBe('1.234,56');
    expect(paste('9,99', '10000,00')).toBe('10.000,00');
  });

  it('colando no campo vazio: o mesmo valor de parseBRL; o que não se lê fica como está, para a validação explicar', () => {
    expect(paste('', '12.50')).toBe('12,50');
    expect(paste('', '1.250')).toBe('1.250');
    expect(paste('', '1234.56')).toBe('1.234,56');
    expect(paste('', '1.2345,00')).toBe('1.2345,00');
    expect(paste('', '0.500')).toBe('0.500');
    expect(paste('', '0500')).toBe('500');
  });

  it('o trecho que mudou vem do começo e do fim iguais: colar é mais de um caractere entrando, mesmo com o tamanho parecido', () => {
    expect(moneyEditSpan('8,00', '9.99')).toEqual({ at: 0, removed: '8,00', inserted: '9.99' });
    expect(moneyEditSpan('45,90', '12.50')).toEqual({ at: 0, removed: '45,9', inserted: '12.5' });
    expect(moneyEditSpan('1.234', '1.2345')).toEqual({ at: 5, removed: '', inserted: '5' });
    expect(moneyEditSpan('1.234', '1234')).toEqual({ at: 1, removed: '.', inserted: '' });
  });

  it('propriedade: colar um texto (mais de um caractere entrando) nunca muda o valor lido, qualquer que seja o texto de antes', () => {
    // Gerador pequeno e determinístico (sem dependência nova): textos com algarismos, ponto e vírgula, e valores já mascarados.
    let seed = 20261126;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const chars = '0123456789.,';
    const randomText = () => Array.from({ length: 1 + rand(9) }, () => chars[rand(chars.length)]).join('');
    const masked = () => type(String(rand(10_000_000)) + (rand(2) ? `,${String(rand(100)).padStart(2, '0')}` : ''));
    let pastes = 0;
    for (let i = 0; i < 4000; i++) {
      const before = rand(3) === 0 ? '' : rand(2) ? masked() : randomText();
      const next = rand(2) ? randomText() : masked().replace(/\./g, rand(2) ? '' : '.');
      if (moneyEditSpan(before, next).inserted.length < 2) continue;
      pastes++;
      expect(parseBRL(maskMoneyTyping(before, next)), `${before} -> ${next}`).toBe(parseBRL(next));
    }
    expect(pastes).toBeGreaterThan(1500);
  });

  it('o valor lido nunca muda ao colar no campo vazio nem ao completar ao sair', () => {
    for (const raw of ['80', '80,5', '1234', '1234,56', '12.50', '1.250', '999999999', '0,99', '10000,00', '9.99', '100.00']) {
      expect(parseBRL(maskMoneyTyping('', raw)), raw).toBe(parseBRL(raw));
      expect(parseBRL(completeMoneyText(maskMoneyTyping('', raw))), raw).toBe(parseBRL(raw));
    }
  });
});

describe('máscara de moeda: apagar junto de um ponto da máscara e o cursor (revisão de 26/11/2026)', () => {
  it('Backspace logo depois de um ponto da máscara apaga o algarismo antes dele (antes, o ponto voltava e nada mudava)', () => {
    expect(maskMoneyEdit('1.234', '1234', 1)).toEqual({ text: '234', caret: 0 });
    // "12.|345": o "2" sai e o cursor fica entre o "1" e o "3", logo depois do ponto ("1.|345"): outro Backspace apaga o "1".
    expect(maskMoneyEdit('12.345', '12345', 2)).toEqual({ text: '1.345', caret: 2 });
    expect(maskMoneyEdit('1.234.567', '1.234567', 5)).toEqual({ text: '123.567', caret: 4 });
  });

  it('Delete logo antes de um ponto da máscara apaga o algarismo depois dele', () => {
    expect(maskMoneyEdit('1.234', '1234', 1, { forward: true })).toEqual({ text: '134', caret: 1 });
    // "12|.345": o "3" sai e o cursor fica logo depois do "2" ("1.2|45").
    expect(maskMoneyEdit('12.345', '12345', 2, { forward: true })).toEqual({ text: '1.245', caret: 3 });
  });

  it('o cursor fica junto dos mesmos algarismos quando os pontos mudam de lugar (antes, na web, ia para o fim)', () => {
    // "9" digitado em "1|23": "1.9|23".
    expect(maskMoneyEdit('123', '1923', 2)).toEqual({ text: '1.923', caret: 3 });
    // Backspace em "1.2|34,56": "1|34,56".
    expect(maskMoneyEdit('1.234,56', '1.34,56', 2)).toEqual({ text: '134,56', caret: 1 });
    // Algarismo no fim: o cursor continua no fim.
    expect(maskMoneyEdit('1.234', '1.2345', 6)).toEqual({ text: '12.345', caret: 6 });
    // O ponto digitado: o cursor fica logo depois dele.
    expect(maskMoneyEdit('1.234', '1.234.', 6)).toEqual({ text: '1234.', caret: 5 });
    expect(maskMoneyEdit('1234', '1.234', 2)).toEqual({ text: '1.234', caret: 2 });
    // Ponto ignorado (vírgula já digitada): o cursor volta para onde estava.
    expect(maskMoneyEdit('1.234,5', '1.2.34,5', 4)).toEqual({ text: '1.234,5', caret: 3 });
    // Colado no meio: o cursor fica depois do que entrou.
    expect(maskMoneyEdit('', '1234.56', 7)).toEqual({ text: '1.234,56', caret: 8 });
  });

  it('o cursor nunca sai do texto mascarado', () => {
    const samples: [string, string, number][] = [
      ['', '1', 1],
      ['1.234', '1234', 1],
      ['1.234', '234', 0],
      ['12,5', '12,5.', 5],
      ['1.234.567,89', '1.234.567,8', 11],
    ];
    for (const [before, next, caret] of samples) {
      const out = maskMoneyEdit(before, next, caret);
      expect(out.caret, `${before} -> ${next}`).toBeGreaterThanOrEqual(0);
      expect(out.caret, `${before} -> ${next}`).toBeLessThanOrEqual(out.text.length);
    }
  });
});

describe('máscara de moeda: ao sair do campo (revisão de 26/11/2026)', () => {
  it('acima do limite de um registro, o texto fica como está (antes, 14 algarismos viravam "10.000.000,00")', () => {
    expect(parseBRL('12345678901234')).toBe(MAX_RECORD_CENTS + 1);
    expect(completeMoneyText('12345678901234')).toBe('12345678901234');
    expect(completeMoneyText('12.345.678.901.234')).toBe('12.345.678.901.234');
    expect(completeMoneyText('10000000')).toBe('10000000');
    expect(completeMoneyText('9999999,99')).toBe('9.999.999,99');
    expect(parseBRL('9999999,99')).toBe(MAX_RECORD_CENTS);
  });

  it('só muda o texto quando há o que completar, e nunca com um erro na tela (o "maior que zero" de "0" continua)', () => {
    expect(moneyTextOnBlur('2.000', false)).toBe('2.000,00');
    expect(moneyTextOnBlur('12.5', false)).toBe('12,50');
    expect(moneyTextOnBlur('2.000,00', false)).toBeNull();
    expect(moneyTextOnBlur('abc', false)).toBeNull();
    expect(moneyTextOnBlur('', false)).toBeNull();
    expect(moneyTextOnBlur('12345678901234', false)).toBeNull();
    expect(moneyTextOnBlur('0', false)).toBe('0,00');
    expect(moneyTextOnBlur('0', true)).toBeNull();
    expect(moneyTextOnBlur('2.000', true)).toBeNull();
  });
});
