import { Router, Request, Response } from 'express';
import * as path from 'path';
import { nodeFileSystem } from '../fs/NodeFileSystem';
import { createNodeWorkspace } from '../workspace/NodeWorkspace';
import { generateFixId, generateStoryId } from '../../../../src/generator/utils/SpecIdGenerator';

const router = Router();

const FIX_KEYWORDS =
  /\bquebrad|\b(bug|erro|error|falha|falhou|broke|broken|crash|regression|corrigir|corre[cç][aã]o|n[aã]o funciona)\b/i;

function detectIntent(description: string): 'story' | 'fix' {
  if (/--fix\b|--bug\b/i.test(description)) return 'fix';
  if (FIX_KEYWORDS.test(description)) return 'fix';
  return 'story';
}

router.post('/draft', async (req: Request, res: Response) => {
  const { workspaceRoot, type, description } = req.body as {
    workspaceRoot: string;
    type?: 'story' | 'fix';
    description: string;
  };

  if (!workspaceRoot) {
    res.status(400).json({ error: 'workspaceRoot is required' });
    return;
  }
  if (!description || !description.trim()) {
    res.status(400).json({ error: 'description is required' });
    return;
  }

  try {
    const workspace = createNodeWorkspace(workspaceRoot);
    const specDir = path.join(workspaceRoot, '.speckit');
    await nodeFileSystem.ensureDir(specDir);

    const intent = type ?? detectIntent(description);
    const cleanInput = description.replace(/\s*--(fix|bug|story)\b/gi, '').trim();

    if (intent === 'fix') {
      const existing = await workspace.listFixFiles(specDir);
      const specId = generateFixId(workspaceRoot, existing);
      const now = new Date().toISOString().split('T')[0];

      const content = `# Fix ${specId}

<!-- metadata
id: ${specId}
title: ${cleanInput.slice(0, 80)}
createdAt: ${now}
version: 1
type: fix
status: open
gate: 0
-->

## Bug Description

### Título do Bug
${cleanInput}

### Sintomas
<!-- TODO: descreva o comportamento incorreto observado -->

### Passos para Reproduzir
<!-- TODO:
- Passo 1
- Passo 2
-->
-

### Ambiente Afetado
<!-- TODO: versão, OS, browser, ambiente (prod/staging/local) -->

### Frequência de Ocorrência
<!-- TODO: sempre | intermitente | apenas em condição X -->

---

## Root Cause Hypothesis

### Hipótese
<!-- TODO: sua melhor hipótese sobre a causa raiz -->

### Arquivos/Componentes Suspeitos
<!-- TODO:
- src/path/to/file.ts
-->
-

---

## Impact Assessment

### Severidade
<!-- TODO: critical | high | medium | low -->

### Usuários/Sistemas Afetados
<!-- TODO -->

### Risco de Regressão
<!-- TODO: áreas que podem ser impactadas pela correção -->

---

## Regression Prevention

### Testes a Adicionar
<!-- TODO:
- Teste que verifica cenário X
-->
-

---

## DoF — Definition of Fixed

- [ ] Bug não reproduz mais com os passos documentados
- [ ] Root cause endereçado
- [ ] Testes de regressão adicionados e passando
- [ ] Cobertura ≥ 80%
`;

      res.json({
        specId,
        type: 'fix',
        intent,
        content,
        markdown: `## 📝 Rascunho de Fix — \`${specId}\`\n\nRascunho gerado a partir da descrição. Revise e salve como \`${specId}.md\` em \`.speckit/\`.\n\nUse \`/validate\` após salvar.`,
      });
    } else {
      const existing = await workspace.listStoryFiles(specDir);
      const specId = generateStoryId(workspaceRoot, existing);
      const now = new Date().toISOString().split('T')[0];

      const content = `# Story ${specId}

<!-- metadata
id: ${specId}
title: ${cleanInput.slice(0, 80)}
createdAt: ${now}
version: 1
type: story
status: open
gate: 0
-->

## Objetivo

${cleanInput}

---

## Contexto e Motivação

<!-- TODO: Por que essa feature é necessária? Qual problema resolve? -->

---

## Critérios de Aceite

<!-- TODO:
- [ ] Critério 1
- [ ] Critério 2
-->
- [ ]

---

## Escopo Técnico

### Linguagem / Framework
<!-- TODO: detectado automaticamente pelo /validate -->

### Arquitetura
<!-- TODO: mvc | hexagonal | clean | serverless -->

### Componentes Afetados
<!-- TODO: lista de módulos, serviços ou arquivos -->
-

---

## DoD — Definition of Done

- [ ] Implementação completa e funcionando
- [ ] Testes cobrindo cenários principais
- [ ] Cobertura ≥ 80%
- [ ] Code review aprovado
`;

      res.json({
        specId,
        type: 'story',
        intent,
        content,
        markdown: `## 📝 Rascunho de Story — \`${specId}\`\n\nRascunho gerado a partir da descrição. Revise e salve como \`${specId}.md\` em \`.speckit/\`.\n\nUse \`/validate\` após salvar.`,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
