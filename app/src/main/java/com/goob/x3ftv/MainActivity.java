package com.goob.x3ftv;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * X3F TV v0.3 — a D-pad launcher for the X3F game suite, driven by the X3 Force bar over BLE.
 * All 8 BLE games are bundled; picking one loads it full-screen in a WebView with the bar's
 * force injected (window.__x3fForce). The TV remote is captured natively and drives in-game
 * focus/clicks (window.__x3fNav), scoped to whichever menu/modal is open — so the Upgrade Bay
 * etc. are navigable. Back returns to the launcher. Full-screen (mobile max-width overridden).
 */
public class MainActivity extends Activity {

    private static final UUID SERVICE  = UUID.fromString("e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CH_FORCE = UUID.fromString("e3458901-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CCCD     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final int  REQ_PERMS = 42;

    private static final String[][] GAMES = {
        {"Nova",      "nova.html"},
        {"Splash",    "splash.html"},
        {"Bloom",     "bloom.html"},
        {"Flow",      "flow.html"},
        {"Arena",     "arena.html"},
        {"Duel",      "duel.html"},
        {"Rhythm",    "rhythm.html"},
        {"Calibrate", "calibrate.html"},
    };
    private static final String[] BANDS = {"White", "Light Gray", "Dark Gray", "Black", "Elite Black"};

    private final Handler ui = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;

    private boolean scanning = false, connecting = false, connected = false;
    private String targetAddress = null;
    private double baseline = 0;
    private boolean haveBaseline = false;

    private FrameLayout root;
    private LinearLayout launcher;
    private TextView tvStatus, tvBand;
    private ListView gameList;
    private int bandIdx = 0;

    private WebView web;
    private boolean inGame = false, gameLoaded = false;
    private long lastInject = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        BluetoothManager mgr = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = (mgr != null) ? mgr.getAdapter() : null;
        if (adapter == null) { setStatus("Bar: no Bluetooth on this device", 0xFFFF5D78); return; }
        if (!adapter.isEnabled()) setStatus("Bar: turn on Bluetooth in TV settings", 0xFFFFD23F);
        ensurePermsThenScan();
    }

