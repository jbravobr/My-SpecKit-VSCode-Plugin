export declare const FORBIDDEN_VSIX_PATHS: string[];

export declare function getPackageMetadata(rootDir?: string): {
  rootDir: string;
  packageJsonPath: string;
  name: string;
  version: string;
};

export declare function getVsixOutputPath(rootDir?: string): string;

export declare function ensureCleanVsixOutput(vsixPath: string): void;

export declare function readZipEntries(zipPath: string): string[];

export declare function findForbiddenEntries(
  entries: string[],
  forbiddenPrefixes?: string[],
): string[];

export declare function assertNoForbiddenEntries(
  entries: string[],
  forbiddenPrefixes?: string[],
): void;

export declare function formatVsixPath(vsixPath: string): string;

export declare function getVsceBinPath(rootDir?: string): string;
