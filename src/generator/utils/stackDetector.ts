// stackDetector.ts — Recursive stack detection across multiple languages and frameworks.
//
// BFS traversal with bounded depth (default 7) over the workspace tree, detecting
// manifest files (package.json, pom.xml, build.gradle, *.csproj, go.mod, Cargo.toml,
// composer.json, Gemfile, build.sbt, Package.swift, pyproject.toml, requirements.txt,
// Pipfile) and producing TechStackDetection records.
//
// Pure module — receives an abstract filesystem so it can be unit-tested without VS Code.

import { TechStackDetection } from '../../fix/Fix';
import { Framework, Language, ProjectStage } from '../../story/Story';

export interface StackDetectorEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface StackDetectorFs {
  readDirectory(dirPath: string): Promise<StackDetectorEntry[]>;
  readFile(filePath: string): Promise<string>;
  joinPath(...segments: string[]): string;
}

export const DEFAULT_MAX_DEPTH = 7;

/** Directory names skipped during BFS — vendored deps, build artefacts, IDE/OS metadata. */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'out',
  'bin',
  'obj',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.idea',
  '.vscode',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.parcel-cache',
  '.cache',
  '.turbo',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.terraform',
  'vendor',
  'Pods',
  'DerivedData',
]);

export interface DetectionOptions {
  maxDepth?: number;
  ignoredDirs?: ReadonlySet<string>;
}

/**
 * Walks the workspace BFS up to `maxDepth` (default 7) and returns every detected
 * tech stack, sorted by depth (shallowest first) then by `source` path.
 */
export async function detectAllStacks(
  rootPath: string,
  fs: StackDetectorFs,
  options: DetectionOptions = {},
): Promise<TechStackDetection[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const ignored = options.ignoredDirs ?? IGNORED_DIRS;

  type Visit = { absPath: string; relPath: string; depth: number };
  const queue: Visit[] = [{ absPath: rootPath, relPath: '', depth: 0 }];
  const detections: TechStackDetection[] = [];

  while (queue.length > 0) {
    const node = queue.shift() as Visit;
    let entries: StackDetectorEntry[];
    try {
      entries = await fs.readDirectory(node.absPath);
    } catch {
      continue;
    }

    const dets = await detectInDirectory(node.absPath, node.relPath, entries, fs);
    detections.push(...dets);

    if (node.depth >= maxDepth) continue;

    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      if (ignored.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      queue.push({
        absPath: fs.joinPath(node.absPath, entry.name),
        relPath: node.relPath ? `${node.relPath}/${entry.name}` : entry.name,
        depth: node.depth + 1,
      });
    }
  }

  detections.sort((a, b) => {
    const da = depthOf(a.source);
    const db = depthOf(b.source);
    if (da !== db) return da - db;
    return a.source.localeCompare(b.source);
  });

  return detections;
}

function depthOf(source: string): number {
  if (!source) return 0;
  return source.split(/[/\\]/).length - 1;
}

async function detectInDirectory(
  absPath: string,
  relPath: string,
  entries: StackDetectorEntry[],
  fs: StackDetectorFs,
): Promise<TechStackDetection[]> {
  const fileNames = new Set(entries.filter((e) => e.isFile).map((e) => e.name));
  const dirNames = new Set(entries.filter((e) => e.isDirectory).map((e) => e.name));
  const detections: TechStackDetection[] = [];

  if (fileNames.has('package.json')) {
    const d = await tryDetectNode(absPath, relPath, fileNames, dirNames, fs);
    if (d) detections.push(d);
  }
  if (fileNames.has('pom.xml')) {
    const d = await tryDetectMaven(absPath, relPath, fs);
    if (d) detections.push(d);
  }
  if (
    fileNames.has('build.gradle') ||
    fileNames.has('build.gradle.kts') ||
    fileNames.has('settings.gradle') ||
    fileNames.has('settings.gradle.kts')
  ) {
    const d = await tryDetectGradle(absPath, relPath, fileNames, fs);
    if (d) detections.push(d);
  }
  for (const name of fileNames) {
    if (name.endsWith('.csproj') || name.endsWith('.fsproj') || name.endsWith('.vbproj')) {
      detections.push(buildDotNetDetection(name, relPath));
      break;
    }
  }
  if (fileNames.has('pyproject.toml')) {
    const d = await tryDetectPython(absPath, relPath, 'pyproject.toml', fs);
    if (d) detections.push(d);
  } else if (fileNames.has('requirements.txt')) {
    const d = await tryDetectPython(absPath, relPath, 'requirements.txt', fs);
    if (d) detections.push(d);
  } else if (fileNames.has('Pipfile')) {
    const d = await tryDetectPython(absPath, relPath, 'Pipfile', fs);
    if (d) detections.push(d);
  }
  if (fileNames.has('go.mod')) {
    const d = await tryDetectGo(absPath, relPath, fs);
    if (d) detections.push(d);
  }
  if (fileNames.has('Cargo.toml')) {
    const d = await tryDetectRust(absPath, relPath, fs);
    if (d) detections.push(d);
  }
  if (fileNames.has('composer.json')) {
    const d = await tryDetectPhp(absPath, relPath, fs);
    if (d) detections.push(d);
  }
  if (fileNames.has('Gemfile')) {
    const d = await tryDetectRuby(absPath, relPath, fs);
    if (d) detections.push(d);
  }
  if (fileNames.has('build.sbt')) {
    detections.push(buildScalaDetection(relPath));
  }
  if (fileNames.has('Package.swift')) {
    const d = await tryDetectSwift(absPath, relPath, fs);
    if (d) detections.push(d);
  }

  return detections;
}

