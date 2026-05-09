package io.speckit.llm;

import com.intellij.ide.plugins.PluginManagerCore;
import com.intellij.notification.NotificationGroupManager;
import com.intellij.notification.NotificationType;
import com.intellij.openapi.actionSystem.ActionManager;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.extensions.PluginId;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;

import java.awt.datatransfer.StringSelection;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * LLMBridge — integrates SpecKit with the active AI provider in IntelliJ.
 *
 * <p>Strategy (in order):
 * <ol>
 *   <li>Detect JetBrains AI Assistant (com.intellij.ml.llm) — open its chat panel.</li>
 *   <li>Detect GitHub Copilot for IntelliJ (com.github.copilot) — open its chat panel.</li>
 *   <li>Fallback — copy the prompt to the clipboard and notify the user.</li>
 * </ol>
 *
 * <p>The agent prompt is built from the spec file content. The user only needs to
 * paste (Ctrl+V) in the AI chat and press Enter — no API keys needed.
 */
public class LLMBridge {

    private static final String PLUGIN_JBAI    = "com.intellij.ml.llm";
    private static final String PLUGIN_COPILOT = "com.github.copilot";

    // JetBrains AI Chat action IDs (try in order — may vary per version)
    private static final String[] JBAI_CHAT_ACTIONS = {
        "MLChat.OpenNewChatAction",
        "AIAssistant.Chat.Open",
        "ai.grazie.assist.openChatWindow",
        "MLChat.ShowChatAction",
    };

    // GitHub Copilot Chat action IDs
    private static final String[] COPILOT_CHAT_ACTIONS = {
        "GitHub.Copilot.OpenChat",
        "GitHubCopilot.OpenChatToolWindow",
        "GitHub.Copilot.Chat.Open",
    };

    /**
     * Main entry point. Call this after the Core Server validates a spec successfully.
     *
     * @param project       the current IntelliJ project
     * @param specPath      absolute path to the .speckit/STORY-X.md or FIX-X.md file
     * @param workspaceRoot project workspace root (same as project.getBasePath())
     */
    public static void openSpecInAIChat(Project project, String specPath, String workspaceRoot) {
        ApplicationManager.getApplication().invokeLater(() -> {
            String prompt = buildAgentPrompt(specPath, workspaceRoot);

            // 1. Copy prompt to clipboard so the user can paste immediately
            CopyPasteManager.getInstance().setContents(new StringSelection(prompt));

            // 2. Open the spec file in the editor for reference
            if (specPath != null) {
                VirtualFile file = LocalFileSystem.getInstance().refreshAndFindFileByPath(specPath);
                if (file != null) {
                    FileEditorManager.getInstance(project).openFile(file, false);
                }
            }

            // 3. Try to open the AI chat panel
            AIProvider provider = detectProvider();
            boolean chatOpened = tryOpenChat(provider);

            // 4. Notify the user
            String title = "SpecKit — Agente Pronto";
            String pasteKey = System.getProperty("os.name", "").toLowerCase().contains("mac") ? "⌘V" : "Ctrl+V";
            String msg;
            if (chatOpened) {
                msg = "Prompt do agente copiado! Cole no AI Chat (" + pasteKey +
                        ") e pressione Enter para iniciar a implementação.";
            } else {
                msg = "Prompt copiado. " + buildProviderHint(provider);
            }

            showNotification(project, title, msg,
                    chatOpened ? NotificationType.INFORMATION : NotificationType.WARNING);
        });
    }

    // ───────────────────────── Provider Detection ─────────────────────────

    enum AIProvider { JBAI, COPILOT, NONE }

    static AIProvider detectProvider() {
        if (isPluginEnabled(PLUGIN_JBAI))    return AIProvider.JBAI;
        if (isPluginEnabled(PLUGIN_COPILOT)) return AIProvider.COPILOT;
        return AIProvider.NONE;
    }

