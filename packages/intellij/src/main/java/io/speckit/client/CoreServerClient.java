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

    public ServerResponse getHelp(String topic) throws IOException {
        if (topic == null || topic.isBlank()) return getHelp();
        String url = baseUrl + "/help?topic=" +
                java.net.URLEncoder.encode(topic, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse createFix(String workspaceRoot) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        return post("/fix", body);
    }

    public ServerResponse draft(String workspaceRoot, String type, String description) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        if (type != null) body.put("type", type);
        body.put("description", description);
        return post("/draft", body);
    }

    public ServerResponse getGate() throws IOException {
        Request request = new Request.Builder().url(baseUrl + "/gate").get().build();
        return execute(request);
    }

    public ServerResponse getAudit(String workspaceRoot, int limit) throws IOException {
        String url = baseUrl + "/audit?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8) +
                "&limit=" + limit;
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getTrace(String workspaceRoot, String specId) throws IOException {
        String url = baseUrl + "/trace?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        if (specId != null && !specId.isEmpty()) {
            url += "&specId=" + java.net.URLEncoder.encode(specId, java.nio.charset.StandardCharsets.UTF_8);
        }
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getHistory(String workspaceRoot, int limit, String filter) throws IOException {
        String url = baseUrl + "/history?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8) +
                "&limit=" + limit;
        if (filter != null && !filter.isEmpty()) {
            url += "&filter=" + java.net.URLEncoder.encode(filter, java.nio.charset.StandardCharsets.UTF_8);
        }
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getDoctor(String workspaceRoot) throws IOException {
        String url = baseUrl + "/doctor?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse batch(String workspaceRoot, boolean generate, boolean unified) throws IOException {
        return batch(workspaceRoot, BatchOptions.of(generate, unified));
    }

    public ServerResponse batch(String workspaceRoot, BatchOptions options) throws IOException {
        Map<String, Object> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        body.put("generate", options.generate);
        body.put("unified", options.unified);
        if (options.storyId != null && !options.storyId.isBlank()) {
            body.put("storyId", options.storyId);
        }
        if (options.branchStrategy != null && !options.branchStrategy.isBlank()) {
            body.put("branchStrategy", options.branchStrategy);
        }
        if (options.confirmIntentId != null && !options.confirmIntentId.isBlank()) {
            body.put("confirmIntentId", options.confirmIntentId);
        }
        String json = gson.toJson(body);
        RequestBody requestBody = RequestBody.create(json, JSON_MEDIA_TYPE);
        Request request = new Request.Builder().url(baseUrl + "/batch").post(requestBody).build();
        return execute(request);
    }

    public ServerResponse init(String workspaceRoot) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        return post("/init", body);
    }

    public ServerResponse reviewAuto(String workspaceRoot, String specFile) throws IOException {
        return reviewAuto(workspaceRoot, new ReviewAutoOptions(specFile, null, false, false, false, false, false, null));
    }

    public ServerResponse reviewAuto(String workspaceRoot, ReviewAutoOptions options) throws IOException {
        Map<String, Object> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        if (options.specFile != null && !options.specFile.isBlank()) {
            body.put("specFile", options.specFile);
        }
        if (options.action != null && !options.action.isBlank()) {
            body.put("action", options.action);
        }
        if (options.approved) body.put("approved", true);
        if (options.changesRequested) body.put("changesRequested", true);
        if (options.mutation) body.put("mutation", true);
        if (options.auto) body.put("auto", true);
        if (options.batchConsent) body.put("batchConsent", true);
        if (options.confirmIntentId != null && !options.confirmIntentId.isBlank()) {
            body.put("confirmIntentId", options.confirmIntentId);
        }
        return post("/review-auto", body);
    }

    public ServerResponse getContext(String workspaceRoot) throws IOException {
        String url = baseUrl + "/context?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getStatusFix(String workspaceRoot) throws IOException {
        String url = baseUrl + "/status-fix?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getAgentModes() throws IOException {
        Request request = new Request.Builder().url(baseUrl + "/agent").get().build();
        return execute(request);
    }

    public ServerResponse getAgentModes(String workspaceRoot) throws IOException {
        if (workspaceRoot == null || workspaceRoot.isBlank()) return getAgentModes();
        String url = baseUrl + "/agent?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse setAgentMode(String workspaceRoot, String mode) throws IOException {
        return setAgentMode(workspaceRoot, mode, null);
    }

    public ServerResponse setAgentMode(String workspaceRoot, String mode, String confirmIntentId) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        if (mode != null && !mode.isBlank()) {
            body.put("mode", mode);
        }
        if (confirmIntentId != null && !confirmIntentId.isBlank()) {
            body.put("confirmIntentId", confirmIntentId);
        }
        return post("/agent", body);
    }

    public ServerResponse verify(String workspaceRoot, Integer gate) throws IOException {
        Map<String, String> body = new HashMap<>();
        body.put("workspaceRoot", workspaceRoot);
        if (gate != null) body.put("gate", String.valueOf(gate));
        return post("/verify", body);
    }

    public ServerResponse getMetrics(String workspaceRoot) throws IOException {
        String url = baseUrl + "/metrics?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
        return execute(request);
    }

    public ServerResponse getScore(String workspaceRoot) throws IOException {
        String url = baseUrl + "/score?workspaceRoot=" +
                java.net.URLEncoder.encode(workspaceRoot, java.nio.charset.StandardCharsets.UTF_8);
        Request request = new Request.Builder().url(url).get().build();
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

    private ServerResponse post(String path, Map<String, ?> body) throws IOException {
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

    public static class BatchOptions {
        public final boolean generate;
        public final boolean unified;
        public final String storyId;
        public final String branchStrategy;
        public final String confirmIntentId;

        public BatchOptions(
                boolean generate,
                boolean unified,
                String storyId,
                String branchStrategy,
                String confirmIntentId
        ) {
            this.generate = generate;
            this.unified = unified;
            this.storyId = storyId;
            this.branchStrategy = branchStrategy;
            this.confirmIntentId = confirmIntentId;
        }

        public static BatchOptions of(boolean generate, boolean unified) {
            return new BatchOptions(generate, unified, null, null, null);
        }
    }

    public static class ReviewAutoOptions {
        public final String specFile;
        public final String action;
        public final boolean approved;
        public final boolean changesRequested;
        public final boolean mutation;
        public final boolean auto;
        public final boolean batchConsent;
        public final String confirmIntentId;

        public ReviewAutoOptions(
                String specFile,
                String action,
                boolean approved,
                boolean changesRequested,
                boolean mutation,
                boolean auto,
                boolean batchConsent,
                String confirmIntentId
        ) {
            this.specFile = specFile;
            this.action = action;
            this.approved = approved;
            this.changesRequested = changesRequested;
            this.mutation = mutation;
            this.auto = auto;
            this.batchConsent = batchConsent;
            this.confirmIntentId = confirmIntentId;
        }
    }
}
