// stackDetector.test.ts — unit tests for recursive multi-language stack detection.
//
// Uses an InMemoryFs that fully implements StackDetectorFs so we exercise the
// real BFS / parser logic without touching disk or vscode APIs.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_DEPTH,
  detectAllStacks,
  IGNORED_DIRS,
  StackDetectorEntry,
  StackDetectorFs,
} from '../../../../src/generator/utils/stackDetector';

// ───────────────────────── In-memory filesystem ─────────────────────────────

interface FsNode {
  isDirectory: boolean;
  isFile: boolean;
  content?: string;
}

class InMemoryFs implements StackDetectorFs {
  private readonly nodes = new Map<string, FsNode>();

  addFile(absPath: string, content: string): this {
    const norm = this.normalize(absPath);
    this.ensureParents(norm);
    this.nodes.set(norm, { isDirectory: false, isFile: true, content });
    return this;
  }

  addDir(absPath: string): this {
    const norm = this.normalize(absPath);
    this.ensureParents(norm);
    this.nodes.set(norm, { isDirectory: true, isFile: false });
    return this;
  }

  private ensureParents(normalizedPath: string): void {
    const parts = normalizedPath.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc === '' ? parts[i] : `${acc}/${parts[i]}`;
      if (!this.nodes.has(acc)) {
        this.nodes.set(acc, { isDirectory: true, isFile: false });
      }
    }
  }

  /** Strips leading and trailing slashes; backslashes → forward slashes. */
  private normalize(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  async readDirectory(dirPath: string): Promise<StackDetectorEntry[]> {
    const norm = this.normalize(dirPath);
    if (norm !== '' && !this.nodes.has(norm)) {
      throw new Error(`ENOENT ${dirPath}`);
    }
    const prefix = norm ? `${norm}/` : '';
    const direct = new Map<string, StackDetectorEntry>();
    for (const [key, node] of this.nodes) {
      if (norm && !key.startsWith(prefix)) continue;
      const rest = norm ? key.slice(prefix.length) : key;
      if (!rest || rest.includes('/')) continue;
      direct.set(rest, { name: rest, isDirectory: node.isDirectory, isFile: node.isFile });
    }
    return Array.from(direct.values());
  }

  async readFile(filePath: string): Promise<string> {
    const node = this.nodes.get(this.normalize(filePath));
    if (!node || !node.isFile) throw new Error(`ENOENT ${filePath}`);
    return node.content ?? '';
  }

  joinPath(...segments: string[]): string {
    return segments.filter(Boolean).join('/');
  }
}

// ───────────────────────── Tests ────────────────────────────────────────────

