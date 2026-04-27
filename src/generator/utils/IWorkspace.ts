import { TechStackDetection } from '../../fix/Fix';

export interface IWorkspace {
  getWorkspaceRoot(): string | undefined;
  listStoryFiles(dirPath: string): Promise<string[]>;
  listFixFiles(dirPath: string): Promise<string[]>;
  getActiveStoryPath(): Promise<string | undefined>;
  getActiveSpecPath(): Promise<string | undefined>;
  detectTechStack(): Promise<TechStackDetection>;
  detectAllTechStacks(): Promise<TechStackDetection[]>;
}
