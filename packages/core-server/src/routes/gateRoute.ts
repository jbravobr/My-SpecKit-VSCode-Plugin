import { Router, Request, Response } from 'express';
import { getValidNextGates, getValidNextStatuses } from '../../../../src/workflow/GateEnforcer';
import type { Gate, SpecStatus } from '../../../../src/story/Story';

const router = Router();

const GATE_LABELS: Record<Gate, string> = {
  0: 'Alinhamento',
  1: 'Implementação',
  2: 'Testes',
  3: 'Revisão',
  4: 'Entrega',
};

const ALL_STATUSES: SpecStatus[] = [
  'open',
  'in-progress',
  'review',
  'blocked',
  'done',
  'cancelled',
];

router.get('/gate', (_req: Request, res: Response) => {
  const gateTransitions: Array<{ from: number; fromLabel: string; validNext: number[] }> = [];
  for (let g = 0; g <= 4; g++) {
    const next = getValidNextGates(g as Gate);
    gateTransitions.push({ from: g, fromLabel: GATE_LABELS[g as Gate], validNext: next });
  }

  const statusTransitions: Array<{ from: string; validNext: string[] }> = ALL_STATUSES.map((s) => ({
    from: s,
    validNext: getValidNextStatuses(s),
  }));

  const markdown =
    '## 🚪 Regras de Gate & Status\n\n' +
    '### Transições de Gate\n\n' +
    '| De | Para | Permitido |\n|---|---|---|\n' +
    gateTransitions
      .map((g) => {
        const targets =
          g.validNext.map((n) => `Gate ${n} — ${GATE_LABELS[n as Gate]}`).join(', ') || '—';
        return `| Gate ${g.from} — ${g.fromLabel} | ${targets} | ✅ |`;
      })
      .join('\n') +
    '\n\n> Avanço máximo: +1. Regressão máxima: -1 (retrabalho).\n\n' +
    '### Transições de Status\n\n' +
    '| De | Próximos válidos |\n|---|---|\n' +
    statusTransitions
      .map(
        (s) =>
          `| \`${s.from}\` | ${s.validNext.length > 0 ? s.validNext.map((n) => `\`${n}\``).join(', ') : '🔒 terminal'} |`,
      )
      .join('\n');

  res.json({
    gateTransitions,
    statusTransitions,
    gateLabels: GATE_LABELS,
    markdown,
  });
});

export default router;
