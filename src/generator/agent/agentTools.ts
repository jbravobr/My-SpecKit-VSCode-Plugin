/**
 * Explicit tool list for .agent.md frontmatter.
 * Replaces wildcard ["*"] which doesn't reliably expose tools in Agent Mode.
 */
export const AGENT_TOOLS_YAML = `tools:
  [
    read/readFile,
    read/problems,
    read/terminalSelection,
    read/terminalLastCommand,
    edit/editFiles,
    edit/createFile,
    edit/createDirectory,
    edit/rename,
    search/fileSearch,
    search/textSearch,
    search/listDirectory,
    search/codebase,
    search/changes,
    search/usages,
    execute/runInTerminal,
    execute/getTerminalOutput,
    execute/awaitTerminal,
    execute/killTerminal,
    execute/createAndRunTask,
    execute/testFailure,
    agent/runSubagent,
    todo,
    web/fetch,
    vscode/getProjectSetupInfo,
    vscode/runCommand,
    vscode/vscodeAPI,
    vscode/askQuestions,
    vscode/memory,
  ]`;
