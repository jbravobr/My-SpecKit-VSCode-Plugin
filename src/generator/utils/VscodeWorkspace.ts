import { IWorkspace } from './IWorkspace';
import { getWorkspaceRoot, listStoryFiles, getActiveStoryPath } from './workspace';

export const vscodeWorkspace: IWorkspace = { getWorkspaceRoot, listStoryFiles, getActiveStoryPath };
