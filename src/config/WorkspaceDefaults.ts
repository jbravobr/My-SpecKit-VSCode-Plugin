import * as path from 'path';
import { IFileSystem } from '../generator/utils/IFileSystem';
import { Architecture, Framework, Language, ProjectStage, Target } from '../story/Story';

export interface WorkspaceDefaults {
  language?: Language;
  framework?: Framework;
  architecture?: Architecture;
  target?: Target;
  projectStage?: ProjectStage;
  database?: string;
  infrastructure?: string;
}

const VALID_LANGUAGES = new Set<string>(['typescript', 'javascript', 'java', 'csharp', 'python']);
const VALID_FRAMEWORKS = new Set<string>([
  'dotnet',
  'springboot',
  'angular',
  'react',
  'fastapi',
  'other',
]);
const VALID_ARCHITECTURES = new Set<string>([
  'hexagonal',
  'layered',
  'microservices',
  'monolith',
  'serverless',
]);
const VALID_TARGETS = new Set<string>(['backend', 'frontend', 'bff', 'script', 'library']);
const VALID_STAGES = new Set<string>(['greenfield', 'brownfield']);

/**
 * Loads workspace defaults from `.speckit/defaults.yml`.
 * Returns empty object if file doesn't exist or is invalid.
 */
export async function loadWorkspaceDefaults(
  workspaceRoot: string,
  fs: IFileSystem,
): Promise<WorkspaceDefaults> {
  const filePath = path.join(workspaceRoot, '.speckit', 'defaults.yml');

  try {
    const exists = await fs.fileExists(filePath);
    if (!exists) return {};

    const content = await fs.readFile(filePath);
    return parseDefaultsYaml(content);
  } catch {
    return {};
  }
}

/** Lightweight YAML parser — handles only flat `key: value` pairs. */
export function parseDefaultsYaml(content: string): WorkspaceDefaults {
  const defaults: WorkspaceDefaults = {};
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;

    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!value) continue;

    switch (key) {
      case 'language':
        if (VALID_LANGUAGES.has(value)) defaults.language = value as Language;
        break;
      case 'framework':
        if (VALID_FRAMEWORKS.has(value)) defaults.framework = value as Framework;
        break;
      case 'architecture':
        if (VALID_ARCHITECTURES.has(value)) defaults.architecture = value as Architecture;
        break;
      case 'target':
        if (VALID_TARGETS.has(value)) defaults.target = value as Target;
        break;
      case 'projectStage':
        if (VALID_STAGES.has(value)) defaults.projectStage = value as ProjectStage;
        break;
      case 'database':
        defaults.database = value;
        break;
      case 'infrastructure':
        defaults.infrastructure = value;
        break;
    }
  }

  return defaults;
}
