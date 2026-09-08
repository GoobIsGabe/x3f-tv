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
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
    /* THE HOME SCREEN. app.html, not launcher.html.

       launcher.html's own note set the terms: "app.html is the new leanback home.
       It ships in the bundle and passes the nav audit, but it is not the LAUNCHER
       yet: the bar picker, the device list and this updater still live on this
       page, and losing them would be a regression. So it is reachable and
       testable from the couch first, and becomes the launcher once it carries
       those three things."

       It carries all three now, and the nav audit walks them: "home: bar picker
       with devices", "home: bar picker, nothing seen", and Check for updates in
       Settings. launcher.html stays in the bundle - it is what onReceivedError
       used to fall back to, it is the phone build's twin, and deleting a working
       page on the same day as promoting its replacement is two changes wearing
       one commit. */
    private static final String LAUNCHER = "file:///android_asset/app.html";
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
       pick the bar by hand when the advertisement is not self-describing.
       BOUNDED, and named devices outrank unnamed ones — see noteDevice(). */
    private final Map<String, String> seen = new LinkedHashMap<>();
    private static final String UNNAMED = "(unnamed device)";
    /* Room for every device a living room actually contains, and few enough that the
       list can be paged through with a D-pad from the sofa. */
    private static final int  SEEN_MAX        = 24;
    private static final long DEVICES_PUSH_MS = 1200;
    private volatile boolean devicePushPending = false;

    /* ADDRESSES THAT ANSWERED AND TURNED OUT NOT TO BE A BAR — the GATT service was
       missing, or the service was there without the force characteristic.
       nameLooksLikeBar() is a substring match on a name straight off the radio, so a
       neighbour's "X3 Soundbar" matches it. Without this list the recovery path is a
       trap: connect, discover, find nothing, rescan, match the same advertiser again,
       forever, with the TV cycling status text and never reaching the real bar.
       Bounded like `seen`, and rescan() empties it so a bar that was genuinely
       mid-firmware-update can be given another go on demand. */
    private final Set<String> rejected = Collections.synchronizedSet(new LinkedHashSet<String>());
    private static final int REJECT_MAX = 32;

    private volatile boolean triedKnown = false;
    private volatile long watchdog = 0;
    private volatile long scanRetry = 0;
    /* Consecutive failed service discoveries against one address — see
       onServicesDiscovered, where they are what keeps a dropped link from being read as
       "this is not a bar" and putting the real one on the rejected list. */
    private volatile String discFailAddr = null;
    private volatile int    discFailCount = 0;
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
        /* THIS USED TO BE LOAD_CACHE_ELSE_NETWORK, described as "never re-validate a
           file:// asset". It cannot do that: cache mode is an HTTP cache policy and a
           file:// load never goes near the HTTP cache, so it did nothing whatsoever for
           the bundle. What it DID govern is the only traffic this WebView ever makes —
           x3f-sync.js talking to Firebase once enableSync() opens the door — and there
           it is actively wrong: LOAD_CACHE_ELSE_NETWORK prefers a cached response over
           the network even when it has expired, which for a household-sync poll means
           the TV can read yesterday's snapshot and never notice the phone finished a
           set. LOAD_DEFAULT is the policy that says "obey the server's headers", which
           is what a live database needs and what the bundle is unaffected by. */
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
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
                /* THESE USED TO BE TWO EXCLUSIVE BRANCHES, and that is why the new home
                   could not become the launcher.

                   The old shape was: the LAUNCHER gets bar/battery/devices/version and no
                   bootstrap; every other page gets the bootstrap and only the bar. So a
                   page could have the device list or the injected runtime, never both -
                   and app.html needs both. It is a full leanback home (its own nav, its
                   own overlays, the pairing flow) AND it now carries the bar picker, the
                   device list and the updater that launcher.html used to hold alone.

                   Split by what each thing is actually for instead. Every push is a
                   `window.__x3fX && __x3fX(...)` call, so sending state to a page with no
                   handler costs one no-op and nothing else - there was never a reason to
                   withhold it. The BOOTSTRAP is the one thing that is genuinely
                   page-specific: launcher.html and index.html carry their own inline
                   cursor, so injecting a second one there is the double-nav bug this file
                   already warns about elsewhere. */
                if (url != null && url.startsWith("file") && !isLegacyLauncher(url)) {
                    v.evaluateJavascript(BOOTSTRAP, null);
                }
                /* Replay everything the page might want to draw. Devices found before the
                   page finished loading were dropped on the floor: pushDevices() bails
                   when the page is not ready and the list was never replayed, so the
                   picker could be empty while `seen` had entries - on a cold start, and on
                   every return from a game. The bar matters for the same reason: on the TV
                   a page's own onSample() tare never runs, so without this replay a status
                   chip keeps whatever it was born with ("Offline") for the whole session
                   while the bar is live. */
                pushBar();
                pushBattery();
                pushDevices();
                v.evaluateJavascript("window.__x3fVersion&&window.__x3fVersion(" + jsStr(BuildConfig.VERSION_NAME) + ")", null);
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
                if (!isHome(u)) { try { v.loadUrl(LAUNCHER); } catch (Exception ignored) {} }
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

    /* TWO DIFFERENT QUESTIONS THAT USED TO SHARE ONE ANSWER.

       isHome  - "is this the screen BACK should stop at?" Back on the home
                 backgrounds the task so returning resumes instead of restarting;
                 anywhere else it goes home. app.html is the home now, so it has
                 to be in here or Back on the home screen would load the home
                 screen.
       isLegacyLauncher - "is this one of the two old pages that carry their own
                 inline cursor?" Those must not receive the BOOTSTRAP, because a
                 second cursor model on one page is a documented defect in this
                 file. Nothing else about them is special.

       Conflating the two is what kept the redesigned home from being the
       launcher: it could have Back OR the injected runtime, never both. */
    private boolean isHome(String url) {
        return url != null && (url.contains("launcher.html")
                            || url.endsWith("index.html")
                            || url.contains("app.html"));
    }
    private boolean isLegacyLauncher(String url) {
        return url != null && (url.contains("launcher.html") || url.endsWith("index.html"));
    }

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
        /* POSTED, NOT CALLED. A permission result is delivered while the activity is
           still paused (the framework drains pending results just before onResume), and
           startScan() now refuses to touch the radio while paused — see the comment
           there. A plain call would therefore be swallowed. Posting runs it after
           onResume has cleared the flag. */
        if (ok) ui.post(this::startScan); else setBar("", "Bluetooth denied");
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
    private static String addrOf(BluetoothDevice d) {
        try { return (d != null) ? d.getAddress() : null; } catch (Exception e) { return null; }
    }

    /* The three moves on the rejected-address list. A rejection is a session fact, not a
       verdict on the hardware: it survives until the user asks for a rescan or picks the
       device by hand, and it is capped so a room full of advertisers cannot grow it
       without bound the way `seen` used to grow. */
    private boolean isRejected(String addr) {
        return addr != null && rejected.contains(addr);
    }
    private void reject(String addr) {
        if (addr == null) return;
        synchronized (rejected) {
            if (rejected.size() >= REJECT_MAX) {
                Iterator<String> it = rejected.iterator();     // LinkedHashSet: eldest first
                if (it.hasNext()) { it.next(); it.remove(); }
            }
            rejected.add(addr);
        }
        Log.w(TAG, "not a force bar, will not retry this session: " + addr);
        /* If the dud is also the remembered bar, forget it. Otherwise tryKnownDevices()
           goes straight back at it on the next launch, with autoConnect and no scan, and
           the first thing the user sees every single time is a connect that cannot work. */
        try {
            if (prefs != null && addr.equals(prefs.getString("lastBar", null))) prefs.edit().remove("lastBar").apply();
        } catch (Exception ignored) {}
    }
    private void unreject(String addr) {
        if (addr != null) try { rejected.remove(addr); } catch (Exception ignored) {}
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
                    if (nameLooksLikeBar(safeNameOf(d)) && !isRejected(addrOf(d))) {
                        setBar("wait", "Bar already connected - attaching…");
                        connectTo(d); return true;      // connectTo arms the watchdog
                    }
                }
            }
        } catch (Exception ignored) {}
        try {
            String last = (prefs != null) ? prefs.getString("lastBar", null) : null;
            if (last != null && adapter != null && !isRejected(last)) {
                BluetoothDevice d = adapter.getRemoteDevice(last);
                if (d != null) { setBar("wait", "Reconnecting to your bar…"); connectTo(d); return true; }
            }
        } catch (Exception ignored) {}
        try {
            if (adapter != null && adapter.getBondedDevices() != null) {
                for (BluetoothDevice d : adapter.getBondedDevices()) {
                    if (nameLooksLikeBar(safeNameOf(d)) && !isRejected(addrOf(d))) {
                        setBar("wait", "Connecting to paired bar…");
                        connectTo(d); return true;
                    }
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    /* A direct connect has no timeout of its own - if the address is stale it can
       sit on "Reconnecting…" forever. Fall back to scanning if it stalls.

       ARMED BY connectTo() AND reconnect() THEMSELVES, not by their callers. It used to
       be the caller's job, three of the five call sites remembered, and the two that did
       not — the scan's own connectTo() and reconnect() — are exactly the paths that
       could hang: a device that answers the advertisement and then never completes the
       GATT connect leaves connecting=true, and every later scan result is refused by the
       !connecting check. "Connecting…" then stays on the screen until the television is
       unplugged. Anything that sets connecting=true arms this. */
    private static final long WATCHDOG_MS   = 9000;
    /* The reconnect path passes autoConnect=true, which by design has NO timeout at all:
       the stack waits for the bar to advertise again, however long that takes. That is
       worth a longer leash than a direct connect before we give up and scan — but not an
       unbounded one, because a bar that has been carried out of the room never comes. */
    private static final long RECONNECT_WATCHDOG_MS = 20000;

    private void armWatchdog(long ms) {
        final long id = ++watchdog;
        ui.postDelayed(new Runnable() {
            @Override public void run() {
                if (id != watchdog || connected) return;
                connecting = false; closeGatt();
                /* DO NOT SCAN WHILE PAUSED. This used to call startScan() unconditionally.
                   onPause stops the scan precisely because SCAN_MODE_LOW_LATENCY is a
                   100 % duty-cycle radio scan, so pressing Back to go and watch television
                   while a connect was in flight armed this, and nine seconds later the
                   backgrounded app quietly turned the radio back on — for the rest of the
                   session, since nothing stops it again until the app is next resumed and
                   paused. The state above is still cleared either way: leaving
                   connecting=true would block the scan onResume starts for us. */
                if (paused) { setBar("wait", "Bar not answering"); return; }
                setBar("wait", "No answer - scanning instead…");
                startScan();
            }
        }, ms);
    }

    /* Android counts scan STARTS per app: five inside thirty seconds and every further
       start is refused with SCAN_FAILED_SCANNING_TOO_FREQUENTLY until the window rolls
       forward. rescan(), the watchdog, onResume, a disconnect and onScanFailed itself all
       reach startScan(), so a bar that answers slowly burns through five starts without
       anybody doing anything unusual. Wait out the window rather than treat it as fatal.
       Generation-counted so a burst of failures leaves ONE pending retry, not five. */
    private static final long SCAN_RETRY_MS = 35000;
    private void scheduleScanRetry(long ms) {
        final long id = ++scanRetry;
        ui.postDelayed(new Runnable() {
            @Override public void run() {
                if (id != scanRetry || connected || connecting) return;
                startScan();          // itself a no-op while paused; onResume covers that
            }
        }, ms);
    }

    private void startScan() {
        if (scanning || connected || connecting || adapter == null) return;
        /* THE ONE CHOKEPOINT FOR "not while the app is in the background". Half a dozen
           posted runnables in this file end up here — the watchdog, the scan retry, the
           800 ms rescan after a wrong device, the 1200 ms reconnect after a disconnect —
           and any of them can land after onPause has deliberately stopped the radio.
           onResume starts the scan again the moment the user comes back. */
        if (paused) return;
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
            String addr = addrOf(d);
            // remember it, so the launcher can offer a manual pick - bounded, see noteDevice
            noteDevice(addr, name);
            boolean looksLikeBar = nameLooksLikeBar(name) || hasService;
            /* isRejected is what stops the loop. This device already answered once and had
               no force characteristic; without the check the recovery rescan finds the very
               same advertisement a second later and starts the cycle again. */
            if (looksLikeBar && !connecting && !connected && !isRejected(addr)) connectTo(d);
        }

        /* THIS USED TO BE ONE LINE THAT SET A STATUS STRING, and it cost the app every
           later scan. startScan() sets scanning=true before startScan() can fail, and the
           failure callback left it true even though NO scan was running — so startScan()
           returned early on `scanning` from then on, for the rest of the process. One
           transient failure and the television could never see the bar again; there was no
           retry, no timeout, and no way out but force-stopping the app.

           The code worth handling by name is the frequency cap. It is not a fault at all,
           it is Android saying "wait": five scan starts inside thirty seconds and the sixth
           is refused. Back off past that window and try again. */
        @Override public void onScanFailed(int code) {
            Log.w(TAG, "scan failed, code " + code);
            /* ALREADY_STARTED means a scan registered under this very callback is running,
               so the radio genuinely is looking and scanning=true is the truth. Anything
               else means it is not. */
            if (code == ScanCallback.SCAN_FAILED_ALREADY_STARTED) { scanning = true; return; }
            scanning = false;
            if (code == ScanCallback.SCAN_FAILED_FEATURE_UNSUPPORTED) {
                setBar("", "BLE scan unsupported");        // no hardware for it: nothing to retry
                return;
            }
            /* SCAN_FAILED_SCANNING_TOO_FREQUENTLY (value 6) only became a PUBLIC constant
               in API 34, but the platform has delivered the code itself since Nougat,
               which is where the cap came from — so naming it is right even though this
               app runs from API 24. It is safe to name because javac inlines a static
               final int: the compiled class holds the literal 6 and never looks a field up
               at runtime, so there is nothing here for an old framework to be missing.
               Everything else — an internal error, a failed registration, resources gone —
               is also worth one back-off before giving up on the radio, because every one
               of them has a transient form and the alternative is the dead end above. */
            if (code == ScanCallback.SCAN_FAILED_SCANNING_TOO_FREQUENTLY) setBar("wait", "Bluetooth busy - retrying…");
            else setBar("wait", "Scan failed - retrying…");
            scheduleScanRetry(SCAN_RETRY_MS);
        }
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
            catch (SecurityException e) { setBar("", "Connect permission?"); connecting = false; return; }
            /* connectGatt RETURNS NULL AND THAT WAS NEVER CHECKED. It does so when the
               stack cannot hand out another client interface — they are process-wide and
               hard-limited, which is the leak the bleLock above exists to prevent — or
               when the adapter is turning off underneath us. There is then no GATT and
               therefore no callback that could ever clear connecting, so the app sat on
               "Connecting…" and refused every scan result from then on. */
            if (gatt == null) {
                connecting = false;
                setBar("wait", "Bluetooth busy - retrying…");
                /* Posted rather than called: startScan() from inside bleLock would come
                   straight back through tryKnownDevices() into this method. */
                scheduleScanRetry(3000);
                return;
            }
            armWatchdog(WATCHDOG_MS);
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
                    /* Same null as in connectTo, and here it was even easier to hit: this
                       path runs 1.2 seconds after every disconnect, so a stack that has
                       run out of client interfaces reaches it repeatedly. And even when
                       the call succeeds, autoConnect=true never times out on its own —
                       so nothing here ever armed the watchdog and "Reconnecting…" was a
                       permanent screen. Both holes close together. */
                    if (gatt == null) { connecting = false; scheduleScanRetry(3000); return; }
                    armWatchdog(RECONNECT_WATCHDOG_MS);
                }
            }
            catch (Exception e) { connecting = false; startScan(); }
        } else startScan();
    }
    /* Let go of a device that answered the connect but is not a force bar. The watchdog
       generation is bumped first: it is still pending at this point, and its "No answer -
       scanning instead…" would overwrite the message that actually explains what
       happened, nine seconds after the user has already read the truth. */
    private void giveUpOn(String addr) {
        watchdog++;
        connecting = false; connected = false;
        closeGatt();
        reject(addr);
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
            /* Off THIS gatt, not off targetAddress: a callback for the connection we are
               abandoning can still arrive after a newer attempt has moved targetAddress
               on, and rejecting the wrong address would blacklist the real bar. */
            String who = addrOf(g != null ? g.getDevice() : null);
            if (who == null) who = targetAddress;
            /* STATUS FIRST, AND A FAILED ONE IS NOT A VERDICT ON THE DEVICE. Discovery
               comes back failed for transport reasons — the link dropped part-way, the
               stack was busy — and getService() then returns null for a perfectly good
               bar. The `status` argument was ignored entirely, which was survivable while
               the answer to "no service" was an endless retry; it is not survivable now
               that the answer is a rejection, because one unlucky discovery would take the
               user's own bar out of the running for the session and forget the address it
               is remembered by. Two strikes on the same address: retry it once, and only a
               device that cannot complete discovery twice running is given up on. */
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.w(TAG, "service discovery failed, status " + status + " on " + who);
                int strikes = (who != null && who.equals(discFailAddr)) ? discFailCount + 1 : 1;
                discFailAddr = who; discFailCount = strikes;
                if (strikes >= 2) { setBar("", "Bar is not answering — scanning…"); giveUpOn(who); }
                else {
                    watchdog++;                       // its message would arrive after ours
                    connecting = false; connected = false; closeGatt();
                    setBar("wait", "Lost it mid-connect - retrying…");
                }
                ui.postDelayed(MainActivity.this::startScan, 1200);
                return;
            }
            discFailAddr = null; discFailCount = 0;   // it answered: the slate is clean
            BluetoothGattService svc = g.getService(SERVICE);
            if (svc == null) {
                setBar("", "Wrong device — scanning…");
                giveUpOn(who);
                ui.postDelayed(MainActivity.this::startScan, 800);
                return;
            }
            BluetoothGattCharacteristic ch = svc.getCharacteristic(CH_FORCE);
            /* "NO FORCE CHANNEL" WAS A DEAD END WITH NO WAY OUT. The service is there and
               the force characteristic is not — a different product from the same vendor,
               or firmware too old — and this used to set a status string and return with
               connecting still true and the GATT still open. Every subsequent scan result
               was then refused by the !connecting check, no watchdog was left running
               (discovery had already answered), and nothing anywhere retried. The screen
               read "No force channel" until the television was unplugged.
               Let go of the device, remember it so the rescan does not walk straight back
               into it, say what happened, and look for another bar. */
            if (ch == null) {
                setBar("", "No force channel - looking for another bar…");
                giveUpOn(who);
                ui.postDelayed(MainActivity.this::startScan, 800);
                return;
            }
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
       bootstrap holds that maximum on the force channel for one of x3f-set.js's sampler
       periods, which is what actually makes the games' own peak tracking see it — the
       BOOTSTRAP comment on HOLD_MS explains why an extra sample was not enough. Half of
       this channel lived here and did nothing for a release because the other half spent
       the value microseconds after receiving it; read the two together. */
    private void injectForce(double f) {
        final WebView w = web;                    // one read: onDestroy can null it under us
        if (w == null || !webReady || paused) {
            /* NOTHING IS CONSUMING THE PEAK, SO THERE IS NO WINDOW TO ACCUMULATE INTO.
               peakWin was only ever cleared by a publish, and a publish cannot happen on
               this branch — so a hard pull made while the app was backgrounded, or during
               a page load, sat in peakWin and was published as a real sample the instant
               the page came back. That is a maximum from minutes ago arriving as if it
               happened now: a phantom rep, a false PB, and a calibration ceiling learned
               from a number nobody pulled this set. Drop it on the floor, which is where
               it belongs — the value was never measured against a running set. */
            peakWin = 0;
            return;
        }
        long now = SystemClock.uptimeMillis();
        /* NOT cleared here. Being throttled is the one case where the window has to
           survive: peakWin is exactly the maximum of the ~38 % of samples this throttle
           drops, and the next publish carries it. */
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
               last.
               THE GUARD IS HELD UNTIL THE DOWNLOAD ENDS, not until it is enqueued. It used
               to be released in doCheckUpdate's finally, which runs the moment the request
               is handed to DownloadManager — so a second OK a few seconds later walked
               straight back in, DELETED the APK that was being written at that instant,
               and started the whole download again on a TV that is often on a slow link.
               See doCheckUpdate, startDownload and dlRx: between them every path that ends
               an update attempt clears it exactly once. */
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
                    watchdog++;                   // cancel any fallback the last attempt armed
                    stopScan(); closeGatt();
                    connecting = false; connected = false;
                    /* An explicit pick overrides an earlier rejection. The user is looking
                       at the device and choosing it; if the last attempt found no force
                       characteristic because the bar was asleep or mid-update, this is how
                       they say "try again" without restarting the app. */
                    unreject(addr);
                    if (adapter == null) { setBar("", "No Bluetooth"); return; }
                    BluetoothDevice d = adapter.getRemoteDevice(addr);
                    if (d == null) { setBar("", "Bad address"); return; }
                    connectTo(d);                 // connectTo arms the watchdog
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
                scanRetry++;                      // and any pending back-off retry
                stopScan(); closeGatt();
                connecting = false; connected = false; triedKnown = false;
                synchronized (seen) { seen.clear(); }
                /* Rescan is the user saying "forget what you think you know". A device
                   ruled out because it had no force characteristic gets another chance
                   here, which is the only way back if it was asleep or mid-update when
                   the app first reached it. */
                try { rejected.clear(); } catch (Exception ignored) {}
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

    /* THE PICKER USED TO FILL WITH JUNK AND NEVER STOP GROWING. Every advertisement from
       every device in radio range was remembered for the life of the process, and the
       WHOLE map was re-serialised to JSON and evaluated into the WebView for each new
       address. BLE privacy addresses rotate — the spec's default is about every fifteen
       minutes — so one neighbour's phone becomes four fresh "(unnamed device)" rows an
       hour, forever. After an evening the manual-pick list is hundreds of rows of noise
       that a D-pad cannot page through, and the launcher has rebuilt it dozens of times a
       minute for the privilege.

       Three things fix it, and all three are needed:
         - a hard cap, so the list stays a list;
         - names win. An unnamed stranger at the cap is discarded rather than admitted,
           because it is almost always a rotated address that will never be seen again; a
           NAMED device is worth a slot, so make room by dropping the oldest unnamed one.
           The bar is the thing the user is looking for and it advertises a name;
         - pushes are coalesced, so a burst of advertisements costs one serialisation.

       Unnamed devices are still listed, deliberately: the whole point of the picker is
       the bar whose advertisement says nothing, and refusing to show those would remove
       the only escape hatch this app has when the matcher cannot see the bar. */
    private void noteDevice(String addr, String name) {
        if (addr == null) return;
        boolean named = name != null && name.trim().length() > 0;
        boolean changed = false;
        synchronized (seen) {
            String had = seen.get(addr);
            if (had == null) {
                if (seen.size() >= SEEN_MAX && !(named && evictOneUnnamedLocked())) return;
                seen.put(addr, named ? name : UNNAMED);
                changed = true;
            } else if (named && !name.equals(had)) {
                /* A device very often advertises with no name and supplies one in the scan
                   response a moment later. The first form used to stick for the session,
                   so the bar itself could sit in the picker as "(unnamed device)" while
                   the shell knew perfectly well what it was called. */
                seen.put(addr, name);
                changed = true;
            }
        }
        if (changed) schedulePushDevices();
    }
    /* Caller holds `seen`. Iterator.remove(), not entrySet removal during a for-each,
       which is a ConcurrentModificationException. LinkedHashMap iterates oldest first. */
    private boolean evictOneUnnamedLocked() {
        Iterator<Map.Entry<String, String>> it = seen.entrySet().iterator();
        while (it.hasNext()) {
            if (UNNAMED.equals(it.next().getValue())) { it.remove(); return true; }
        }
        return false;      // every slot is a named device: keep them all, drop the stranger
    }
    /* One serialisation per burst. The flag is volatile and the check-then-set is not
       atomic, but the callback that drives it is delivered on one thread and the worst
       a race can cost is a second push of a correct list. */
    private void schedulePushDevices() {
        if (devicePushPending) return;
        devicePushPending = true;
        ui.postDelayed(new Runnable() { @Override public void run() {
            devicePushPending = false;
            pushDevices();
        } }, DEVICES_PUSH_MS);
    }

    private void pushDevices() {
        WebView w = web;
        if (w == null || !webReady) return;
        JSONArray arr = new JSONArray();
        /* NAMED DEVICES FIRST, in two passes over one insertion-ordered map. The bar
           advertises a name and the picker is driven by a D-pad from the sofa, so the row
           the user is actually looking for must not sit below a column of anonymous
           addresses. Within each group the order is still the order they were seen, which
           is what makes the list stable while a scan is running. */
        synchronized (seen) {
            for (int pass = 0; pass < 2; pass++) {
                for (Map.Entry<String, String> e : seen.entrySet()) {
                    boolean unnamed = UNNAMED.equals(e.getValue());
                    if (unnamed != (pass == 1)) continue;
                    try {
                        JSONObject o = new JSONObject();
                        o.put("a", e.getKey() == null ? "" : e.getKey());
                        o.put("n", htmlSafe(e.getValue()));
                        arr.put(o);
                    } catch (Exception ignored) {}
                }
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
    /* EVERY RETURN OUT OF THIS METHOD EITHER RELEASES THE GUARD OR HANDS IT TO THE
       DOWNLOAD. There used to be a single `finally { updating = false; }`, which read like
       the careful thing to do and was the bug: the download is asynchronous, so the finally
       ran while the APK was still arriving. Only the startDownload() path below leaves
       updating true, and startDownload clears it itself if the enqueue fails; otherwise
       dlRx clears it when DownloadManager reports the download over. */
    private void doCheckUpdate() {
        try {
            pushUpdate("Checking…");
            String s = httpGet(VERSION_URL).replaceAll("[^0-9]", "");
            if (s.isEmpty()) { pushUpdate("Couldn't read version"); updating = false; return; }
            int remote;
            try { remote = Integer.parseInt(s); }
            catch (NumberFormatException nfe) { pushUpdate("Couldn't read version"); updating = false; return; }
            if (remote <= BuildConfig.VERSION_CODE) {
                pushUpdate("You're on the latest (v" + BuildConfig.VERSION_NAME + ")");
                updating = false; return;
            }
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                pushUpdate("Allow \"install unknown apps\" for X3F, then check again");
                try {
                    final Intent st = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                    st.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ui.post(() -> { try { startActivity(st); } catch (Exception ignored) {} });
                } catch (Exception ignored) {}
                updating = false; return;                 // the user has to come back and press it again
            }
            pushUpdate("Downloading v" + remote + "…");
            startDownload();                              // owns `updating` from here on
        } catch (Exception e) { pushUpdate("Update check failed"); updating = false; }
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
    /* A download that never ends must not lock the updater out for the rest of the
       session. DownloadManager will sit in PENDING for as long as the TV has no usable
       network and broadcasts nothing while it waits, so after this long the guard is
       released and the user may try again — by which time startDownload cancels the
       stalled request properly instead of deleting the file underneath it. */
    private static final long UPDATE_STUCK_MS = 900000;   // fifteen minutes
    private void armUpdateRelease() {
        final long id = dlId;
        ui.postDelayed(new Runnable() { @Override public void run() {
            if (dlId == id && updating) { updating = false; pushUpdate("Download is taking a while - you can check again"); }
        } }, UPDATE_STUCK_MS);
    }
    private void startDownload() {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            /* CANCEL BEFORE DELETING. The delete below used to be the first thing that
               happened, which is what made a second press destructive: it removed the file
               a still-running DownloadManager job had open, and that job then wrote a
               half-APK nobody was tracking. Removing the request first means there is no
               writer left to surprise us. */
            try { if (dlId != -1) dm.remove(dlId); } catch (Exception ignored) {}
            dlId = -1;
            try { new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "x3f-update.apk").delete(); } catch (Exception ignored) {}
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(APK_URL));
            r.setMimeType("application/vnd.android.package-archive");
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            r.setTitle("X3F TV update");
            r.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "x3f-update.apk");
            dlId = dm.enqueue(r);
            armUpdateRelease();
        } catch (Exception e) { pushUpdate("Download failed"); updating = false; }
    }
    private final BroadcastReceiver dlRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == -1 || id != dlId) return;
            /* The attempt is over either way — DownloadManager broadcasts this for a
               failure as well as a success — so this is where the re-entry guard the OK
               key needs is finally released. In a finally, because every line below can
               throw and a thrown installer would otherwise wedge the updater for good. */
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
            finally { updating = false; }
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
        if (isHome(currentUrl)) { moveTaskToBack(true); return; }
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
     /* HOLD_MS MUST EXCEED x3f-set.js's SAMPLE_MS, WHICH IS 40. See the peak note
        below: 48 leaves margin for a tick that arrives late without holding a stale
        maximum long enough to be visible as a plateau. */
     var lastSeq=0, hold=0, holdTill=0, HOLD_MS=48;
     var ing=function(v){
       try{ if(typeof window.__x3fIngest==='function'){ window.__x3fIngest(v); return; } }catch(e){}
       try{ var lo=(typeof calLo==='function')?(+calLo()||0):0; force=(v>lo)?v-lo:0; }catch(e){}
     };
     window.__x3fDrv=setInterval(function(){ try{
       var v=+window.__x3fForce||0;
       /* THE PEAK CHANNEL, AND WHY IT IS A HOLD RATHER THAN AN EXTRA SAMPLE.
          The bar notifies at ~100 Hz and the shell forwards ~62 of them, so about a
          third of every set is dropped - and a fast concentric snap's true peak lands
          in a dropped packet more often than not, which is why every peak logged on
          the TV read low. The native side tracks the maximum across EVERY sample and
          publishes it as window.__x3fPeak with a sequence number, so nothing is lost
          on the way here.
          This loop used to spend it immediately: ing(peak) followed by ing(current) in
          the same tick. That reached exactly one consumer - a game whose peak lives
          inside onSample itself, which is Arena alone. Every other game reads its peak
          from x3f-set.js, and x3f-set.js does not listen to onSample at all: it WATCHES
          the force variable on its own 40 ms timer. Writing the peak and overwriting it
          microseconds later meant that sampler could never see it, so the peak the
          native side went to such trouble to preserve was destroyed on arrival, on the
          default game, silently - the second time in this file's history that peak has
          been lost to a shape nobody could see from one side alone.
          So the peak is not an extra sample; it is a floor under the channel for one
          full sampler period. A 25 Hz watcher cannot miss a 48 ms hold. It costs a
          descent that lags by up to 48 ms out of a two-to-three-second eccentric, and
          it keeps ONE conditioning path: everything still arrives through ing.
          The sequence number is what stops one published window being consumed twice. */
       var s=+window.__x3fSeq||0;
       if(s!==lastSeq){ lastSeq=s; var p=+window.__x3fPeak||0;
         if(p>v&&p>hold){ hold=p; holdTill=Date.now()+HOLD_MS; } }
       /* Cleared the moment the real signal catches up, so a rising pull is never
          flattened - the hold can only ever raise a falling sample, never lower one. */
       if(hold>0){ if(v>=hold||Date.now()>=holdTill) hold=0; else v=hold; }
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
