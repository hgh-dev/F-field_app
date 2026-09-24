package app.ffield.mobile;

import android.Manifest;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;

/** Capacitor 화면과 TrackLocationService 사이의 명령/이벤트 연결점입니다. */
@CapacitorPlugin(
    name = "NativeTrack",
    permissions = {
        @Permission(
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notifications"
        )
    }
)
public class NativeTrackPlugin extends Plugin implements TrackLocationService.Observer {

    @Override
    public void load() {
        TrackLocationService.addObserver(this);
    }

    @Override
    protected void handleOnDestroy() {
        TrackLocationService.removeObserver(this);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }
        requestNotificationPermissionThenStart(call);
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        if (call == null) return;
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("위치 권한이 필요합니다.", "LOCATION_PERMISSION_DENIED");
            return;
        }
        requestNotificationPermissionThenStart(call);
    }

    private void requestNotificationPermissionThenStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (call == null) return;
        // 알림을 거부해도 Android 시스템의 활성 앱 영역에는 서비스가 표시되므로 기록은 시작합니다.
        startService(call);
    }

    private void startService(PluginCall call) {
        long intervalMs = Math.max(500L, call.getLong("intervalMs", 1000L));
        float minDistanceMeters = Math.max(0f, call.getFloat("minDistanceMeters", 0f));

        Intent intent = new Intent(getContext(), TrackLocationService.class);
        intent.setAction(TrackLocationService.ACTION_START);
        intent.putExtra(TrackLocationService.EXTRA_INTERVAL_MS, intervalMs);
        intent.putExtra(TrackLocationService.EXTRA_MIN_DISTANCE_METERS, minDistanceMeters);
        ContextCompat.startForegroundService(getContext(), intent);

        JSObject response = createStatusResult();
        response.put("startRequested", true);
        response.put("notificationsGranted",
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (TrackLocationService.isRunning()) {
            Intent intent = new Intent(getContext(), TrackLocationService.class);
            intent.setAction(TrackLocationService.ACTION_STOP);
            getContext().startService(intent);
        }
        call.resolve(createStatusResult());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(createStatusResult());
    }

    @PluginMethod
    public void getPendingSession(PluginCall call) {
        try {
            TrackSessionStore store = new TrackSessionStore(getContext());
            JSONObject session = store.readSession();
            JSObject result = new JSObject();
            result.put("session", session == null ? null : session);
            call.resolve(result);
        } catch (IOException | JSONException error) {
            call.reject("트랙 임시 기록을 읽지 못했습니다: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void clearPendingSession(PluginCall call) {
        if (TrackLocationService.isRunning()) {
            call.reject("기록 중인 트랙은 삭제할 수 없습니다.", "TRACK_IS_RUNNING");
            return;
        }

        TrackSessionStore store = new TrackSessionStore(getContext());
        if (!store.clearSession()) {
            call.reject("트랙 임시 기록을 완전히 삭제하지 못했습니다.");
            return;
        }
        call.resolve();
    }

    private JSObject createStatusResult() {
        JSObject result = new JSObject();
        result.put("running", TrackLocationService.isRunning());
        TrackSessionStore.Summary stored = new TrackSessionStore(getContext()).getSummary();
        result.put("hasPendingSession", stored != null);
        result.put("sessionId", stored == null ? null : stored.sessionId);
        result.put("sessionState", stored == null ? null : stored.state);
        result.put("startedAt", stored == null ? TrackLocationService.getStartedAt() : stored.startedAt);
        result.put("pointCount", stored == null ? TrackLocationService.getPointCount() : stored.pointCount);
        Location lastLocation = TrackLocationService.getLastLocation();
        if (lastLocation != null) result.put("lastLocation", locationToJson(lastLocation));
        return result;
    }

    private JSObject locationToJson(Location location) {
        JSObject result = new JSObject();
        result.put("latitude", location.getLatitude());
        result.put("longitude", location.getLongitude());
        result.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        result.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
        result.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        result.put("bearing", location.hasBearing() ? location.getBearing() : null);
        result.put("timestamp", location.getTime());
        return result;
    }

    @Override
    public void onTrackLocation(Location location) {
        notifyListeners("location", locationToJson(location));
    }

    @Override
    public void onTrackStatusChanged(boolean running, String message) {
        JSObject event = createStatusResult();
        event.put("running", running);
        event.put("message", message);
        notifyListeners("statusChange", event, true);
    }
}
