package com.luminshot.receipt;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

final class AppUpdateManager {
    private static final long MAX_APK_BYTES = 100L * 1024L * 1024L;
    private static final Pattern VERSION_PATTERN = Pattern.compile("\\d+(?:\\.\\d+)*");
    private static final Pattern DIGEST_PATTERN = Pattern.compile("sha256:[a-f0-9]{64}", Pattern.CASE_INSENSITIVE);

    private final Activity activity;
    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean active = new AtomicBoolean(false);

    private volatile boolean destroyed;
    private boolean waitingForInstallPermission;
    private UpdateRequest pendingPermissionRequest;

    AppUpdateManager(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    void startUpdate(String assetUrl, String version, String digest, double expectedSize) {
        final UpdateRequest request;
        try {
            request = validateRequest(assetUrl, version, digest, expectedSize);
        } catch (IllegalArgumentException e) {
            report("error", 0, "更新包信息不安全或不完整，请稍后重试。");
            return;
        }
        activity.runOnUiThread(() -> beginUpdate(request));
    }

    private UpdateRequest validateRequest(String assetUrl, String version, String digest, double expectedSize) {
        String safeVersion = version == null ? "" : version.trim();
        if (!VERSION_PATTERN.matcher(safeVersion).matches()) throw new IllegalArgumentException("version");
        if (!Double.isFinite(expectedSize) || expectedSize < 1 || expectedSize > MAX_APK_BYTES
                || expectedSize != Math.rint(expectedSize)) throw new IllegalArgumentException("size");

        Uri uri = Uri.parse(assetUrl == null ? "" : assetUrl);
        String path = uri.getPath();
        String expectedName = "piao-v" + safeVersion + ".apk";
        String expectedPath = "/luminshot/piao/releases/download/v" + safeVersion + "/" + expectedName;
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !"github.com".equalsIgnoreCase(uri.getHost())
                || path == null || !expectedPath.equals(path)
                || !expectedName.equals(uri.getLastPathSegment())
                || uri.getPort() != -1 || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("url");
        }

        String normalizedDigest = digest == null ? "" : digest.trim().toLowerCase(Locale.US);
        if (!DIGEST_PATTERN.matcher(normalizedDigest).matches()) throw new IllegalArgumentException("digest");
        return new UpdateRequest(uri.toString(), safeVersion, normalizedDigest.substring("sha256:".length()),
                (long) expectedSize);
    }

