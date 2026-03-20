export interface StoryMetadata {
  id: string;
  title: string;
  createdAt: string;
  version: number;
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

export type Language = 'typescript' | 'javascript' | 'java' | 'csharp' | 'python';
export type Framework = 'dotnet' | 'springboot' | 'angular' | 'react' | 'fastapi' | 'other';
export type Architecture = 'hexagonal' | 'layered' | 'microservices' | 'monolith' | 'serverless';
export type Target = 'backend' | 'frontend' | 'fullstack' | 'script' | 'library';

export interface TechnicalSpec {
  language: Language | '';
  framework: Framework | '';
  architecture: Architecture | '';
  target: Target | '';
  database: string;
  infrastructure: string;
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
    metadata: { id: '', title: '', createdAt: '', version: 1 },
    businessRequirement: { problem: '', value: '', stakeholders: [] },
    functionalSpec: { userStories: [], acceptanceCriteria: [], outOfScope: [] },
    nonFunctionalSpec: { performance: '', security: '', scalability: '', usability: '', availability: '' },
    technicalSpec: { language: '', framework: '', architecture: '', target: '', database: '', infrastructure: '' },
    dor: { criteria: [], checked: [] },
    dod: { criteria: [] },
  };
}
