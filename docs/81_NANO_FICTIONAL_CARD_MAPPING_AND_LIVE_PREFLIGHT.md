# Nano fictional card mapping and live-capture preflight

21 November 2026. **Mapping: PASS as owner-reported. Live capture: NOT AUTHORIZED / PREFLIGHT INCOMPLETE.** This records the private-HMAC mapping milestone and the current gate review. No serial capture, SQLite queue access, gateway delivery, firmware change, Pi Supabase restart, network change, commit or push occurred in this continuation.

## Mapping result

The owner reports the physical card was mapped to the previously registered fictional Nano learner using a private HMAC lookup. The sanitized result reports:

- fictional school capability scope matched;
- local config permissions `0600`;
- raw UID was neither printed nor stored;
- SQLite queue and database were not accessed or written;
- capture and delivery remain disabled;
- Nano identity/signing key were not regenerated.

No UID, HMAC, capability, key, account credential, or mapping configuration is reproduced here. The mapping was performed in the Pi-local owner-controlled environment; this assistant did not independently read the private configuration.

## Read-only preservation and guard review

The approved Windows QA read-only preservation check was rerun after the mapping report:

- Existing software-simulator gate event: **1**; receipt: **1**; matching payload and immutable assignment: **PASS**.
- Classroom attendance: **0** for the verified simulator event.
- All **20 protected-school dataset hashes unchanged**.
- Check used authorized service-client SELECTs only; no sign-ins or source event writes.

The already deployed Pi safeguards were reviewed against their source and recorded non-live tests (Milestone 80):

- Approval contract is restricted to `nano_rc522`, the enrolled device/school/session/reader IDs, exact FTDI identity `0403:6001:BG02XZ38`, and the stable `/dev/serial/by-id/` path. It requires `fictionalOnly: true`, `maxNewEvents: 1`, `maxRequests: 2`, an unexpired approval, and the reviewed enrollment/capability.
- Capture hard-limits the serial run to one newly durable event. It refuses a previously used session or a device with existing queue events before opening serial. It does not invoke the HTTP delivery transport.
- Capture opens the existing gateway SQLite store with interrupted-work recovery disabled. It shares the existing queue; it does not create a competing queue or recover/alter unrelated queued events. Capture is a **local durable queue write** if a valid scan is accepted.
- Delivery is a separate CLI mode requiring a separate approval bound to one exact event ID and payload hash; it selects only that row, uses the existing signed v2 transport/receipt logic, limits requests to two, and suppresses recovery of unrelated work.
- The bounded/legacy gateway mocked suite passed **38/38** on deployment. Existing M7 serial suite passed **21**, with **1 skipped** of 22. These are software tests, not physical capture evidence.

The Windows QA database check confirms the fictional device/capability/assignment were valid and isolated when registered. It is not a fresh Pi-side verification of the private mapping file or a current revocation check.

## Outstanding preflight gates

No live approval JSON was created during mapping. The CLI also refuses capture unless the reviewed config explicitly records the operator’s reset-risk acceptance and closed-monitor confirmation. Those fields were left false by mapping preparation. The existing code requires both to be set true in an owner-reviewed config, and requires a separate, current, unexpired `live-approval.json`. The CLI itself is fail-closed if any requirement is absent or mismatched.

I cannot independently confirm from this session that the expected Pi config/approval files are present, correctly scoped, or absent: there is no direct Pi filesystem session available here. The owner-provided mapping summary is not a substitute for that read-only Pi preflight. **Do not run capture yet.** Before requesting capture authorization, run a reviewed read-only check on the Pi that confirms, without displaying values:

1. `reviewed.json` is owner-owned mode `0600`; it contains the already registered Nano device and fictional school/session/reader scope, exact FTDI/by-id source, 30-second duration, and valid signed capability; the HMAC mapping is present without printing either digest or UID.
2. The capability is still valid and matches the enrolled fictional assignment and device.
3. No Pi queue row exists for this device/session and the simulator row(s) are unchanged; perform this with a read-only SQLite connection only if separately safe, and do not run normal gateway startup/recovery.
4. No unexpected `live-approval.json` exists. If one does exist, stop and inspect its scope without printing it.
5. The user reconfirms Serial Monitor is closed and accepts the known possible Nano reset behavior for the selected DTR/RTS settings. The current mapping config deliberately does not assert those confirmations.

The one-event budget and exact source checks are verified from deployed code/tests, but approval-file contents, live authorization expiry, actual Pi queue state and current operator reset/monitor confirmations remain **unverified** here. This is the remaining blocker to a pass-ready live command.

## Proposed capture command — for a later separately approved run only

This command is intentionally **not run** and is not authorized by the mapping approval. First, identify the single reviewed enrollment directory and complete the read-only preflight above. Then an owner-approved `live-approval.json` must exist in that same private directory, and its scope and expiry must match the reviewed config. The config must also reflect fresh operator confirmation of the reset risk and closed Serial Monitor. Do not create or edit those files by copying example values or reusing an expired approval.

From `/home/schovera/Schovera`, after those gates and a separate explicit capture approval, the intended one-time command shape is:

```bash
cd /home/schovera/Schovera
set -euo pipefail
mapfile -t configs < <(find "$PWD/.local/physical-rfid" -mindepth 2 -maxdepth 2 -type f -name reviewed.json -print)
if [ "${#configs[@]}" -ne 1 ]; then
  printf 'STOP: expected exactly one reviewed Nano config; found %s\n' "${#configs[@]}" >&2
  exit 1
fi
CFG="${configs[0]}"
APPROVAL="$(dirname "$CFG")/live-approval.json"
DB="$PWD/.local/schovera-rfid-gateway/gateway.sqlite"
if [ ! -f "$APPROVAL" ]; then
  printf 'STOP: approved live-approval.json is absent\n' >&2
  exit 1
fi
read_scope() {
  node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const k=process.argv[2]; const v=k==="school"?c.binding.schoolId:k==="session"?c.binding.sessionId:c.enrollment.deviceId; if(typeof v!=="string")process.exit(2); process.stdout.write(v)' "$CFG" "$1"
}
node scripts/physical-rfid/bounded-test-cli.mjs capture \
  --config "$CFG" \
  --approval "$APPROVAL" \
  --database "$DB" \
  --confirm-school "$(read_scope school)" \
  --confirm-session "$(read_scope session)" \
  --confirm-device "$(read_scope device)"
```

This requires the **existing SSH tunnel and local Windows API to remain in place only for later delivery**; capture itself does not contact the API. A successful capture writes exactly one local SQLite event and closes the serial port; it does not send that event. A subsequent delivery command would be a separate action requiring a second explicit approval bound to that exact captured event ID and payload hash. Do not run delivery as part of capture approval.

## Handoff

Mapping is recorded as successful based on the owner’s sanitized result. No physical acceptance beyond the earlier read-only three-frame diagnostic is implied. Before a live capture request, finish the Pi-local read-only preflight, then provide the sanitized booleans/counts only. At that point review the exact fresh capture approval scope and request separate approval. Preserve the simulator evidence, SQLite queue, protected datasets, Pi Supabase stopped state, firmware and network configuration.

The synthetic demo account credentials were accidentally exposed in an earlier ignored local evidence output; they were not changed here. Rotate them before use and keep them out of logs/chat.