describe('detectAllStacks — single-ecosystem at root', () => {
  it('detects Node.js + React from package.json', async () => {
    const fs = new InMemoryFs()
      .addFile('/repo/package.json', JSON.stringify({ dependencies: { react: '18.0.0' } }))
      .addFile('/repo/tsconfig.json', '{}');

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('typescript');
    expect(result[0].framework).toBe('react');
    expect(result[0].confidence).toBe('high');
    expect(result[0].source).toBe('package.json');
  });

  it('detects Java + Spring Boot from pom.xml', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/pom.xml',
      `<project><dependencies>
         <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter</artifactId></dependency>
         <dependency><groupId>org.springframework.kafka</groupId><artifactId>spring-kafka</artifactId></dependency>
       </dependencies></project>`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('java');
    expect(result[0].framework).toBe('springboot');
    expect(result[0].messaging).toBe('kafka');
    expect(result[0].source).toBe('pom.xml');
  });

  it('detects Java + Spring Boot from Gradle (build.gradle)', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/build.gradle',
      `plugins { id 'org.springframework.boot' version '3.2.0' }
       dependencies { implementation 'org.springframework.kafka:spring-kafka' }`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('java');
    expect(result[0].framework).toBe('springboot');
    expect(result[0].messaging).toBe('kafka');
    expect(result[0].source).toBe('build.gradle');
  });

  it('detects Kotlin + Spring Boot from build.gradle.kts', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/build.gradle.kts',
      `plugins {
         kotlin("jvm") version "1.9.0"
         id("org.springframework.boot") version "3.2.0"
       }`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('kotlin');
    expect(result[0].framework).toBe('springboot');
  });

  it('detects Kotlin + Android from Gradle plus AndroidManifest.xml', async () => {
    const fs = new InMemoryFs()
      .addFile(
        '/repo/build.gradle.kts',
        `plugins {
           id("com.android.application")
           kotlin("android") version "1.9.0"
         }`,
      )
      .addFile('/repo/AndroidManifest.xml', '<manifest/>');

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('kotlin');
    expect(result[0].framework).toBe('android');
    expect(result[0].target).toBe('frontend');
  });

  it('detects C# + .NET from *.csproj', async () => {
    const fs = new InMemoryFs().addFile('/repo/MyApp.csproj', '<Project Sdk="Microsoft.NET.Sdk"/>');

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('csharp');
    expect(result[0].framework).toBe('dotnet');
    expect(result[0].source).toBe('MyApp.csproj');
  });

  it('detects Python + FastAPI from requirements.txt', async () => {
    const fs = new InMemoryFs().addFile('/repo/requirements.txt', 'fastapi==0.110.0\nuvicorn');

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('python');
    expect(result[0].framework).toBe('fastapi');
    expect(result[0].confidence).toBe('high');
  });

  it('detects Python + Django from pyproject.toml', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/pyproject.toml',
      '[project]\ndependencies = ["django>=5.0"]',
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].framework).toBe('django');
  });

  it('detects Python + Flask from Pipfile', async () => {
    const fs = new InMemoryFs().addFile('/repo/Pipfile', '[packages]\nflask = "*"');

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].framework).toBe('flask');
  });

  it('detects Go + Gin from go.mod', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/go.mod',
      `module example.com/api
       go 1.22
       require github.com/gin-gonic/gin v1.9.1`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('go');
    expect(result[0].framework).toBe('gin');
  });

  it('detects Rust + Actix from Cargo.toml', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/Cargo.toml',
      `[package]
       name = "api"
       [dependencies]
       actix-web = "4"`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('rust');
    expect(result[0].framework).toBe('actix');
  });

  it('detects PHP + Laravel from composer.json', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/composer.json',
      JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('php');
    expect(result[0].framework).toBe('laravel');
  });

  it('detects Ruby + Rails from Gemfile', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/Gemfile',
      `source "https://rubygems.org"
       gem "rails", "~> 7.1"`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('ruby');
    expect(result[0].framework).toBe('rails');
  });

  it('detects Scala from build.sbt (low confidence without specific framework)', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/build.sbt',
      `name := "api"
       scalaVersion := "3.3.0"`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('scala');
    expect(result[0].confidence).toBe('low');
  });

  it('detects Swift + Vapor from Package.swift', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/Package.swift',
      `// swift-tools-version:5.9
       import PackageDescription
       .package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")`,
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('swift');
    expect(result[0].framework).toBe('vapor');
  });
});

describe('detectAllStacks — Node.js framework matrix', () => {
  it.each([
    ['next', 'next', 'frontend'],
    ['nuxt', 'nuxt', 'frontend'],
    ['@angular/core', 'angular', 'frontend'],
    ['@nestjs/core', 'nestjs', 'backend'],
    ['vue', 'vue', 'frontend'],
    ['svelte', 'svelte', 'frontend'],
    ['fastify', 'fastify', 'backend'],
    ['express', 'express', 'backend'],
  ])(
    'detects %s package as framework=%s, target=%s',
    async (depName, expectedFw, expectedTarget) => {
      const fs = new InMemoryFs().addFile(
        '/repo/package.json',
        JSON.stringify({ dependencies: { [depName]: '1.0.0' } }),
      );

      const result = await detectAllStacks('/repo', fs);

      expect(result[0].framework).toBe(expectedFw);
      expect(result[0].target).toBe(expectedTarget);
    },
  );

  it('returns bff target when both frontend and backend deps present', async () => {
    const fs = new InMemoryFs().addFile(
      '/repo/package.json',
      JSON.stringify({ dependencies: { react: '18.0.0', express: '4.0.0' } }),
    );

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].target).toBe('bff');
  });

  it('falls back to javascript when tsconfig.json absent', async () => {
    const fs = new InMemoryFs().addFile('/repo/package.json', JSON.stringify({ dependencies: {} }));

    const result = await detectAllStacks('/repo', fs);

    expect(result[0].language).toBe('javascript');
    expect(result[0].confidence).toBe('low');
  });
});

