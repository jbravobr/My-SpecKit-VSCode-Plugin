package io.speckit.toolwindow;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import org.jetbrains.annotations.NotNull;

public class SpeckitToolWindowFactory implements ToolWindowFactory {
    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        SpeckitToolWindow window = new SpeckitToolWindow(project);
        Content content = ContentFactory.getInstance().createContent(
                window.getContent(),
                "",
                false
        );
        toolWindow.getContentManager().addContent(content);
    }
}
