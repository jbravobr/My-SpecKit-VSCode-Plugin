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
 */
public class SpeckitToolWindow {

    private final Project project;
    private final JPanel panel;
    private final JTextArea chatHistory;
    private final JTextField inputField;
    private final JButton sendButton;
    private final CoreServerClient client;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private static final String[] QUICK_COMMANDS = {
            "/new", "/validate", "/status", "/diff", "/commit", "/help"
    };

    public SpeckitToolWindow(Project project) {
        this.project = project;
        this.client = new CoreServerClient(CoreServerManager.BASE_URL);

        chatHistory = new JBTextArea();
        chatHistory.setEditable(false);
        chatHistory.setLineWrap(true);
        chatHistory.setWrapStyleWord(true);
        chatHistory.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        chatHistory.setText("SpecKit ready. Type a command (e.g. /new, /status, /validate) and press Enter.\n\n");

        JBScrollPane scrollPane = new JBScrollPane(chatHistory);
        scrollPane.setPreferredSize(new Dimension(400, 300));

        inputField = new JBTextField();
        inputField.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        inputField.setToolTipText("Type a SpecKit command: /new, /status, /validate, /commit, /help...");
        inputField.addKeyListener(new KeyAdapter() {
            @Override
            public void keyPressed(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.VK_ENTER) {
                    handleSend();
                }
            }
        });

        sendButton = new JButton("Send");
        sendButton.addActionListener((ActionEvent e) -> handleSend());

        JPanel quickPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 4, 2));
        for (String cmd : QUICK_COMMANDS) {
            JButton btn = new JButton(cmd);
            btn.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
            btn.addActionListener((ActionEvent e) -> {
                inputField.setText(cmd);
                handleSend();
            });
            quickPanel.add(btn);
        }

        JPanel inputRow = new JPanel(new BorderLayout(4, 0));
        inputRow.add(inputField, BorderLayout.CENTER);
        inputRow.add(sendButton, BorderLayout.EAST);

        panel = new JPanel(new BorderLayout(0, 4));
        panel.setBorder(BorderFactory.createEmptyBorder(4, 4, 4, 4));
        panel.add(scrollPane, BorderLayout.CENTER);
        panel.add(quickPanel, BorderLayout.NORTH);
        panel.add(inputRow, BorderLayout.SOUTH);
    }

    public JComponent getContent() {
        return panel;
    }

    private void handleSend() {
        String input = inputField.getText().trim();
        if (input.isEmpty()) return;

        inputField.setText("");
        appendToChat("You: " + input + "\n");
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
                    appendToChat("SpecKit: ❌ Error — " + ex.getMessage() + "\n\n");
                    inputField.setEnabled(true);
                    sendButton.setEnabled(true);
                });
            }
        });
    }

    private String processCommand(String input) throws IOException {
        String workspaceRoot = project.getBasePath();
        if (workspaceRoot == null) workspaceRoot = System.getProperty("user.dir");

        if (!client.isHealthy()) {
            CoreServerManager.getInstance().ensureRunning();
            if (!client.isHealthy()) {
                return "❌ SpecKit Core Server is not running. Please ensure Node.js is installed " +
                        "and the core-server is built (packages/core-server/dist/server.js).";
            }
        }

        String[] parts = input.trim().split("\\s+", 2);
        String command = parts[0].toLowerCase();

        switch (command) {
            case "/new":
                return client.createNew(workspaceRoot).markdown;
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
            case "/help":
                return client.getHelp().markdown;
            default:
                return "❓ Unknown command: `" + command + "`\n\n" +
                        "Available commands: /new, /validate, /status, /commit, /diff, /help\n" +
                        "Type /help for full documentation.";
        }
    }

    private void appendToChat(String text) {
        chatHistory.append(text);
        chatHistory.setCaretPosition(chatHistory.getDocument().getLength());
    }
}
