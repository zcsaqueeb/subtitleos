package app.subtitleos;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final String HOME = "https://subtitleos.lovable.app/";
    private static final String HOST = "subtitleos.lovable.app";
    private static final int FILE_REQ = 1001, PERM_REQ = 1002, SAVE_REQ = 1003;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;
    private OutputStream saveStream;
    private ProgressDialog saveProgress;
    private long saveSize;
    private boolean connectionDialog, saving, destroyed;

    private boolean trusted(String value) {
        if (value == null) return false;
        Uri u = Uri.parse(value);
        return "https".equals(u.getScheme()) && HOST.equals(u.getHost()) && (u.getPort() == -1 || u.getPort() == 443);
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0a0a0a"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (!trusted(url)) return;
                // Capture the export name before temporary download links are removed. No native bridge.
                view.evaluateJavascript("(()=>{if(window.__subtitleosDownloadNames)return;window.__subtitleosDownloadNames={};document.addEventListener('click',e=>{const a=e.target.closest?.('a[download]');if(a){const n=window.__subtitleosDownloadNames;n[a.href]=a.download;const keys=Object.keys(n);if(keys.length>30)delete n[keys[0]];}},true);})()", null);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (trusted(req.getUrl().toString())) return false;
                if (req.isForMainFrame() && ("https".equals(req.getUrl().getScheme()) || "http".equals(req.getUrl().getScheme()) || "mailto".equals(req.getUrl().getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception ignored) {}
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
                if (!req.isForMainFrame() || connectionDialog || destroyed) return;
                showConnectionRecovery(req.getUrl().toString());
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse response) {
                if (req.isForMainFrame() && response.getStatusCode() >= 500) showConnectionRecovery(req.getUrl().toString());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                ArrayList<String> accepted = new ArrayList<>();
                for (String type : p.getAcceptTypes()) if (type.contains("/")) accepted.add(type);
                if (!accepted.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, accepted.toArray(new String[0]));
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(Intent.createChooser(i, "Choose file"), FILE_REQ); }
                catch (Exception e) { cb.onReceiveValue(null); fileCallback = null; }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest req) {
                if (!trusted(req.getOrigin().toString()) || !trusted(web.getUrl())) { req.deny(); return; }
                if (pendingPermission != null) pendingPermission.deny();
                pendingPermission = req;
                ArrayList<String> needed = new ArrayList<>();
                for (String r : req.getResources()) {
                    String permission = PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) ? Manifest.permission.RECORD_AUDIO : PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) ? Manifest.permission.CAMERA : null;
                    if (permission != null && checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) needed.add(permission);
                }
                if (needed.isEmpty()) grantAllowed();
                else requestPermissions(needed.toArray(new String[0]), PERM_REQ);
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest req) { if (pendingPermission == req) pendingPermission = null; }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url.startsWith("blob:")) { saveBlob(url, mime); return; }
            if (!trusted(url)) { Toast.makeText(this, "Unsupported download address", Toast.LENGTH_LONG).show(); return; }
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) r.addRequestHeader("Cookie", cookies);
                r.addRequestHeader("User-Agent", ua);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, cd, mime));
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, "Download started", Toast.LENGTH_SHORT).show();
            } catch (Exception e) { Toast.makeText(this, "Download failed. Try again.", Toast.LENGTH_LONG).show(); }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
    }

    private void showConnectionRecovery(String failedUrl) {
        if (connectionDialog || destroyed) return;
        connectionDialog = true;
        new AlertDialog.Builder(this).setTitle("Unable to connect")
            .setMessage("Your connection may be offline or the website may be temporarily unavailable.")
            .setPositiveButton("Retry page", (d, w) -> { connectionDialog = false; web.loadUrl(trusted(failedUrl) ? failedUrl : HOME); })
            .setNeutralButton("Homepage", (d, w) -> { connectionDialog = false; web.loadUrl(HOME); })
            .setNegativeButton("Close", (d, w) -> connectionDialog = false)
            .setOnCancelListener(d -> connectionDialog = false).show();
    }

    private String safeFilename(String value, String mime) {
        String name = value == null ? "" : value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (name.isEmpty() || ".".equals(name) || "..".equals(name))
            return "SubtitleOS-export" + ("video/mp4".equals(mime) ? ".mp4" : "application/zip".equals(mime) ? ".zip" : "text/vtt".equals(mime) ? ".vtt" : ".txt");
        if (name.length() <= 180) return name;
        int dot = name.lastIndexOf('.');
        String extension = dot > 0 && name.length() - dot <= 20 ? name.substring(dot) : "";
        return name.substring(0, 180 - extension.length()) + extension;
    }

    private void grantAllowed() {
        PermissionRequest req = pendingPermission;
        pendingPermission = null;
        if (req == null) return;
        if (!trusted(web.getUrl()) || !trusted(req.getOrigin().toString())) { req.deny(); return; }
        ArrayList<String> allowed = new ArrayList<>();
        for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) allowed.add(r);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) allowed.add(r);
        }
        if (allowed.isEmpty()) req.deny(); else req.grant(allowed.toArray(new String[0]));
    }

    private void saveBlob(String url, String mime) {
        if (saving || !trusted(web.getUrl()) || !url.startsWith("blob:https://" + HOST + "/")) return;
        saving = true;
        String q = JSONObject.quote(url);
        // Keep the Blob itself, not one huge base64 string. No JavaScript interface is exposed.
        web.evaluateJavascript("(()=>{window.__subtitleosSave={ready:false};fetch(" + q + ").then(r=>r.blob()).then(b=>{window.__subtitleosSave={ready:true,blob:b};}).catch(()=>{window.__subtitleosSave={error:true};});return true;})()", v -> waitForBlob(mime, url, 0));
    }
    private void waitForBlob(String mime, String url, int attempt) {
        if (destroyed) return;
        web.evaluateJavascript("JSON.stringify({ready:!!window.__subtitleosSave?.ready,error:!!window.__subtitleosSave?.error,size:window.__subtitleosSave?.blob?.size||0,name:window.__subtitleosDownloadNames?.[" + JSONObject.quote(url) + "]||Array.from(document.querySelectorAll('a[download]')).find(a=>a.href===" + JSONObject.quote(url) + ")?.download||''})", value -> {
            try {
                JSONObject result = new JSONObject(new JSONArray("[" + value + "]").getString(0));
                if (result.optBoolean("error") || attempt > 100) { finishSave(false); return; }
                if (!result.optBoolean("ready")) { web.postDelayed(() -> waitForBlob(mime, url, attempt + 1), 100); return; }
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                saveSize = result.optLong("size");
                String name = safeFilename(result.optString("name"), mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(i, SAVE_REQ);
            } catch (Exception e) { finishSave(false); }
        });
    }
    private void writeChunk(long offset) {
        if (destroyed || saveStream == null || !trusted(web.getUrl())) { finishSave(false); return; }
        if (offset >= saveSize) { finishSave(true); return; }
        web.evaluateJavascript("(()=>{const b=window.__subtitleosSave?.blob;window.__subtitleosChunk=null;if(!b){window.__subtitleosChunk='error';return;}const r=new FileReader();r.onload=()=>window.__subtitleosChunk=r.result.split(',')[1];r.onerror=()=>window.__subtitleosChunk='error';r.readAsDataURL(b.slice(" + offset + "," + (offset + 262144) + "));})()", v -> readChunk(offset, 0));
    }
    private void readChunk(long offset, int attempt) {
        if (destroyed || saveStream == null) return;
        if (!trusted(web.getUrl()) || attempt > 500) { finishSave(false); return; }
        web.evaluateJavascript("window.__subtitleosChunk", value -> {
            if (!saving || saveStream == null || destroyed) return;
            try {
                if ("null".equals(value)) { web.postDelayed(() -> readChunk(offset, attempt + 1), 20); return; }
                String chunk = new JSONArray("[" + value + "]").getString(0);
                if ("error".equals(chunk)) { finishSave(false); return; }
                saveStream.write(Base64.decode(chunk, Base64.DEFAULT));
                if (saveProgress != null) saveProgress.setProgress((int)Math.min(100, (offset + 262144) * 100 / Math.max(1, saveSize)));
                writeChunk(offset + 262144);
            } catch (Exception e) { finishSave(false); }
        });
    }
    private void finishSave(boolean success) {
        try { if (saveStream != null) saveStream.close(); } catch (Exception ignored) {}
        saveStream = null; saving = false;
        if (saveProgress != null) { saveProgress.dismiss(); saveProgress = null; }
        if (!destroyed) { web.evaluateJavascript("delete window.__subtitleosSave;delete window.__subtitleosChunk", null); Toast.makeText(this, success ? "File saved" : "File not saved", Toast.LENGTH_SHORT).show(); }
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) { super.onRequestPermissionsResult(code, perms, results); if (code == PERM_REQ) grantAllowed(); }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == SAVE_REQ) {
            if (result == RESULT_OK && data != null && data.getData() != null) {
                try {
                    saveStream = getContentResolver().openOutputStream(data.getData());
                    if (saveStream == null) { finishSave(false); return; }
                    saveProgress = new ProgressDialog(this);
                    saveProgress.setTitle("Saving export");
                    saveProgress.setMessage("Keep this page open until your file is saved.");
                    saveProgress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
                    saveProgress.setMax(100);
                    saveProgress.setCancelable(false);
                    saveProgress.setButton(AlertDialog.BUTTON_NEGATIVE, "Cancel", (d, w) -> finishSave(false));
                    saveProgress.show();
                    writeChunk(0);
                } catch (Exception e) { finishSave(false); }
            } else finishSave(false);
        }
        if (code == FILE_REQ && fileCallback != null) {
            Uri[] uris = WebChromeClient.FileChooserParams.parseResult(result, data);
            if (result == RESULT_OK && data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                uris = new Uri[count];
                for (int i = 0; i < count; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
            }
            fileCallback.onReceiveValue(uris); fileCallback = null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        destroyed = true; finishSave(false);
        if (pendingPermission != null) pendingPermission.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        web.stopLoading(); web.setWebChromeClient(null); web.destroy(); super.onDestroy();
    }
}
