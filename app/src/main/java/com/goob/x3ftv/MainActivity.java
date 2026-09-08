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
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * X3F TV — WebView-only shell. Loads a bundled HTML launcher (launcher.html); picking a game
 * navigates the WebView to it. BLE force is fed to whatever page is showing (window.__x3fForce).
 * The remote drives window.__x3fNav on both launcher and games; Back returns to the launcher.
 * Includes an in-app updater (version.txt on the dist branch → DownloadManager → installer).
 *
 * THREE THINGS IN HERE ARE LOAD-BEARING AND EASY TO BREAK:
 *
 *  1. BOOTSTRAP (bottom of this file) is extracted from this source by
 *     tools/nav-audit/run.py and tools/func-test/run.py, which regex out the text block by
 *     its field name and delimiters — they read the LIVE string on purpose, because a
 *     hand-copied one drifts and then the tests are checking fiction. nav-audit also needs
 *     the literal three-space-indented line `   setInterval(function(){ try{ var sc=scope();`
 *     as a splice anchor and exits 2 without it. Reformatting the text block breaks both suites.
 *
 *  2. The native → JS globals and the X3F bridge method names are a contract with 13 HTML
 *     pages and two test suites. Adding is safe; renaming is not.
 *
 *  3. Everything the BLE callbacks touch is read by three other threads. Shared fields are
 *     volatile for that reason, not for style.
 */
public class MainActivity extends Activity {

    private static final String TAG     = "x3f";
    private static final String TAG_WEB = "x3f-web";

