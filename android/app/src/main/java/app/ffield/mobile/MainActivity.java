package app.ffield.mobile;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        registerPlugin(NativeFileSaverPlugin.class);
        registerPlugin(NativePhotoPickerPlugin.class);
        registerPlugin(NativeTrackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
