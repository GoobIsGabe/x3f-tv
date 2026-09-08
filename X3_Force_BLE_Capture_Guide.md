# X3 Force Bar → Custom Games: BLE Capture Guide

Goal: read the bar's live force data on your **Windows PC** so we can build our own
games. This guide gets me the two things I need:

1. **The Map** — which Bluetooth service/characteristic streams force.
2. **The Decoder Key** — how the raw bytes turn into an actual force number.

No hacking, no root, no risk to the bar or the official app. You'll use your
**Android** phone for capture and Chrome on Windows to run the games later.

---

## How this works (30-second version)

The X3 Force bar is a Bluetooth Low Energy (BLE) device. Inside it, a load cell
measures pull force. That number is published on one **characteristic** (think: a
labeled mailbox) that the official app *subscribes* to. Every time force changes,
the bar pushes new bytes to that mailbox. We just need to find the right mailbox
and learn how to read what's inside it. Once we know that, Chrome on your PC can
subscribe to the same mailbox using **Web Bluetooth** — and feed it into games.

Important: BLE devices usually allow **only one connection at a time**. So while
you're capturing with nRF Connect, the official X3 app must be fully closed, and
vice versa.

---

## PHASE 1 — Get the Map (nRF Connect, ~10 min)

**1. Install the tool**
On your Android phone, install **nRF Connect for Mobile** (by Nordic
Semiconductor) from the Play Store. It's the standard free BLE scanner.

**2. Close the official app**
Force-close the X3 Force app (swipe it away / App Info → Force Stop). Make sure
the bar isn't already paired-connected to it.

**3. Wake the bar**
Do whatever powers the bar's Bluetooth on (usually it advertises when you first
load a band / apply slight tension, or it has an on state).

**4. Scan**
Open nRF Connect → **SCANNER** tab → **SCAN**. Find the bar in the list — the
name is probably something like `X3`, `X3 Force`, `JBC`, or a random-looking name
with a strong signal (top of the list when the bar is right next to the phone).

➡️ **Send me:** the exact **device name** and the **MAC/BLE address** shown.

**5. Connect and dump the profile**
Tap **CONNECT** next to the bar. You'll see a list of **Services**, each
containing **Characteristics** with UUIDs and property tags (READ, WRITE,
NOTIFY, INDICATE).

➡️ **Send me:** a screenshot (or several) showing **every service and
characteristic UUID and its properties**. The one we care about most has
**NOTIFY** — that's the streaming force channel. There may also be a WRITE
characteristic used to start/tare the sensor.

**6. Turn on notifications and watch it move**
Find a characteristic with **NOTIFY**. Tap the subscribe icon (three downward
arrows) next to it. Now **physically apply force to the bar** (press/pull the
platform or band). If the value updates as you push, that's our force channel. 🎯

➡️ **Send me:** the **UUID of the characteristic that changes with force**, and
a note of whether the values are shown as hex or text.

---

## PHASE 2 — Get the Decoder Key (correlate bytes to force)

The bytes alone don't tell us the units. We need a few paired samples of
"raw bytes ↔ real force number." Two ways — do whichever is easier; the second
is more precise.

### Option A — Rough correlation in nRF Connect (fast)
While subscribed to the force characteristic:
- **Rest (no load):** note the hex value. (This is our zero baseline.)
- **Light steady pull:** hold roughly steady, note the hex.
- **Hard steady pull:** hold near max, note the hex.

➡️ **Send me** those 3–5 hex readings with a rough "low / medium / high" label.
That's usually enough to work out the number format (byte order + scale).

### Option B — Ground-truth with the real app (precise)
This captures the exact packets the official app sees, alongside the force number
the app displays, so we can decode units exactly.

1. On Android: **Settings → About phone → tap "Build number" 7×** to unlock
   Developer Options.
2. **Settings → System → Developer options → enable "Bluetooth HCI snoop log"**
   (set to "Enabled" / "Filtered"). Toggle Bluetooth off/on so it starts logging.
3. Open the **official X3 Force app**, connect the bar, and do a short set —
   a few reps at a few different intensities.
4. **Screen-record or note the force numbers the app shows** during that set.
5. Grab the log file: `btsnoop_hci.log` (location varies —
   `Developer options → "Take bug report"` bundles it, or it's under
   `/sdcard/` or `/data/misc/bluetooth/logs/`). If it's awkward to find, tell me
   your phone model and I'll give you the exact path.

➡️ **Send me:** the `btsnoop_hci.log` file **+** the force numbers you saw on
screen (with rough timing). I'll open it in Wireshark, line the packets up with
your numbers, and nail the exact encoding.

---

## What to send me (checklist)

- [ ] Device **name** + **BLE address**
- [ ] Screenshots of **all services/characteristics + properties**
- [ ] The **UUID that changes when you apply force** (the NOTIFY one)
- [ ] 3–5 **hex readings** labeled rest / low / med / high  *(Option A)*
- [ ] `btsnoop_hci.log` + on-screen force numbers  *(Option B, if you can)*

Any subset gets us started — even just Phase 1 lets me start building.

---

## Then: the games (Windows)

Once decoded, I build games as web pages that run in **Chrome on Windows** (and
Chrome on Android TV) using **Web Bluetooth** — Chrome connects to the bar
directly, no extra software. First one is the fun proof-of-life: a real-time
force meter + "hold the target zone" challenge. After that we go for the gains:
- **Progressive overload chaser** — beat your best peak/time-under-tension.
- **Boss fights** — sustained force drains the boss's HP; slack = it heals.
- **Rhythm/hold games** — match force curves for combos.
- **Auto-logging** — every session's peak force + total work saved so we can push
  targets up week over week.

---

### Notes / gotchas
- Only one thing connects to the bar at a time — close nRF Connect before testing
  Web Bluetooth, and close the official app before using nRF Connect.
- Web Bluetooth needs **Chrome or Edge** (not Firefox) and an HTTPS page or
  `localhost` — I'll handle that setup.
- We're only *reading* the sensor. We're not modifying the bar or the official
  app, and your existing X3 app keeps working normally.