    // ---------- permissions ----------
    private void ensurePermsThenScan() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.BLUETOOTH_SCAN);
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.BLUETOOTH_CONNECT);
        } else {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (need.isEmpty()) startScan();
        else requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        boolean ok = res.length > 0;
        for (int r : res) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        if (ok) startScan();
        else setStatus("Bar: Bluetooth permission denied", 0xFFFF5D78);
    }

    // ---------- BLE scan / connect ----------
    private void startScan() {
        if (scanning || connected || connecting || adapter == null) return;
        try {
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { setStatus("Bar: Bluetooth is off", 0xFFFFD23F); return; }
            ScanSettings s = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
            scanner.startScan(null, s, scanCb);
            scanning = true;
            setStatus("Bar: scanning… (wake it — load a band)", 0xFFFFD23F);
        } catch (SecurityException e) {
            setStatus("Bar: missing Bluetooth permission", 0xFFFF5D78);
        }
    }

    private void stopScan() {
        if (!scanning || scanner == null) return;
        try { scanner.stopScan(scanCb); } catch (Exception ignored) {}
        scanning = false;
    }

    private final ScanCallback scanCb = new ScanCallback() {
        @Override public void onScanResult(int type, ScanResult result) {
            BluetoothDevice d = result.getDevice();
            String name = safeName(d, result);
            boolean hasService = result.getScanRecord() != null
                    && result.getScanRecord().getServiceUuids() != null
                    && result.getScanRecord().getServiceUuids().contains(new ParcelUuid(SERVICE));
            boolean looksLikeBar = (name != null && name.toUpperCase().contains("X3")) || hasService;
            if (looksLikeBar && !connecting && !connected) connectTo(d);
        }
        @Override public void onScanFailed(int errorCode) {
            setStatus("Bar: scan failed (code " + errorCode + ")", 0xFFFF5D78);
        }
    };

    private String safeName(BluetoothDevice d, ScanResult r) {
        String n = null;
        try {
            if (r.getScanRecord() != null) n = r.getScanRecord().getDeviceName();
            if (n == null) n = d.getName();
        } catch (SecurityException ignored) {}
        return n;
    }

    private void connectTo(BluetoothDevice d) {
        if (connecting || connected) return;
        connecting = true;
        targetAddress = d.getAddress();
        stopScan();
        setStatus("Bar: connecting…", 0xFFFFD23F);
        try {
            gatt = d.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE);
        } catch (SecurityException e) {
            setStatus("Bar: missing BLUETOOTH_CONNECT permission", 0xFFFF5D78);
            connecting = false;
        }
    }

    private void reconnect() {
        if (connected || connecting || adapter == null) return;
        if (targetAddress != null) {
            try {
                BluetoothDevice d = adapter.getRemoteDevice(targetAddress);
                connecting = true;
                setStatus("Bar: reconnecting…", 0xFFFFD23F);
                gatt = d.connectGatt(this, true, gattCb, BluetoothDevice.TRANSPORT_LE);
            } catch (Exception e) { startScan(); }
        } else startScan();
    }

    private void closeGatt() {
        if (gatt != null) { try { gatt.close(); } catch (Exception ignored) {} gatt = null; }
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothGatt.STATE_CONNECTED) {
                setStatus("Bar: connected — reading…", 0xFFFFD23F);
                try { g.discoverServices(); } catch (SecurityException ignored) {}
            } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                connected = false; connecting = false;
                setStatus("Bar: disconnected — reconnecting…", 0xFFFF5D78);
                ui.post(() -> { if (web != null && gameLoaded) { try { web.evaluateJavascript("window.__x3fForce=0;", null); } catch (Exception ignored) {} } });
                closeGatt();
                ui.postDelayed(MainActivity.this::reconnect, 1200);
            }
        }

        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService svc = g.getService(SERVICE);
            if (svc == null) {
                setStatus("Bar: wrong device — scanning…", 0xFFFF5D78);
                connecting = false; connected = false; closeGatt();
                ui.postDelayed(MainActivity.this::startScan, 800);
                return;
            }
            BluetoothGattCharacteristic ch = svc.getCharacteristic(CH_FORCE);
            if (ch == null) { setStatus("Bar: force channel not found", 0xFFFF5D78); return; }
            try {
                g.setCharacteristicNotification(ch, true);
                BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
                if (cccd != null) {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    g.writeDescriptor(cccd);
                }
                connected = true; connecting = false; haveBaseline = false;
                setStatus("Bar: LIVE — pick a game", 0xFF39F5C4);
            } catch (SecurityException e) {
                setStatus("Bar: missing BLUETOOTH_CONNECT permission", 0xFFFF5D78);
            }
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
        if (!inGame || !gameLoaded || web == null) return;
        long now = SystemClock.uptimeMillis();
        if (now - lastInject < 16) return;
        lastInject = now;
        final String js = "window.__x3fForce=" + (Math.round(force * 100) / 100.0) + ";";
        web.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignored) {} });
    }

    // JS bridge: game's Re-Zero button re-tares the bar natively
    private class Bridge {
        @JavascriptInterface public void reZero() { haveBaseline = false; }
    }

    // ---------- launch / return ----------
    private void launchGame(int idx) {
        if (idx < 0 || idx >= GAMES.length || web == null) return;
        inGame = true;
        gameLoaded = false;
        launcher.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.requestFocus();
        web.loadUrl("file:///android_asset/" + GAMES[idx][1]);
    }

    private void showLauncher() {
        inGame = false;
        gameLoaded = false;
        if (web != null) { web.setVisibility(View.GONE); try { web.loadUrl("about:blank"); } catch (Exception ignored) {} }
        launcher.setVisibility(View.VISIBLE);
        if (gameList != null) gameList.requestFocus();
    }

    private void nav(String dir) {
        if (web == null) return;
        web.evaluateJavascript("window.__x3fNav&&window.__x3fNav('" + dir + "')", null);
    }

    // ---------- key routing ----------
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (inGame && gameLoaded && e.getAction() == KeyEvent.ACTION_DOWN) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT:  nav("left");  return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: nav("right"); return true;
                case KeyEvent.KEYCODE_DPAD_UP:    nav("up");    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:  nav("down");  return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_BUTTON_A:   nav("enter"); return true;
                case KeyEvent.KEYCODE_BACK:       showLauncher(); return true;
            }
        }
        if (inGame && e.getAction() == KeyEvent.ACTION_UP) {
            // swallow the matching key-ups so they don't leak to the launcher underneath
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_BUTTON_A: case KeyEvent.KEYCODE_BACK: return true;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopScan();
        closeGatt();
        if (web != null) { web.destroy(); web = null; }
    }

    // ---------- UI ----------
    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF05030F);

        launcher = new LinearLayout(this);
        launcher.setOrientation(LinearLayout.VERTICAL);
        launcher.setBackgroundColor(0xFF05030F);
        int pad = dp(32);
        launcher.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("X3F  ·  FORCE BAR GAMES");
        title.setTextColor(0xFF8F7DFF);
        title.setTextSize(30);
        launcher.addView(title);

        tvStatus = new TextView(this);
        tvStatus.setText("Bar: starting…");
        tvStatus.setTextColor(0xFFA99FD6);
        tvStatus.setTextSize(16);
        tvStatus.setPadding(0, dp(6), 0, dp(14));
        launcher.addView(tvStatus);

        tvBand = new Button(this);
        updateBandLabel();
        tvBand.setAllCaps(false);
        tvBand.setTextSize(16);
        tvBand.setOnClickListener(v -> { bandIdx = (bandIdx + 1) % BANDS.length; updateBandLabel(); });
        launcher.addView(tvBand, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView pick = new TextView(this);
        pick.setText("Games");
        pick.setTextColor(0xFF6F6790);
        pick.setTextSize(13);
        pick.setPadding(0, dp(16), 0, dp(6));
        launcher.addView(pick);

        List<String> names = new ArrayList<>();
        for (String[] g : GAMES) names.add(g[0]);
        gameList = new ListView(this);
        ArrayAdapter<String> ga = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, names) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                View v = super.getView(position, convertView, parent);
                TextView t = v.findViewById(android.R.id.text1);
                if (t != null) { t.setTextColor(Color.WHITE); t.setTextSize(20); t.setPadding(dp(6), dp(10), 0, dp(10)); }
                return v;
            }
        };
        gameList.setAdapter(ga);
        gameList.setBackgroundColor(0xFF120A26);
        gameList.setOnItemClickListener((parent, view, pos, id) -> launchGame(pos));
        launcher.addView(gameList, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFF05030F);
        web.addJavascriptInterface(new Bridge(), "X3F");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                if (url != null && url.startsWith("file")) {
                    v.evaluateJavascript("window.__x3fBand='" + BANDS[bandIdx] + "';", null);
                    v.evaluateJavascript(BOOTSTRAP, null);
                    gameLoaded = true;
                }
            }
        });
        web.setVisibility(View.GONE);

        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(launcher, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        gameList.requestFocus();
    }

    private void updateBandLabel() {
        tvBand.setText("Band:  " + BANDS[bandIdx] + "   (OK to change)");
    }

    private void setStatus(String t, int color) {
        ui.post(() -> { if (tvStatus != null) { tvStatus.setText(t); tvStatus.setTextColor(color); } });
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    // Injected into each game after load: full-screen, force feed, band, and D-pad spatial nav.
    private static final String BOOTSTRAP = """
(function(){
 try{ window.__x3fNative=true; }catch(e){}
 try{ var st=document.getElementById('x3fCss'); if(!st){ st=document.createElement('style'); st.id='x3fCss';
   st.textContent='.app{max-width:none!important;width:100%!important}html,body{width:100%!important;height:100%!important}.x3f-focus{outline:4px solid #39f5c4!important;outline-offset:2px;border-radius:8px}';
   (document.head||document.documentElement).appendChild(st); } }catch(e){}
 try{ if(window.__x3fDrv)clearInterval(window.__x3fDrv);
   window.__x3fDrv=setInterval(function(){ try{ force=+window.__x3fForce||0; }catch(e){} },16); }catch(e){}
 try{ if(window.__x3fBand){ band=window.__x3fBand; if(typeof xset==='function')xset('band',band);
   try{ if(bandSel){ bandSel.value=band; } }catch(e){} try{ if(typeof buildBG==='function')buildBG(); }catch(e){} } }catch(e){}
 try{ var fr=document.getElementById('firstrun'); if(fr)fr.classList.remove('show'); }catch(e){}
 try{ if(typeof startRun==='function')startRun(); }catch(e){}
 try{ var z=document.getElementById('zeroBtn'); if(z){ z.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); try{ if(window.X3F&&X3F.reZero)X3F.reZero(); }catch(e){} },true); } }catch(e){}
 try{
  if(!window.__x3fNav){
   var cur=null, lastScope=null;
   function scope(){ var m=document.querySelectorAll('.scrim.show,.modal.show'); if(m&&m.length)return m[m.length-1]; return document; }
   function vis(el){ try{ if(!el||el.disabled)return false; if(el.tagName!=='BODY'&&el.offsetParent===null)return false; var r=el.getBoundingClientRect(); return r.width>4&&r.height>4&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth; }catch(e){return false;} }
   function items(){ var rootEl=scope(); var q=rootEl.querySelectorAll('button,select,input,a[href],.cta,.buy,.mini,.iconbtn,[role=button],[onclick]'); var a=[]; for(var i=0;i<q.length;i++) if(vis(q[i])) a.push(q[i]); return a; }
   function clear(){ if(cur){ cur.classList.remove('x3f-focus'); } cur=null; }
   function setFocus(el){ if(cur)cur.classList.remove('x3f-focus'); cur=el; if(cur){ cur.classList.add('x3f-focus'); try{cur.scrollIntoView({block:'nearest'});}catch(e){} try{cur.focus({preventScroll:true});}catch(e){} } }
   function ctr(el){ var r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }
   window.__x3fNav=function(dir){ try{
     var list=items(); if(!list.length){ clear(); return; }
     if(!cur||list.indexOf(cur)<0){ setFocus(list[0]); return; }
     if(dir==='enter'){ if(cur.tagName==='SELECT'){ cur.selectedIndex=(cur.selectedIndex+1)%cur.options.length; cur.dispatchEvent(new Event('change',{bubbles:true})); } else { cur.click(); } return; }
     var c=ctr(cur), best=null, bd=1e12;
     for(var i=0;i<list.length;i++){ var el=list[i]; if(el===cur)continue; var e=ctr(el), dx=e.x-c.x, dy=e.y-c.y;
       var ok=(dir==='left'&&dx<-4)||(dir==='right'&&dx>4)||(dir==='up'&&dy<-4)||(dir==='down'&&dy>4); if(!ok)continue;
       var along=(dir==='left'||dir==='right')?Math.abs(dx):Math.abs(dy), perp=(dir==='left'||dir==='right')?Math.abs(dy):Math.abs(dx);
       var d=along+perp*2.5; if(d<bd){bd=d;best=el;} }
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
