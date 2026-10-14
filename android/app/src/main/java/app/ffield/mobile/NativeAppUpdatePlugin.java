package app.ffield.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "NativeAppUpdate")
public class NativeAppUpdatePlugin extends Plugin {
    @PluginMethod
    public void checkForUpdate(PluginCall call) {
        AppUpdateManagerFactory.create(getContext()).getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                JSObject result = new JSObject();
                result.put("updateAvailable", info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Play 스토어 업데이트 확인 실패", error));
    }
}
