# Validador Python de Story Markdown

## Problema

Stories criadas por `/new` ou concluídas a partir de `/draft` podem conter todas as seções visíveis do template e, ainda assim, ter lacunas semânticas ou conteúdo fora do alcance do parser e dos agentes do SpecKit.

## Solução

O script `validate_story_markdown.py` valida um arquivo Markdown de Story contra a estrutura canônica do template:

- ordem exata dos H2 até `DoD - Definition of Done`;
- subseções H3 esperadas por seção canônica;
- metadata obrigatória e compatível com Story;
- campos obrigatórios sem TODO ou placeholders;
- listas obrigatórias reais;
- DoR completamente marcado antes de implementação;
- H2 extra após DoD como erro de escopo;
- conteúdo que não será capturado pelo parser do plugin, com explicação da regra aplicada.

O output é sempre conciso: resumo da validação e achados. O contexto canônico semântico é usado internamente para validar a Story, mas não é emitido no relatório nem no JSON.

## Uso

```powershell
C:/Users/800065405/AppData/Local/Programs/Python/Python314/python.exe scripts/validate_story_markdown.py .speckit/US-ABC-20260429-1234.md
```

Também é possível validar mais de um arquivo na mesma execução:

```powershell
C:/Users/800065405/AppData/Local/Programs/Python/Python314/python.exe scripts/validate_story_markdown.py .speckit/US-ABC-20260429-1234.md .speckit/US-ABC-20260429-1235.md
```

Para saída estruturada:

```powershell
C:/Users/800065405/AppData/Local/Programs/Python/Python314/python.exe scripts/validate_story_markdown.py .speckit/US-ABC-20260429-1234.md .speckit/US-ABC-20260429-1235.md --json
```

## Critério de aceite

- Exit code `0`: story canônica, completa e pronta para agentes.
- Exit code `1`: story inválida para conduzir implementação/revisão sem correção.
- Exit code `2`: falha operacional de leitura do arquivo.

## Impacto

O script não altera arquivos de Story. Ele apenas lê o Markdown, valida estrutura e semântica e escreve o relatório em stdout.

## Validação

Executar os testes comportamentais:

```powershell
C:/Users/800065405/AppData/Local/Programs/Python/Python314/python.exe -m unittest tests/python/test_validate_story_markdown.py
```
