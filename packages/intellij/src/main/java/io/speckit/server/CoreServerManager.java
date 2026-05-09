package io.speckit.server;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Manages the lifecycle of the SpecKit Core Server (Node.js process).
 *
 * Strategy (in order of preference):
 *  1. Server already running at PORT → do nothing (VS Code may have started it).
 *  2. Bundled server found inside plugin JAR (server/server.bundle.js) → extract
 *     to OS temp dir and start it. This is the normal case for end-users.
 *  3. Development fallback: look for packages/core-server/dist/server.js in cwd.
 */
public class CoreServerManager {

    public static final int    PORT     = 4815;
    public static final String BASE_URL = "http://127.0.0.1:" + PORT;

    private static final String BUNDLE_RESOURCE = "/server/server.bundle.js";
    private static final String TEMP_DIR_PREFIX  = "speckit-server-";

    private static CoreServerManager instance;
    private Process serverProcess;
    /** Path where the bundled server was extracted (null if not yet extracted). */
    private File extractedBundle;

    private CoreServerManager() {}

    public static synchronized CoreServerManager getInstance() {
        if (instance == null) {
            instance = new CoreServerManager();
        }
        return instance;
    }

    /** Ensures the Core Server is running; no-op if already up. */
    public void ensureRunning() {
        if (isServerUp()) return;
        startServer();
    }

    public boolean isServerUp() {
        try {
            URL url = new URL(BASE_URL + "/health");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(1500);
            conn.setReadTimeout(1500);
            conn.setRequestMethod("GET");
            return conn.getResponseCode() == 200;
        } catch (IOException e) {
            return false;
        }
    }

    private void startServer() {
        String nodeCmd = resolveNodeCommand();
        File script = resolveServerScript();

        if (script == null || !script.exists()) {
            System.err.println("[SpecKit] Core Server script not found — " +
                    "the bundled server could not be extracted and no dev fallback was found.");
            return;
        }

        try {
            ProcessBuilder pb = new ProcessBuilder(nodeCmd, script.getAbsolutePath());
            pb.environment().put("SPECKIT_PORT", String.valueOf(PORT));
            pb.redirectErrorStream(true);
            serverProcess = pb.start();

            // Poll until ready (max 15 s)
            for (int i = 0; i < 30; i++) {
                Thread.sleep(500);
                if (isServerUp()) {
                    System.out.println("[SpecKit] Core Server ready on port " + PORT +
                            " (PID: " + serverProcess.pid() + ")");
                    return;
                }
            }
            System.err.println("[SpecKit] Core Server did not respond within 15 s.");
        } catch (IOException | InterruptedException e) {
            System.err.println("[SpecKit] Failed to start Core Server: " + e.getMessage());
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Returns the server script to run.
     * Priority: bundled JAR resource > dev fallback in cwd.
     */
    private File resolveServerScript() {
        // 1. Already extracted in this session
        if (extractedBundle != null && extractedBundle.exists()) {
            return extractedBundle;
        }

        // 2. Extract from plugin JAR resources
        try (InputStream in = CoreServerManager.class.getResourceAsStream(BUNDLE_RESOURCE)) {
            if (in != null) {
                Path tempDir = Files.createTempDirectory(TEMP_DIR_PREFIX);
                Path dest = tempDir.resolve("server.bundle.js");
                Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
                extractedBundle = dest.toFile();
                System.out.println("[SpecKit] Bundle extracted to: " + extractedBundle);
                return extractedBundle;
            }
        } catch (IOException e) {
            System.err.println("[SpecKit] Could not extract bundled server: " + e.getMessage());
        }

        // 3. Dev fallback: look for compiled server next to the repo
        File cwd = new File(System.getProperty("user.dir"));
        for (File base : new File[]{cwd, cwd.getParentFile()}) {
            if (base == null) continue;
            File candidate = new File(base, "packages/core-server/dist/server.js");
            if (candidate.exists()) {
                System.out.println("[SpecKit] Dev fallback: using " + candidate);
                return candidate;
            }
        }

        return null;
    }

    private String resolveNodeCommand() {
        boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        // Try explicit paths common on Windows
        if (windows) {
            for (String p : new String[]{
                    "C:\\Program Files\\nodejs\\node.exe",
                    System.getProperty("user.home") + "\\AppData\\Roaming\\nvm\\current\\node.exe"}) {
                if (new File(p).exists()) return p;
            }
            return "node.exe";
        }
        return "node";
    }

    public void stop() {
        if (serverProcess != null && serverProcess.isAlive()) {
            serverProcess.destroy();
        }
    }
}
