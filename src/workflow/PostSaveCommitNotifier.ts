import { IFileSystem } from '../generator/utils/IFileSystem';
import { IWorkspace } from '../generator/utils/IWorkspace';
import { parseStory } from '../story/StoryParser';
import { extractSpecType } from '../parser/BaseParser';
import { IGitOps } from './GitOperations';

export interface PostSaveNotifyDeps {
  workspace: IWorkspace;
  fs: IFileSystem;
  git: IGitOps;
  /**
   * Called when the notifier determines the user should commit after Keep.
   * Receives the spec ID for display. Returns true if the user accepted the
   * prompt (implementation shows a VS Code info message or equivalent).
   */
  notify: (specId: string) => Promise<boolean>;
}

/**
 * Core logic for the post-save commit nudge.
 *
 * After the user clicks "Keep" on the Copilot Edits bar, source files land on
 * disk and formatters may introduce further changes. This function runs
 * (debounced, via onDidSaveTextDocument) to detect the situation and nudge the
 * user to run /commit if:
 *   - there is an active spec at gate 4 / status done, AND
 *   - git still has uncommitted changes.
 *
 * Extracted from extension.ts so it can be unit-tested without a VS Code host.
 */
export async function checkPostSavePendingCommit(deps: PostSaveNotifyDeps): Promise<void> {
  const { workspace, fs, git, notify } = deps;

  const workspaceRoot = workspace.getWorkspaceRoot();
  if (!workspaceRoot) return;

  const activeSpecPath = await workspace.getActiveSpecPath();
  if (!activeSpecPath) return;

  let specId: string;
  try {
    const content = await fs.readFile(activeSpecPath);
    const specType = extractSpecType(content);
    if (specType !== 'story') return;

    const story = parseStory(content);
    if (story.metadata.gate !== 4 || story.metadata.status !== 'done') return;
    specId = story.metadata.id;
  } catch {
    return;
  }

  const dirty = await git.hasChanges(workspaceRoot).catch(() => false);
  if (!dirty) return;

  await notify(specId);
}
