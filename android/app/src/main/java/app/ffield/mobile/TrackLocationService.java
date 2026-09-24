package app.ffield.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.HandlerThread;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.io.IOException;

/** 화면 꺼짐과 앱 전환 중에도 사용자가 시작한 트랙 위치 수신을 유지합니다. */
public class TrackLocationService extends Service implements LocationListener {

    public interface Observer {
        void onTrackLocation(Location location);
        void onTrackStatusChanged(boolean running, String message);
    }

    public static final String ACTION_START = "app.ffield.mobile.action.START_TRACK_LOCATION";
    public static final String ACTION_STOP = "app.ffield.mobile.action.STOP_TRACK_LOCATION";
    public static final String EXTRA_INTERVAL_MS = "intervalMs";
    public static final String EXTRA_MIN_DISTANCE_METERS = "minDistanceMeters";

    private static final String CHANNEL_ID = "track_location";
    private static final int NOTIFICATION_ID = 1201;
    private static final Set<Observer> OBSERVERS = new CopyOnWriteArraySet<>();

    private static volatile boolean running = false;
    private static volatile long startedAt = 0L;
    private static volatile int pointCount = 0;
    private static volatile Location lastLocation = null;

    private LocationManager locationManager;
    private TrackSessionStore sessionStore;
    private HandlerThread locationThread;

    public static void addObserver(Observer observer) {
        if (observer != null) OBSERVERS.add(observer);
    }

    public static void removeObserver(Observer observer) {
        if (observer != null) OBSERVERS.remove(observer);
    }

    public static boolean isRunning() {
        return running;
    }

    public static long getStartedAt() {
        return startedAt;
    }

    public static int getPointCount() {
        return pointCount;
    }

    public static Location getLastLocation() {
        return lastLocation == null ? null : new Location(lastLocation);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        sessionStore = new TrackSessionStore(this);
        locationThread = new HandlerThread("ffield-track-location");
        locationThread.start();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTracking("사용자가 트랙 기록을 중지했습니다.");
            stopSelf();
            return START_NOT_STICKY;
        }

        startAsForeground();
        long intervalMs = intent == null
            ? 1000L
            : Math.max(500L, intent.getLongExtra(EXTRA_INTERVAL_MS, 1000L));
        float minDistanceMeters = intent == null
            ? 0f
            : Math.max(0f, intent.getFloatExtra(EXTRA_MIN_DISTANCE_METERS, 0f));
        startTracking(intervalMs, minDistanceMeters);
        return START_NOT_STICKY;
    }

    private void startAsForeground() {
        int foregroundType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), foregroundType);
    }

    private void startTracking(long intervalMs, float minDistanceMeters) {
        if (running) return;

        boolean hasFineLocation = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarseLocation = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!hasFineLocation && !hasCoarseLocation) {
            notifyStatus(false, "위치 권한이 없습니다.");
            stopSelf();
            return;
        }

        if (locationManager == null || !locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            notifyStatus(false, "기기의 GPS가 꺼져 있습니다.");
            stopSelf();
            return;
        }

        try {
            TrackSessionStore.Summary session = sessionStore.beginOrResumeSession();
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                minDistanceMeters,
                this,
                locationThread.getLooper()
            );
            running = true;
            startedAt = session.startedAt;
            pointCount = session.pointCount;
            lastLocation = null;
            notifyStatus(true, "트랙 기록 중");
        } catch (IOException error) {
            notifyStatus(false, "트랙 임시 저장소를 준비하지 못했습니다.");
            stopSelf();
        } catch (SecurityException error) {
            notifyStatus(false, "위치 권한을 사용할 수 없습니다.");
            stopSelf();
        } catch (IllegalArgumentException error) {
            notifyStatus(false, "GPS 위치 공급자를 사용할 수 없습니다.");
            stopSelf();
        }
    }

    private void stopTracking(String message) {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (SecurityException ignored) {
                // 실행 중 권한이 철회돼도 서비스 종료를 계속합니다.
            }
        }
        boolean wasRunning = running;
        running = false;
        if (sessionStore != null) sessionStore.markStopped();
        if (wasRunning) notifyStatus(false, message);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        try {
            TrackSessionStore.Summary summary = sessionStore.append(location);
            lastLocation = new Location(location);
            pointCount = summary.pointCount;
        } catch (IOException error) {
            notifyStatus(false, "트랙 좌표를 기기에 저장하지 못했습니다.");
            stopSelf();
            return;
        }
        for (Observer observer : OBSERVERS) {
            observer.onTrackLocation(new Location(location));
        }
    }

    @Override
    public void onProviderDisabled(@NonNull String provider) {
        if (LocationManager.GPS_PROVIDER.equals(provider)) {
            notifyStatus(true, "기기의 GPS가 꺼져 있어 위치 수신을 기다리고 있습니다.");
        }
    }

    @Override
    public void onProviderEnabled(@NonNull String provider) {
        // 위치 구독이 유지되므로 별도 재시작은 필요하지 않습니다.
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onStatusChanged(String provider, int status, Bundle extras) {
        // Android 10 이전 호환용 콜백입니다.
    }

    @Override
    public void onDestroy() {
        stopTracking("트랙 위치 서비스가 종료되었습니다.");
        if (locationThread != null) locationThread.quitSafely();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void notifyStatus(boolean isRunning, String message) {
        for (Observer observer : OBSERVERS) {
            observer.onTrackStatusChanged(isRunning, message);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "트랙 위치 기록",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("화면이 꺼진 동안에도 진행 중인 트랙 기록을 표시합니다.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, TrackLocationService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_track_notification)
            .setContentTitle("F-Field 트랙 기록 중")
            .setContentText("화면을 끄거나 다른 앱을 사용해도 위치를 기록합니다.")
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setUsesChronometer(true)
            .addAction(0, "기록 중지", stopPendingIntent)
            .build();
    }
}
