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
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
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
 * X3F TV v0.2 — auto-connects to the X3 Force bar over BLE and runs Nova on the TV,
 * feeding live force straight into the game via a WebView (no phone, no relay).
 * BLE: service e3458900 / char e3458901 (float64 LE), tared to a baseline, then
 * injected as window.__x3fForce; the game reads it when window.__x3fNative is set.
 */
public class MainActivity extends Activity {

    private static final UUID SERVICE  = UUID.fromString("e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CH_FORCE = UUID.fromString("e3458901-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CCCD     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final int  REQ_PERMS = 42;
    private static final String GAME_URL = "file:///android_asset/nova-native.html";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;

    private boolean scanning = false, connecting = false, connected = false;
    private String targetAddress = null;
    private double baseline = 0;
    private boolean haveBaseline = false;

    private FrameLayout root;
    private LinearLayout overlay;
    private TextView tvStatus, tvDev;
    private ListView list;
    private ArrayAdapter<String> listAdapter;
    private final List<BluetoothDevice> found = new ArrayList<>();
    private final List<String> labels = new ArrayList<>();

    private WebView web;
    private boolean gameLoaded = false;
    private long lastInject = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        BluetoothManager mgr = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = (mgr != null) ? mgr.getAdapter() : null;
        if (adapter == null) { setStatus("No Bluetooth on this device", 0xFFFF5D78); return; }
        if (!adapter.isEnabled()) setStatus("Turn on Bluetooth in TV settings, then reopen", 0xFFFFD23F);
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
        else setStatus("Bluetooth permission denied — allow it to reach the bar", 0xFFFF5D78);
    }

