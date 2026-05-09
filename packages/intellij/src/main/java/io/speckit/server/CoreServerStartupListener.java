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

    /** Called just before IntelliJ closes — shut down the Core Server gracefully. */
    @Override
    public void appWillBeClosed(boolean isRestart) {
        try {
            CoreServerManager.getInstance().stop();
            System.out.println("[SpecKit] Core Server stopped on IDE shutdown.");
        } catch (Exception e) {
            System.err.println("[SpecKit] Error stopping Core Server on shutdown: " + e.getMessage());
        }
    }
}