describe('detectAllStacks — recursive depth and ignored dirs', () => {
  it('detects manifests deep in the tree (up to depth 7)', async () => {
    const fs = new InMemoryFs().addFile(
      '/root/a/b/c/d/e/f/g/package.json',
      JSON.stringify({ dependencies: { react: '18.0.0' } }),
    );

    const result = await detectAllStacks('/root', fs);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('a/b/c/d/e/f/g/package.json');
  });

  it('does NOT detect manifests beyond depth 7', async () => {
    const fs = new InMemoryFs().addFile(
      '/root/a/b/c/d/e/f/g/h/package.json',
      JSON.stringify({ dependencies: { react: '18.0.0' } }),
    );

    const result = await detectAllStacks('/root', fs);

    expect(result).toHaveLength(0);
  });

  it('respects custom maxDepth option', async () => {
    const fs = new InMemoryFs().addFile(
      '/root/a/b/c/package.json',
      JSON.stringify({ dependencies: {} }),
    );

    const shallow = await detectAllStacks('/root', fs, { maxDepth: 2 });
    const deeper = await detectAllStacks('/root', fs, { maxDepth: 3 });

    expect(shallow).toHaveLength(0);
    expect(deeper).toHaveLength(1);
  });

  it('skips ignored directories (node_modules, .git, dist, build, target)', async () => {
    const fs = new InMemoryFs()
      .addFile('/repo/node_modules/lodash/package.json', JSON.stringify({ name: 'lodash' }))
      .addFile('/repo/.git/config', '')
      .addFile('/repo/dist/package.json', JSON.stringify({}))
      .addFile('/repo/target/pom.xml', '<project/>')
      .addFile('/repo/build/build.gradle', "apply plugin: 'java'")
      .addFile('/repo/src/main/Main.java', '');

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(0);
  });

  it('default max depth constant equals 7', () => {
    expect(DEFAULT_MAX_DEPTH).toBe(7);
  });

  it('IGNORED_DIRS includes the most common offenders', () => {
    expect(IGNORED_DIRS.has('node_modules')).toBe(true);
    expect(IGNORED_DIRS.has('.git')).toBe(true);
    expect(IGNORED_DIRS.has('target')).toBe(true);
    expect(IGNORED_DIRS.has('build')).toBe(true);
    expect(IGNORED_DIRS.has('.gradle')).toBe(true);
    expect(IGNORED_DIRS.has('venv')).toBe(true);
    expect(IGNORED_DIRS.has('vendor')).toBe(true);
  });
});

describe('detectAllStacks — monorepo (multi-manifest list)', () => {
  it('returns multiple detections sorted by depth then alphabetically', async () => {
    const fs = new InMemoryFs()
      .addFile('/repo/apps/web/package.json', JSON.stringify({ dependencies: { react: '18.0.0' } }))
      .addFile('/repo/apps/web/tsconfig.json', '{}')
      .addFile(
        '/repo/services/api/pom.xml',
        '<project><dependency>spring-boot-starter</dependency></project>',
      )
      .addFile(
        '/repo/services/worker/go.mod',
        'module worker\n require github.com/gin-gonic/gin v1.9.1',
      );

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(3);
    const sources = result.map((r) => r.source);
    expect(sources).toEqual([
      'apps/web/package.json',
      'services/api/pom.xml',
      'services/worker/go.mod',
    ]);
  });

  it('shallower manifests come before deeper ones', async () => {
    const fs = new InMemoryFs()
      .addFile('/repo/services/deep/api/pom.xml', '<project/>')
      .addFile('/repo/package.json', JSON.stringify({ dependencies: {} }));

    const result = await detectAllStacks('/repo', fs);

    expect(result.map((r) => r.source)).toEqual(['package.json', 'services/deep/api/pom.xml']);
  });

  it('returns empty list when no manifest is found anywhere', async () => {
    const fs = new InMemoryFs()
      .addFile('/repo/README.md', '# Empty')
      .addFile('/repo/src/main.txt', '');

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(0);
  });
});

describe('detectAllStacks — robustness', () => {
  it('does not throw when a manifest is malformed JSON', async () => {
    const fs = new InMemoryFs().addFile('/repo/package.json', '{ not json');

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(0);
  });

  it('does not throw when a directory cannot be read', async () => {
    const fs: StackDetectorFs = {
      async readDirectory() {
        throw new Error('EACCES');
      },
      async readFile() {
        throw new Error('EACCES');
      },
      joinPath: (...s) => s.join('/'),
    };

    const result = await detectAllStacks('/restricted', fs);

    expect(result).toHaveLength(0);
  });

  it('coexists Maven + Gradle in the same module (returns both)', async () => {
    const fs = new InMemoryFs()
      .addFile('/repo/pom.xml', '<project>spring-boot</project>')
      .addFile('/repo/build.gradle', "apply plugin: 'java'");

    const result = await detectAllStacks('/repo', fs);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.source).sort()).toEqual(['build.gradle', 'pom.xml']);
  });
});