    // ---------- scanning ----------
    private void startScan() {
        if (scanning || connected || connecting || adapter == null) return;
        try {
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { setStatus("Bluetooth is off", 0xFFFFD23F); return; }
            found.clear();
            labels.clear();
            ui.post(() -> { listAdapter.notifyDataSetChanged(); showOverlay(true); });
            ScanSettings s = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
            scanner.startScan(null, s, scanCb);
            scanning = true;
            setStatus("Scanning for the bar…", 0xFFFFD23F);
            ui.post(() -> tvDev.setText("Wake the bar (load a band). Pick it below if it doesn't auto-connect."));
        } catch (SecurityException e) {
            setStatus("Missing Bluetooth permission", 0xFFFF5D78);
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
            addDevice(d, name, result.getRssi());
            boolean looksLikeBar = (name != null && name.toUpperCase().contains("X3")) || hasService;
            if (looksLikeBar && !connecting && !connected) connectTo(d);
        }
        @Override public void onScanFailed(int errorCode) {
            setStatus("Scan failed (code " + errorCode + ")", 0xFFFF5D78);
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

    private void addDevice(BluetoothDevice d, String name, int rssi) {
        for (BluetoothDevice x : found) if (x.getAddress().equals(d.getAddress())) return;
        found.add(d);
        labels.add((name != null ? name : "(unnamed)") + "    " + d.getAddress() + "    " + rssi + " dBm");
        ui.post(listAdapter::notifyDataSetChanged);
    }

    // ---------- connect ----------
    private void connectTo(BluetoothDevice d) {
        if (connecting || connected) return;
        connecting = true;
        targetAddress = d.getAddress();
        stopScan();
        setStatus("Connecting to bar…", 0xFFFFD23F);
        try {
            gatt = d.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE);
        } catch (SecurityException e) {
            setStatus("Missing BLUETOOTH_CONNECT permission", 0xFFFF5D78);
            connecting = false;
        }
    }

    private void reconnect() {
        if (connected || connecting || adapter == null) return;
        if (targetAddress != null) {
            try {
                BluetoothDevice d = adapter.getRemoteDevice(targetAddress);
                connecting = true;
                setStatus("Reconnecting…", 0xFFFFD23F);
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
                setStatus("Connected — reading services…", 0xFFFFD23F);
                try { g.discoverServices(); } catch (SecurityException ignored) {}
            } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                connected = false;
                connecting = false;
                setStatus("Bar disconnected — reconnecting…", 0xFFFF5D78);
                ui.post(() -> { if (web != null && gameLoaded) { try { web.evaluateJavascript("window.__x3fForce=0;", null); } catch (Exception ignored) {} } });
                closeGatt();
                ui.postDelayed(MainActivity.this::reconnect, 1200);
            }
        }

        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService svc = g.getService(SERVICE);
            if (svc == null) {
                setStatus("Not the bar (no force service) — scanning…", 0xFFFF5D78);
                connecting = false; connected = false; closeGatt();
                ui.postDelayed(MainActivity.this::startScan, 800);
                return;
            }
            BluetoothGattCharacteristic ch = svc.getCharacteristic(CH_FORCE);
            if (ch == null) { setStatus("Force channel not found", 0xFFFF5D78); return; }
            try {
                g.setCharacteristicNotification(ch, true);
                BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
                if (cccd != null) {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    g.writeDescriptor(cccd);
                }
                connected = true; connecting = false; haveBaseline = false;
                setStatus("LIVE", 0xFF39F5C4);
                ui.post(MainActivity.this::launchGame);
            } catch (SecurityException e) {
                setStatus("Missing BLUETOOTH_CONNECT permission", 0xFFFF5D78);
            }
        }

        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch, byte[] value) {
            handleForce(value);
        }

        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch) {
            handleForce(ch.getValue());
        }
    };

    private void handleForce(byte[] v) {
        if (v == null || v.length < 8) return;
        double rawd = ByteBuffer.wrap(v).order(ByteOrder.LITTLE_ENDIAN).getDouble();
        if (!haveBaseline) { baseline = rawd; haveBaseline = true; }
        injectForce(Math.max(0, rawd - baseline));
    }

    // ---------- game / webview ----------
    private void launchGame() {
        showOverlay(false);
        if (web != null) {
            web.setVisibility(View.VISIBLE);
            if (!gameLoaded) web.loadUrl(GAME_URL); // onPageFinished flips gameLoaded + native flag
        }
    }

    private void injectForce(double force) {
        if (!gameLoaded || web == null) return;
        long now = SystemClock.uptimeMillis();
        if (now - lastInject < 16) return;   // cap ~60 Hz
        lastInject = now;
        final String js = "window.__x3fForce=" + (Math.round(force * 100) / 100.0) + ";";
        web.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignored) {} });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            int k = e.getKeyCode();
            if ((k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_BUTTON_A)
                    && connected && gameLoaded) {
                haveBaseline = false;   // OK re-zeros the bar
                return true;
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

        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setBackgroundColor(0xFF05030F);
        int pad = dp(28);
        overlay.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("X3F  ·  NOVA");
        title.setTextColor(0xFF8F7DFF);
        title.setTextSize(26);
        overlay.addView(title);

        tvStatus = new TextView(this);
        tvStatus.setText("Starting…");
        tvStatus.setTextColor(0xFFA99FD6);
        tvStatus.setTextSize(18);
        tvStatus.setPadding(0, dp(6), 0, dp(10));
        overlay.addView(tvStatus);

        tvDev = new TextView(this);
        tvDev.setText("Scanning…");
        tvDev.setTextColor(0xFFA99FD6);
        tvDev.setTextSize(15);
        tvDev.setPadding(0, dp(10), 0, dp(4));
        overlay.addView(tvDev);

        list = new ListView(this);
        listAdapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, labels) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                View v = super.getView(position, convertView, parent);
                TextView t = v.findViewById(android.R.id.text1);
                if (t != null) { t.setTextColor(Color.WHITE); t.setTextSize(16); }
                return v;
            }
        };
        list.setAdapter(listAdapter);
        list.setBackgroundColor(0xFF120A26);
        list.setOnItemClickListener((parent, view, pos, id) -> {
            if (pos >= 0 && pos < found.size()) { haveBaseline = false; connectTo(found.get(pos)); }
        });
        overlay.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);   // localStorage persistence for scores/history
        ws.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFF05030F);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript("window.__x3fNative=true;", null);
                gameLoaded = true;
            }
        });
        web.setVisibility(View.GONE);

        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private void showOverlay(boolean show) {
        if (overlay != null) overlay.setVisibility(show ? View.VISIBLE : View.GONE);
        if (web != null && show) web.setVisibility(View.GONE);
    }

    private void setStatus(String t, int color) {
        ui.post(() -> { if (tvStatus != null) { tvStatus.setText(t); tvStatus.setTextColor(color); } });
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
