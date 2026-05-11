export type SpecStatus =
  | 'open'
  | 'in-progress'
  | 'review'
  | 'blocked'
  | 'ready-to-commit'
  | 'done'
  | 'cancelled';
export type Gate = 0 | 1 | 2 | 3 | 4;
export type ProjectStage = 'greenfield' | 'brownfield';
export type SpecType = 'story' | 'refactoring' | 'spike';

export interface StoryMetadata {
  id: string;
  title: string;
  createdAt: string;
  version: number;
  type: SpecType;
  status: SpecStatus;
  gate: Gate;
  dependsOn: string[];
}

export interface BusinessRequirement {
  problem: string;
  value: string;
  stakeholders: string[];
}

export interface FunctionalSpec {
  userStories: string[];
  acceptanceCriteria: string[];
  outOfScope: string[];
}

export interface NonFunctionalSpec {
  performance: string;
  security: string;
  scalability: string;
  usability: string;
  availability: string;
}

export type Language =
  | 'typescript'
  | 'javascript'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'python'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'scala'
  | 'swift'
  | 'unknown';
export type Framework =
  | 'dotnet'
  | 'springboot'
  | 'quarkus'
  | 'micronaut'
  | 'angular'
  | 'react'
  | 'vue'
  | 'svelte'
  | 'next'
  | 'nuxt'
  | 'nestjs'
  | 'express'
  | 'fastify'
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'rails'
  | 'laravel'
  | 'gin'
  | 'actix'
  | 'rocket'
  | 'vapor'
  | 'android'
  | 'gradle'
  | 'other';
export type Architecture = 'hexagonal' | 'layered' | 'microservices' | 'monolith' | 'serverless';
export type Target = 'backend' | 'frontend' | 'bff' | 'script' | 'library';
export type CiProvider = 'github-actions' | 'none';

export interface TechnicalSpec {
  language: Language | '';
  framework: Framework | '';
  architecture: Architecture | '';
  target: Target | '';
  database: string;
  infrastructure: string;
  projectStage: ProjectStage | '';
  ci: CiProvider | '';
}

export interface DoR {
  criteria: string[];
  checked: boolean[];
}

export interface DoD {
  criteria: string[];
}

export interface Story {
  metadata: StoryMetadata;
  businessRequirement: BusinessRequirement;
  functionalSpec: FunctionalSpec;
  nonFunctionalSpec: NonFunctionalSpec;
  technicalSpec: TechnicalSpec;
  dor: DoR;
  dod: DoD;
}

export interface Gap {
  section: string;
  field: string;
  message: string;
}

export interface DorStatus {
  criterion: string;
  checked: boolean;
}

export interface ValidationResult {
  valid: boolean;
  gaps: Gap[];
  dorStatus: DorStatus[];
}

export function emptyStory(): Story {
  return {
    metadata: {
      id: '',
      title: '',
      createdAt: '',
      version: 1,
      type: 'story',
      status: 'open',
      gate: 0,
      dependsOn: [],
    },
    businessRequirement: { problem: '', value: '', stakeholders: [] },
    functionalSpec: { userStories: [], acceptanceCriteria: [], outOfScope: [] },
    nonFunctionalSpec: {
      performance: '',
      security: '',
      scalability: '',
      usability: '',
      availability: '',
    },
    technicalSpec: {
      language: '',
      framework: '',
      architecture: '',
      target: '',
      database: '',
      infrastructure: '',
      projectStage: '',
      ci: '',
    },
    dor: { criteria: [], checked: [] },
    dod: { criteria: [] },
  };
}
