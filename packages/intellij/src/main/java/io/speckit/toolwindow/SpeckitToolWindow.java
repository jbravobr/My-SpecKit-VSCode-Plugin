package io.speckit.toolwindow;

import com.intellij.openapi.project.Project;
import com.intellij.ui.JBColor;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.ui.components.JBTextField;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.UIUtil;
import io.speckit.client.CoreServerClient;
import io.speckit.server.CoreServerManager;

import javax.swing.*;
import javax.swing.border.AbstractBorder;
import java.awt.*;
import java.awt.event.*;
import java.awt.geom.RoundRectangle2D;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * SpecKit Tool Window — Redesigned UI.
 *
 * Features:
 *  - Chat bubbles (user = right/blue, bot = left/panel-bg, system = centered/subtle)
 *  - Animated server status dot (pulsing green / steady red / amber when starting)
 *  - Loading indicator with animated dots
 *  - Command grid with hover-highlight buttons
 *  - Collapsible command panel (click header to toggle)
 *  - Theme-aware colours via JBColor / UIUtil
 *  - Auto-scroll to latest message
 */
public class SpeckitToolWindow {

    // Palette
    private static final JBColor C_USER_BUBBLE  = new JBColor(new Color(0x4C78CC), new Color(0x3A6BBF));
    private static final JBColor C_BOT_BUBBLE   = new JBColor(new Color(0xECECEC), new Color(0x3C3F41));
    private static final JBColor C_USER_TEXT    = JBColor.WHITE;
    private static final JBColor C_BOT_TEXT     = new JBColor(new Color(0x1A1A1A), new Color(0xBBBBBB));
    private static final JBColor C_SYSTEM_TEXT  = new JBColor(new Color(0x888888), new Color(0x888888));
    private static final JBColor C_HEADER_BG    = new JBColor(new Color(0x2B5EA7), new Color(0x1E3D6F));
    private static final JBColor C_INPUT_BORDER = new JBColor(new Color(0x4C78CC), new Color(0x3A6BBF));
    private static final JBColor C_BTN_HOVER    = new JBColor(new Color(0xDDE8FF), new Color(0x4A6FA5));
    private static final JBColor C_BTN_BORDER   = new JBColor(new Color(0x4C78CC), new Color(0x3A6BBF));
    // Button surface: light theme = white/light-blue tint; dark theme = medium blue-gray (readable)
    private static final JBColor C_BTN_SURFACE  = new JBColor(new Color(0xF0F4FC), new Color(0x3E4D6C));
    private static final Color   C_GREEN        = new Color(0x27AE60);
    private static final Color   C_AMBER        = new Color(0xE67E22);
    private static final Color   C_RED          = new Color(0xE74C3C);

    // Fonts — always relative to IDE label font so scaling (100%/125%/150%) works correctly
    private static Font fontHeader() {
        Font base = JBUI.Fonts.label();
        return base.deriveFont(Font.BOLD, base.getSize() + JBUI.scale(2));
    }
    private static Font fontBody() {
        return JBUI.Fonts.label();          // IDE default — do not override size
    }
    private static Font fontSmall() {
        Font base = JBUI.Fonts.label();
        return base.deriveFont((float) Math.max(10, base.getSize() - JBUI.scale(1)));
    }
    private static Font fontCmd() {
        Font base = JBUI.Fonts.label();
        return base.deriveFont(Font.BOLD, (float) Math.max(10, base.getSize() - JBUI.scale(1)));
    }

    // Commands organized in groups: {label, command, group}
    private static final String[][] COMMANDS = {
            // Group 1 — Workspace
            {"🚀 /init",            "/init",                       "Workspace"},
            {"🩺 /doctor",          "/doctor",                     "Workspace"},
            {"🤖 /agent",           "/agent",                      "Workspace"},
            // Group 2 — Specs
            {"📄 /new",             "/new",                        "Specs"},
            {"🐛 /fix",             "/fix",                        "Specs"},
            {"📝 /draft",           "/draft",                      "Specs"},
            {"📊 /status",          "/status",                     "Specs"},
            {"📊 /status --all",    "/status --all",               "Specs"},
            {"🔧 /status-fix",      "/status-fix",                 "Specs"},
            // Group 3 — Workflow
            {"✅ /validate",        "/validate",                   "Workflow"},
            {"🚪 /gate",            "/gate",                       "Workflow"},
            {"📦 /batch",           "/batch",                      "Workflow"},
            {"⚙ /batch --generate", "/batch --generate",           "Workflow"},
            {"⚙ /batch --unified",  "/batch --generate --unified", "Workflow"},
            {"🔄 /review-auto",     "/review-auto",                "Workflow"},
            // Group 4 — History & Context
            {"📋 /audit",           "/audit",                      "History & Context"},
            {"🔗 /trace",           "/trace",                      "History & Context"},
            {"🕘 /history",         "/history",                    "History & Context"},
            {"📂 /context",         "/context",                    "History & Context"},
            // Group 5 — Git
            {"🔍 /diff",            "/diff",                       "Git"},
            {"💾 /commit",          "/commit",                     "Git"},
            // Group 6 — Info
            {"❓ /help",            "/help",                       "Info"},
    };

