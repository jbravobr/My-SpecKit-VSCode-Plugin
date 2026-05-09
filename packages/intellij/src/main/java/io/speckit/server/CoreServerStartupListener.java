package io.speckit.server;

import com.intellij.ide.AppLifecycleListener;

public class CoreServerStartupListener implements AppLifecycleListener {
    @Override
    public void appStarted() {
        Thread thread = new Thread(() -> {
            try {
                CoreServerManager.getInstance().ensureRunning();
            } catch (Exception e) {
                System.err.println("SpecKit: error during core-server startup: " + e.getMessage());
            }
        }, "speckit-server-starter");
        thread.setDaemon(true);
        thread.start();
    }
}
