package io.ionic.starter;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;
    private PermissionRequest pendingWebViewRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMicPlugin.class);
        super.onCreate(savedInstanceState);

        // ── (fallback เดิม) ตั้งค่า WebChromeClient ให้รองรับ getUserMedia ──
        // เก็บไว้เผื่อ WebView บางเครื่องรองรับ แต่ตอนนี้แอปใช้ NativeMicPlugin
        // (AudioRecord) เป็นทางหลักแล้ว ไม่ต้องพึ่งพา getUserMedia() อีกต่อไป
        this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // เช็คว่า Android permission RECORD_AUDIO ได้รับอนุญาตแล้วหรือยัง
                    if (ContextCompat.checkSelfPermission(MainActivity.this,
                            Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        // อนุญาตให้ WebView เข้าถึงไมโครโฟนได้เลย
                        request.grant(request.getResources());
                    } else {
                        // ยังไม่ได้รับอนุญาต ขอ Android permission ก่อน
                        pendingWebViewRequest = request;
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{Manifest.permission.RECORD_AUDIO},
                                PERMISSION_REQUEST_CODE
                        );
                    }
                });
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == PERMISSION_REQUEST_CODE && pendingWebViewRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingWebViewRequest.grant(pendingWebViewRequest.getResources());
            } else {
                pendingWebViewRequest.deny();
            }
            pendingWebViewRequest = null;
        }
    }
}