    private enum MessageType { USER, BOT, SYSTEM }

    // Components
    private final Project          project;
    private final JPanel           rootPanel;
    private final JPanel           chatPanel;
    private final JBScrollPane     chatScroll;
    private final JBTextField      inputField;
    private final JButton          sendButton;
    private final JLabel           statusLabel;
    private final JButton          startServerBtn;
    private final StatusDot        statusDot;
    private final JPanel           cmdPanel;
    private final JLabel           cmdToggleLabel;
    private boolean                cmdPanelVisible = true;
    private JPanel                 loadingBubble;

    private final CoreServerClient client;
    private final ExecutorService  executor = Executors.newSingleThreadExecutor();

    public SpeckitToolWindow(Project project) {
        this.project = project;
        this.client  = new CoreServerClient(CoreServerManager.BASE_URL);

        // Input (must be initialized before cmdGrid lambdas reference it)
        inputField = new JBTextField();
        inputField.setFont(fontBody());
        inputField.setBorder(new RoundedBorder(C_INPUT_BORDER, 8, 1));
        inputField.setOpaque(false);
        inputField.addKeyListener(new KeyAdapter() {
            @Override public void keyPressed(KeyEvent e) {
                if (e.getKeyCode() == KeyEvent.VK_ENTER) handleSend();
            }
        });

        sendButton = buildSendButton();

        JPanel inputRow = new JPanel(new BorderLayout(6, 0));
        inputRow.setOpaque(false);
        inputRow.setBorder(JBUI.Borders.empty(6, 8, 8, 8));
        inputRow.add(inputField, BorderLayout.CENTER);
        inputRow.add(sendButton, BorderLayout.EAST);

        // Command grid (collapsible)
        cmdPanel = buildCommandGrid();
        cmdToggleLabel = new JLabel("▾ Comandos");
        cmdToggleLabel.setFont(fontCmd());
        cmdToggleLabel.setForeground(C_BOT_TEXT);
        cmdToggleLabel.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        cmdToggleLabel.setBorder(JBUI.Borders.empty(4, 8, 2, 8));
        cmdToggleLabel.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { toggleCommandPanel(); }
            @Override public void mouseEntered(MouseEvent e) { cmdToggleLabel.setForeground(C_USER_BUBBLE); }
            @Override public void mouseExited(MouseEvent e)  { cmdToggleLabel.setForeground(C_BOT_TEXT); }
        });

        JPanel cmdSection = new JPanel(new BorderLayout());
        cmdSection.setOpaque(false);
        cmdSection.add(cmdToggleLabel, BorderLayout.NORTH);
        cmdSection.add(cmdPanel, BorderLayout.CENTER);

        // Server status bar
        statusDot  = new StatusDot();
        statusLabel = new JLabel("Verificando servidor…");
        statusLabel.setFont(fontSmall());
        statusLabel.setForeground(C_SYSTEM_TEXT);

        startServerBtn = buildStartServerButton();

        JPanel serverBar = new JPanel(new BorderLayout(6, 0));
        serverBar.setOpaque(false);
        serverBar.setBorder(JBUI.Borders.empty(3, 8, 3, 8));
        serverBar.add(statusDot,     BorderLayout.WEST);
        serverBar.add(statusLabel,   BorderLayout.CENTER);
        serverBar.add(startServerBtn, BorderLayout.EAST);

        // Header
        JPanel header = buildHeader();

        // North composite
        JPanel northPanel = new JPanel(new BorderLayout());
        northPanel.setOpaque(false);
        northPanel.add(header,     BorderLayout.NORTH);
        northPanel.add(serverBar,  BorderLayout.CENTER);
        northPanel.add(cmdSection, BorderLayout.SOUTH);

        // Chat area
        chatPanel = new JPanel();
        chatPanel.setLayout(new BoxLayout(chatPanel, BoxLayout.Y_AXIS));
        chatPanel.setOpaque(true);
        chatPanel.setBackground(UIUtil.getPanelBackground());
        chatPanel.setBorder(JBUI.Borders.empty(6, 8));

        chatScroll = new JBScrollPane(chatPanel);
        chatScroll.setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
        chatScroll.setBorder(JBUI.Borders.empty());
        chatScroll.getVerticalScrollBar().setUnitIncrement(16);

        // Root
        rootPanel = new JPanel(new BorderLayout());
        rootPanel.setBackground(UIUtil.getPanelBackground());
        rootPanel.add(northPanel, BorderLayout.NORTH);
        rootPanel.add(chatScroll, BorderLayout.CENTER);
        rootPanel.add(inputRow,   BorderLayout.SOUTH);

        addSystemMessage("Bem-vindo ao SpecKit 🚀  Spec Driven Development\nEscolha um comando acima ou digite abaixo.");

        Timer t = new Timer(800, e -> refreshServerStatus());
        t.setRepeats(false);
        t.start();
    }

    public JComponent getContent() { return rootPanel; }

    // Builder helpers

    private JPanel buildHeader() {
        JLabel title = new JLabel("  SpecKit");
        title.setFont(fontHeader());
        title.setForeground(Color.WHITE);

        JLabel sub = new JLabel("  Spec Driven Development  v0.3.25");
        sub.setFont(fontSmall());
        sub.setForeground(new Color(0xCCDDFF));

        JPanel texts = new JPanel();
        texts.setLayout(new BoxLayout(texts, BoxLayout.Y_AXIS));
        texts.setOpaque(false);
        texts.add(title);
        texts.add(Box.createVerticalStrut(2));
        texts.add(sub);

        JPanel header = new JPanel(new BorderLayout());
        header.setBackground(C_HEADER_BG);
        header.setBorder(JBUI.Borders.empty(8, 10, 8, 10));
        header.add(texts, BorderLayout.CENTER);
        return header;
    }

    private JPanel buildCommandGrid() {
        JPanel outer = new JPanel();
        outer.setLayout(new BoxLayout(outer, BoxLayout.Y_AXIS));
        outer.setOpaque(false);
        outer.setBorder(JBUI.Borders.empty(2, 8, 4, 8));

        // Collect unique groups in order
        List<String> groups = new ArrayList<>();
        for (String[] e : COMMANDS) {
            String g = e[2];
            if (!groups.contains(g)) groups.add(g);
        }

        for (String groupName : groups) {
            // Collect commands for this group
            List<String[]> groupCmds = new ArrayList<>();
            for (String[] e : COMMANDS) {
                if (e[2].equals(groupName)) groupCmds.add(e);
            }

            // Build collapsible section
            JPanel section = buildCollapsibleGroup(groupName, groupCmds);
            outer.add(section);
            outer.add(Box.createVerticalStrut(2));
        }
        return outer;
    }

    private JPanel buildCollapsibleGroup(String groupName, List<String[]> cmds) {
        int cols = 3;
        int rows = (int) Math.ceil((double) cmds.size() / cols);
        JPanel grid = new JPanel(new GridLayout(rows, cols, 4, 4));
        grid.setOpaque(false);
        for (String[] e : cmds) grid.add(buildCommandButton(e[0], e[1]));

        JLabel toggle = new JLabel("▾ " + groupName);
        toggle.setFont(fontSmall().deriveFont(Font.BOLD));
        toggle.setForeground(C_SYSTEM_TEXT);
        toggle.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        toggle.setBorder(JBUI.Borders.empty(2, 0, 1, 0));
        toggle.addMouseListener(new MouseAdapter() {
            boolean visible = true;
            @Override public void mouseClicked(MouseEvent e) {
                visible = !visible;
                grid.setVisible(visible);
                toggle.setText((visible ? "▾ " : "▸ ") + groupName);
            }
            @Override public void mouseEntered(MouseEvent e) { toggle.setForeground(C_USER_BUBBLE); }
            @Override public void mouseExited(MouseEvent e)  { toggle.setForeground(C_SYSTEM_TEXT); }
        });

        JPanel section = new JPanel(new BorderLayout());
        section.setOpaque(false);
        section.add(toggle, BorderLayout.NORTH);
        section.add(grid,   BorderLayout.CENTER);
        return section;
    }

    private JButton buildCommandButton(String label, String command) {
        // Foreground: on dark theme use white, on light theme use dark blue
        final JBColor btnFg = new JBColor(new Color(0x1A2A4A), Color.WHITE);

        JButton btn = new JButton(label) {
            private boolean hovered  = false;
            private boolean pressed  = false;
            { addMouseListener(new MouseAdapter() {
                @Override public void mouseEntered(MouseEvent e) { hovered = true;  repaint(); }
                @Override public void mouseExited(MouseEvent e)  { hovered = false; pressed = false; repaint(); }
                @Override public void mousePressed(MouseEvent e) { pressed = true;  repaint(); }
                @Override public void mouseReleased(MouseEvent e){ pressed = false; repaint(); }
            }); }
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int w = getWidth(), h = getHeight(), r = 7;

                // Surface color: use C_BTN_SURFACE (visible on both themes), brighter on hover
                Color base = hovered ? C_BTN_HOVER : C_BTN_SURFACE;

                // Subtle gradient: +12 brightness on top half
                int br = Math.min(255, base.getRed()   + (pressed ? -10 : 12));
                int bg = Math.min(255, base.getGreen() + (pressed ? -10 : 12));
                int bb = Math.min(255, base.getBlue()  + (pressed ? -10 : 12));
                Color top    = pressed ? new Color(Math.max(0, base.getRed()-10), Math.max(0, base.getGreen()-10), Math.max(0, base.getBlue()-10)) : new Color(br, bg, bb);
                Color bottom = pressed ? new Color(br, bg, bb) : new Color(Math.max(0, base.getRed()-8), Math.max(0, base.getGreen()-8), Math.max(0, base.getBlue()-8));

                // Shadow offset (skip when pressed)
                if (!pressed) {
                    g2.setColor(new Color(0, 0, 0, UIUtil.isUnderDarcula() ? 60 : 30));
                    g2.fillRoundRect(0, 2, w, h, r, r);
                }

                // Gradient body
                g2.setPaint(new GradientPaint(0, 0, top, 0, h, bottom));
                g2.fillRoundRect(0, 0, w, pressed ? h : h - 1, r, r);

                // Top gloss (light theme only — dark theme already has good contrast)
                if (!UIUtil.isUnderDarcula() && !pressed) {
                    g2.setColor(new Color(255, 255, 255, 70));
                    g2.fillRoundRect(1, 1, w - 2, h / 2, r, r);
                }

                // Border
                Color border = hovered ? C_BTN_BORDER
                        : new JBColor(new Color(0x9AB0D0), new Color(0x5A7BAF));
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, w - 1, pressed ? h - 1 : h - 2, r, r);

                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setFont(fontCmd());
        btn.setForeground(btnFg);
        btn.setContentAreaFilled(false);
        btn.setBorderPainted(false);
        btn.setFocusPainted(false);
        btn.setOpaque(false);
        btn.setMargin(JBUI.insets(4, 6, 4, 6));
        btn.setToolTipText(command);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.addActionListener(e -> { inputField.setText(command); handleSend(); });
        return btn;
    }

    private JButton buildSendButton() {
        JButton btn = new JButton("Enviar ↵") {
            private boolean hovered = false;
            private boolean pressed = false;
            { addMouseListener(new MouseAdapter() {
                @Override public void mouseEntered(MouseEvent e) { hovered = true;  repaint(); }
                @Override public void mouseExited(MouseEvent e)  { hovered = false; pressed = false; repaint(); }
                @Override public void mousePressed(MouseEvent e) { pressed = true;  repaint(); }
                @Override public void mouseReleased(MouseEvent e){ pressed = false; repaint(); }
            }); }
            @Override protected void paintComponent(Graphics g) {
                if (!isEnabled()) { super.paintComponent(g); return; }
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int w = getWidth(), h = getHeight(), r = 10;
                Color base = hovered ? C_USER_BUBBLE.brighter() : C_USER_BUBBLE;
                // Shadow
                if (!pressed) {
                    g2.setColor(new Color(0, 0, 0, 50));
                    g2.fillRoundRect(1, 3, w - 2, h - 1, r, r);
                }
                // Gradient body
                g2.setPaint(new GradientPaint(0, 0,
                        pressed ? base : base.brighter(),
                        0, h,
                        pressed ? base.brighter() : base.darker()));
                g2.fillRoundRect(0, 0, w, pressed ? h : h - 1, r, r);
                // Top gloss
                g2.setColor(new Color(255, 255, 255, pressed ? 0 : 50));
                g2.fillRoundRect(1, 1, w - 2, h / 2, r, r);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setFont(fontBody().deriveFont(Font.BOLD));
        btn.setForeground(Color.WHITE);
        btn.setContentAreaFilled(false);
        btn.setBorderPainted(false);
        btn.setFocusPainted(false);
        btn.setOpaque(false);
        btn.setPreferredSize(new Dimension(JBUI.scale(90), JBUI.scale(30)));
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.addActionListener(e -> handleSend());
        return btn;
    }

    private JButton buildStartServerButton() {
        JButton btn = new JButton("▶ Start Server") {
            private boolean hovered = false;
            private boolean pressed = false;
            { addMouseListener(new MouseAdapter() {
                @Override public void mouseEntered(MouseEvent e) { hovered = true;  repaint(); }
                @Override public void mouseExited(MouseEvent e)  { hovered = false; pressed = false; repaint(); }
                @Override public void mousePressed(MouseEvent e) { pressed = true;  repaint(); }
                @Override public void mouseReleased(MouseEvent e){ pressed = false; repaint(); }
            }); }
            @Override protected void paintComponent(Graphics g) {
                if (!isEnabled()) { super.paintComponent(g); return; }
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int w = getWidth(), h = getHeight(), r = 8;
                Color base = hovered ? C_GREEN.brighter() : C_GREEN;
                if (!pressed) {
                    g2.setColor(new Color(0, 0, 0, 45));
                    g2.fillRoundRect(1, 3, w - 2, h - 1, r, r);
                }
                g2.setPaint(new GradientPaint(0, 0,
                        pressed ? base : base.brighter(),
                        0, h,
                        pressed ? base.brighter() : base.darker()));
                g2.fillRoundRect(0, 0, w, pressed ? h : h - 1, r, r);
                g2.setColor(new Color(255, 255, 255, pressed ? 0 : 50));
                g2.fillRoundRect(1, 1, w - 2, h / 2, r, r);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setFont(fontSmall().deriveFont(Font.BOLD));
        btn.setForeground(Color.WHITE);
        btn.setContentAreaFilled(false);
        btn.setBorderPainted(false);
        btn.setFocusPainted(false);
        btn.setOpaque(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.addActionListener(e -> handleStartServer());
        return btn;
    }

    // Command panel toggle

    private void toggleCommandPanel() {
        cmdPanelVisible = !cmdPanelVisible;
        cmdPanel.setVisible(cmdPanelVisible);
        cmdToggleLabel.setText(cmdPanelVisible ? "▾ Comandos" : "▸ Comandos");
        rootPanel.revalidate();
    }

    // Chat rendering

    private void addUserMessage(String text) {
        chatPanel.add(buildUserBubble(text));
        chatPanel.add(Box.createVerticalStrut(6));
        chatPanel.revalidate();
        chatPanel.repaint();
        scrollToBottom();
    }

    private void addBotMessage(String text) {
        chatPanel.add(buildBotBubble(text));
        chatPanel.add(Box.createVerticalStrut(6));
        chatPanel.revalidate();
        chatPanel.repaint();
        scrollToBottom();
    }

    private void addSystemMessage(String text) {
        JLabel lbl = new JLabel("<html><center>" + text.replace("\n", "<br>") + "</center></html>");
        lbl.setFont(fontSmall());
        lbl.setForeground(C_SYSTEM_TEXT);
        lbl.setHorizontalAlignment(SwingConstants.CENTER);
        lbl.setAlignmentX(Component.CENTER_ALIGNMENT);
        lbl.setBorder(JBUI.Borders.empty(4, 16));

        JPanel wrap = new JPanel(new FlowLayout(FlowLayout.CENTER));
        wrap.setOpaque(false);
        wrap.add(lbl);
        chatPanel.add(wrap);
        chatPanel.add(Box.createVerticalStrut(4));
        chatPanel.revalidate();
        chatPanel.repaint();
    }

    private JPanel showLoadingBubble() {
        LoadingDots dots = new LoadingDots();

        JPanel inner = new JPanel(new BorderLayout(8, 0));
        inner.setBackground(C_BOT_BUBBLE);
        inner.setBorder(JBUI.Borders.empty(6, 10));
        JLabel avatar = new JLabel("🤖 ");
        avatar.setFont(fontBody());
        inner.add(avatar, BorderLayout.WEST);
        inner.add(dots,   BorderLayout.CENTER);
        inner.setOpaque(true);

        JPanel outer = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        outer.setOpaque(false);
        outer.add(inner);

        chatPanel.add(outer);
        chatPanel.add(Box.createVerticalStrut(6));
        chatPanel.revalidate();
        chatPanel.repaint();
        scrollToBottom();
        dots.start();
        loadingBubble = outer;
        return outer;
    }

    private void removeLoadingBubble() {
        if (loadingBubble == null) return;
        Component[] comps = chatPanel.getComponents();
        int idx = -1;
        for (int i = 0; i < comps.length; i++) {
            if (comps[i] == loadingBubble) { idx = i; break; }
        }
        if (idx >= 0) {
            chatPanel.remove(loadingBubble);
            if (idx < chatPanel.getComponentCount()) chatPanel.remove(idx);
        }
        // Stop dots animation
        for (Component c : loadingBubble.getComponents()) {
            if (c instanceof JPanel) {
                for (Component cc : ((JPanel)c).getComponents()) {
                    if (cc instanceof LoadingDots) ((LoadingDots)cc).stop();
                }
            }
        }
        loadingBubble = null;
        chatPanel.revalidate();
        chatPanel.repaint();
    }

    private JPanel buildUserBubble(String text) {
        JTextArea area = makeBubbleTextArea(text, C_USER_TEXT);
        area.setBackground(C_USER_BUBBLE);

        JPanel bubble = new JPanel(new BorderLayout()) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(C_USER_BUBBLE);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 14, 14);
                g2.dispose();
            }
        };
        bubble.setOpaque(false);
        bubble.setBorder(JBUI.Borders.empty(7, 12));
        bubble.add(area, BorderLayout.CENTER);

        // BorderLayout outer: strut on WEST pushes bubble to the right and gives it real width
        JPanel outer = new JPanel(new BorderLayout());
        outer.setOpaque(false);
        outer.setBorder(JBUI.Borders.emptyRight(4));
        outer.add(Box.createHorizontalStrut(JBUI.scale(60)), BorderLayout.WEST);
        outer.add(bubble, BorderLayout.CENTER);
        return outer;
    }

    private JPanel buildBotBubble(String text) {
        JTextArea area = makeBubbleTextArea(text, C_BOT_TEXT);
        area.setBackground(C_BOT_BUBBLE);

        JLabel avatar = new JLabel("🤖");
        avatar.setFont(fontBody().deriveFont((float)(fontBody().getSize() + JBUI.scale(2))));
        avatar.setBorder(JBUI.Borders.emptyRight(JBUI.scale(6)));
        avatar.setVerticalAlignment(SwingConstants.TOP);

        JPanel bubble = new JPanel(new BorderLayout()) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(C_BOT_BUBBLE);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 14, 14);
                g2.dispose();
            }
        };
        bubble.setOpaque(false);
        bubble.setBorder(JBUI.Borders.empty(7, 12));
        bubble.add(area, BorderLayout.CENTER);

        JPanel inner = new JPanel(new BorderLayout(JBUI.scale(4), 0));
        inner.setOpaque(false);
        inner.add(avatar, BorderLayout.WEST);
        inner.add(bubble, BorderLayout.CENTER);

        // BorderLayout outer: strut on EAST pushes bubble to the left and gives it real width
        JPanel outer = new JPanel(new BorderLayout());
        outer.setOpaque(false);
        outer.setBorder(JBUI.Borders.emptyLeft(4));
        outer.add(inner, BorderLayout.CENTER);
        outer.add(Box.createHorizontalStrut(JBUI.scale(60)), BorderLayout.EAST);
        return outer;
    }

    private JTextArea makeBubbleTextArea(String text, Color fg) {
        JTextArea area = new JTextArea(text);
        area.setFont(fontBody());
        area.setForeground(fg);
        area.setOpaque(false);
        area.setEditable(false);
        area.setLineWrap(true);
        area.setWrapStyleWord(true);
        area.setBorder(null);
        return area;
    }

    private void scrollToBottom() {
        SwingUtilities.invokeLater(() ->
                chatScroll.getVerticalScrollBar().setValue(
                        chatScroll.getVerticalScrollBar().getMaximum()));
    }

    // Server controls

    private void refreshServerStatus() {
        executor.submit(() -> {
            boolean up = client.isHealthy();
            SwingUtilities.invokeLater(() ->
                    applyServerStatus(up ? ServerStatus.ONLINE : ServerStatus.OFFLINE));
        });
    }

    private enum ServerStatus { ONLINE, OFFLINE, STARTING }

    private void applyServerStatus(ServerStatus s) {
        switch (s) {
            case ONLINE:
                statusDot.setStatus(C_GREEN, true);
                statusLabel.setText("Core Server rodando · porta 4815");
                statusLabel.setForeground(C_GREEN);
                startServerBtn.setEnabled(false);
                startServerBtn.setVisible(false);
                break;
            case OFFLINE:
                statusDot.setStatus(C_RED, false);
                statusLabel.setText("Core Server parado");
                statusLabel.setForeground(C_RED);
                startServerBtn.setText("▶ Start Server");
                startServerBtn.setEnabled(true);
                startServerBtn.setVisible(true);
                break;
            case STARTING:
                statusDot.setStatus(C_AMBER, true);
                statusLabel.setText("Iniciando Core Server…");
                statusLabel.setForeground(C_AMBER);
                startServerBtn.setText("⏳ Aguarde…");
                startServerBtn.setEnabled(false);
                startServerBtn.setVisible(true);
                break;
        }
    }

    private void handleStartServer() {
        applyServerStatus(ServerStatus.STARTING);
        addSystemMessage("🔄 Iniciando Core Server na porta 4815…");
        executor.submit(() -> {
            CoreServerManager.getInstance().ensureRunning();
            boolean up = client.isHealthy();
            SwingUtilities.invokeLater(() -> {
                applyServerStatus(up ? ServerStatus.ONLINE : ServerStatus.OFFLINE);
                if (up) addSystemMessage("✅ Core Server iniciado com sucesso!");
                else    addSystemMessage("❌ Falha ao iniciar. Verifique se Node.js está instalado\ne packages/core-server/dist/server.js existe.");
            });
        });
    }

    // Command dispatch

    private void handleSend() {
        String input = inputField.getText().trim();
        if (input.isEmpty()) return;
        inputField.setText("");
        addUserMessage(input);
        inputField.setEnabled(false);
        sendButton.setEnabled(false);
        showLoadingBubble();
        executor.submit(() -> {
            try {
                String response = processCommand(input);
                SwingUtilities.invokeLater(() -> {
                    removeLoadingBubble();
                    addBotMessage(response);
                    inputField.setEnabled(true);
                    sendButton.setEnabled(true);
                    inputField.requestFocus();
                });
            } catch (Exception ex) {
                SwingUtilities.invokeLater(() -> {
                    removeLoadingBubble();
                    addBotMessage("❌ " + ex.getMessage());
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
            boolean up = client.isHealthy();
            final boolean finalUp = up;
            SwingUtilities.invokeLater(() -> applyServerStatus(finalUp ? ServerStatus.ONLINE : ServerStatus.OFFLINE));
            if (!up) return "❌ Core Server não está rodando.\nClique em '▶ Start Server' para iniciá-lo.";
        }

        String[] parts  = input.trim().split("\\s+", 2);
        String   command = parts[0].toLowerCase();
        final String finalRoot = workspaceRoot;

        switch (command) {
            case "/new":      return client.createNew(finalRoot).markdown;
            case "/validate": return client.validate(finalRoot).markdown;
            case "/status":
                return client.getStatus(finalRoot, input.contains("--all") || input.contains("--closed")).markdown;
            case "/commit":
                return client.commit(finalRoot, parts.length > 1 ? parts[1] : null).markdown;
            case "/diff":
                return client.getDiff(finalRoot, input.contains("--full")).markdown;
            case "/help":     return client.getHelp().markdown;
            case "/fix":      return client.createFix(finalRoot).markdown;
            case "/draft": {
                String desc = parts.length > 1 ? parts[1] : "";
                if (desc.isEmpty()) return "❌ Forneça uma descrição.\nExemplo: /draft O login retorna 500 após expiração do token --fix";
                String type = desc.contains("--fix") || desc.contains("--bug") ? "fix" : "story";
                return client.draft(finalRoot, type, desc).markdown;
            }
            case "/gate":     return client.getGate().markdown;
            case "/audit":    return client.getAudit(finalRoot, 50).markdown;
            case "/trace":    return client.getTrace(finalRoot, null).markdown;
            case "/history":  return client.getHistory(finalRoot, 50, "all").markdown;
            case "/doctor":   return client.getDoctor(finalRoot).markdown;
            case "/batch":
                return client.batch(finalRoot, input.contains("--generate"), input.contains("--unified")).markdown;
            case "/init":     return client.init(finalRoot).markdown;
            case "/review-auto": return client.reviewAuto(finalRoot, null).markdown;
            case "/context":  return client.getContext(finalRoot).markdown;
            case "/status-fix": return client.getStatusFix(finalRoot).markdown;
            case "/agent":    return client.getAgentModes().markdown;
            default:
                return "❓ Comando desconhecido: `" + command + "`\n\n" +
                        "Disponíveis: /new /fix /draft /validate /status /status --all /status-fix\n" +
                        "/gate /batch /review-auto /audit /trace /history /context\n" +
                        "/diff /commit /init /doctor /agent /help";
        }
    }

    // Inner: StatusDot

    private static class StatusDot extends JComponent {
        private Color   dotColor = Color.GRAY;
        private boolean pulsing  = false;
        private float   alpha    = 1f;
        private boolean growing  = false;
        private Timer   timer;

        StatusDot() {
            setPreferredSize(new Dimension(14, 14));
            setMinimumSize(new Dimension(14, 14));
        }

        void setStatus(Color color, boolean pulse) {
            this.dotColor = color;
            this.pulsing  = pulse;
            if (timer != null) timer.stop();
            if (pulse) {
                timer = new Timer(60, e -> {
                    alpha += growing ? 0.07f : -0.07f;
                    if (alpha >= 1f) { alpha = 1f; growing = false; }
                    if (alpha <= 0.3f) { alpha = 0.3f; growing = true; }
                    repaint();
                });
                timer.start();
            } else {
                alpha = 1f;
                repaint();
            }
        }

        @Override protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int a = Math.min(255, (int)(alpha * 255));
            g2.setColor(new Color(dotColor.getRed(), dotColor.getGreen(), dotColor.getBlue(), a));
            int s = 10, x = (getWidth()-s)/2, y = (getHeight()-s)/2;
            g2.fillOval(x, y, s, s);
            g2.dispose();
        }
    }

    // Inner: LoadingDots

    private static class LoadingDots extends JLabel {
        private final String[] frames = {
            "SpecKit está pensando  ●  ○  ○",
            "SpecKit está pensando  ○  ●  ○",
            "SpecKit está pensando  ○  ○  ●",
        };
        private int frame = 0;
        private Timer timer;

        LoadingDots() {
            setText(frames[0]);
            setFont(UIUtil.getLabelFont().deriveFont(Font.ITALIC, 11f));
            setForeground(C_SYSTEM_TEXT);
        }

        void start() {
            timer = new Timer(400, e -> { frame = (frame+1) % frames.length; setText(frames[frame]); });
            timer.start();
        }

        void stop() { if (timer != null) timer.stop(); }
    }

    // Inner: RoundedBorder

    private static class RoundedBorder extends AbstractBorder {
        private final Color color;
        private final int   radius, thickness;

        RoundedBorder(Color color, int radius, int thickness) {
            this.color = color; this.radius = radius; this.thickness = thickness;
        }

        @Override public void paintBorder(Component c, Graphics g, int x, int y, int w, int h) {
            if (thickness <= 0) return;
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setColor(color);
            g2.setStroke(new BasicStroke(thickness));
            g2.draw(new RoundRectangle2D.Float(x+.5f, y+.5f, w-1, h-1, radius, radius));
            g2.dispose();
        }

        @Override public Insets getBorderInsets(Component c) { return new Insets(4, 8, 4, 8); }
        @Override public Insets getBorderInsets(Component c, Insets i) { i.set(4,8,4,8); return i; }
    }
}