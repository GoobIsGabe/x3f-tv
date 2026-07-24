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
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * X3F Bar Probe — a TV-native app that auto-connects to the X3 Force bar over BLE
 * and shows the live force. Same protocol as the web games:
 *   service e3458900 / force char e3458901 (float64, little-endian), tared to a baseline.
 * This is step one of the full app: once the number moves on the TV, we add the games.
 */
public class MainActivity extends Activity {

    private static final UUID SERVICE  = UUID.fromString("e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CH_FORCE = UUID.fromString("e3458901-6ed5-40ff-aa3a-4e9a87ce1ad6");
    private static final UUID CCCD     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final int  REQ_PERMS = 42;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;

    private boolean scanning = false;
    private boolean connecting = false;
    private boolean connected = false;
    private String targetAddress = null;
    private double baseline = 0;
    private boolean haveBaseline = false;
    private double peak = 60;

    private TextView tvStatus, tvForce, tvHint, tvDev;
    private ProgressBar bar;
    private ListView list;
    private ArrayAdapter<String> listAdapter;
    private final List<BluetoothDevice> found = new ArrayList<>();
    private final List<String> labels = new ArrayList<>();

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
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
        else setStatus("Bluetooth permission denied — allow it to scan the bar", 0xFFFF5D78);
    }

    // ---------- scanning ----------
    private void startScan() {
        if (scanning || connected || connecting || adapter == null) return;
        try {
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { setStatus("Bluetooth is off", 0xFFFFD23F); return; }
            found.clear();
            labels.clear();
            ui.post(() -> {
                listAdapter.notifyDataSetChanged();
                list.setVisibility(View.VISIBLE);
                tvForce.setVisibility(View.GONE);
                bar.setVisibility(View.GONE);
            });
            ScanSettings s = new ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
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
        setStatus("Connecting to " + targetAddress + "…", 0xFFFFD23F);
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
                setStatus("Reconnecting to " + targetAddress + "…", 0xFFFFD23F);
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
                setStatus("Disconnected — reconnecting…", 0xFFFF5D78);
                ui.post(() -> { tvForce.setVisibility(View.GONE); bar.setVisibility(View.GONE); });
                closeGatt();
                ui.postDelayed(MainActivity.this::reconnect, 1200);
            }
        }

        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService svc = g.getService(SERVICE);
            if (svc == null) {
                setStatus("Connected, but no force service — not the bar. Pick another below.", 0xFFFF5D78);
                connecting = false; connected = false; closeGatt();
                ui.postDelayed(MainActivity.this::startScan, 800);
                return;
            }
            BluetoothGattCharacteristic ch = svc.getCharacteristic(CH_FORCE);
            if (ch == null) { setStatus("Force channel not found on the bar", 0xFFFF5D78); return; }
            try {
                g.setCharacteristicNotification(ch, true);
                BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
                if (cccd != null) {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    g.writeDescriptor(cccd);
                }
                connected = true; connecting = false; haveBaseline = false; peak = 60;
                setStatus("LIVE — pull the bar", 0xFF39F5C4);
                ui.post(() -> {
                    list.setVisibility(View.GONE);
                    tvForce.setVisibility(View.VISIBLE);
                    bar.setVisibility(View.VISIBLE);
                    tvDev.setText("Bar: " + targetAddress + "     ·     press OK to re-zero");
                    tvHint.setText("This confirms the TV reads the bar directly. Next build drops your games on top.");
                });
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
        final double force = Math.max(0, rawd - baseline);
        if (force > peak) peak = force;
        ui.post(() -> {
            tvForce.setText(String.valueOf(Math.round(force)));
            bar.setProgress((int) Math.max(0, Math.min(1000, force / Math.max(50, peak) * 1000)));
        });
    }

    // ---------- remote keys ----------
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER
                || keyCode == KeyEvent.KEYCODE_BUTTON_A) {
            if (connected) { haveBaseline = false; peak = 60; return true; }
        }
        return super.onKeyDown(keyCode, e);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopScan();
        closeGatt();
    }

    // ---------- UI ----------
    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF05030F);
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("X3F  ·  BAR PROBE");
        title.setTextColor(0xFF8F7DFF);
        title.setTextSize(26);
        root.addView(title);

        tvStatus = new TextView(this);
        tvStatus.setText("Starting…");
        tvStatus.setTextColor(0xFFA99FD6);
        tvStatus.setTextSize(18);
        tvStatus.setPadding(0, dp(6), 0, dp(10));
        root.addView(tvStatus);

        tvForce = new TextView(this);
        tvForce.setText("—");
        tvForce.setTextColor(0xFF39F5C4);
        tvForce.setTextSize(110);
        tvForce.setGravity(Gravity.CENTER);
        tvForce.setVisibility(View.GONE);
        root.addView(tvForce, weight(1f));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(1000);
        bar.setVisibility(View.GONE);
        root.addView(bar, fixedH(dp(18)));

        tvHint = new TextView(this);
        tvHint.setText("");
        tvHint.setTextColor(0xFF6F6790);
        tvHint.setTextSize(14);
        tvHint.setPadding(0, dp(8), 0, 0);
        root.addView(tvHint);

        tvDev = new TextView(this);
        tvDev.setText("Scanning…");
        tvDev.setTextColor(0xFFA99FD6);
        tvDev.setTextSize(15);
        tvDev.setPadding(0, dp(10), 0, dp(4));
        root.addView(tvDev);

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
        root.addView(list, weight(2f));

        setContentView(root);
    }

    private void setStatus(String t, int color) {
        ui.post(() -> { tvStatus.setText(t); tvStatus.setTextColor(color); });
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams weight(float w) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, w);
    }

    private LinearLayout.LayoutParams fixedH(int h) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, h);
    }
}
