import { IWorkspace } from './IWorkspace';
import {
  getWorkspaceRoot,
  listStoryFiles,
  listFixFiles,
  getActiveStoryPath,
  getActiveSpecPath,
  detectTechStack,
  detectAllTechStacks,
} from './workspace';

export const vscodeWorkspace: IWorkspace = {
  getWorkspaceRoot,
  listStoryFiles,
  listFixFiles,
  getActiveStoryPath,
  getActiveSpecPath,
  detectTechStack,
  detectAllTechStacks,
};
