export interface IWorkspace {
  getWorkspaceRoot(): string | undefined;
  listStoryFiles(dirPath: string): Promise<string[]>;
  getActiveStoryPath(): Promise<string | undefined>;
}
