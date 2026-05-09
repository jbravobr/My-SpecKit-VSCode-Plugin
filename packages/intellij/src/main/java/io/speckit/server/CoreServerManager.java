package io.speckit.server;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Manages the lifecycle of the SpecKit Core Server (Node.js process).
 * Starts the server if not already running, and provides health-check polling.
 */
public class CoreServerManager {

    public static final int PORT = 4815;
    public static final String BASE_URL = "http://127.0.0.1:" + PORT;

    private static CoreServerManager instance;
    private Process serverProcess;

    private CoreServerManager() {}

    public static synchronized CoreServerManager getInstance() {
        if (instance == null) {
            instance = new CoreServerManager();
        }
        return instance;
    }

    /**
     * Ensures the Core Server is running. If it's already up (e.g., started
     * by VS Code), does nothing. Otherwise, locates the Node.js entry point
     * adjacent to the plugin and starts it.
     */
    public void ensureRunning() {
        if (isServerUp()) {
            return;
        }
        startServer();
    }

    public boolean isServerUp() {
        try {
            URL url = new URL(BASE_URL + "/health");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(1000);
            conn.setReadTimeout(1000);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            return code == 200;
        } catch (IOException e) {
            return false;
        }
    }

    private void startServer() {
        String nodeCmd = System.getProperty("os.name", "").toLowerCase().contains("win")
                ? "node.exe"
                : "node";

        String pluginDir = System.getProperty("speckit.server.dir", "");
        File serverScript = pluginDir.isEmpty()
                ? findServerScript()
                : new File(pluginDir, "server.js");

        if (serverScript == null || !serverScript.exists()) {
            System.err.println("SpecKit: core-server script not found. " +
                    "Ensure packages/core-server is built. " +
                    "Set -Dspeckit.server.dir=<path-to-dist>");
            return;
        }

        try {
            ProcessBuilder pb = new ProcessBuilder(nodeCmd, serverScript.getAbsolutePath());
            pb.environment().put("SPECKIT_PORT", String.valueOf(PORT));
            pb.redirectErrorStream(true);
            serverProcess = pb.start();

            // Poll until server is ready (max 10s)
            for (int i = 0; i < 20; i++) {
                Thread.sleep(500);
                if (isServerUp()) {
                    System.out.println("SpecKit Core Server started (PID: " +
                            serverProcess.pid() + ")");
                    return;
                }
            }
            System.err.println("SpecKit: core-server did not start within 10 seconds.");
        } catch (IOException | InterruptedException e) {
            System.err.println("SpecKit: failed to start core-server: " + e.getMessage());
        }
    }

    private File findServerScript() {
        File cwd = new File(System.getProperty("user.dir"));
        File candidate = new File(cwd, "packages/core-server/dist/server.js");
        if (candidate.exists()) return candidate;
        File parent = cwd.getParentFile();
        if (parent != null) {
            candidate = new File(parent, "packages/core-server/dist/server.js");
            if (candidate.exists()) return candidate;
        }
        return null;
    }

    public void stop() {
        if (serverProcess != null && serverProcess.isAlive()) {
            serverProcess.destroy();
        }
    }
}