// ---------- Per-ecosystem detectors ----------

async function tryDetectNode(
  absPath: string,
  relPath: string,
  fileNames: Set<string>,
  dirNames: Set<string>,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let pkg: Record<string, unknown>;
  try {
    const content = await fs.readFile(fs.joinPath(absPath, 'package.json'));
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
  const deps: Record<string, unknown> = {
    ...((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
    ...((pkg.peerDependencies as Record<string, unknown>) ?? {}),
  };

  const language: Language = fileNames.has('tsconfig.json') ? 'typescript' : 'javascript';

  let framework: Framework = 'other';
  if (deps['next']) framework = 'next';
  else if (deps['nuxt'] || deps['nuxt3']) framework = 'nuxt';
  else if (deps['@angular/core']) framework = 'angular';
  else if (deps['@nestjs/core']) framework = 'nestjs';
  else if (deps['vue'] || deps['@vue/cli-service']) framework = 'vue';
  else if (deps['svelte'] || deps['@sveltejs/kit']) framework = 'svelte';
  else if (deps['react']) framework = 'react';
  else if (deps['fastify']) framework = 'fastify';
  else if (deps['express']) framework = 'express';

  const target = inferNodeTarget(deps, dirNames);
  const architecture = inferArchitectureFromDirs(dirNames);
  const sourceFile = relPath ? `${relPath}/package.json` : 'package.json';

  return {
    language,
    framework,
    ...(architecture ? { architecture } : {}),
    target,
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

async function tryDetectMaven(
  absPath: string,
  relPath: string,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, 'pom.xml'));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();
  const isKotlin = lc.includes('kotlin-maven-plugin') || lc.includes('jetbrains.kotlin');
  const language: Language = isKotlin ? 'kotlin' : 'java';

  let framework: Framework = 'other';
  if (lc.includes('spring-boot')) framework = 'springboot';
  else if (lc.includes('quarkus')) framework = 'quarkus';
  else if (lc.includes('micronaut')) framework = 'micronaut';

  const messaging =
    lc.includes('spring-kafka') || lc.includes('kafka-clients') ? ('kafka' as const) : undefined;
  const sourceFile = relPath ? `${relPath}/pom.xml` : 'pom.xml';

  return {
    language,
    framework,
    target: 'backend',
    ...(messaging ? { messaging } : {}),
    projectStage: 'brownfield' as ProjectStage,
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

async function tryDetectGradle(
  absPath: string,
  relPath: string,
  fileNames: Set<string>,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  const candidates = ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle'];
  let mainFile: string | null = null;
  let content = '';
  for (const c of candidates) {
    if (fileNames.has(c)) {
      try {
        content = await fs.readFile(fs.joinPath(absPath, c));
        mainFile = c;
        break;
      } catch {
        // try next
      }
    }
  }
  if (!mainFile) return null;

  const lc = content.toLowerCase();
  const isKotlin =
    mainFile.endsWith('.kts') || lc.includes('kotlin(') || lc.includes('org.jetbrains.kotlin');
  const isAndroid =
    lc.includes('com.android.application') ||
    lc.includes('com.android.library') ||
    fileNames.has('AndroidManifest.xml');
  const language: Language = isKotlin ? 'kotlin' : 'java';

  let framework: Framework = 'gradle';
  if (isAndroid) framework = 'android';
  else if (lc.includes('org.springframework.boot') || lc.includes('spring-boot')) {
    framework = 'springboot';
  } else if (lc.includes('quarkus')) framework = 'quarkus';
  else if (lc.includes('micronaut')) framework = 'micronaut';

  const messaging =
    lc.includes('spring-kafka') ||
    lc.includes('kafka-clients') ||
    lc.includes("'org.apache.kafka'") ||
    lc.includes('"org.apache.kafka"')
      ? ('kafka' as const)
      : undefined;

  const sourceFile = relPath ? `${relPath}/${mainFile}` : mainFile;

  return {
    language,
    framework,
    target: isAndroid ? 'frontend' : 'backend',
    ...(messaging ? { messaging } : {}),
    projectStage: 'brownfield',
    confidence: framework !== 'gradle' ? 'high' : 'low',
    source: sourceFile,
  };
}

function buildDotNetDetection(filename: string, relPath: string): TechStackDetection {
  const language: Language = filename.endsWith('.fsproj')
    ? 'unknown'
    : filename.endsWith('.vbproj')
      ? 'unknown'
      : 'csharp';
  const sourceFile = relPath ? `${relPath}/${filename}` : filename;
  return {
    language,
    framework: 'dotnet',
    target: 'backend',
    projectStage: 'brownfield',
    confidence: 'high',
    source: sourceFile,
  };
}

async function tryDetectPython(
  absPath: string,
  relPath: string,
  manifest: 'pyproject.toml' | 'requirements.txt' | 'Pipfile',
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, manifest));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();

  let framework: Framework = 'other';
  if (/(^|[^a-z])fastapi([^a-z]|$)/.test(lc)) framework = 'fastapi';
  else if (/(^|[^a-z])django([^a-z]|$)/.test(lc)) framework = 'django';
  else if (/(^|[^a-z])flask([^a-z]|$)/.test(lc)) framework = 'flask';

  const sourceFile = relPath ? `${relPath}/${manifest}` : manifest;
  return {
    language: 'python',
    framework,
    target: 'backend',
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

async function tryDetectGo(
  absPath: string,
  relPath: string,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, 'go.mod'));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();
  let framework: Framework = 'other';
  if (lc.includes('gin-gonic/gin')) framework = 'gin';

  const sourceFile = relPath ? `${relPath}/go.mod` : 'go.mod';
  return {
    language: 'go',
    framework,
    target: 'backend',
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

async function tryDetectRust(
  absPath: string,
  relPath: string,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, 'Cargo.toml'));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();
  let framework: Framework = 'other';
  if (/(^|\s)actix[-_]web/.test(lc) || lc.includes('actix-web')) framework = 'actix';
  else if (/(^|\s)rocket\s*=/.test(lc) || lc.includes('rocket =')) framework = 'rocket';

  const sourceFile = relPath ? `${relPath}/Cargo.toml` : 'Cargo.toml';
  return {
    language: 'rust',
    framework,
    target: 'backend',
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

async function tryDetectPhp(
  absPath: string,
  relPath: string,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, 'composer.json'));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();
  let framework: Framework = 'other';
  if (lc.includes('laravel/framework')) framework = 'laravel';

  const sourceFile = relPath ? `${relPath}/composer.json` : 'composer.json';
  return {
    language: 'php',
    framework,
    target: 'backend',
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

async function tryDetectRuby(
  absPath: string,
  relPath: string,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, 'Gemfile'));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();
  let framework: Framework = 'other';
  if (/gem\s+['"]rails['"]/.test(lc)) framework = 'rails';

  const sourceFile = relPath ? `${relPath}/Gemfile` : 'Gemfile';
  return {
    language: 'ruby',
    framework,
    target: 'backend',
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

function buildScalaDetection(relPath: string): TechStackDetection {
  const sourceFile = relPath ? `${relPath}/build.sbt` : 'build.sbt';
  return {
    language: 'scala',
    framework: 'other',
    target: 'backend',
    projectStage: 'brownfield',
    confidence: 'low',
    source: sourceFile,
  };
}

async function tryDetectSwift(
  absPath: string,
  relPath: string,
  fs: StackDetectorFs,
): Promise<TechStackDetection | null> {
  let content: string;
  try {
    content = await fs.readFile(fs.joinPath(absPath, 'Package.swift'));
  } catch {
    return null;
  }
  const lc = content.toLowerCase();
  const framework: Framework = lc.includes('vapor') ? 'vapor' : 'other';
  const sourceFile = relPath ? `${relPath}/Package.swift` : 'Package.swift';
  return {
    language: 'swift',
    framework,
    target: framework === 'vapor' ? 'backend' : 'library',
    projectStage: 'brownfield',
    confidence: framework !== 'other' ? 'high' : 'low',
    source: sourceFile,
  };
}

// ---------- Helpers ----------

function inferNodeTarget(
  deps: Record<string, unknown>,
  dirNames: Set<string>,
): 'backend' | 'frontend' | 'bff' | 'script' | 'library' {
  const hasFrontendDep = Boolean(
    deps['react'] ||
    deps['@angular/core'] ||
    deps['vue'] ||
    deps['svelte'] ||
    deps['next'] ||
    deps['nuxt'],
  );
  const hasBackendDep = Boolean(
    deps['express'] ||
    deps['fastify'] ||
    deps['koa'] ||
    deps['@nestjs/core'] ||
    deps['hapi'] ||
    deps['restify'],
  );
  if (hasFrontendDep && hasBackendDep) return 'bff';
  if (hasFrontendDep) return 'frontend';
  if (hasBackendDep) return 'backend';
  if (dirNames.has('components') || dirNames.has('pages')) return 'frontend';
  if (dirNames.has('controllers') || dirNames.has('routes')) return 'backend';
  return 'backend';
}

function inferArchitectureFromDirs(dirNames: Set<string>): string | undefined {
  if (dirNames.has('domain') && dirNames.has('ports')) return 'hexagonal';
  if (dirNames.has('controllers') && dirNames.has('services') && dirNames.has('repositories')) {
    return 'layered';
  }
  return undefined;
}