    private static final UUID SERVICE  = UUID.fromString("e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CH_FORCE = UUID.fromString("e3458901-6ed5-40ff-aa3a-4e9a87ce1ad6");
    /* Cell millivolts, uint16 little-endian — the same characteristic the web
       build's Arena already reads, so the percentage matches across builds. */
    private static final UUID CH_BATT  = UUID.fromString("e3458902-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CCCD     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final int  REQ_PERMS = 42;
    private static final String LAUNCHER = "file:///android_asset/launcher.html";
    private static final String ASSETS   = "file:///android_asset/";
    private static final String VERSION_URL = "https://raw.githubusercontent.com/GoobIsGabe/x3f-tv/dist/version.txt";
    private static final String APK_URL = "https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk";

    private final Handler ui = new Handler(Looper.getMainLooper());

    /* WHY volatile ON ESSENTIALLY EVERY FIELD BELOW.
       Four threads write these: the UI thread (lifecycle, keys, posted runnables), the
       Binder thread the BLE stack calls back on, the WebView's JavaBridge thread (every
       @JavascriptInterface body that is not wrapped in ui.post), and the updater's ad-hoc
       thread. Nothing here was volatile or synchronised, which is not a theoretical
       problem: "Re-Zero" writes haveBaseline from the JavaBridge thread while the Binder
       thread spins on it at ~100 Hz, so the JIT is free to hoist it into a register and
       the button silently does nothing for the rest of the session. Long fields are worse
       still — a non-volatile long write is not even guaranteed atomic (JLS 17.7), and the
       two generation counters below are longs compared across threads. */
    private volatile BluetoothAdapter adapter;
    private volatile BluetoothLeScanner scanner;
    private volatile BluetoothGatt gatt;
    private volatile boolean scanning = false, connecting = false, connected = false;
    private volatile String targetAddress = null;
    private volatile double baseline = 0;
    private volatile boolean haveBaseline = false;
    /* Household sync is OFF until a page that has a Firebase config asks for it.
       While it is off the WebView cannot reach the network AT ALL, which is the
       posture this app ships in and the one it should stay in for anyone who
       never sets sync up. See enableSync(). */
    private volatile boolean syncAllowed = false;
    /* Re-Zero arrives on the JavaBridge thread but every byte of the tare state below is
       owned by the BLE thread. Rather than mutate it across threads, raise a flag and let
       the next packet do the work where all the other accumulators live. */
    private volatile boolean zeroRequest = false;
    /* Bumped every time a new resting floor is established. Published as window.__x3fZero.
       INVARIANT: a per-movement floor stored by x3f-cal.js is only meaningful against the
       baseline it was captured with — both are absolute bar units. If this number changes
       mid-set, anything already measured against the old zero is no longer comparable. */
    private volatile long zeroEpoch = 0;

    /* The GATT client interface is a process-wide, hard-limited resource. connectTo() used
       to be a plain check-then-act on plain fields, so two scan callbacks for the same bar
       (advert + scan response, delivered microseconds apart) both passed !connecting, both
       called connectGatt, and the first BluetoothGatt was overwritten without ever being
       closed. Each reconnect cycle leaked one until connectGatt returned null and BLE was
       dead for the whole process until force-stop. One lock, one owner. */
    private final Object bleLock = new Object();

    private volatile WebView web;
    private volatile boolean webReady = false;
    private volatile boolean paused = false;
    private volatile String currentUrl = LAUNCHER;
    private volatile long lastInject = 0;
    private volatile long injectSeq = 0;
    private volatile long dlId = -1;
    private volatile boolean updating = false;
    private volatile String barState = "wait", barText = "Connecting…";
    private volatile android.content.SharedPreferences prefs;
    /* Everything the scan has seen this session, address -> name, so the user can
       pick the bar by hand when the advertisement is not self-describing. */
    private final Map<String, String> seen = new LinkedHashMap<>();
    private volatile boolean triedKnown = false;
    private volatile long watchdog = 0;
    private volatile int battMv = -1;          // last battery reading, -1 = unknown
    private volatile long battPoll = 0;        // generation counter for the re-read timer
    private volatile boolean overlayOpen = false;
    /* Pushed ahead of the key event by the page (same trick as overlayOpen, for the same
       reason — see INV-03): true while the D-pad cursor sits on a text-entry control. */
    private volatile boolean textInput = false;
    private volatile boolean imeShown = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        /* A 20-minute canvas session on a TV stick thermally throttles: the SoC boosts,
           heats, then collapses to a lower clock than it would have held all along. This
           asks for the stable clock instead of the boost-then-collapse curve. */
        try { if (Build.VERSION.SDK_INT >= 24) getWindow().setSustainedPerformanceMode(true); } catch (Exception ignored) {}
        try { prefs = getSharedPreferences("x3f", MODE_PRIVATE); } catch (Exception ignored) {}
        buildWeb(LAUNCHER);
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

    /* The whole WebView configuration lives here. It used to be three WebSettings calls;
       every line below fixes something concrete on a TV, and the comments say which. */
    private void buildWeb(String url) {
        WebView old = web;
        if (old != null) { web = null; webReady = false; destroyWeb(old); }

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);        // load-bearing: all 12 x3f_* keys live here
        ws.setMediaPlaybackRequiresUserGesture(false);   // x3f-music.js needs it

        /* --- TV correctness --- */
        /* The system font-scale / display-size setting on Google TV multiplies WebView
           text. The whole UI is tuned in explicit units, so "Large" text clipped chips
           and overflowed cards for anyone who had ever touched that setting. */
        ws.setTextZoom(100);
        /* Without these the <meta name=viewport> on every page is only half honoured —
           initial-scale and viewport-fit do nothing and the CSS-pixel viewport becomes
           density-dependent, which is the single most likely cause of "why does
           everything look wrong on the TV". */
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        /* Guarantees TEXT_AUTOSIZING is off. Autosizing inflates text on large viewports,
           which is precisely the wrong thing when the injected CSS is already doing a
           deliberate 10-foot pass. */
        ws.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        ws.setDefaultTextEncodingName("utf-8");
        /* No touchscreen on a TV, but a connected mouse — or the same APK on a phone —
           can pinch or ctrl-scroll straight out of the layout. */
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        /* Stops the WebView auto-focusing the first focusable element on load. That fights
           both cursor models (the BOOTSTRAP's and x3f-nav.js's) and was a contributor to
           the first-D-pad-press-lands-on-Back bug. */
        ws.setNeedInitialFocus(false);
        /* The theme is a DeviceDefault variant, which is light on many OEM TV builds, so
           WebView's algorithmic darkening would happily invert an already-dark page and
           wash the whole palette out. */
        try { if (Build.VERSION.SDK_INT >= 29) ws.setForceDark(WebSettings.FORCE_DARK_OFF); } catch (Exception ignored) {}

        /* --- no network, ever (AD-5) --- */
        /* The bundle is offline-first and the WebView holds a Java bridge. Blocking loads
           at the settings level as well as in shouldInterceptRequest means a page that
           regains a network reference (a stray <img>, a future CDN paste) fails instantly
           and visibly instead of hanging for seconds on a TV that has not associated yet. */
        ws.setBlockNetworkLoads(true);
        ws.setBlockNetworkImage(true);
        /* Moot while network is blocked, but explicit: never re-validate a file:// asset. */
        ws.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        /* Safe Browsing costs real milliseconds at WebView startup and does periodic
           network work, all of it pointless for a file:// bundle that cannot navigate. */
        try { if (Build.VERSION.SDK_INT >= 26) ws.setSafeBrowsingEnabled(false); } catch (Exception ignored) {}

        /* --- security defaults made explicit (they are version-dependent) --- */
        /* Assets and resources stay readable through file:///android_asset and
           file:///android_res regardless of this flag — the carve-out lives in the
           WebView APK, not the platform — so this only shuts off the real file system,
           which this app has no business reading.
           Deliberately not applied below API 29. There it is the one place the setting
           would actually change behaviour, on the devices most likely to carry an old
           WebView build, and getting it wrong means a blank launcher with no way back.
           On API 30+ false is already the platform default, so this is the posture the
           app has been shipping with and is known to work under. */
        if (Build.VERSION.SDK_INT >= 29) ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        /* These two are false by default and the bundle DEPENDS on that: no page may
           fetch()/XHR a sibling file, which is why every shared script is a <script src>.
           Turning either on would silently change that contract. */
        ws.setAllowFileAccessFromFileURLs(false);
        ws.setAllowUniversalAccessFromFileURLs(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setSupportMultipleWindows(false);
        ws.setGeolocationEnabled(false);
        ws.setSaveFormData(false);

        /* --- view-level TV behaviour --- */
        /* Matches --bg in x3f-ui.css and the window background in the theme, so a cold
           launch is one continuous colour instead of OEM grey → near-black → page. */
        web.setBackgroundColor(0xFF0F1114);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);   // no stretch/glow at the end of a D-pad scroll
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        web.setLongClickable(false);                     // removes the accidental text-selection path
        web.setHapticFeedbackEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        /* Stops the floating Copy/Share action bar appearing over a running game. */
        try { ws.setDisabledActionModeMenuItems(WebSettings.MENU_ITEM_NONE); } catch (Exception ignored) {}
        /* Keeps tiles rastered while the WebView is not the front window, so returning
           from a game is not a blank frame then a paint. Costs memory; largeHeap in the
           manifest pays for it. */
        try { if (Build.VERSION.SDK_INT >= 23) ws.setOffscreenPreRaster(true); } catch (Exception ignored) {}
        /* On a 1 GB stick this is what stops the renderer being the first thing reaped —
           and it pairs with onRenderProcessGone below, which handles it when it happens
           anyway. */
        try { if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Exception ignored) {}
        /* Debugging is now an explicit choice rather than a side effect of CI shipping a
           debuggable build. */
        try { WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG); } catch (Exception ignored) {}

        web.addJavascriptInterface(new Bridge(), "X3F");

        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView v, String u, String m, JsResult r) { r.confirm(); return true; }
            @Override public boolean onJsConfirm(WebView v, String u, String m, JsResult r) { r.confirm(); return true; }
            /* 13 HTML pages, 9 shared scripts and an injected bootstrap that wraps almost
               every statement in try/catch — and until now not one line of any of it
               reached logcat. That is exactly how a divergence like "the TV never applies
               the per-movement floor" ships: nothing anywhere reports it. */
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                if (m == null) return true;
                Log.w(TAG_WEB, m.message() + "  (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest r) {
                try { r.deny(); } catch (Exception ignored) {}
            }
        });

        web.setWebViewClient(new WebViewClient() {

            /* webReady used to be set true once and never cleared, so pressing Back while
               a game was still loading saw currentUrl == launcher and sent the whole app
               to the TV home screen while the game carried on loading behind it. */
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap fav) {
                webReady = false;
                if (url != null) currentUrl = url;
                overlayOpen = false;
                textInput = false;
            }

            @Override public void onPageFinished(WebView v, String url) {
                currentUrl = url != null ? url : LAUNCHER;
                webReady = true;
                overlayOpen = false;              // a fresh page has nothing open
                if (isLauncher(url)) {
                    pushBar();
                    pushBattery();
                    /* Devices found before the launcher finished loading were dropped on
                       the floor: pushDevices() bails when the page is not ready and the
                       list was never replayed, so the picker could be empty while `seen`
                       had entries — on a cold start, and on every return from a game. */
                    pushDevices();
                    v.evaluateJavascript("window.__x3fVersion&&window.__x3fVersion(" + jsStr(BuildConfig.VERSION_NAME) + ")", null);
                } else if (url != null && url.startsWith("file")) {
                    v.evaluateJavascript(BOOTSTRAP, null);
                    /* The bootstrap gives game pages a __x3fSetBar, so replay the current
                       state into it. Without this a game's status chip keeps whatever it
                       was born with ("Offline") for the whole session even though the bar
                       is live, because on the TV the page's own onSample() tare — the only
                       thing that ever updated that chip — never runs. */
                    pushBar();
                }
            }

            /* The bundle is local and the WebView holds the X3F bridge. Anything that is
               not one of our own assets does not get to navigate this WebView, so a
               compromised page cannot hand window.X3F to a remote origin. */
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = (req != null) ? req.getUrl() : null;
                if (u == null) return true;
                String s = u.toString();
                if (s.startsWith(ASSETS)) return false;
                Log.w(TAG, "refused navigation off the bundle: " + s);
                return true;
            }

            /* A HARD BLOCK ON ALL NETWORK, not a font shim. The app's contract is that it
               works with no network at all; anything that reaches for one is a bug, and a
               silent empty response makes it fail in a millisecond and show up in logcat
               instead of stalling first paint until the network stack gives up. */
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                try {
                    Uri u = (req != null) ? req.getUrl() : null;
                    String s = (u != null && u.getScheme() != null) ? u.getScheme().toLowerCase(Locale.US) : "";
                    if (s.equals("file") || s.equals("data") || s.equals("blob") || s.equals("about")) return null;
                    if (syncAllowed && s.equals("https") && isSyncHost(u.getHost())) return null;
                    Log.w(TAG, "blocked network request: " + u);
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                } catch (Exception e) { return null; }
            }

            /* A missing page used to show the raw Chromium error card: white, with a
               magnifying glass, no bootstrap, no focus ring, and no way out but the
               remote's Back key. Bounce to the launcher instead. Sub-resource failures
               are ignored, and a failure loading the launcher itself cannot loop. */
            @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req == null || !req.isForMainFrame()) return;
                String u = String.valueOf(req.getUrl());
                Log.w(TAG, "page failed to load: " + u);
                if (!isLauncher(u)) { try { v.loadUrl(LAUNCHER); } catch (Exception ignored) {} }
            }

            /* Without this override the framework kills the whole process when the
               renderer dies — the app simply vanishes off the TV mid-set. Take the hit,
               rebuild, and come back to where the user was. */
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                Log.w(TAG, "renderer gone; rebuilding the WebView");
                final String back = currentUrl;
                if (web == v) { web = null; webReady = false; }
                ui.post(new Runnable() { @Override public void run() {
                    destroyWeb(v);
                    buildWeb(back != null ? back : LAUNCHER);
                } });
                return true;
            }
        });

        setContentView(web);
        web.loadUrl(url != null ? url : LAUNCHER);
    }

    /* The platform requires a WebView to leave the view hierarchy before destroy(); doing
       it the other way round leaks a native surface or crashes outright on some OEM
       WebView builds. */
    private void destroyWeb(WebView w) {
        if (w == null) return;
        try { if (w.getParent() instanceof ViewGroup) ((ViewGroup) w.getParent()).removeView(w); } catch (Exception ignored) {}
        try { w.stopLoading(); } catch (Exception ignored) {}
        try { w.destroy(); } catch (Exception ignored) {}
    }

    private boolean isLauncher(String url) { return url != null && (url.contains("launcher.html") || url.endsWith("index.html")); }

    /* ONE escaping policy for every string this file evaluates. There used to be three
       (strip apostrophes here, a blocklist there, raw interpolation over there), all of
       them safe only by accident because every value except a device name was a
       compile-time literal. JSONObject.quote produces a correctly escaped, quoted JS
       string literal for any input, including the quotes. */
    private static String jsStr(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    // ---------- lifecycle ----------

    /* THE APP USED TO HAVE NO LIFECYCLE AT ALL — no onPause, no onResume, nothing. Back on
       the launcher calls moveTaskToBack, so the user goes off to watch TV while this
       process keeps a SCAN_MODE_LOW_LATENCY BLE scan running, a 100 Hz notification
       stream, a 16 ms interval in the WebView, the ambient rAF loop and, if a game was
       showing, its entire canvas render loop — until the system finally kills it. On a
       cheap stick that is visible as the OTHER app stuttering.

       The GATT connection is deliberately kept: dropping it would make every return from
       the home screen a full rediscover, and the bar may be mid-set. What actually costs
       anything — the scan's radio duty cycle, the page's timers, and the per-sample
       evaluateJavascript hop — all stop. */
    @Override protected void onPause() {
        super.onPause();
        paused = true;
        stopScan();
        WebView w = web;
        if (w != null) { try { w.onPause(); w.pauseTimers(); } catch (Exception ignored) {} }
    }

    @Override protected void onResume() {
        super.onResume();
        paused = false;
        WebView w = web;
        if (w != null) { try { w.onResume(); w.resumeTimers(); } catch (Exception ignored) {} }
        /* Only resume scanning once permissions actually exist — otherwise this consumes
           the once-per-session tryKnownDevices() pass before the grant comes back, and the
           direct-connect path (the only one that can reach a bar that is not advertising)
           never runs. */
        if (hasBlePerms() && !connected && !connecting) startScan();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        /* Every posted runnable in this file holds a strong reference to the activity, and
           armBattPoll re-arms itself every five minutes forever, so one recreation used to
           leak the whole activity graph permanently. */
        ui.removeCallbacksAndMessages(null);
        stopScan(); closeGatt();
        try { unregisterReceiver(dlRx); } catch (Exception ignored) {}
        WebView w = web;
        web = null; webReady = false;
        destroyWeb(w);
    }

    // ---------- permissions ----------
    private boolean hasBlePerms() {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                    && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
            }
            return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) { return false; }
    }
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
        String u = n.toUpperCase(Locale.US);
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

    /* Serialised, and it closes any previous handle before opening a new one. Two scan
       callbacks for the same bar arrive microseconds apart and both used to get through
       the plain !connecting check; the second connectGatt overwrote the first
       BluetoothGatt, which was then never closed and leaked a process-wide client
       interface every reconnect cycle until BLE stopped working entirely. */
    private void connectTo(BluetoothDevice d) {
        if (d == null) return;
        synchronized (bleLock) {
            if (connecting || connected) return;
            connecting = true;
            targetAddress = d.getAddress();
            stopScan();
            closeGattLocked();
            setBar("wait", "Connecting…");
            try { gatt = d.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE); }
            catch (SecurityException e) { setBar("", "Connect permission?"); connecting = false; }
        }
    }
    private void reconnect() {
        if (connected || connecting || adapter == null) return;
        if (targetAddress != null) {
            try {
                BluetoothDevice d = adapter.getRemoteDevice(targetAddress);
                synchronized (bleLock) {
                    if (connected || connecting) return;
                    connecting = true;
                    closeGattLocked();
                    setBar("wait", "Reconnecting…");
                    gatt = d.connectGatt(this, true, gattCb, BluetoothDevice.TRANSPORT_LE);
                }
            }
            catch (Exception e) { connecting = false; startScan(); }
        } else startScan();
    }
    private void closeGatt() { synchronized (bleLock) { closeGattLocked(); } }
    private void closeGattLocked() {
        BluetoothGatt g = gatt;
        gatt = null;
        if (g != null) { try { g.close(); } catch (Exception ignored) {} }
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothGatt.STATE_CONNECTED) { setBar("wait", "Connected…"); try { g.discoverServices(); } catch (SecurityException ignored) {} }
            else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                connected = false; connecting = false; setBar("", "Bar disconnected");
                battMv = -1; battPoll++; pushBattery();
                resetBaseline();
                ui.post(() -> {
                    WebView w = web;
                    if (w != null && webReady) { try { w.evaluateJavascript("window.__x3fForce=0;window.__x3fPeak=0;", null); } catch (Exception ignored) {} }
                });
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
                connected = true; connecting = false; resetBaseline(); setBar("on", "Bar: LIVE");
                // remember it: next launch can go straight at it, which works even
                // when the bar is not advertising and a scan would never see it
                try { if (prefs != null && targetAddress != null) prefs.edit().putString("lastBar", targetAddress).apply(); } catch (Exception ignored) {}
            } catch (SecurityException e) { setBar("", "Connect permission?"); }
        }
        /* One GATT operation at a time: the battery subscription has to wait for
           the force CCCD write to come back, or the stack silently drops it. */
        @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            try {
                UUID of = (d != null && d.getCharacteristic() != null) ? d.getCharacteristic().getUuid() : null;
                if (CH_FORCE.equals(of)) subscribeBattery(g);
                else if (CH_BATT.equals(of)) readBattery(g);   // don't wait for the first notify
            } catch (Exception ignored) {}
        }
        @Override public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic ch, int status) {
            if (ch != null && CH_BATT.equals(ch.getUuid())) handleBattery(ch.getValue());
        }
        @Override public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic ch, byte[] value, int status) {
            if (ch != null && CH_BATT.equals(ch.getUuid())) handleBattery(value);
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch, byte[] value) { route(ch, value); }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch) { route(ch, ch != null ? ch.getValue() : null); }
    };

    /* Both characteristics notify on the same connection, so a packet has to be
       told apart by UUID before it is read as a float64. */
    private void route(BluetoothGattCharacteristic ch, byte[] v) {
        UUID u = (ch != null) ? ch.getUuid() : null;
        if (CH_BATT.equals(u)) handleBattery(v);
        else if (u == null || CH_FORCE.equals(u)) handleForce(v);
    }

    // ---------- force: the native tare and the peak ----------

    /* THE BASELINE USED TO BE ONE PACKET, taken at the worst possible moment.
       handleForce simply took the first sample after the CCCD write as "zero" — while the
       launcher's own instructions tell the user to "wake the bar (load a band)". A bar
       that only starts notifying under load therefore handed us a LOADED first packet,
       that number became the resting floor, and every reading afterwards was
       max(0, raw - loaded) = 0 until the user out-pulled the accident. The meter reads
       zero and the bar looks broken, permanently, with no message.

       So: average a window, and check it was actually a resting window.

       Two defences, because they catch different failures.

       1. SPREAD. A window whose min and max differ by more than BASE_STEADY was not a bar
          at rest — a human holding a band wobbles far more than load-cell noise. Discard
          and measure again, up to BASE_MAX_TRIES; if the bar never settles, take the
          quietest window we did see rather than refusing to work at all.

       2. A FLOOR THAT CAN ONLY GO DOWN. Spread alone cannot see a STEADY load — someone
          holding a start position perfectly still passes the steadiness test. But the
          moment they let go, samples sit below the stored baseline, and force below zero
          is physically impossible. So a sustained run below the baseline is proof the
          baseline was captured under load: adopt the lower value. This direction is safe
          on its own terms — it can heal a bad zero, and it can never invent force that is
          not there.

       Anything measured against the old zero is not comparable with anything measured
       against the new one, so every re-baseline bumps zeroEpoch, which is published as
       window.__x3fZero for exactly that reason. */
    private static final long   BASE_WINDOW_MS   = 900;   // long enough to average out noise, short enough not to feel broken
    private static final int    BASE_MIN_SAMPLES = 6;
    private static final double BASE_STEADY      = 6.0;   // bar units of peak-to-peak wobble we accept as "at rest"
    private static final int    BASE_MAX_TRIES   = 4;
    private static final long   SLACK_MS         = 1500;  // how long below the floor before we believe it
    private static final double SLACK_MARGIN     = 2.0;
    private static final long   INJECT_MS        = 16;

    /* Owned by the BLE callback thread and nothing else. reZero() raises zeroRequest
       instead of touching any of it. */
    private long   baseStart = 0;
    private int    baseCount = 0, baseTries = 0;
    private double baseSum = 0, baseMin = 0, baseMax = 0, bestMean = 0, bestSpread = -1;
    private long   lowStart = 0;
    private int    lowCount = 0;
    private double lowSum = 0;
    /* The highest conditioned sample since the last publish — see injectForce. */
    private double peakWin = 0;

    private void resetBaseline() {
        haveBaseline = false;
        baseStart = 0; baseCount = 0; baseTries = 0; baseSum = 0;
        bestSpread = -1; bestMean = 0;
        lowStart = 0; lowCount = 0; lowSum = 0;
        peakWin = 0;
    }

    private void handleForce(byte[] v) {
        if (v == null || v.length < 8) return;
        double raw;
        try { raw = ByteBuffer.wrap(v).order(ByteOrder.LITTLE_ENDIAN).getDouble(); }
        catch (Exception e) { return; }
        if (Double.isNaN(raw) || Double.isInfinite(raw)) return;

        if (zeroRequest) { zeroRequest = false; resetBaseline(); }

        long now = SystemClock.uptimeMillis();
        if (!haveBaseline) { measureBaseline(raw, now); return; }
        healBaseline(raw, now);

        double f = raw - baseline;
        if (f < 0) f = 0;
        /* Tracked on EVERY sample, before the throttle gets a say — this is the whole
           point of doing it here (see injectForce). */
        if (f > peakWin) peakWin = f;
        injectForce(f);
    }

    private void measureBaseline(double raw, long now) {
        if (baseStart == 0) {
            baseStart = now; baseSum = 0; baseCount = 0; baseMin = raw; baseMax = raw;
            if (baseTries == 0) setBar("wait", "Zeroing - hold still");
        }
        baseSum += raw; baseCount++;
        if (raw < baseMin) baseMin = raw;
        if (raw > baseMax) baseMax = raw;
        injectForce(0);                                    // hold the page at rest while we measure
        if (now - baseStart < BASE_WINDOW_MS || baseCount < BASE_MIN_SAMPLES) return;

        double mean = baseSum / baseCount;
        double spread = baseMax - baseMin;
        if (bestSpread < 0 || spread < bestSpread) { bestSpread = spread; bestMean = mean; }
        if (spread > BASE_STEADY && baseTries < BASE_MAX_TRIES) {
            baseTries++; baseStart = 0;                    // that was not a resting window; try again
            return;
        }
        baseline = (spread <= BASE_STEADY) ? mean : bestMean;
        haveBaseline = true;
        zeroEpoch++;
        peakWin = 0;
        lowStart = 0;
        setBar("on", "Bar: LIVE");
    }

    private void healBaseline(double raw, long now) {
        if (raw < baseline - SLACK_MARGIN) {
            if (lowStart == 0) { lowStart = now; lowSum = 0; lowCount = 0; }
            lowSum += raw; lowCount++;
            if (now - lowStart >= SLACK_MS && lowCount >= BASE_MIN_SAMPLES) {
                baseline = lowSum / lowCount;
                zeroEpoch++;
                peakWin = 0;
                lowStart = 0;
                Log.i(TAG, "baseline lowered - it was captured under load");
            }
        } else {
            lowStart = 0;
        }
    }

    /* THE PEAK PROBLEM. The bar notifies at ~100 Hz and this throttle forwards ~62 of
       them; the other ~38 % used to be dropped and forgotten. A fast concentric snap's
       true peak lands in a dropped packet more often than not, so every peak logged on
       the TV was low: PBs wrong, the peak chart wrong, X3FCal.observe() auto-learning a
       ceiling that is too low, and TV history not comparable with phone history. For an
       app whose product is measuring force, that is a correctness bug, not a trade-off.

       Fix: peakWin above is updated on every single sample, and each publish carries it
       as window.__x3fPeak alongside the current value, with window.__x3fSeq so the page
       can tell one published window from the next and consume each exactly once. The
       bootstrap feeds that peak into the game's own conditioning function as a real
       sample — because it IS one; it happened milliseconds ago — so the games' existing
       peak tracking sees it without any second code path to keep in step. */
    private void injectForce(double f) {
        final WebView w = web;                    // one read: onDestroy can null it under us
        if (w == null || !webReady || paused) return;
        long now = SystemClock.uptimeMillis();
        if (now - lastInject < INJECT_MS) return;
        lastInject = now;
        double p = (peakWin > f) ? peakWin : f;
        peakWin = 0;
        final String js = "window.__x3fForce=" + r2(f)
                + ";window.__x3fPeak=" + r2(p)
                + ";window.__x3fSeq=" + (++injectSeq)
                + ";window.__x3fZero=" + zeroEpoch + ";";
        w.post(new Runnable() { @Override public void run() {
            try { w.evaluateJavascript(js, null); } catch (Exception ignored) {}
        } });
    }
    private static double r2(double x) { return Math.round(x * 100) / 100.0; }

    /* Battery is optional: a bar without the characteristic simply shows no
       percentage, it must never stop the force stream from coming up. */
    private void subscribeBattery(BluetoothGatt g) {
        try {
            BluetoothGattCharacteristic b = battChar(g);
            if (b == null) return;
            if ((b.getProperties() & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
                g.setCharacteristicNotification(b, true);
                BluetoothGattDescriptor cccd = b.getDescriptor(CCCD);
                if (cccd != null) {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    g.writeDescriptor(cccd);          // the read follows in onDescriptorWrite
                    return;
                }
            }
            readBattery(g);
        } catch (SecurityException ignored) {}
    }
    private BluetoothGattCharacteristic battChar(BluetoothGatt g) {
        if (g == null) return null;
        BluetoothGattService svc = g.getService(SERVICE);
        return (svc != null) ? svc.getCharacteristic(CH_BATT) : null;
    }
    /* A notify-only bar says nothing until the level actually moves, so the first
       number has to be read, and a slow re-read keeps it honest over a session. */
    private void readBattery(BluetoothGatt g) {
        try {
            BluetoothGattCharacteristic b = battChar(g);
            if (b != null && (b.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) g.readCharacteristic(b);
            armBattPoll();
        } catch (SecurityException ignored) {}
    }
    private void armBattPoll() {
        final long id = ++battPoll;
        ui.postDelayed(new Runnable() { @Override public void run() {
            if (id != battPoll || !connected || gatt == null) return;
            try {
                BluetoothGattCharacteristic b = battChar(gatt);
                if (b != null && (b.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) gatt.readCharacteristic(b);
            } catch (Exception ignored) {}
            armBattPoll();
        } }, 300000);
    }
    private void handleBattery(byte[] v) {
        if (v == null || v.length < 2) return;
        int mv = (v[0] & 0xff) | ((v[1] & 0xff) << 8);
        if (mv <= 0 || mv > 10000) return;            // not a plausible cell voltage
        battMv = mv;
        pushBattery();
    }
    private void pushBattery() {
        final String js = "window.__x3fSetBattery&&window.__x3fSetBattery(" + battMv + ")";
        ui.post(() -> {
            WebView w = web;
            if (w != null && webReady) { try { w.evaluateJavascript(js, null); } catch (Exception ignored) {} }
        });
    }

    private void setBar(String state, String text) {
        barState = state; barText = text;
        ui.post(this::pushBar);
    }
    private void pushBar() {
        WebView w = web;
        if (w == null || !webReady) return;
        final String js = "window.__x3fSetBar&&window.__x3fSetBar(" + jsStr(barState) + "," + jsStr(barText) + ")";
        try { w.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    // ---------- JS bridge ----------
    /* The ONLY hosts this app may ever reach, and only while sync is on.
       Deliberately an exact-match list plus two suffixes rather than a pattern:
       a wildcard on googleapis.com would open every Google API, and the point of
       this list is that it is short enough to read.

         identitytoolkit  anonymous sign-up (accounts:signUp)
         securetoken      refreshing that hour-long token
         firebaseio.com / firebasedatabase.app
                          the database itself, including the Server-Sent Events
                          stream that makes pairing feel instant

       Nothing else. No fonts, no analytics, no CDN. */
    private static boolean isSyncHost(String h) {
        if (h == null) return false;
        h = h.toLowerCase(Locale.US);
        return h.equals("identitytoolkit.googleapis.com")
            || h.equals("securetoken.googleapis.com")
            || h.endsWith(".firebaseio.com")
            || h.endsWith(".firebasedatabase.app");
    }

    private class Bridge {
        @JavascriptInterface public void reZero() { zeroRequest = true; }

        /* Household sync, opened by the page rather than assumed by the shell.

           WHY IT WORKS THIS WAY. The plan's first instinct was a full REST client
           in Java - anonymous auth, an SSE reader, a callback bridge, roughly a
           hundred and fifty lines. There is no Android SDK on the machine this
           was written on, so none of that could be compiled, let alone run; and
           web/x3f-sync.js already speaks the whole protocol correctly over
           fetch(). Handing the page two specific hosts is a dozen lines that can
           be reasoned about completely, instead of a hundred and fifty that
           cannot be tested.

           The trade is real and worth stating: a file:// page holding a Java
           bridge regains a network path. It is narrowed as far as it goes - off
           by default, opened only by a page that actually has a Firebase config,
           and restricted to four hosts by isSyncHost(). The upgrade path, if that
           ever stops being acceptable, is to move the transport into Java behind
           X3F.rtdb(); x3f-sync.js already prefers that bridge when it exists. */
        @JavascriptInterface public void enableSync(final boolean on) {
            syncAllowed = on;
            ui.post(new Runnable() { @Override public void run() {
                try {
                    if (web != null) web.getSettings().setBlockNetworkLoads(!on);
                    Log.i(TAG, "sync network " + (on ? "opened to Firebase hosts" : "closed"));
                } catch (Exception ignored) {}
            } });
        }
        @JavascriptInterface public void checkUpdate() {
            /* The OK key repeats. Without a guard, holding it on "Check for updates" span
               ten threads, enqueued ten DownloadManager requests to the same destination
               file, and left nine of them orphaned because dlId only ever matched the
               last. */
            if (updating) return;
            updating = true;
            new Thread(MainActivity.this::doCheckUpdate).start();
        }
        /* Manual escape hatch: the launcher lists everything the scan saw and the
           user picks the bar with the remote. Works when the advertisement gives
           us nothing to match on. */
        @JavascriptInterface public void pickDevice(final String addr) {
            ui.post(new Runnable() { @Override public void run() {
                try {
                    stopScan(); closeGatt();
                    connecting = false; connected = false;
                    if (adapter == null) { setBar("", "No Bluetooth"); return; }
                    BluetoothDevice d = adapter.getRemoteDevice(addr);
                    if (d == null) { setBar("", "Bad address"); return; }
                    connectTo(d); armWatchdog();
                } catch (Exception e) { setBar("", "Could not connect"); }
            } });
        }
        /* The page tells us when a modal is up. Back has to close it rather
           than send the whole app to the home screen, and evaluateJavascript is
           async, so the answer has to be here before the key arrives. */
        @JavascriptInterface public void setOverlay(boolean open) { overlayOpen = open; }
        /* Same contract, for text entry: true while the D-pad cursor sits on an input the
           user can type into. ENTER is then left alone so the field is actually usable. */
        @JavascriptInterface public void setTextInput(boolean editing) { textInput = editing; }
        /* Pressing OK on a number field used to call click(), which does not raise the
           IME, so Arena's two inputs looked focusable and were completely dead on TV. */
        @JavascriptInterface public void showKeyboard() {
            ui.post(new Runnable() { @Override public void run() {
                WebView w = web;
                if (w == null) return;
                try {
                    w.requestFocus();
                    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (imm != null) { imm.showSoftInput(w, InputMethodManager.SHOW_IMPLICIT); imeShown = true; }
                } catch (Exception ignored) {}
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

    /* THE DEVICE NAME IS THE ONE ATTACKER-CONTROLLED STRING IN THIS FILE. It comes
       straight off the radio, and launcher.html renders it with innerHTML. The old
       jsSafe() stripped backslashes and quotes, which closes the JS-literal hole and does
       nothing at all about markup: a nearby device advertising the Complete Local Name
       <img src=x onerror=...> (37 bytes — it fits in a scan response) executed in the
       file:// origin that holds window.X3F. From there it could start an APK download and
       pop the installer, repoint the app at a fake bar and feed invented force into the
       user's logged history, permanently break the Back button, and read every x3f_* key
       — the user's entire training record.

       The fix is escaping, not filtering: the full name survives byte for byte, it just
       cannot leave a text node. The JS-literal half of the job is org.json's now, which
       is a real encoder rather than a blocklist.

       WHEN launcher.html SWITCHES ITS SINK TO textContent, DELETE THIS METHOD — escaping
       twice for one sink would start showing the user &amp; in device names. */
    private static String htmlSafe(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private void pushDevices() {
        WebView w = web;
        if (w == null || !webReady) return;
        JSONArray arr = new JSONArray();
        synchronized (seen) {
            for (Map.Entry<String, String> e : seen.entrySet()) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("a", e.getKey() == null ? "" : e.getKey());
                    o.put("n", htmlSafe(e.getValue()));
                    arr.put(o);
                } catch (Exception ignored) {}
            }
        }
        final String js = "window.__x3fDevices&&window.__x3fDevices(" + arr.toString() + ")";
        ui.post(new Runnable() { @Override public void run() {
            WebView v = web;
            if (v == null || !webReady) return;
            try { v.evaluateJavascript(js, null); } catch (Exception ignored) {}
        } });
    }
    private void pushUpdate(String msg) {
        final String js = "window.__x3fUpdate&&window.__x3fUpdate(" + jsStr(msg) + ")";
        ui.post(() -> {
            WebView w = web;
            if (w == null) return;
            try { w.evaluateJavascript(js, null); } catch (Exception ignored) {}
        });
    }
    private void doCheckUpdate() {
        try {
            pushUpdate("Checking…");
            String s = httpGet(VERSION_URL).replaceAll("[^0-9]", "");
            if (s.isEmpty()) { pushUpdate("Couldn't read version"); return; }
            int remote;
            try { remote = Integer.parseInt(s); }
            catch (NumberFormatException nfe) { pushUpdate("Couldn't read version"); return; }
            if (remote <= BuildConfig.VERSION_CODE) { pushUpdate("You're on the latest (v" + BuildConfig.VERSION_NAME + ")"); return; }
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                pushUpdate("Allow \"install unknown apps\" for X3F, then check again");
                try {
                    final Intent st = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                    st.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ui.post(() -> { try { startActivity(st); } catch (Exception ignored) {} });
                } catch (Exception ignored) {}
                return;
            }
            pushUpdate("Downloading v" + remote + "…");
            startDownload();
        } catch (Exception e) { pushUpdate("Update check failed"); }
        finally { updating = false; }
    }
    private String httpGet(String u) throws Exception {
        HttpURLConnection c = null;
        InputStream in = null;
        try {
            c = (HttpURLConnection) new URL(u).openConnection();
            c.setConnectTimeout(9000); c.setReadTimeout(9000);
            c.setRequestProperty("User-Agent", "x3f-tv");
            /* raw.githubusercontent.com serves version.txt with a cache TTL, so right
               after a CI publish the TV would read a stale number and cheerfully report
               "You're on the latest". */
            c.setRequestProperty("Cache-Control", "no-cache");
            c.setUseCaches(false);
            int code = c.getResponseCode();
            if (code < 200 || code > 299) throw new Exception("HTTP " + code);
            in = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int n;
            /* != -1, not > 0: a socket stream may legitimately return 0. */
            while ((n = in.read(b)) != -1) bo.write(b, 0, n);
            return bo.toString("UTF-8").trim();
        } finally {
            if (in != null) try { in.close(); } catch (Exception ignored) {}
            if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
        }
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
    private void nav(String dir) {
        WebView w = web;
        if (w == null || !webReady) return;
        try { w.evaluateJavascript("window.__x3fNav&&window.__x3fNav(" + jsStr(dir) + ")", null); } catch (Exception ignored) {}
    }

    /* KEY AUTO-REPEAT USED TO BE UNFILTERED. Android delivers a held key as a stream of
       ACTION_DOWN events at the system repeat rate — typically every 50 ms after a 400 ms
       delay — so holding Right on the launcher's card grid ran __x3fNav('right') about
       twenty times a second and the cursor blew straight past the target and wrapped.
       Every TV UI rate-limits this. The two numbers below are x3f-nav.js's gamepad
       numbers, deliberately, so the remote and a controller feel the same. */
    private static final long REPEAT_DELAY_MS = 380;
    private static final long REPEAT_EVERY_MS = 130;
    private int  heldKey = 0;
    private long heldSince = 0, lastRepeat = 0;

    private boolean repeatAllowed(KeyEvent e) {
        long now = e.getEventTime() > 0 ? e.getEventTime() : SystemClock.uptimeMillis();
        int code = e.getKeyCode();
        if (e.getRepeatCount() == 0 || code != heldKey) {
            heldKey = code; heldSince = now; lastRepeat = now; return true;
        }
        if (now - heldSince < REPEAT_DELAY_MS) return false;
        if (now - lastRepeat < REPEAT_EVERY_MS) return false;
        lastRepeat = now;
        return true;
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        final int code = e.getKeyCode();
        final boolean down = e.getAction() == KeyEvent.ACTION_DOWN;

        /* Back is handled whether or not a page is ready. It used to be gated on webReady
           like everything else, which meant that during a page load it fell through to
           the framework and finish()ed the activity — the app closing outright if you
           pressed Back a moment too early. */
        /* B on a gamepad and Escape on a keyboard are the natural "back" and used to fall
           through to a WebView that does nothing with them. They are treated as Back only
           while no text field holds the cursor, because in a field Escape means cancel. */
        boolean backKey = (code == KeyEvent.KEYCODE_BACK)
                || (!textInput && (code == KeyEvent.KEYCODE_ESCAPE || code == KeyEvent.KEYCODE_BUTTON_B));
        if (backKey) {
            if (down && e.getRepeatCount() == 0) handleBack();
            return true;
        }

        /* A PAGE THAT IS NOT READY MUST SWALLOW THE D-PAD, NOT FORWARD IT.
           This used to fall straight through to the WebView for every key, and the
           window is real: a menu page is well over a thousand lines plus six shared
           scripts, so on a cheap TV stick there is a visible gap between
           onPageStarted (webReady=false) and onPageFinished. Any press inside it
           reached CHROMIUM'S OWN focus engine instead of ours - which seats focus
           wherever it likes, and on a <select> treats Left/Right as "change the
           value". That is how a stray press during a load could silently move the
           user's training band, the exact invariant this app is built around
           (arrows move the cursor, OK activates, nothing else ever changes a band).
           Nothing is lost by dropping these: there is no cursor to move yet. Back is
           handled above this line precisely so it keeps working during a load. */
        if (!webReady) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_LEFT:  case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP:    case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_BUTTON_A:
                    return true;
                case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (!textInput) return true;
                    break;
                default: break;
            }
            return super.dispatchKeyEvent(e);
        }

        if (down) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_LEFT:  if (repeatAllowed(e)) nav("left");  return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: if (repeatAllowed(e)) nav("right"); return true;
                case KeyEvent.KEYCODE_DPAD_UP:    if (repeatAllowed(e)) nav("up");    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:  if (repeatAllowed(e)) nav("down");  return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_BUTTON_A:
                    if (e.getRepeatCount() == 0) nav("enter");
                    return true;
                /* ENTER USED TO BE SWALLOWED UNCONDITIONALLY, which is why Arena's two
                   number inputs are focusable and dead on the TV: the D-pad can reach
                   them, OK called click() (which does not raise the IME), and every key
                   that would confirm an entry was eaten here. While the page reports a
                   text field under the cursor, ENTER belongs to the field. */
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (textInput) return super.dispatchKeyEvent(e);
                    if (e.getRepeatCount() == 0) nav("enter");
                    return true;
            }
        }
        if (e.getAction() == KeyEvent.ACTION_UP) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP:   case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_BUTTON_A:
                    heldKey = 0;
                    return true;
                case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (textInput) return super.dispatchKeyEvent(e);
                    heldKey = 0;
                    return true;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    /* Three-way, and the order matters: an open keyboard, then an open overlay, then the
       page. On the launcher Back backgrounds the task rather than finishing it, so coming
       back resumes instead of restarting. */
    private void handleBack() {
        if (imeShown) { hideIme(); return; }
        if (overlayOpen) {
            overlayOpen = false;
            WebView w = web;
            if (w != null) { try { w.evaluateJavascript("window.__x3fCloseOverlay&&window.__x3fCloseOverlay()", null); } catch (Exception ignored) {} }
            return;
        }
        if (isLauncher(currentUrl)) { moveTaskToBack(true); return; }
        WebView w = web;
        if (w != null) { try { w.loadUrl(LAUNCHER); } catch (Exception ignored) {} }
    }
    private void hideIme() {
        imeShown = false;
        WebView w = web;
        if (w == null) return;
        try {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(w.getWindowToken(), 0);
        } catch (Exception ignored) {}
    }

    /* Injected into GAMES and the menu pages (not the launcher) after load.
       KEEP THIS A PLAIN TEXT BLOCK, ASSIGNED TO A FIELD OF THIS EXACT NAME: tools/nav-audit
       and tools/func-test regex it straight out of this source, and nav-audit additionally
       splices a test seam onto the literal line `   setInterval(function(){ try{ var
       sc=scope();` (three leading spaces) — it exits 2 if that line changes shape. The
       closing delimiter sits at column 0 so incidental-whitespace stripping stays at zero.
       Inside a text block a lone backslash is an escape and three quotes end the block, so
       this JavaScript deliberately contains neither: every string is single-quoted and no
       regex uses a backslash class. */
    private static final String BOOTSTRAP = """
(function(){
 try{ window.__x3fNative=true; }catch(e){}
 /* Is this page a force page at all? The shell injects this into every non-launcher
    file: URL, which includes routine/library/progress - menu pages that have no force
    variable, no onSample() and their own 10-foot CSS from sync-from-web.py. Running the
    game rules there burned a 62 Hz timer for nothing, created a stray window.force and
    window.baseline, and let the games' type sizes override the menus' own (both use
    !important, and the later sheet - this one - wins). Every game defines onSample();
    no menu page defines any of these. */
 var GAME=false;
 try{ GAME=(typeof window.__x3fIngest==='function')||(typeof onSample==='function')||(typeof calLo==='function')||(typeof force!=='undefined'); }catch(e){}
 /* Calibrate refuses to run until the page has a baseline, and on the TV the page's own
    tare never happens because the shell owns the zero. Without this the Calibrate button
    alerts and returns on every press, forever. */
 try{ if(GAME) baseline=0; }catch(e){}
 try{ var st=document.getElementById('x3fCss'); if(!st){ st=document.createElement('style'); st.id='x3fCss';
   var css='.app{max-width:none!important;width:100%!important}html,body{width:100%!important;height:100%!important}.x3f-focus{outline:4px solid #39f5c4!important;outline-offset:2px;border-radius:8px}'
     /* The TV button asks for fullscreen + an orientation lock. In this shell the
        WebView is already fullscreen and the activity is locked to landscape, so
        it does nothing at all - a button that lies. Hide it here rather than in
        the game, which still needs it in a phone browser. Three games give it a
        .tvbtn class and four write the same button with inline styles and no
        class at all, where it stayed visible, sat in the D-pad path, and did
        nothing when pressed - so match the handler too. */
     +'.tvbtn,[onclick*=x3tv]{display:none!important}';
   /* 10-foot pass for the GAMES ONLY. The menu pages scale their own type; the games
      were still phone-sized across a room - a 21px force number on a 55" screen
      three metres away. Only bumps type and padding, never layout, and only on a
      big viewport so a phone browser is untouched. */
   /* NO MEDIA QUERY. This pass used to sit inside @media (min-width:1200px), with
      the reasoning "only on a big viewport so a phone browser is untouched" - but a
      phone browser never gets here at all. This whole string is BOOTSTRAP, injected
      only by MainActivity into its own WebView; the web build in web/ never sees a
      byte of it. So the query guarded against something that cannot happen, while
      excluding something that constantly does: an Android TV WebView routinely
      reports a CSS viewport NARROWER than 1200px - 960 is the common 1080p value,
      and this file already reasons about "a TV reporting a 960-wide viewport"
      elsewhere. On every one of those panels the gate failed silently and the games
      stayed phone-sized across a room, which is the exact thing the pass exists to
      prevent: a 21px force number on a 55-inch screen three metres away. */
   if(GAME) css=css
     +'.chip .v{font-size:30px!important}.chip .k{font-size:13px!important;letter-spacing:2px!important}'
     +'.chip{padding:10px 16px!important;border-radius:18px!important}'
     +'.status{font-size:15px!important;padding:9px 16px!important}'
     +'.mini,select{font-size:15px!important;padding:11px 14px!important}'
     +'.cta{font-size:19px!important;padding:16px 24px!important}'
     +'.brand{font-size:23px!important}'
     +'.toast{font-size:clamp(2.4rem,8vw,4rem)!important}'
     +'.huge{font-size:clamp(3rem,11vw,7rem)!important}'
     +'.eyebrow{font-size:15px!important}'
     +'.card h1{font-size:38px!important}.card p{font-size:17px!important;line-height:1.6!important}'
     +'.card .tag{font-size:14px!important}';
   st.textContent=css;
   (document.head||document.documentElement).appendChild(st); } }catch(e){}
 /* ONE CONDITIONING PATH, AND THIS IS IT.

    The old driver assigned `force` itself, which REPLACED the browser build's
    onSample(). Anything that conditions the raw signal therefore had to be written
    twice - once in the game and once here - or it silently did not exist on the TV.
    Three shipped bugs came out of that single shape: Arena's vis() in v0.9, the
    per-movement floor in v1.6, and Bloom logging peak:0 for EVERY set on the TV
    forever, because setPeak is only ever assigned inside onSample(). That one killed
    every peak PB, the peak chart, peak achievements and peak challenges, on the
    default game, and nothing anywhere reported it.

    So the shell stopped conditioning anything. It hands the raw sample to

        window.__x3fIngest(v)

    which IS the game's own onSample - the same function the browser's Bluetooth
    handler calls with the same argument. One implementation. It cannot drift,
    because there is nothing to drift from.

      v          one force sample in BAR UNITS, straight off CH_FORCE, exactly what
                 onSample() reads out of `raw` today. The shell has already removed
                 its own native zero, which is why `baseline` is pinned to 0 above,
                 so the page's raw-baseline arithmetic stays an identity.
      returns    ignored. Must not throw, and must tolerate ~120 calls a second.

    MIGRATION SHIM: a page that has not exported __x3fIngest yet still gets the old
    inline floor subtraction so it keeps working. Delete that branch once all eight
    games export the function - until then it is the only thing keeping an
    un-migrated game alive on the TV. Calibrate deliberately defines no calLo(): it
    has to measure absolute force, and typeof calLo==='function' is false there. */
 try{ if(window.__x3fDrv)clearInterval(window.__x3fDrv);
   if(GAME){
     var lastSeq=0;
     var ing=function(v){
       try{ if(typeof window.__x3fIngest==='function'){ window.__x3fIngest(v); return; } }catch(e){}
       try{ var lo=(typeof calLo==='function')?(+calLo()||0):0; force=(v>lo)?v-lo:0; }catch(e){}
     };
     window.__x3fDrv=setInterval(function(){ try{
       var v=+window.__x3fForce||0;
       /* The bar notifies at ~100 Hz and the shell forwards ~62 of them, so about a
          third of every set used to be dropped and forgotten - and a fast concentric
          snap's true peak lands in a dropped packet more often than not, which is why
          every peak logged on the TV read low. The native side now tracks the maximum
          across EVERY sample and publishes it with a sequence number. Feed that
          maximum in as a real sample, because it is one: it happened a few
          milliseconds ago, and the game's own peak tracking then sees it with no
          second code path to keep in step. The sequence number is what stops one
          published window being consumed twice. */
       var s=+window.__x3fSeq||0;
       if(s!==lastSeq){ lastSeq=s; var p=+window.__x3fPeak||0; if(p>v)ing(p); }
       ing(v);
     }catch(e){} },16); }
 }catch(e){}
 /* On the TV the page's status chip is never updated, because the only thing that
    ever wrote it was the end of onSample()'s tare - which the shell owns instead. So
    every game sat on 'Offline' all session with a live bar. Reuse the launcher's own
    signature rather than inventing a second one. */
 try{ if(!window.__x3fSetBar&&typeof setStatus==='function'){
   window.__x3fSetBar=function(state,text){ try{ setStatus(text,state); }catch(e){} }; } }catch(e){}
 try{ var fr=document.getElementById('firstrun'); if(fr)fr.classList.remove('show'); }catch(e){}
 try{ if(typeof startRun==='function')startRun(); }catch(e){}
 /* CAPTURE PHASE + stopPropagation, and both halves are load-bearing: a capture
    listener on the target runs before the element's own onclick property handler, and
    stopPropagation() there suppresses it. That is the only thing stopping the game's
    own handler calling startTare(), which sets taring=true and can only be cleared by
    onSample() - never called on the TV - so every game would wedge on 'Zeroing - hold
    still' forever. Guarded now because onPageFinished can fire more than once for a
    document, and this was the one injection here with no idempotence check. */
 try{ var z=document.getElementById('zeroBtn'); if(z&&!z.__x3fZeroed){ z.__x3fZeroed=1; z.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); try{ if(window.X3F&&X3F.reZero)X3F.reZero(); }catch(e){} },true); } }catch(e){}
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
   var EDIT=/^(text|number|search|tel|url|email|password)$/;
   function isEdit(el){ try{ if(!el)return false; var t=el.tagName;
     if(t==='TEXTAREA')return true; if(el.isContentEditable)return true;
     if(t!=='INPUT')return false; return EDIT.test(String(el.type||'text').toLowerCase()); }catch(e){return false;} }
   /* THE FIRST D-PAD PRESS IN A GAME USED TO LAND ON THE BACK CHEVRON. The cursor
      seats on list[0], and the tiny back button is the first matching element in
      document order in every single game - so a player who nudged the D-pad mid-run
      saw a ring appear on a 38px arrow, pressed OK to make it go away, and lost the
      run to history.back(). Honour data-nav-first the way x3f-nav.js does, and
      failing that never seat the cursor on a control whose whole job is to leave. */
   function isExit(el){ try{
     var lab=(el.getAttribute('aria-label')||'')+' '+(el.getAttribute('title')||'');
     if(/back|exit|quit|home/i.test(lab))return true;
     var oc=el.getAttribute('onclick')||'';
     return oc.indexOf('history.back')>=0||oc.indexOf('index.html')>=0; }catch(e){return false;} }
   function firstOf(list){ if(!list||!list.length)return null;
     for(var i=0;i<list.length;i++){ if(list[i].hasAttribute&&list[i].hasAttribute('data-nav-first'))return list[i]; }
     for(var j=0;j<list.length;j++){ if(!isExit(list[j]))return list[j]; }
     return list[0]; }
   /* Tell the shell what kind of thing the cursor is on, ahead of the key event and
      for the same reason setOverlay is pushed rather than queried: evaluateJavascript
      is async, so the answer has to already be there when the key arrives. */
   function tell(el){ try{ if(window.X3F&&X3F.setTextInput)X3F.setTextInput(isEdit(el)); }catch(e){} }
   /* DELIBERATELY NOT reporting overlay state from here. The shell's Back key would then
      close a game's modal instead of leaving the game - which is what you want - but the
      only generic way to close one is to drop its .show class, and Nova's Upgrade Bay has
      no dismiss control at all: its single button is 'Launch Next Sector', which advances
      the run. Removing .show there would leave the game with no scrim and no running
      sector. The real fix is a per-game window.__x3fCloseOverlay, which lives in the game
      files, not here. Until those exist, Back keeps its current meaning. */
   function clear(){ if(cur){ cur.classList.remove('x3f-focus'); } cur=null; tell(null); }
   function setFocus(el){ if(cur)cur.classList.remove('x3f-focus'); cur=el; if(cur){ cur.classList.add('x3f-focus'); try{cur.scrollIntoView({block:'nearest'});}catch(e){} try{cur.focus({preventScroll:true});}catch(e){} } tell(cur); }
   function ctr(el){ var r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }
   window.__x3fNav=function(dir){ try{
     var list=items(); if(!list.length){ clear(); return; }
     if(!cur||list.indexOf(cur)<0){ setFocus(firstOf(list)); return; }
     if(dir==='enter'){
       if(cur.tagName==='SELECT'){ cur.selectedIndex=(cur.selectedIndex+1)%cur.options.length; cur.dispatchEvent(new Event('change',{bubbles:true})); }
       /* A number field was focusable and completely dead: click() does not raise the
          IME and the shell ate every ENTER. Ask the shell for the keyboard instead. */
       else if(isEdit(cur)){ try{cur.focus();}catch(e){} try{ if(window.X3F&&X3F.showKeyboard)X3F.showKeyboard(); }catch(e){} }
       else { cur.click(); }
       return; }
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
       /* HORIZONTAL IS A GATE, VERTICAL IS A PENALTY, and the asymmetry is
          deliberate - x3f-nav.js reasons it out at length and the games were not
          following it. Both directions used the +4000 penalty, so a candidate
          that shared no part of your row was still eligible if nothing better
          existed: pressing Right on the last button of a game's bottom control
          bar found nothing beside it and teleported the ring to the top of the
          screen. Every one of the seven games behaved that way.
          Horizontally, "nothing in this row that way" means the row ENDED, and
          stopping is the right answer. Vertically it usually means the next band
          is merely offset - a two-button bar in a corner - and refusing it would
          strand controls the D-pad is required to reach. */
       var d; if(horiz){ if(ov<=2)continue; d=along+perp*2.5; }
              else { d=along+perp*2.5+(ov>2?0:4000); }
       if(d<bd){bd=d;best=el;} }
     if(best)setFocus(best);
   }catch(e){} };
   setInterval(function(){ try{ var sc=scope();
     if(sc!==lastScope){ lastScope=sc; if(sc!==document){ var l=items(); setFocus(firstOf(l)); } else { clear(); } }
     else if(cur&&!vis(cur)){ clear(); }
   }catch(e){} }, 350);
  }
 }catch(e){}
})();
""";
}
