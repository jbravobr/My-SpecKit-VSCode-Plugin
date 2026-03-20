export interface IFileSystem {
  ensureDir(dirPath: string): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
}
