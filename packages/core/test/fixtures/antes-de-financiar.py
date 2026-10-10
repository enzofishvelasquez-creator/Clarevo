#!/usr/bin/env python3
"""
Gera antes-de-financiar.json: casos aleatórios (semente fixa) com o resultado calculado de forma independente do TypeScript,
em centavos inteiros, para conferir "Antes de financiar" (D-044).

- Price: Fraction (aritmética racional exata). Parcela = F * i / (1 - (1 + i)^-n), com i = pontos-base / 10.000; paga na compra:
  a mesma parcela dividida por (1 + i); taxa zero: F / n. Arredondamento metade para cima, mínimo de 1 centavo.
  total = entrada + n * parcela; juros = max(0, total - preço).
- Poupança com depósitos no início do mês: Decimal com 70 dígitos. r = (1 + a)^(1/12); depois de n meses,
  valor = mensal * r * (r^n - 1) / (r - 1); meses = menor n de 1 a 600 com valor >= alvo (None passando de 600); mensal >= alvo: 1.
  O valor ao fim dos meses é arredondado para baixo, em centavos.

Uso: python3 -I antes-de-financiar.py > antes-de-financiar.json
"""
import json
import random
from decimal import Decimal, getcontext
from fractions import Fraction

getcontext().prec = 70
rng = random.Random(20261010)


def round_half_up(x: Fraction) -> int:
    return (x + Fraction(1, 2)).__floor__()


def price(financed: int, bp: int, n: int, first_in_one_month: bool) -> int:
    if financed == 0:
        return 0
    if bp == 0:
        p = Fraction(financed, n)
    else:
        i = Fraction(bp, 10000)
        p = financed * i / (1 - (1 + i) ** (-n))
        if not first_in_one_month:
            p = p / (1 + i)
    return max(1, round_half_up(p))


def saving_months(target: int, monthly: int, rate_bp: int):
    if monthly >= target:
        return 1, None
    if rate_bp == 0:
        n = -(-target // monthly)
        return (n, monthly * n) if n <= 600 else (None, None)
    r = (Decimal(1) + Decimal(rate_bp) / Decimal(10000)) ** (Decimal(1) / Decimal(12))
    value = Decimal(0)
    pot = Decimal(1)
    for n in range(1, 601):
        pot *= r
        value += monthly * pot  # aporte no início do mês n rende n meses... (soma de r^k, k = 1..n)
        if value >= target:
            return n, int(value.to_integral_value(rounding='ROUND_FLOOR'))
    return None, None


def pick(*choices):
    return rng.choice(choices)


cases = []
# Price: 220 casos
for k in range(220):
    scale = pick(10 ** 4, 10 ** 5, 10 ** 6, 10 ** 7, 10 ** 8, 999_999_999)
    preco = rng.randint(100, scale)
    entrada = pick(0, 0, rng.randint(0, preco), rng.randint(0, preco // 2), preco // 5)
    n = pick(1, 2, 12, 24, 36, 48, 60, 84, 120, 240, 360, 480, rng.randint(1, 480), rng.randint(1, 480))
    bp = pick(0, 1, 99, 100, 199, 250, 999, 1500, 9999, rng.randint(0, 600), rng.randint(0, 600), rng.randint(0, 9999))
    first = pick(True, False, True)
    financed = preco - entrada
    parcela = price(financed, bp, n, first)
    total = entrada + n * parcela
    cases.append(
        {
            'kind': 'price',
            'precoCents': preco,
            'entradaCents': entrada,
            'parcelas': n,
            'taxaBp': bp,
            'primeiraEmUmMes': first,
            'parcelaCents': parcela,
            'totalCents': total,
            'interestCents': max(0, total - preco),
        }
    )
# Poupança com depósitos no início do mês: 220 casos
for k in range(220):
    target = rng.randint(100, pick(10 ** 5, 10 ** 6, 10 ** 7, 999_999_999))
    monthly = pick(rng.randint(1, max(1, target // 10)), rng.randint(1, max(1, target // 60)), rng.randint(1, max(1, target // 300)), rng.randint(1, target))
    rate_bp = pick(0, 0, 50, 300, 800, 1000, 1268, 1500, 3000, rng.randint(0, 3000), rng.randint(0, 3000))
    months, final = saving_months(target, monthly, rate_bp)
    cases.append({'kind': 'saving', 'targetCents': target, 'monthlyCents': monthly, 'rateBp': rate_bp, 'months': months, 'finalCents': final})

print(json.dumps({'generator': 'antes-de-financiar.py', 'seed': 20261010, 'cases': cases}, indent=0))
