package io.speckit.toolwindow;

import com.intellij.openapi.project.Project;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.ui.components.JBTextArea;
import com.intellij.ui.components.JBTextField;
import io.speckit.client.CoreServerClient;
import io.speckit.server.CoreServerManager;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Main SpecKit Tool Window providing a multi-turn chat interface.
 * Communicates with the SpecKit Core Server via HTTP.
 *
 * Layout (top → bottom):
 *   [serverBar]  — status label + "▶ Start Server" button
 *   [cmdGrid]    — 3-column grid of quick-action command buttons (always fully visible)
 *   [chatArea]   — scrollable conversation history
 *   [inputRow]   — text field + Send button
 */
public class SpeckitToolWindow {

    // Commands shown as quick-action buttons — label : command sent
    private static final String[][] COMMANDS = {
            {"📄 /new",      "/new"},
            {"✅ /validate", "/validate"},
            {"📊 /status",   "/status"},
            {"📊 /status --all", "/status --all"},
            {"🔍 /diff",     "/diff"},
            {"💾 /commit",   "/commit"},
            {"🔧 /fix",      "/fix"},
            {"📜 /history",  "/history"},
            {"❓ /help",     "/help"},
    };

    private final Project project;
    private final JPanel panel;
    private final JTextArea chatHistory;
    private final JTextField inputField;
    private final JButton sendButton;
    private final JLabel serverStatusLabel;
    private final JButton startServerButton;
    private final CoreServerClient client;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public SpeckitToolWindow(Project project) {
        this.project = project;
        this.client = new CoreServerClient(CoreServerManager.BASE_URL);

        // ── Input row (initialized first — referenced in cmdGrid lambdas) ───────
        inputField = new JBTextField();
        inputField.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        inputField.setToolTipText("Digite um comando SpecKit: /new, /status, /validate, /commit...");
        inputField.addKeyListener(new KeyAdapter() {
            @Override
            public void keyPressed(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.VK_ENTER) {
                    handleSend();
                }
            }
        });

        sendButton = new JButton("Enviar");
        sendButton.addActionListener((ActionEvent e) -> handleSend());

        JPanel inputRow = new JPanel(new BorderLayout(4, 0));
        inputRow.add(inputField, BorderLayout.CENTER);
        inputRow.add(sendButton, BorderLayout.EAST);