    private void beginUpdate(UpdateRequest request) {
        if (destroyed) return;
        if (!active.compareAndSet(false, true)) {
            report("error", 0, "更新任务正在进行，请稍候。");
            return;
        }
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            pendingPermissionRequest = request;
            waitingForInstallPermission = true;
            report("permission", 0, "首次安装更新需允许“小票来了”安装应用；授权后返回此 App 会自动开始下载。");
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(settings);
            } catch (ActivityNotFoundException e) {
                waitingForInstallPermission = false;
                pendingPermissionRequest = null;
                active.set(false);
                report("error", 0, "无法打开 Android 安装权限设置，请稍后重试。");
            }
            return;
        }
        queueDownload(request);
    }

    void onResume() {
        if (!waitingForInstallPermission || destroyed) return;
        waitingForInstallPermission = false;
        UpdateRequest request = pendingPermissionRequest;
        pendingPermissionRequest = null;
        if (request == null) {
            active.set(false);
            return;
        }
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            active.set(false);
            report("error", 0, "尚未允许“小票来了”安装应用；如要更新，请重新检查并授权。");
            return;
        }
        queueDownload(request);
    }

    private void queueDownload(UpdateRequest request) {
        report("downloading", 0, "正在 App 内下载 v" + request.version + "… 0%");
        try {
            executor.execute(() -> {
                try {
                    File apk = downloadAndVerify(request);
                    activity.runOnUiThread(() -> openInstaller(apk));
                } catch (Exception e) {
                    active.set(false);
                    report("error", 0, "下载或校验失败，请检查网络后重试。");
                }
            });
        } catch (RejectedExecutionException e) {
            active.set(false);
            report("error", 0, "更新任务无法启动，请重试。");
        }
    }

    private File downloadAndVerify(UpdateRequest request) throws IOException, NoSuchAlgorithmException {
        File directory = new File(activity.getCacheDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("cache unavailable");
        File temporary = new File(directory, "piao-v" + request.version + "-partial.apk");
        File target = new File(directory, "piao-v" + request.version + ".apk");
        if (temporary.exists() && !temporary.delete()) throw new IOException("stale temporary file");

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(request.url).openConnection();
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
            connection.setRequestProperty("User-Agent", "PiaoAppUpdater/1.0");

            int responseCode = connection.getResponseCode();
            URL finalUrl = connection.getURL();
            if (responseCode != HttpURLConnection.HTTP_OK || !"https".equalsIgnoreCase(finalUrl.getProtocol())
                    || !isAllowedGithubAssetHost(finalUrl.getHost())) {
                throw new IOException("unexpected download response");
            }
            long contentLength = connection.getContentLengthLong();
            if (contentLength > 0 && contentLength != request.expectedSize) throw new IOException("size mismatch");

            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            long downloaded = 0;
            int lastPercent = 0;
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(temporary, false)) {
                byte[] buffer = new byte[32 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new IOException("download interrupted");
                    downloaded += count;
                    if (downloaded > MAX_APK_BYTES || downloaded > request.expectedSize) throw new IOException("download too large");
                    output.write(buffer, 0, count);
                    sha256.update(buffer, 0, count);
                    int percent = (int) Math.min(99, (downloaded * 100L) / request.expectedSize);
                    if (percent >= lastPercent + 5) {
                        report("downloading", percent,
                                "正在 App 内下载 v" + request.version + "… " + percent + "%");
                        lastPercent = percent;
                    }
                }
                output.flush();
                output.getFD().sync();
            }
            if (downloaded != request.expectedSize) throw new IOException("size mismatch");

            report("verifying", 100, "下载完成，正在校验 APK…");
            if (!request.sha256.equals(toHex(sha256.digest()))) throw new IOException("sha256 mismatch");
            verifyApkMetadata(temporary, request.version);

            if (target.exists() && !target.delete()) throw new IOException("cannot replace cached APK");
            if (!temporary.renameTo(target)) throw new IOException("cannot finalize APK");
            return target;
        } finally {
            if (connection != null) connection.disconnect();
            if (temporary.exists()) temporary.delete();
        }
    }

    private void verifyApkMetadata(File apk, String expectedVersion) throws IOException {
        PackageInfo candidate = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName)
                || !expectedVersion.equals(candidate.versionName)) {
            throw new IOException("package identity mismatch");
        }
        PackageInfo installed;
        try {
            installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        } catch (Exception e) {
            throw new IOException("installed package unavailable", e);
        }
        long candidateCode = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        long installedCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        if (candidateCode <= installedCode) throw new IOException("version code is not newer");
    }

    private void openInstaller(File apk) {
        if (destroyed) return;
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            active.set(false);
            report("error", 0, "Android 尚未允许“小票来了”安装应用，请重新检查更新。");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
            Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            report("installing", 100, "APK 已下载并校验，请在 Android 安装界面确认安装。");
            activity.startActivity(install);
        } catch (Exception e) {
            report("error", 0, "系统安装界面无法打开，请稍后重试。");
        } finally {
            active.set(false);
        }
    }

    private static boolean isAllowedGithubAssetHost(String host) {
        String normalized = host == null ? "" : host.toLowerCase(Locale.US);
        return "github.com".equals(normalized) || normalized.endsWith(".githubusercontent.com");
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.US, "%02x", value & 0xff));
        return result.toString();
    }

    private void report(String state, int percent, String message) {
        if (destroyed) return;
        final String script = "window.__xpl&&window.__xpl.nativeUpdateProgress&&window.__xpl.nativeUpdateProgress("
                + JSONObject.quote(state) + "," + percent + "," + JSONObject.quote(message) + ")";
        activity.runOnUiThread(() -> {
            if (!destroyed && webView != null) webView.evaluateJavascript(script, null);
        });
    }

    void onDestroy() {
        destroyed = true;
        waitingForInstallPermission = false;
        pendingPermissionRequest = null;
        active.set(false);
        executor.shutdownNow();
    }

    private static final class UpdateRequest {
        final String url;
        final String version;
        final String sha256;
        final long expectedSize;

        UpdateRequest(String url, String version, String sha256, long expectedSize) {
            this.url = url;
            this.version = version;
            this.sha256 = sha256;
            this.expectedSize = expectedSize;
        }
    }
}
