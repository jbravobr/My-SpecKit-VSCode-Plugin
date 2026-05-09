package io.speckit.client;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import okhttp3.*;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * HTTP client for the SpecKit Core Server (localhost:4815).
 */
public class CoreServerClient {

    private static final MediaType JSON_MEDIA_TYPE =
            MediaType.parse("application/json; charset=utf-8");

    private final OkHttpClient client;
    private final String baseUrl;
    private final Gson gson = new Gson();

    public CoreServerClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    public ServerResponse getStatus(String workspaceRoot, boolean includeAll) throws IOException {
        String url = baseUrl + "/status?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8) +
                "&all=" + includeAll;
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse createNew(String workspaceRoot) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        return post("/new", body);
    }

    public ServerResponse validate(String workspaceRoot) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        return post("/validate", body);
    }

    public ServerResponse commit(String workspaceRoot, String message) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        if (message != null) body.put("message", message);
        return post("/commit", body);
    }

    public ServerResponse getDiff(String workspaceRoot, boolean full) throws IOException {
        String url = baseUrl + "/diff?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8) +
                "&full=" + full;
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getHelp() throws IOException {
        Request request = new Request.Builder().url(baseUrl + "/help").get().build();
        return execute(request);
    }

    public boolean isHealthy() {
        try {
            Request request = new Request.Builder().url(baseUrl + "/health").get().build();
            try (Response response = client.newCall(request).execute()) {
                return response.isSuccessful();
            }
        } catch (IOException e) {
            return false;
        }
    }

    private ServerResponse post(String path, Map<String, String> body) throws IOException {
        String json = gson.toJson(body);
        RequestBody requestBody = RequestBody.create(json, JSON_MEDIA_TYPE);
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .post(requestBody)
                .build();
        return execute(request);
    }

    private ServerResponse execute(Request request) throws IOException {
        try (Response response = client.newCall(request).execute()) {
            String body = response.body() != null ? response.body().string() : "{}";
            JsonObject json = gson.fromJson(body, JsonObject.class);
            String markdown = json.has("markdown")
                    ? json.get("markdown").getAsString()
                    : body;
            return new ServerResponse(response.code(), markdown, json);
        }
    }

    public static class ServerResponse {
        public final int statusCode;
        public final String markdown;
        public final JsonObject raw;

        ServerResponse(int statusCode, String markdown, JsonObject raw) {
            this.statusCode = statusCode;
            this.markdown = markdown;
            this.raw = raw;
        }

        public boolean isSuccess() {
            return statusCode >= 200 && statusCode < 300;
        }
    }
}
