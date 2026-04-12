import { Story } from '../../story/Story';
import { stripFrontmatter } from './stripFrontmatter';
import { generateTypeScript } from '../language/TypeScriptGenerator';
import { generateJavaScript } from '../language/JavaScriptGenerator';
import { generateJava } from '../language/JavaGenerator';
import { generateCSharp } from '../language/CSharpGenerator';
import { generatePython } from '../language/PythonGenerator';
import { generateDotNet } from '../framework/DotNetGenerator';
import { generateSpringBoot } from '../framework/SpringBootGenerator';
import { generateAngular } from '../framework/AngularGenerator';
import { generateReact } from '../framework/ReactGenerator';
import { generateFastApi } from '../framework/FastApiGenerator';
import { generateKafka } from '../infra/KafkaGenerator';
import { generateAws } from '../infra/AwsGenerator';
import { generateGlueJob } from '../infra/GlueJobGenerator';
import { generateCrudPattern } from '../pattern/CrudPatternGenerator';
import { generateBffPattern } from '../pattern/BffPatternGenerator';
import { generateContractTesting } from '../pattern/ContractTestingGenerator';
import { generateIdempotency } from '../baseline/IdempotencyGenerator';
import { isNa } from '../utils/na';

interface StackSkillOptions {
  language: string;
  framework: string;
  infrastructure?: string;
  database?: string;
  target?: string;
}

export function generateStackSkill(opts: StackSkillOptions, story?: Story): string {
  const sections: string[] = [];
  const stackParts: string[] = [];

  // Language
  const langGenerators: Record<string, () => string> = {
    typescript: generateTypeScript,
    javascript: generateJavaScript,
    java: generateJava,
    csharp: generateCSharp,
    python: generatePython,
  };
  const langGen = langGenerators[opts.language];
  if (langGen) {
    sections.push(stripFrontmatter(langGen()));
    stackParts.push(opts.language);
  }

  // Framework
  const fwGenerators: Record<string, () => string> = {
    dotnet: generateDotNet,
    springboot: generateSpringBoot,
    angular: generateAngular,
    react: generateReact,
    fastapi: generateFastApi,
  };
  const fwGen = fwGenerators[opts.framework];
  if (fwGen) {
    sections.push(stripFrontmatter(fwGen()));
    stackParts.push(opts.framework);
  }

  // Infra — conditional
  const infra = opts.infrastructure ?? '';
  const db = opts.database ?? '';
  const infraLc = infra.toLowerCase();
  const dbLc = db.toLowerCase();

  if (!isNa(infra) && infraLc.includes('kafka')) {
    sections.push(stripFrontmatter(generateKafka()));
    stackParts.push('kafka');
  }

  const needsAws =
    !isNa(db) &&
    (dbLc.includes('dynamodb') ||
      dbLc.includes('aurora') ||
      dbLc.includes('rds') ||
      dbLc.includes('mysql'));
  if (needsAws) {
    sections.push(
      stripFrontmatter(
        generateAws(story ?? ({ technicalSpec: { database: db, infrastructure: '' } } as any)),
      ),
    );
    stackParts.push('aws');
  }

  if (
    (!isNa(infra) && infraLc.includes('glue')) ||
    (opts.language === 'python' && opts.target === 'script')
  ) {
    sections.push(stripFrontmatter(generateGlueJob()));
    stackParts.push('glue');
  }

  // Patterns — conditional
  if (opts.target === 'backend' || opts.target === 'bff') {
    sections.push(stripFrontmatter(generateCrudPattern(opts.language, opts.framework)));
    sections.push(stripFrontmatter(generateIdempotency()));
  }

  if (opts.target === 'bff') {
    sections.push(stripFrontmatter(generateBffPattern()));
    sections.push(stripFrontmatter(generateContractTesting()));
  }

  const stackLabel = stackParts.join(', ') || 'generic';

  return `---
name: speckit-stack
description: "SpecKit stack conventions — ${stackLabel}. Best practices for ${opts.language || 'general'} language, ${opts.framework || 'general'} framework, infrastructure, and architectural patterns. Activate when writing or reviewing code in a SpecKit-managed project."
---

${sections.join('\n---\n\n')}
`;
}