        // ── Server status bar ────────────────────────────────────────────────
        serverStatusLabel = new JLabel("⬤ Checking...");
        serverStatusLabel.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));

        startServerButton = new JButton("▶ Start Server");
        startServerButton.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
        startServerButton.setToolTipText("Start the SpecKit Core Server (Node.js, port 4815)");
        startServerButton.addActionListener((ActionEvent e) -> handleStartServer());

        JPanel serverBar = new JPanel(new BorderLayout(6, 0));
        serverBar.setBorder(BorderFactory.createEmptyBorder(2, 0, 4, 0));
        serverBar.add(serverStatusLabel, BorderLayout.CENTER);
        serverBar.add(startServerButton, BorderLayout.EAST);

        // ── Command grid (3 columns, always fully visible) ───────────────────
        int cols = 3;
        int rows = (int) Math.ceil((double) COMMANDS.length / cols);
        JPanel cmdGrid = new JPanel(new GridLayout(rows, cols, 4, 4));
        cmdGrid.setBorder(BorderFactory.createTitledBorder("Comandos"));

        for (String[] entry : COMMANDS) {
            String label   = entry[0];
            String command = entry[1];
            JButton btn = new JButton(label);
            btn.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
            btn.setMargin(new Insets(2, 4, 2, 4));
            btn.setToolTipText(command);
            btn.addActionListener((ActionEvent e) -> {
                inputField.setText(command);
                handleSend();
            });
            cmdGrid.add(btn);
        }

        // ── Chat history ─────────────────────────────────────────────────────
        chatHistory = new JBTextArea();
        chatHistory.setEditable(false);
        chatHistory.setLineWrap(true);
        chatHistory.setWrapStyleWord(true);
        chatHistory.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        chatHistory.setText("SpecKit — Spec Driven Development\n" +
                "Clique em um comando acima ou digite na caixa abaixo e pressione Enter.\n\n");

        JBScrollPane scrollPane = new JBScrollPane(chatHistory);

        // ── North panel (server bar + command grid) ──────────────────────────
        JPanel northPanel = new JPanel(new BorderLayout(0, 4));
        northPanel.add(serverBar, BorderLayout.NORTH);
        northPanel.add(cmdGrid, BorderLayout.CENTER);

        // ── Root panel ───────────────────────────────────────────────────────
        panel = new JPanel(new BorderLayout(0, 4));
        panel.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));
        panel.add(northPanel, BorderLayout.NORTH);
        panel.add(scrollPane,  BorderLayout.CENTER);
        panel.add(inputRow,    BorderLayout.SOUTH);

        // Refresh server status after a short delay (IDE may still be loading)
        Timer statusTimer = new Timer(1500, (ActionEvent e) -> refreshServerStatus());
        statusTimer.setRepeats(false);
        statusTimer.start();
    }

    public JComponent getContent() {
        return panel;
    }

    // ── Server controls ──────────────────────────────────────────────────────

    private void refreshServerStatus() {
        executor.submit(() -> {
            boolean up = client.isHealthy();
            SwingUtilities.invokeLater(() -> updateServerStatusUI(up));
        });
    }

    private void updateServerStatusUI(boolean up) {
        if (up) {
            serverStatusLabel.setText("⬤ Core Server rodando (porta 4815)");
            serverStatusLabel.setForeground(new Color(34, 139, 34));
            startServerButton.setEnabled(false);
            startServerButton.setText("✔ Online");
        } else {
            serverStatusLabel.setText("⬤ Core Server parado");
            serverStatusLabel.setForeground(Color.RED);
            startServerButton.setEnabled(true);
            startServerButton.setText("▶ Start Server");
        }
    }

    private void handleStartServer() {
        startServerButton.setEnabled(false);
        startServerButton.setText("⏳ Iniciando...");
        serverStatusLabel.setText("⬤ Iniciando Core Server...");
        serverStatusLabel.setForeground(Color.ORANGE);

        executor.submit(() -> {
            CoreServerManager.getInstance().ensureRunning();
            boolean up = client.isHealthy();
            SwingUtilities.invokeLater(() -> {
                updateServerStatusUI(up);
                if (up) {
                    appendToChat("SpecKit: ✅ Core Server iniciado com sucesso (porta 4815)\n\n");
                } else {
                    appendToChat("SpecKit: ❌ Falha ao iniciar o Core Server.\n" +
                            "Verifique se Node.js está instalado e se packages/core-server/dist/server.js existe.\n\n");
                }
            });
        });
    }

    // ── Command dispatch ─────────────────────────────────────────────────────

    private void handleSend() {
        String input = inputField.getText().trim();
        if (input.isEmpty()) return;

        inputField.setText("");
        appendToChat("▶ " + input + "\n");
        inputField.setEnabled(false);
        sendButton.setEnabled(false);

        executor.submit(() -> {
            try {
                String response = processCommand(input);
                SwingUtilities.invokeLater(() -> {
                    appendToChat("SpecKit:\n" + response + "\n\n");
                    inputField.setEnabled(true);
                    sendButton.setEnabled(true);
                    inputField.requestFocus();
                });
            } catch (Exception ex) {
                SwingUtilities.invokeLater(() -> {
                    appendToChat("SpecKit: ❌ " + ex.getMessage() + "\n\n");
                    inputField.setEnabled(true);
                    sendButton.setEnabled(true);
                });
            }
        });
    }

    private String processCommand(String input) throws IOException {
        String workspaceRoot = project.getBasePath();
        if (workspaceRoot == null) workspaceRoot = System.getProperty("user.dir");

        // Auto-start if needed
        if (!client.isHealthy()) {
            CoreServerManager.getInstance().ensureRunning();
            boolean up = client.isHealthy();
            final boolean finalUp = up;
            SwingUtilities.invokeLater(() -> updateServerStatusUI(finalUp));
            if (!up) {
                return "❌ Core Server não está rodando.\n" +
                        "Clique em '▶ Start Server' ou verifique se Node.js está instalado.\n" +
                        "Caminho esperado: packages/core-server/dist/server.js";
            }
        }

        String[] parts = input.trim().split("\\s+", 2);
        String command = parts[0].toLowerCase();

        switch (command) {
            case "/new":
                return client.createNew(workspaceRoot).markdown;
            case "/fix":
                return "ℹ️ Para criar um fix, use /new e escolha o tipo Fix no arquivo gerado.\n" +
                        "Suporte a /fix dedicado será adicionado em breve.";
            case "/validate":
                return client.validate(workspaceRoot).markdown;
            case "/status":
                boolean all = input.contains("--all") || input.contains("--closed");
                return client.getStatus(workspaceRoot, all).markdown;
            case "/commit":
                String commitMsg = parts.length > 1 ? parts[1] : null;
                return client.commit(workspaceRoot, commitMsg).markdown;
            case "/diff":
                boolean full = input.contains("--full");
                return client.getDiff(workspaceRoot, full).markdown;
            case "/history":
                return "ℹ️ Histórico de audit disponível em .speckit/audit.log no workspace.";
            case "/help":
                return client.getHelp().markdown;
            default:
                return "❓ Comando desconhecido: " + command + "\n\n" +
                        "Comandos disponíveis: /new, /fix, /validate, /status, /status --all, " +
                        "/diff, /commit, /history, /help";
        }
    }

    private void appendToChat(String text) {
        chatHistory.append(text);
        chatHistory.setCaretPosition(chatHistory.getDocument().getLength());
    }
}
