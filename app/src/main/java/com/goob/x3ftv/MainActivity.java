package com.goob.x3ftv;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * X3F TV v0.5 — WebView-only shell. Loads a bubbly HTML launcher (launcher.html); picking a game
 * navigates the WebView to it. BLE force is fed to whatever page is showing (window.__x3fForce).
 * The remote drives window.__x3fNav on both launcher and games; Back returns to the launcher.
 * Includes an in-app updater (version.txt on the dist branch → DownloadManager → installer).
 */
public class MainActivity extends Activity {

    private static final UUID SERVICE  = UUID.fromString("e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CH_FORCE = UUID.fromString("e3458901-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CCCD     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final int  REQ_PERMS = 42;
    private static final String LAUNCHER = "file:///android_asset/launcher.html";
    private static final String VERSION_URL = "https://raw.githubusercontent.com/GoobIsGabe/x3f-tv/dist/version.txt";
    private static final String APK_URL = "https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private boolean scanning = false, connecting = false, connected = false;
    private String targetAddress = null;
    private double baseline = 0;
    private boolean haveBaseline = false;

    private WebView web;
    private boolean webReady = false;
    private String currentUrl = LAUNCHER;
    private long lastInject = 0;
    private long dlId = -1;
    private String barState = "wait", barText = "Connecting…";
    private android.content.SharedPreferences prefs;
    /* Everything the scan has seen this session, address -> name, so the user can
       pick the bar by hand when the advertisement is not self-describing. */
    private final Map<String, String> seen = new LinkedHashMap<>();
    private boolean triedKnown = false;
    private long watchdog = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try { prefs = getSharedPreferences("x3f", MODE_PRIVATE); } catch (Exception ignored) {}
        buildWeb();
        try {
            IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(dlRx, f, Context.RECEIVER_EXPORTED);
            else registerReceiver(dlRx, f);
        } catch (Exception ignored) {}
        BluetoothManager mgr = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = (mgr != null) ? mgr.getAdapter() : null;
        if (adapter == null) { setBar("", "No Bluetooth"); return; }
        if (!adapter.isEnabled()) setBar("wait", "Turn on Bluetooth");
        ensurePermsThenScan();
    }

