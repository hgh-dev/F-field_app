package app.ffield.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * 진행 중인 트랙을 앱 내부 저장소에 보관합니다.
 * 좌표별 JSON Lines 형식이라 마지막 줄이 손상돼도 앞선 좌표를 복구할 수 있습니다.
 */
final class TrackSessionStore {

    static final class Summary {
        final String sessionId;
        final long startedAt;
        final long updatedAt;
        final int pointCount;
        final String state;

        Summary(String sessionId, long startedAt, long updatedAt, int pointCount, String state) {
            this.sessionId = sessionId;
            this.startedAt = startedAt;
            this.updatedAt = updatedAt;
            this.pointCount = pointCount;
            this.state = state;
        }
    }

    private static final String PREFS_NAME = "track_session";
    private static final String KEY_SESSION_ID = "sessionId";
    private static final String KEY_STARTED_AT = "startedAt";
    private static final String KEY_UPDATED_AT = "updatedAt";
    private static final String KEY_POINT_COUNT = "pointCount";
    private static final String KEY_STATE = "state";
    private static final String STATE_RECORDING = "recording";
    private static final String STATE_STOPPED = "stopped";

    private final SharedPreferences preferences;
    private final File sessionDirectory;
    private final File pointsFile;

    TrackSessionStore(Context context) {
        Context appContext = context.getApplicationContext();
        preferences = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        sessionDirectory = new File(appContext.getFilesDir(), "track-session");
        pointsFile = new File(sessionDirectory, "active-track.jsonl");
    }

    synchronized Summary beginOrResumeSession() throws IOException {
        Summary existing = getSummary();
        if (existing != null && pointsFile.isFile()) {
            int recoveredPointCount = readStoredPoints().length();
            preferences.edit()
                .putString(KEY_STATE, STATE_RECORDING)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .putInt(KEY_POINT_COUNT, recoveredPointCount)
                .commit();
            return getSummary();
        }

        ensureDirectory();
        try (FileOutputStream output = new FileOutputStream(pointsFile, false)) {
            output.getFD().sync();
        }

        long now = System.currentTimeMillis();
        String sessionId = UUID.randomUUID().toString();
        boolean saved = preferences.edit()
            .clear()
            .putString(KEY_SESSION_ID, sessionId)
            .putLong(KEY_STARTED_AT, now)
            .putLong(KEY_UPDATED_AT, now)
            .putInt(KEY_POINT_COUNT, 0)
            .putString(KEY_STATE, STATE_RECORDING)
            .commit();
        if (!saved) throw new IOException("트랙 세션 정보를 저장하지 못했습니다.");
        return getSummary();
    }

    synchronized Summary append(Location location) throws IOException {
        Summary summary = getSummary();
        if (summary == null) throw new IOException("진행 중인 트랙 세션이 없습니다.");

        JSONObject point = locationToJson(location);
        byte[] encoded = (point.toString() + "\n").getBytes(StandardCharsets.UTF_8);
        ensureDirectory();
        try (FileOutputStream output = new FileOutputStream(pointsFile, true)) {
            output.write(encoded);
            output.flush();
            output.getFD().sync();
        }

        long now = System.currentTimeMillis();
        int nextCount = summary.pointCount + 1;
        boolean saved = preferences.edit()
            .putLong(KEY_UPDATED_AT, now)
            .putInt(KEY_POINT_COUNT, nextCount)
            .putString(KEY_STATE, STATE_RECORDING)
            .commit();
        if (!saved) throw new IOException("트랙 좌표 개수를 저장하지 못했습니다.");
        return getSummary();
    }

    synchronized void markStopped() {
        if (!hasSession()) return;
        preferences.edit()
            .putString(KEY_STATE, STATE_STOPPED)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .commit();
    }

    synchronized Summary getSummary() {
        String sessionId = preferences.getString(KEY_SESSION_ID, null);
        if (sessionId == null || sessionId.trim().isEmpty()) return null;
        return new Summary(
            sessionId,
            preferences.getLong(KEY_STARTED_AT, 0L),
            preferences.getLong(KEY_UPDATED_AT, 0L),
            preferences.getInt(KEY_POINT_COUNT, 0),
            preferences.getString(KEY_STATE, STATE_STOPPED)
        );
    }

    synchronized JSONObject readSession() throws IOException, JSONException {
        Summary summary = getSummary();
        if (summary == null) return null;

        JSONArray points = readStoredPoints();

        JSONObject result = summaryToJson(summary);
        result.put("points", points);
        result.put("pointCount", points.length());
        return result;
    }

    synchronized boolean clearSession() {
        boolean fileCleared = !pointsFile.exists() || pointsFile.delete();
        boolean preferencesCleared = preferences.edit().clear().commit();
        if (sessionDirectory.isDirectory()) sessionDirectory.delete();
        return fileCleared && preferencesCleared;
    }

    synchronized boolean hasSession() {
        return getSummary() != null && pointsFile.isFile();
    }

    static JSONObject summaryToJson(Summary summary) throws JSONException {
        JSONObject result = new JSONObject();
        if (summary == null) {
            result.put("exists", false);
            return result;
        }
        result.put("exists", true);
        result.put("sessionId", summary.sessionId);
        result.put("startedAt", summary.startedAt);
        result.put("updatedAt", summary.updatedAt);
        result.put("pointCount", summary.pointCount);
        result.put("state", summary.state);
        return result;
    }

    private JSONObject locationToJson(Location location) throws IOException {
        try {
            JSONObject result = new JSONObject();
            result.put("latitude", location.getLatitude());
            result.put("longitude", location.getLongitude());
            result.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            result.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
            result.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            result.put("bearing", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            result.put("timestamp", location.getTime());
            return result;
        } catch (JSONException error) {
            throw new IOException("트랙 좌표를 변환하지 못했습니다.", error);
        }
    }

    private JSONArray readStoredPoints() throws IOException {
        JSONArray points = new JSONArray();
        if (!pointsFile.isFile()) return points;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
            new FileInputStream(pointsFile), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) continue;
                try {
                    points.put(new JSONObject(trimmed));
                } catch (JSONException ignored) {
                    // 강제 종료로 마지막 줄만 덜 써진 경우 앞의 정상 좌표는 그대로 복구합니다.
                }
            }
        }
        return points;
    }

    private void ensureDirectory() throws IOException {
        if (sessionDirectory.isDirectory()) return;
        if (!sessionDirectory.mkdirs() && !sessionDirectory.isDirectory()) {
            throw new IOException("트랙 임시 저장 폴더를 만들지 못했습니다.");
        }
    }
}
