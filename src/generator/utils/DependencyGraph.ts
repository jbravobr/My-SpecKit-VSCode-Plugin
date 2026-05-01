import type { Story } from '../../story/Story';

export interface DependencyResult {
  /** Story IDs that have no pending dependencies and can start immediately */
  independent: string[];
  /** Map of story ID → list of dependency IDs that are NOT done */
  blocked: Map<string, string[]>;
}

/**
 * Analyzes dependencies between stories based on the canonical `dependsOn` field.
 * A story is independent if `dependsOn` is empty OR all dependencies have status `done`.
 */
export function analyzeDependencies(stories: Story[]): DependencyResult {
  const statusMap = new Map<string, string>();
  for (const s of stories) {
    statusMap.set(s.metadata.id, s.metadata.status);
  }

  const independent: string[] = [];
  const blocked = new Map<string, string[]>();

  for (const story of stories) {
    if (story.metadata.status === 'done' || story.metadata.status === 'cancelled') continue;

    const pending = story.metadata.dependsOn.filter((depId) => {
      const status = statusMap.get(depId);
      return status !== 'done';
    });

    if (pending.length === 0) {
      independent.push(story.metadata.id);
    } else {
      blocked.set(story.metadata.id, pending);
    }
  }

  return { independent, blocked };
}