    private static boolean isPluginEnabled(String pluginId) {
        try {
            return PluginManagerCore.isPluginInstalled(PluginId.getId(pluginId));
        } catch (Exception e) {
            return false;
        }
    }

    // ───────────────────────── AI Chat Opening ─────────────────────────

    static boolean tryOpenChat(AIProvider provider) {
        String[] actionIds = switch (provider) {
            case JBAI    -> JBAI_CHAT_ACTIONS;
            case COPILOT -> COPILOT_CHAT_ACTIONS;
            case NONE    -> new String[0];
        };

        ActionManager am = ActionManager.getInstance();
        for (String actionId : actionIds) {
            AnAction action = am.getAction(actionId);
            if (action != null) {
                try {
                    am.tryToExecute(action, null, null, null, true);
                    return true;
                } catch (Exception ignored) {
                    // try next action ID
                }
            }
        }
        return false;
    }

    // ───────────────────────── Prompt Building ─────────────────────────

    /**
     * Builds the agent prompt from the spec file content.
     * If a .github/copilot-instructions.md exists in the workspace, appends it.
     */
    public static String buildAgentPrompt(String specPath, String workspaceRoot) {
        if (specPath == null) {
            return "❌ Path da spec não fornecido — execute /validate primeiro.";
        }
        try {
            String specContent = new String(Files.readAllBytes(Paths.get(specPath)));
            String specFileName = Paths.get(specPath).getFileName().toString();
            boolean isFix = specFileName.startsWith("FIX-");

            StringBuilder sb = new StringBuilder();
            sb.append("## 🤖 Agente SpecKit — ").append(specFileName).append("\n\n");
            sb.append("Você é um agente de ")
              .append(isFix ? "correção de bug" : "implementação")
              .append(" SpecKit. Siga rigorosamente a spec abaixo.\n\n");
            sb.append("---\n## Spec\n\n").append(specContent).append("\n\n");

            appendInstructions(sb, workspaceRoot);

            sb.append("---\n\n");
            if (isFix) {
                sb.append("1. Localize a causa raiz do bug descrito.\n");
                sb.append("2. Implemente a correção.\n");
                sb.append("3. Escreva testes que provem que o bug está corrigido.\n");
            } else {
                sb.append("1. Implemente todos os critérios de aceite da spec.\n");
                sb.append("2. Escreva testes comportamentais para cada critério.\n");
                sb.append("3. Ao concluir, informe o status de cada critério.\n");
            }

            return sb.toString();
        } catch (IOException e) {
            return "❌ Erro ao ler spec em `" + specPath + "`: " + e.getMessage();
        }
    }

    private static void appendInstructions(StringBuilder sb, String workspaceRoot) {
        if (workspaceRoot == null) return;
        File instrFile = new File(workspaceRoot, ".github/copilot-instructions.md");
        if (!instrFile.exists()) return;
        try {
            String instructions = new String(Files.readAllBytes(instrFile.toPath()));
            sb.append("---\n## Instruções do Workspace\n\n").append(instructions).append("\n\n");
        } catch (IOException ignored) {
            // skip if unreadable
        }
    }

    // ───────────────────────── Notifications ─────────────────────────

    private static void showNotification(Project project, String title,
                                         String message, NotificationType type) {
        try {
            NotificationGroupManager.getInstance()
                    .getNotificationGroup("SpecKit Notifications")
                    .createNotification(title, message, type)
                    .notify(project);
        } catch (Exception e) {
            // NotificationGroup not registered — safe fallback
            System.out.println("[SpecKit] " + title + ": " + message);
        }
    }

    static String buildProviderHint(AIProvider provider) {
        return switch (provider) {
            case JBAI    -> "Abra o JetBrains AI Chat e cole o prompt para iniciar.";
            case COPILOT -> "Abra o GitHub Copilot Chat e cole o prompt para iniciar.";
            case NONE    -> "Instale JetBrains AI Assistant ou GitHub Copilot for IntelliJ para " +
                            "usar a integração automática. O prompt foi copiado — cole em qualquer AI chat.";
        };
    }
}
