export function generateGlueJob(): string {
  return `---
applyTo: "**/*.py"
---
# AWS GlueJob — Boas Práticas (Python ETL)

## Inicialização do Job

- Sempre use \`getResolvedOptions(sys.argv, ['JOB_NAME', ...])\` para receber parâmetros do job
- Inicialize o contexto na ordem correta:
  \`\`\`python
  sc = SparkContext.getOrCreate()
  glueContext = GlueContext(sc)
  spark = glueContext.spark_session
  job = Job(glueContext)
  job.init(args['JOB_NAME'], args)
  \`\`\`
- **Sempre chame \`job.commit()\`** ao final do processamento bem-sucedido — sem \`commit()\`, o job bookmark não avança

## DynamicFrame vs DataFrame

- Use **\`DynamicFrame\`** quando a fonte tem schema inconsistente, campos opcionais ou estruturas aninhadas — o DynamicFrame tolera divergências de schema sem falhar
- Converta para **Spark \`DataFrame\`** para transformações pesadas (joins, agregações, groupBy) com \`dynamic_frame.toDF()\`
- Converta de volta para DynamicFrame antes de escrever via Glue Catalog: \`DynamicFrame.fromDF(df, glueContext, "nome")\`
- Evite acumular transformações em DynamicFrame quando a performance importa — DataFrames têm otimização via Catalyst

## Job Bookmarks

- Habilite com parâmetro do job: \`--job-bookmark-option job-bookmark-enable\`
- Bookmarks rastreiam **novos arquivos/partições** adicionados desde a última execução bem-sucedida
- **Não confie em bookmarks para deduplicação** — eles garantem que novos arquivos não sejam reprocessados, mas não garantem idempotência de registros dentro de um arquivo reprocessado
- Para deduplicação real, use chave de negócio + \`ConditionExpression\` no DynamoDB ou \`ON CONFLICT DO NOTHING\` no RDS

## Pushdown Predicates

- Filtre na fonte, não após o carregamento — use o parâmetro \`push_down_predicate\`:
  \`\`\`python
  datasource = glueContext.create_dynamic_frame.from_catalog(
      database="meu_database",
      table_name="minha_tabela",
      push_down_predicate="year='2024' and month='03'"
  )
  \`\`\`
- Pushdown predicates funcionam em fontes particionadas no Glue Catalog — verifique se a tabela está particionada antes de usar

## Tratamento de Erros

- Envolva a lógica de transformação em \`try/except\` — registre registros falhos em S3 antes de propagar a exceção
- Path de erro recomendado: \`s3://bucket/errors/<nome-do-job>/<run_id>/\`
- Nunca engula exceções silenciosamente — ao menos logue com \`logger.error()\` incluindo contexto (arquivo, partição, registro)
- Chame \`job.commit()\` **somente** se o processamento foi concluído com sucesso — falha antes do commit faz o job reprocessar no próximo run

## Escrita de Resultados

- Use \`glueContext.write_dynamic_frame.from_options()\` para escrever — especifique sempre \`partitionKeys\` por data ou entidade
- Para Parquet: use \`compression='snappy'\` — melhor equilíbrio entre tamanho e velocidade de leitura
- Prefira escrever para o **Glue Catalog** (com database/table) em vez de paths S3 raw — facilita descoberta e query via Athena
- Exemplo:
  \`\`\`python
  glueContext.write_dynamic_frame.from_options(
      frame=result_frame,
      connection_type="s3",
      connection_options={"path": "s3://bucket/output/", "partitionKeys": ["year", "month"]},
      format="parquet",
      format_options={"compression": "snappy"}
  )
  \`\`\`

## Anti-patterns

- **Nunca use \`collect()\`** em datasets grandes — traz todos os dados para o driver (OOM risk)
- Evite transformações wide (\`groupBy\`, \`join\`, \`orderBy\`) sem \`repartition()\` explícito antes — podem gerar shuffle desbalanceado
- Não use **Python UDFs** em hot paths — UDFs saem do contexto otimizado do Spark; prefira funções nativas (\`pyspark.sql.functions\`)
- **Nunca inclua credenciais AWS** no script do job — use a role IAM atribuída ao job pelo IDP
`;
}
