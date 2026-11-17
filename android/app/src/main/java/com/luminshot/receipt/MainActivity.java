package com.luminshot.receipt;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public final class MainActivity extends ComponentActivity {
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/www/index.html";
    private static final int REQUEST_PICK_BACKUP = 4101;
    private static final int REQUEST_CREATE_FILE = 4102;
    private static final int MAX_BRIDGE_BYTES = 24 * 1024 * 1024;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private byte[] pendingSaveBytes;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleSystemBack();
            }
        });
        configureSystemBars();
        buildWebView(savedInstanceState);
    }

    private void configureSystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
        }
    }

    private void buildWebView(Bundle savedInstanceState) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247, 245, 240));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(241, 238, 231));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(Math.max(bars.left, 0), Math.max(bars.top, 0),
                    Math.max(bars.right, 0), Math.max(bars.bottom, ime.bottom));
            return insets;
        });
        ViewCompat.requestApplyInsets(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);

        int flags = getApplicationInfo().flags;
        if ((flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme())
                        && LOCAL_HOST.equalsIgnoreCase(uri.getHost())) return false;
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/json"});
                try {
                    startActivityForResult(pick, REQUEST_PICK_BACKUP);
                    return true;
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    return true;
                }
            }
        });
        webView.addJavascriptInterface(new NativeFiles(), "AndroidApp");

        if (savedInstanceState != null && webView.restoreState(savedInstanceState) != null) return;
        webView.loadUrl(START_URL);
    }

    private final class NativeFiles {
        @JavascriptInterface
        public void saveFile(String name, String mimeType, String encoded) {
            receiveFile(name, mimeType, encoded, false);
        }

        @JavascriptInterface
        public void shareFile(String name, String mimeType, String encoded) {
            receiveFile(name, mimeType, encoded, true);
        }
    }

    private void receiveFile(String name, String mimeType, String encoded, boolean share) {
        final byte[] bytes;
        try {
            if (encoded == null || encoded.length() > (MAX_BRIDGE_BYTES * 4L / 3L + 16)) {
                reportNativeResult(false);
                return;
            }
            bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length > MAX_BRIDGE_BYTES) {
                reportNativeResult(false);
                return;
            }
        } catch (IllegalArgumentException e) {
            reportNativeResult(false);
            return;
        }
        final String safeName = safeFileName(name);
        final String safeMime = (mimeType == null || mimeType.isEmpty())
                ? "application/octet-stream" : mimeType;
        runOnUiThread(() -> {
            if (share) shareBytes(safeName, safeMime, bytes);
            else requestSave(safeName, safeMime, bytes);
        });
    }

    private void requestSave(String name, String mimeType, byte[] bytes) {
        pendingSaveBytes = bytes;
        Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        create.addCategory(Intent.CATEGORY_OPENABLE);
        create.setType(mimeType);
        create.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(create, REQUEST_CREATE_FILE);
        } catch (ActivityNotFoundException e) {
            pendingSaveBytes = null;
            reportNativeResult(false);
        }
    }

    private void shareBytes(String name, String mimeType, byte[] bytes) {
        try {
            File dir = new File(getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cache unavailable");
            File file = new File(dir, name);
            try (FileOutputStream output = new FileOutputStream(file, false)) {
                output.write(bytes);
                output.flush();
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newUri(getContentResolver(), name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, "分享小票"));
        } catch (Exception e) {
            reportNativeResult(false);
        }
    }

    private String safeFileName(String name) {
        String candidate = (name == null || name.trim().isEmpty()) ? "小票导出" : name.trim();
        candidate = candidate.replaceAll("[\\\\/:*?\"<>|]", "_");
        return candidate.length() > 120 ? candidate.substring(candidate.length() - 120) : candidate;
    }

    private void reportNativeResult(boolean success) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.__xpl&&window.__xpl.nativeSaveResult(" + success + ")", null);
            } else if (!success) {
                Toast.makeText(this, "文件处理失败，请重试", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_BACKUP) {
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(uri == null ? null : new Uri[]{uri});
                filePathCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_CREATE_FILE) {
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (uri == null || pendingSaveBytes == null) {
                pendingSaveBytes = null;
                return;
            }
            boolean success = false;
            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output != null) {
                    output.write(pendingSaveBytes);
                    output.flush();
                    success = true;
                }
            } catch (Exception ignored) { }
            pendingSaveBytes = null;
            reportNativeResult(success);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    private void handleSystemBack() {
        if (webView == null) { finish(); return; }
        webView.evaluateJavascript(
                "(function(){return !!(window.__xpl&&window.__xpl.handleBack&&window.__xpl.handleBack())})()",
                result -> { if (!"true".equals(result)) finish(); });
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidApp");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
