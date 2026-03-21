import { Language, Framework, SpecStatus } from '../story/Story';

export interface FixMetadata {
  id: string;
  title: string;
  createdAt: string;
  version: number;
  type: 'fix';
  status: SpecStatus;
}

export interface BugDescription {
  title: string;
  symptoms: string;
  stepsToReproduce: string[];
  environment: string;
  frequency: string;
}

export interface RootCauseHypothesis {
  hypothesis: string;
  suspectedFiles: string[];
  suspectedComponents: string[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface ImpactAssessment {
  severity: Severity | '';
  affectedUsers: string;
  affectedSystems: string[];
  regressionRisk: string;
}

export interface RegressionPrevention {
  testsToAdd: string[];
}

export interface Dof {
  criteria: string[];
}

export interface Fix {
  metadata: FixMetadata;
  bugDescription: BugDescription;
  rootCauseHypothesis: RootCauseHypothesis;
  impactAssessment: ImpactAssessment;
  regressionPrevention: RegressionPrevention;
  dof: Dof;
}

export interface TechStackDetection {
  language: Language;
  framework: Framework;
  architecture?: string;
  target: 'backend' | 'frontend' | 'fullstack' | 'script' | 'library';
  confidence: 'high' | 'low';
  source: string;
}

export interface FixGap {
  section: string;
  field: string;
  message: string;
}

export interface FixValidationResult {
  valid: boolean;
  gaps: FixGap[];
}