    // ---------- WebView ----------
    private void buildWeb() {
        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFF05030F);
        web.addJavascriptInterface(new Bridge(), "X3F");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView v, String u, String m, JsResult r) { r.confirm(); return true; }
            @Override public boolean onJsConfirm(WebView v, String u, String m, JsResult r) { r.confirm(); return true; }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                currentUrl = url != null ? url : LAUNCHER;
                webReady = true;
                if (isLauncher(url)) {
                    pushBar();
                    v.evaluateJavascript("window.__x3fVersion&&window.__x3fVersion('" + BuildConfig.VERSION_NAME + "')", null);
                } else if (url != null && url.startsWith("file")) {
                    v.evaluateJavascript(BOOTSTRAP, null);
                }
            }
        });
        setContentView(web);
        web.loadUrl(LAUNCHER);
    }

    private boolean isLauncher(String url) { return url != null && (url.contains("launcher.html") || url.endsWith("index.html")); }

    // ---------- permissions ----------
    private void ensurePermsThenScan() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.BLUETOOTH_SCAN);
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.BLUETOOTH_CONNECT);
        } else {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (need.isEmpty()) startScan();
        else requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }
    @Override public void onRequestPermissionsResult(int req, String[] p, int[] res) {
        super.onRequestPermissionsResult(req, p, res);
        boolean ok = res.length > 0;
        for (int r : res) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        if (ok) startScan(); else setBar("", "Bluetooth denied");
    }

    // ---------- BLE ----------

    /* Names the bar is known to advertise under. Case-insensitive, because a
       lowercase name used to slip past the old toUpperCase().contains("X3"). */
    private boolean nameLooksLikeBar(String n) {
        if (n == null) return false;
        String u = n.toUpperCase();
        return u.contains("X3") || u.contains("FORCE") || u.contains("JAQUISH");
    }
    private String safeNameOf(BluetoothDevice d) {
        try { return d.getName(); } catch (Exception e) { return null; }
    }

    /* Scanning alone cannot find the bar in two very ordinary situations:
         1. it is already connected (to this TV from a previous run, or to your
            phone) - a connected peripheral stops advertising, so it is invisible
            to every scan, forever;
         2. its advertisement carries neither the name nor the service UUID, which
            is what the matcher needs - if the system's name cache gets wiped the
            same firmware suddenly stops matching.
       So before scanning, go straight at the devices we can address directly. */
    private boolean tryKnownDevices() {
        try {
            BluetoothManager mgr = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
            if (mgr != null) {
                List<BluetoothDevice> live = mgr.getConnectedDevices(BluetoothProfile.GATT);
                if (live != null) for (BluetoothDevice d : live) {
                    if (nameLooksLikeBar(safeNameOf(d))) {
                        setBar("wait", "Bar already connected - attaching…");
                        connectTo(d); armWatchdog(); return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        try {
            String last = (prefs != null) ? prefs.getString("lastBar", null) : null;
            if (last != null && adapter != null) {
                BluetoothDevice d = adapter.getRemoteDevice(last);
                if (d != null) { setBar("wait", "Reconnecting to your bar…"); connectTo(d); armWatchdog(); return true; }
            }
        } catch (Exception ignored) {}
        try {
            if (adapter != null && adapter.getBondedDevices() != null) {
                for (BluetoothDevice d : adapter.getBondedDevices()) {
                    if (nameLooksLikeBar(safeNameOf(d))) {
                        setBar("wait", "Connecting to paired bar…");
                        connectTo(d); armWatchdog(); return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    /* A direct connect has no timeout of its own - if the address is stale it can
       sit on "Reconnecting…" forever. Fall back to scanning if it stalls. */
    private void armWatchdog() {
        final long id = ++watchdog;
        ui.postDelayed(new Runnable() {
            @Override public void run() {
                if (id != watchdog || connected) return;
                connecting = false; closeGatt();
                setBar("wait", "No answer - scanning instead…");
                startScan();
            }
        }, 9000);
    }

    private void startScan() {
        if (scanning || connected || connecting || adapter == null) return;
        if (!triedKnown) { triedKnown = true; if (tryKnownDevices()) return; }
        try {
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { setBar("wait", "Bluetooth off"); return; }
            ScanSettings s = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
            scanner.startScan(null, s, scanCb);
            scanning = true;
            setBar("wait", "Scanning for bar…");
        } catch (SecurityException e) { setBar("", "Bluetooth permission?"); }
    }
    private void stopScan() { if (!scanning || scanner == null) return; try { scanner.stopScan(scanCb); } catch (Exception ignored) {} scanning = false; }

    private final ScanCallback scanCb = new ScanCallback() {
        @Override public void onScanResult(int type, ScanResult result) {
            BluetoothDevice d = result.getDevice();
            String name = safeName(d, result);
            boolean hasService = result.getScanRecord() != null && result.getScanRecord().getServiceUuids() != null
                    && result.getScanRecord().getServiceUuids().contains(new ParcelUuid(SERVICE));
            // remember everything, so the launcher can offer a manual pick
            try {
                String addr = d.getAddress();
                boolean isNew = false;
                synchronized (seen) {
                    if (addr != null && !seen.containsKey(addr)) {
                        seen.put(addr, name != null ? name : "(unnamed device)");
                        isNew = true;
                    }
                }
                if (isNew) pushDevices();
            } catch (Exception ignored) {}
            boolean looksLikeBar = nameLooksLikeBar(name) || hasService;
            if (looksLikeBar && !connecting && !connected) connectTo(d);
        }
        @Override public void onScanFailed(int c) { setBar("", "Scan failed"); }
    };
    private String safeName(BluetoothDevice d, ScanResult r) {
        String n = null;
        try { if (r.getScanRecord() != null) n = r.getScanRecord().getDeviceName(); if (n == null) n = d.getName(); } catch (SecurityException ignored) {}
        return n;
    }
    private void connectTo(BluetoothDevice d) {
        if (connecting || connected) return;
        connecting = true; targetAddress = d.getAddress(); stopScan(); setBar("wait", "Connecting…");
        try { gatt = d.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE); }
        catch (SecurityException e) { setBar("", "Connect permission?"); connecting = false; }
    }
    private void reconnect() {
        if (connected || connecting || adapter == null) return;
        if (targetAddress != null) {
            try { BluetoothDevice d = adapter.getRemoteDevice(targetAddress); connecting = true; setBar("wait", "Reconnecting…"); gatt = d.connectGatt(this, true, gattCb, BluetoothDevice.TRANSPORT_LE); }
            catch (Exception e) { startScan(); }
        } else startScan();
    }
    private void closeGatt() { if (gatt != null) { try { gatt.close(); } catch (Exception ignored) {} gatt = null; } }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothGatt.STATE_CONNECTED) { setBar("wait", "Connected…"); try { g.discoverServices(); } catch (SecurityException ignored) {} }
            else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                connected = false; connecting = false; setBar("", "Bar disconnected");
                ui.post(() -> { if (web != null && webReady) { try { web.evaluateJavascript("window.__x3fForce=0;", null); } catch (Exception ignored) {} } });
                closeGatt(); ui.postDelayed(MainActivity.this::reconnect, 1200);
            }
        }
        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService svc = g.getService(SERVICE);
            if (svc == null) { setBar("", "Wrong device — scanning…"); connecting = false; connected = false; closeGatt(); ui.postDelayed(MainActivity.this::startScan, 800); return; }
            BluetoothGattCharacteristic ch = svc.getCharacteristic(CH_FORCE);
            if (ch == null) { setBar("", "No force channel"); return; }
            try {
                g.setCharacteristicNotification(ch, true);
                BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
                if (cccd != null) { cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE); g.writeDescriptor(cccd); }
                connected = true; connecting = false; haveBaseline = false; setBar("on", "Bar: LIVE");
                // remember it: next launch can go straight at it, which works even
                // when the bar is not advertising and a scan would never see it
                try { if (prefs != null && targetAddress != null) prefs.edit().putString("lastBar", targetAddress).apply(); } catch (Exception ignored) {}
            } catch (SecurityException e) { setBar("", "Connect permission?"); }
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch, byte[] value) { handleForce(value); }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch) { handleForce(ch.getValue()); }
    };

    private void handleForce(byte[] v) {
        if (v == null || v.length < 8) return;
        double rawd = ByteBuffer.wrap(v).order(ByteOrder.LITTLE_ENDIAN).getDouble();
        if (!haveBaseline) { baseline = rawd; haveBaseline = true; }
        injectForce(Math.max(0, rawd - baseline));
    }
    private void injectForce(double force) {
        if (!webReady || web == null) return;
        long now = SystemClock.uptimeMillis();
        if (now - lastInject < 16) return; lastInject = now;
        final String js = "window.__x3fForce=" + (Math.round(force * 100) / 100.0) + ";";
        web.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignored) {} });
    }

    private void setBar(String state, String text) {
        barState = state; barText = text;
        ui.post(this::pushBar);
    }
    private void pushBar() {
        if (web == null || !webReady) return;
        final String js = "window.__x3fSetBar&&window.__x3fSetBar('" + barState + "','" + barText.replace("'", " ") + "')";
        try { web.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    // ---------- JS bridge ----------
    private class Bridge {
        @JavascriptInterface public void reZero() { haveBaseline = false; }
        @JavascriptInterface public void checkUpdate() { new Thread(MainActivity.this::doCheckUpdate).start(); }
        /* Manual escape hatch: the launcher lists everything the scan saw and the
           user picks the bar with the remote. Works when the advertisement gives
           us nothing to match on. */
        @JavascriptInterface public void pickDevice(final String addr) {
            ui.post(new Runnable() { @Override public void run() {
                try {
                    stopScan(); closeGatt();
                    connecting = false; connected = false;
                    BluetoothDevice d = adapter.getRemoteDevice(addr);
                    if (d == null) { setBar("", "Bad address"); return; }
                    connectTo(d); armWatchdog();
                } catch (Exception e) { setBar("", "Could not connect"); }
            } });
        }
        /* Start over cleanly - drops any half-open GATT, which is what gets the
           stack unstuck without reopening the app. */
        @JavascriptInterface public void rescan() {
            ui.post(new Runnable() { @Override public void run() {
                watchdog++;                       // cancel any pending fallback
                stopScan(); closeGatt();
                connecting = false; connected = false; triedKnown = false;
                synchronized (seen) { seen.clear(); }
                pushDevices();
                setBar("wait", "Rescanning…");
                ensurePermsThenScan();
            } });
        }
    }
    private String jsSafe(String s) {
        if (s == null) return "";
        return s.replace("\\", " ").replace("\"", " ").replace("'", " ")
                .replace("\n", " ").replace("\r", " ").trim();
    }
    private void pushDevices() {
        if (web == null || !webReady) return;
        StringBuilder sb = new StringBuilder("[");
        synchronized (seen) {
            boolean firstItem = true;
            for (Map.Entry<String, String> e : seen.entrySet()) {
                if (!firstItem) sb.append(",");
                firstItem = false;
                sb.append("{\"a\":\"").append(jsSafe(e.getKey()))
                  .append("\",\"n\":\"").append(jsSafe(e.getValue())).append("\"}");
            }
        }
        sb.append("]");
        final String js = "window.__x3fDevices&&window.__x3fDevices(" + sb + ")";
        ui.post(new Runnable() { @Override public void run() {
            try { web.evaluateJavascript(js, null); } catch (Exception ignored) {}
        } });
    }
    private void pushUpdate(String msg) {
        if (web == null) return;
        ui.post(() -> { try { web.evaluateJavascript("window.__x3fUpdate&&window.__x3fUpdate('" + msg.replace("'", " ") + "')", null); } catch (Exception ignored) {} });
    }
    private void doCheckUpdate() {
        try {
            pushUpdate("Checking…");
            String s = httpGet(VERSION_URL).replaceAll("[^0-9]", "");
            if (s.isEmpty()) { pushUpdate("Couldn't read version"); return; }
            int remote = Integer.parseInt(s);
            if (remote <= BuildConfig.VERSION_CODE) { pushUpdate("You're on the latest (v" + BuildConfig.VERSION_NAME + ")"); return; }
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                pushUpdate("Allow \"install unknown apps\" for X3F, then check again");
                try { Intent st = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())); st.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(st); } catch (Exception ignored) {}
                return;
            }
            pushUpdate("Downloading v" + remote + "…");
            startDownload();
        } catch (Exception e) { pushUpdate("Update check failed"); }
    }
    private String httpGet(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setConnectTimeout(9000); c.setReadTimeout(9000); c.setRequestProperty("User-Agent", "x3f-tv");
        InputStream in = c.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[4096]; int n; while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        in.close(); c.disconnect(); return bo.toString("UTF-8").trim();
    }
    private void startDownload() {
        try {
            try { new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "x3f-update.apk").delete(); } catch (Exception ignored) {}
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(APK_URL));
            r.setMimeType("application/vnd.android.package-archive");
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            r.setTitle("X3F TV update");
            r.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "x3f-update.apk");
            dlId = dm.enqueue(r);
        } catch (Exception e) { pushUpdate("Download failed"); }
    }
    private final BroadcastReceiver dlRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == -1 || id != dlId) return;
            try {
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                Uri uri = dm.getUriForDownloadedFile(id);
                if (uri == null) { pushUpdate("Download failed"); return; }
                pushUpdate("Opening installer — confirm to update");
                Intent inst = new Intent(Intent.ACTION_VIEW);
                inst.setDataAndType(uri, "application/vnd.android.package-archive");
                inst.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(inst);
            } catch (Exception e) { pushUpdate("Install failed"); }
        }
    };

    // ---------- keys ----------
    private void nav(String dir) { if (web != null) web.evaluateJavascript("window.__x3fNav&&window.__x3fNav('" + dir + "')", null); }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (webReady && e.getAction() == KeyEvent.ACTION_DOWN) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT:  nav("left");  return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: nav("right"); return true;
                case KeyEvent.KEYCODE_DPAD_UP:    nav("up");    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:  nav("down");  return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_BUTTON_A:   nav("enter"); return true;
                case KeyEvent.KEYCODE_BACK:
                    if (isLauncher(currentUrl)) { moveTaskToBack(true); } else { web.loadUrl(LAUNCHER); }
                    return true;
            }
        }
        if (webReady && e.getAction() == KeyEvent.ACTION_UP) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_BUTTON_A: case KeyEvent.KEYCODE_BACK: return true;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        stopScan(); closeGatt();
        try { unregisterReceiver(dlRx); } catch (Exception ignored) {}
        if (web != null) { web.destroy(); web = null; }
    }

    // Injected into GAMES (not the launcher) after load.
    private static final String BOOTSTRAP = """
(function(){
 try{ window.__x3fNative=true; }catch(e){}
 try{ baseline=0; }catch(e){}
 try{ var st=document.getElementById('x3fCss'); if(!st){ st=document.createElement('style'); st.id='x3fCss';
   st.textContent='.app{max-width:none!important;width:100%!important}html,body{width:100%!important;height:100%!important}.x3f-focus{outline:4px solid #39f5c4!important;outline-offset:2px;border-radius:8px}'
     /* The TV button asks for fullscreen + an orientation lock. In this shell the
        WebView is already fullscreen and the activity is locked to landscape, so
        it does nothing at all - a button that lies. Hide it here rather than in
        the game, which still needs it in a phone browser. */
     +'.tvbtn{display:none!important}';
   (document.head||document.documentElement).appendChild(st); } }catch(e){}
 try{ if(window.__x3fDrv)clearInterval(window.__x3fDrv);
   window.__x3fDrv=setInterval(function(){ try{ force=+window.__x3fForce||0; }catch(e){} },16); }catch(e){}
 try{ var fr=document.getElementById('firstrun'); if(fr)fr.classList.remove('show'); }catch(e){}
 try{ if(typeof startRun==='function')startRun(); }catch(e){}
 try{ var z=document.getElementById('zeroBtn'); if(z){ z.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); try{ if(window.X3F&&X3F.reZero)X3F.reZero(); }catch(e){} },true); } }catch(e){}
 try{
  if(!window.__x3fNav){
   var cur=null, lastScope=null;
   function scope(){ var m=document.querySelectorAll('.scrim.show,.modal.show'); if(m&&m.length)return m[m.length-1]; return document; }
   /* Walk the ANCESTORS, not just the element: panels here hide with opacity and
      pointer-events while keeping their layout box (Arena's inactive mode tabs,
      every .scrim), so an element-only check happily focuses buttons nobody can
      see - and OK would press them. */
   function vis(el){ try{ if(!el||el.disabled)return false; if(el.tagName!=='BODY'&&el.offsetParent===null)return false; var r=el.getBoundingClientRect(); if(r.width<4||r.height<4)return false; var sc=el.closest&&el.closest('.scrim'); if(sc&&!sc.classList.contains('show'))return false;
     for(var n=el;n&&n.nodeType===1;n=n.parentElement){ var cs=getComputedStyle(n); if(!cs)break;
       if(cs.visibility==='hidden'||cs.display==='none')return false;
       if(parseFloat(cs.opacity)<0.05)return false;
       if(cs.pointerEvents==='none')return false;
       if(n===document.body)break; }
     return true; }catch(e){return false;} }
   function items(){ var rootEl=scope(); var q=rootEl.querySelectorAll('button,select,input,a[href],.cta,.buy,.mini,.iconbtn,[role=button],[onclick]'); var a=[]; for(var i=0;i<q.length;i++) if(vis(q[i])) a.push(q[i]); return a; }
   function clear(){ if(cur){ cur.classList.remove('x3f-focus'); } cur=null; }
   function setFocus(el){ if(cur)cur.classList.remove('x3f-focus'); cur=el; if(cur){ cur.classList.add('x3f-focus'); try{cur.scrollIntoView({block:'nearest'});}catch(e){} try{cur.focus({preventScroll:true});}catch(e){} } }
   function ctr(el){ var r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }
   window.__x3fNav=function(dir){ try{
     var list=items(); if(!list.length){ clear(); return; }
     if(!cur||list.indexOf(cur)<0){ setFocus(list[0]); return; }
     if(dir==='enter'){ if(cur.tagName==='SELECT'){ cur.selectedIndex=(cur.selectedIndex+1)%cur.options.length; cur.dispatchEvent(new Event('change',{bubbles:true})); } else { cur.click(); } return; }
     var c=ctr(cur), cr=cur.getBoundingClientRect(), best=null, bd=1e12;
     for(var i=0;i<list.length;i++){ var el=list[i]; if(el===cur)continue; var e=ctr(el), dx=e.x-c.x, dy=e.y-c.y;
       var ok=(dir==='left'&&dx<-4)||(dir==='right'&&dx>4)||(dir==='up'&&dy<-4)||(dir==='down'&&dy>4); if(!ok)continue;
       var horiz=(dir==='left'||dir==='right');
       var along=horiz?Math.abs(dx):Math.abs(dy), perp=horiz?Math.abs(dy):Math.abs(dx);
       // Require the candidate to actually share your row (or column) - without
       // this a control one row up can out-score the one right beside you.
       var r=el.getBoundingClientRect();
       var ov=horiz?(Math.min(cr.bottom,r.bottom)-Math.max(cr.top,r.top))
                   :(Math.min(cr.right,r.right)-Math.max(cr.left,r.left));
       var d=along+perp*2.5+(ov>2?0:4000); if(d<bd){bd=d;best=el;} }
     if(best)setFocus(best);
   }catch(e){} };
   setInterval(function(){ try{ var sc=scope();
     if(sc!==lastScope){ lastScope=sc; if(sc!==document){ var l=items(); setFocus(l[0]||null); } else { clear(); } }
     else if(cur&&!vis(cur)){ clear(); }
   }catch(e){} }, 350);
  }
 }catch(e){}
})();
""";
}
