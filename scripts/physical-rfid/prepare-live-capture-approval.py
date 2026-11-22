#!/usr/bin/env python3
"""Prepare one short-lived, capture-only Nano approval after fresh consent.

This helper is intended to be reviewed locally, then separately transferred and
authorized for execution on the Pi. It never opens serial, starts the gateway,
contacts a backend, or writes SQLite. It updates only two reviewed.json booleans
and creates one owner-only live-approval.json. All other files are read-only.
"""

from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import urllib.parse


REPO = pathlib.Path("/home/schovera/Schovera")
USB_ID = "0403:6001:BG02XZ38"
PORT = pathlib.Path(
    "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0"
)
DB_RELATIVE = pathlib.Path(".local/schovera-rfid-gateway/gateway.sqlite")
EXPECTED_RESPONSE_SHA256 = (
    "c52defb2ff39247e7214deca10b1684c3cd3c1d6996bbbb30abf182bb271e383"
)
MAX_APPROVAL_SECONDS = 300
UUID = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")
HEX64 = re.compile(r"^[a-f0-9]{64}$")

NODE_VERIFY = r'''
import fs from "node:fs";
import {createHash, createPublicKey} from "node:crypto";
import {verifyAssignmentCapability} from "./scripts/rfid-simulator/event-v2.ts";
const [configPath, responsePath, requestPath] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(configPath, "utf8"));
const r = JSON.parse(fs.readFileSync(responsePath, "utf8"));
const q = JSON.parse(fs.readFileSync(requestPath, "utf8"));
const eq = (a,b) => a === b;
const hex64 = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
if (r.mode !== "fictional_nano_enrollment_only" ||
    r.hardwareType !== "nano_rc522" || r.usbIdentity !== "0403:6001:BG02XZ38" ||
    r.liveCaptureApproved !== false || r.deliveryApproved !== false ||
    r.sourceDeploymentApproved !== false || c.version !== 1 ||
    c.binding?.version !== 1 || c.binding?.mode !== "physical_legacy_host_receipt_time" ||
    c.binding?.reviewedEnrollment !== true || c.binding?.eventType !== "check_in" ||
    c.serial?.port !== "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0" ||
    c.serial?.usbId !== r.usbIdentity || c.serial?.seconds !== 30 || c.serial?.dtr !== "off" ||
    c.serial?.resetRiskAccepted !== false || c.serial?.monitorClosedConfirmed !== false ||
    c.binding?.sourceIdentity !== r.usbIdentity || !hex64(c.binding?.uidKey) ||
    !hex64(c.binding?.uidDigest) || !hex64(c.enrollment?.readerKey) ||
    Object.hasOwn(c.binding, "uid") || Object.hasOwn(c.enrollment, "studentId") ||
    Object.hasOwn(c.enrollment, "devicePrivateKey") ||
    !eq(c.binding.schoolId, r.schoolId) || !eq(c.binding.sessionId, r.captureSessionId) ||
    !eq(c.enrollment.deviceId, r.deviceId) || !eq(c.enrollment.readerId, r.readerId) ||
    !eq(c.enrollment.assignmentId, r.assignmentId) ||
    !eq(c.enrollment.assignmentVersion, r.assignmentVersion) ||
    !eq(c.enrollment.credentialRef, r.credentialRef) ||
    !eq(c.enrollment.capability, r.capability) ||
    !eq(c.binding.capabilityPublicKey, r.capabilityPublicKey) ||
    !eq(q.requestId, r.requestId) || !eq(q.hardwareType, r.hardwareType) ||
    !eq(q.usbIdentity, r.usbIdentity) ||
    createHash("sha256").update(q.verificationPublicKey).digest("hex") !== r.devicePublicKeySha256) {
  console.error("scope_refused"); process.exit(1);
}
const now = Math.floor(Date.now() / 1000);
const v = verifyAssignmentCapability(r.capability, createPublicKey(r.capabilityPublicKey), now);
if (!v.ok || !v.timeValid || v.claims.expires_at <= now + 300 ||
    v.claims.device_id !== r.deviceId || v.claims.school_id !== r.schoolId ||
    v.claims.assignment_id !== r.assignmentId ||
    v.claims.assignment_version !== r.assignmentVersion ||
    v.claims.credential_ref !== r.credentialRef) {
  console.error("capability_refused"); process.exit(1);
}
console.log("OFFLINE_SCOPE_PASS");
'''


class Refusal(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def require(condition: bool, code: str) -> None:
    if not condition:
        raise Refusal(code)


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate json key")
        result[key] = value
    return result


def enable_confirmation_fields(raw: bytes) -> bytes:
    updated = raw
    for key in (b"resetRiskAccepted", b"monitorClosedConfirmed"):
        quoted = b'"' + key + b'"'
        require(updated.count(quoted) == 1, "confirmation_field_ambiguity")
        pattern = re.compile(b'(' + re.escape(quoted) + rb'\s*:\s*)false\b')
        updated, count = pattern.subn(rb'\1true', updated, count=1)
        require(count == 1, "confirmation_field_not_false")
    return updated


def safe_stat(path: pathlib.Path, mode: int = 0o600, size: int | None = None) -> os.stat_result:
    try:
        s = path.lstat()
    except OSError:
        raise Refusal("required_file_unavailable") from None
    require(stat.S_ISREG(s.st_mode), "file_type_refused")
    require(not path.is_symlink(), "symlink_refused")
    require(s.st_uid == os.getuid(), "file_owner_refused")
    require(stat.S_IMODE(s.st_mode) == mode, "file_mode_refused")
    if size is not None:
        require(s.st_size == size, "file_size_refused")
    return s


def check_dir(path: pathlib.Path) -> None:
    try:
        s = path.lstat()
    except OSError:
        raise Refusal("directory_unavailable") from None
    require(stat.S_ISDIR(s.st_mode) and not path.is_symlink(), "directory_type_refused")
    require(s.st_uid == os.getuid(), "directory_owner_refused")
    require((s.st_mode & 0o022) == 0, "directory_permissions_refused")


def discover_config(root: pathlib.Path) -> pathlib.Path:
    check_dir(root)
    candidates: list[pathlib.Path] = []
    try:
        for entry in root.iterdir():
            if entry.is_symlink():
                raise Refusal("symlink_under_private_root")
            if entry.is_dir() and (entry / "reviewed.json").exists():
                candidates.append(entry / "reviewed.json")
    except OSError:
        raise Refusal("private_root_unreadable") from None
    require(len(candidates) == 1, "expected_exactly_one_reviewed_config")
    return candidates[0]


def no_approval_files(root: pathlib.Path, allowed: pathlib.Path | None = None) -> None:
    for base, dirs, files in os.walk(root, followlinks=False):
        if any((pathlib.Path(base) / d).is_symlink() for d in dirs):
            raise Refusal("symlink_under_private_root")
        for name in files:
            if name == "live-approval.json":
                candidate = pathlib.Path(base) / name
                require(allowed is not None and candidate == allowed,
                        "approval_already_exists")


def call_node(config: pathlib.Path, response: pathlib.Path, request: pathlib.Path) -> None:
    version = subprocess.run(
        ["node", "--version"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, check=False, cwd=str(REPO),
    )
    require(version.returncode == 0, "node_unavailable")
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", version.stdout.strip())
    require(match is not None, "node_version_unknown")
    require(tuple(map(int, match.groups())) >= (22, 18, 0), "node_type_stripping_unsupported")
    env = shutil.which("env")
    require(env is not None, "env_command_unavailable")
    result = subprocess.run(
        [env, "-u", "NODE_OPTIONS", "-u", "NODE_PATH", "node", "--input-type=module", "-",
         str(config), str(response), str(request)],
        input=NODE_VERIFY, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, check=False, cwd=str(REPO),
    )
    require(result.returncode == 0 and result.stdout.strip() == "OFFLINE_SCOPE_PASS",
            "offline_scope_or_capability_refused")


def run_checked(args: list[str], code: str, accepted: set[int] = {0}) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, check=False)
    except OSError:
        raise Refusal(code) from None
    require(result.returncode in accepted and not result.stderr, code)
    return result


def check_serial_identity(port: pathlib.Path) -> None:
    require(port.is_symlink() and port.exists(), "stable_serial_path_missing")
    require(stat.S_ISCHR(port.stat().st_mode), "serial_device_type_refused")
    udev = run_checked(["udevadm", "info", "--query=property", "--name", str(port)],
                       "udev_identity_unavailable")
    properties = {}
    for line in udev.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            properties[key] = value
    require(properties.get("ID_VENDOR_ID") == "0403" and
            properties.get("ID_MODEL_ID") == "6001" and
            properties.get("ID_SERIAL_SHORT") == "BG02XZ38", "ftdi_identity_mismatch")
    # fuser returns 1 with no owner, 0 with an owner. Any stderr or other code fails closed.
    result = run_checked(["fuser", "-s", str(port)], "serial_owner_check_failed", {1})
    require(not result.stdout, "serial_port_in_use")


def db_fingerprint(path: pathlib.Path) -> tuple[str, tuple[int, int, int]]:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    s = path.stat()
    return h.hexdigest(), (s.st_ino, s.st_size, s.st_mtime_ns)


def read_queue_snapshot(path: pathlib.Path, device_id: str, session_id: str):
    for suffix in ("-wal", "-shm", "-journal"):
        require(not pathlib.Path(str(path) + suffix).exists(), "sqlite_sidecar_present")
    s = safe_stat(path, mode=0o600)
    run_checked(["fuser", "-s", str(path)], "sqlite_owner_check_failed", {1})
    before = db_fingerprint(path)
    uri = "file:" + urllib.parse.quote(str(path), safe="/") + "?mode=ro&immutable=1"
    try:
        con = sqlite3.connect(uri, uri=True)
        try:
            con.execute("PRAGMA query_only=ON")
            require(con.execute("PRAGMA user_version").fetchone()[0] == 2, "sqlite_schema_refused")
            require(con.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "sqlite_integrity_failed")
            tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            require({"gateway_readers", "gateway_events"}.issubset(tables), "sqlite_tables_refused")
            nano_events = con.execute(
                "SELECT COUNT(*) FROM gateway_events WHERE device_id=?", (device_id,)
            ).fetchone()[0]
            nano_readers = con.execute(
                "SELECT COUNT(*) FROM gateway_readers WHERE device_id=?", (device_id,)
            ).fetchone()[0]
            nano_sessions = 0
            if "physical_legacy_sessions" in tables:
                nano_sessions = con.execute(
                    "SELECT COUNT(*) FROM physical_legacy_sessions WHERE session_id=?", (session_id,)
                ).fetchone()[0]
            other_events = con.execute(
                "SELECT COUNT(*) FROM gateway_events WHERE device_id<>?", (device_id,)
            ).fetchone()[0]
            other_receipts = con.execute(
                "SELECT COUNT(*) FROM gateway_events WHERE device_id<>? AND remote_receipt_id IS NOT NULL",
                (device_id,),
            ).fetchone()[0]
        finally:
            con.close()
    except Refusal:
        raise
    except BaseException:
        raise Refusal("sqlite_read_only_check_failed") from None
    after = db_fingerprint(path)
    require(before == after, "sqlite_changed_during_preflight")
    require(nano_events == 0 and nano_readers == 0 and nano_sessions == 0,
            "nano_queue_not_fresh")
    # This is the exact sanitized Pi queue baseline reported for Milestone 81.
    require(other_events == 1 and other_receipts == 1, "other_device_queue_baseline_changed")
    return other_events, other_receipts, before


def atomic_private_write(path: pathlib.Path, data: bytes,
                         created_files: dict[pathlib.Path, tuple[int, int]],
                         mode: int = 0o600) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, mode)
    created = None
    try:
        created = os.fstat(fd)
        created_files[path] = (created.st_dev, created.st_ino)
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        cleaned = False
        try:
            s = path.lstat()
            if (stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and
                    stat.S_IMODE(s.st_mode) == mode and
                    created is not None and
                    (s.st_dev, s.st_ino) == (created.st_dev, created.st_ino)):
                path.unlink()
                fsync_dir(path.parent)
                created_files.pop(path, None)
                cleaned = True
        except OSError:
            pass
        if not cleaned:
            raise Refusal("partial_file_cleanup_failed") from None
        raise
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


def fsync_dir(path: pathlib.Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def remove_owned_file(path: pathlib.Path, created_files: dict[pathlib.Path, tuple[int, int]]) -> None:
    identity = created_files.get(path)
    if identity is None:
        return
    try:
        s = path.lstat()
    except FileNotFoundError:
        created_files.pop(path, None)
        return
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and
            stat.S_IMODE(s.st_mode) == 0o600 and (s.st_dev, s.st_ino) == identity,
            "cleanup_file_identity_changed")
    path.unlink()
    fsync_dir(path.parent)
    created_files.pop(path, None)


def validate_approval(a: dict, c: dict, response: dict, start: dt.datetime) -> None:
    expected_keys = {
        "version", "hardwareType", "fictionalOnly", "maxNewEvents", "maxRequests",
        "deviceId", "schoolId", "sessionId", "readerId", "devicePublicKeySha256", "expiresAt",
    }
    require(set(a) == expected_keys, "approval_shape_refused")
    require(a["version"] == 1 and a["hardwareType"] == "nano_rc522" and
            a["fictionalOnly"] is True and a["maxNewEvents"] == 1 and a["maxRequests"] == 2,
            "approval_limits_refused")
    require(a["deviceId"] == c["enrollment"]["deviceId"] == response["deviceId"] and
            a["schoolId"] == c["binding"]["schoolId"] == response["schoolId"] and
            a["sessionId"] == c["binding"]["sessionId"] == response["captureSessionId"] and
            a["readerId"] == c["enrollment"]["readerId"] == response["readerId"] and
            a["devicePublicKeySha256"] == response["devicePublicKeySha256"] and
            HEX64.fullmatch(a["devicePublicKeySha256"]), "approval_scope_refused")
    require(all(isinstance(a[k], str) and UUID.fullmatch(a[k])
                for k in ("deviceId", "schoolId", "sessionId", "readerId")),
            "approval_identifier_invalid")
    try:
        expiry = dt.datetime.fromisoformat(a["expiresAt"].replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise Refusal("approval_expiry_invalid") from None
    require(expiry.tzinfo is not None and dt.datetime.now(dt.timezone.utc) < expiry <=
            start + dt.timedelta(seconds=MAX_APPROVAL_SECONDS),
            "approval_expiry_refused")
    require("eventId" not in a and "payloadSha256" not in a, "delivery_scope_in_approval")


def main() -> None:
    require(pathlib.Path.cwd() == REPO, "run_from_pi_repository_root")
    require(os.name == "posix" and sys.platform.startswith("linux"), "linux_pi_required")
    require(os.getuid() != 0, "do_not_run_as_root")
    check_dir(REPO / ".local")
    root = REPO / ".local/physical-rfid"
    check_dir(root)
    cfg_path = discover_config(root)
    directory = cfg_path.parent
    check_dir(directory)
    response_path = directory / "transfer-response.json"
    request_path = directory / "public-request.json"
    approval_path = directory / "live-approval.json"
    no_approval_files(root)

    cfg_stat = safe_stat(cfg_path)
    safe_stat(response_path, size=1603)
    safe_stat(request_path)
    # Private key metadata only: no contents are opened or read.
    safe_stat(directory / "device-private.pem")
    response_bytes = response_path.read_bytes()
    require(hashlib.sha256(response_bytes).hexdigest() == EXPECTED_RESPONSE_SHA256,
            "reviewed_response_checksum")
    config_bytes = cfg_path.read_bytes()
    config_sha256 = hashlib.sha256(config_bytes).digest()
    try:
        config = json.loads(config_bytes, object_pairs_hook=reject_duplicate_keys)
        response = json.loads(response_bytes, object_pairs_hook=reject_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError):
        raise Refusal("private_json_invalid") from None
    require(config["serial"]["resetRiskAccepted"] is False and
            config["serial"]["monitorClosedConfirmed"] is False,
            "operator_flags_not_in_expected_initial_state")

    # Check signed capability and enrollment scope in the installed Node runtime.
    call_node(cfg_path, response_path, request_path)
    check_serial_identity(PORT)
    other_events, other_receipts, db_snapshot = read_queue_snapshot(
        REPO / DB_RELATIVE, config["enrollment"]["deviceId"], config["binding"]["sessionId"]
    )
    no_approval_files(root)

    print("PREFLIGHT PASS: config, response, assignment scope and capability verified")
    print("PREFLIGHT PASS: HMAC mapping fields present; no UID or secret displayed")
    print("PREFLIGHT PASS: FTDI identity matches; port has no owner")
    print("PREFLIGHT PASS: approval absent; Nano event/reader/session counts are zero")
    print(f"BASELINE: other-device events={other_events}; receipts={other_receipts}")
    print("PREFLIGHT PASS: SQLite integrity and immutable read-only snapshot verified")

    monitor = input("Confirm Serial Monitor/Plotter is closed; type CLOSED: ").strip()
    require(monitor == "CLOSED", "monitor_confirmation_missing")
    reset = input("Accept possible Nano USB reset on port open; type ACCEPT-RESET: ").strip()
    require(reset == "ACCEPT-RESET", "reset_risk_not_accepted")

    # Fresh confirmation is recorded only after prompts; repeat volatile checks.
    call_node(cfg_path, response_path, request_path)
    check_serial_identity(PORT)
    no_approval_files(root)
    current_queue = read_queue_snapshot(
        REPO / DB_RELATIVE, config["enrollment"]["deviceId"], config["binding"]["sessionId"]
    )
    require(current_queue == (other_events, other_receipts, db_snapshot),
            "sqlite_changed_before_write")
    require(hashlib.sha256(cfg_path.read_bytes()).digest() == config_sha256,
            "config_content_changed_before_write")
    require(hashlib.sha256(response_path.read_bytes()).hexdigest() == EXPECTED_RESPONSE_SHA256,
            "response_changed_before_write")
    current_cfg_stat = cfg_path.lstat()
    require((cfg_stat.st_ino, cfg_stat.st_size, cfg_stat.st_mtime_ns) ==
            (current_cfg_stat.st_ino, current_cfg_stat.st_size, current_cfg_stat.st_mtime_ns),
            "config_changed_before_write")
    require(not approval_path.exists() and not approval_path.is_symlink(), "approval_path_exists")

    updated = copy.deepcopy(config)
    updated["serial"]["resetRiskAccepted"] = True
    updated["serial"]["monitorClosedConfirmed"] = True
    require({k: v for k, v in updated["serial"].items()
             if k not in {"resetRiskAccepted", "monitorClosedConfirmed"}} ==
            {k: v for k, v in config["serial"].items()
             if k not in {"resetRiskAccepted", "monitorClosedConfirmed"}}, "unexpected_config_change")

    start = dt.datetime.now(dt.timezone.utc)
    expiry = start + dt.timedelta(seconds=MAX_APPROVAL_SECONDS)
    approval = {
        "version": 1,
        "hardwareType": "nano_rc522",
        "fictionalOnly": True,
        "maxNewEvents": 1,
        "maxRequests": 2,
        "deviceId": response["deviceId"],
        "schoolId": response["schoolId"],
        "sessionId": response["captureSessionId"],
        "readerId": response["readerId"],
        "devicePublicKeySha256": response["devicePublicKeySha256"],
        "expiresAt": expiry.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }
    validate_approval(approval, updated, response, start)
    approval_bytes = (json.dumps(approval, separators=(",", ":"), sort_keys=True) + "\n").encode()
    config_bytes_new = enable_confirmation_fields(config_bytes)
    try:
        require(json.loads(config_bytes_new, object_pairs_hook=reject_duplicate_keys) == updated,
                "unexpected_config_serialization_change")
    except (UnicodeError, json.JSONDecodeError):
        raise Refusal("updated_config_invalid") from None
    temp_config = directory / f".reviewed.json.approval-{os.getpid()}.tmp"
    created_files: dict[pathlib.Path, tuple[int, int]] = {}
    original_config = config_bytes

    try:
        atomic_private_write(temp_config, config_bytes_new, created_files)
        atomic_private_write(approval_path, approval_bytes, created_files)
        fsync_dir(directory)

        # Detect a queue/config race immediately before the atomic config replace.
        no_approval_files(root, allowed=approval_path)
        require(approval_path.exists(), "approval_disappeared")
        current_queue = read_queue_snapshot(
            REPO / DB_RELATIVE, config["enrollment"]["deviceId"], config["binding"]["sessionId"]
        )
        require(current_queue == (other_events, other_receipts, db_snapshot),
                "sqlite_changed_during_prepare")
        require(hashlib.sha256(cfg_path.read_bytes()).digest() == config_sha256,
                "config_content_changed_during_prepare")
        latest = cfg_path.lstat()
        require((cfg_stat.st_ino, cfg_stat.st_size, cfg_stat.st_mtime_ns) ==
                (latest.st_ino, latest.st_size, latest.st_mtime_ns), "config_changed_during_prepare")
        os.replace(temp_config, cfg_path)
        created_files.pop(temp_config, None)
        fsync_dir(directory)

        # Verify final file permissions, exact field changes, and approval contract.
        safe_stat(cfg_path)
        safe_stat(approval_path)
        written_config = json.loads(cfg_path.read_text())
        written_approval = json.loads(approval_path.read_text())
        require(written_config == updated, "final_config_verification_failed")
        validate_approval(written_approval, written_config, response, start)
        final_queue = read_queue_snapshot(
            REPO / DB_RELATIVE, config["enrollment"]["deviceId"], config["binding"]["sessionId"]
        )
        require(final_queue == (other_events, other_receipts, db_snapshot),
                "sqlite_changed_after_prepare")
        check_serial_identity(PORT)
        print("AUTHORIZATION PREPARED: capture-only approval, one event maximum, expires in five minutes")
        print("No serial open, queue write, backend request, or delivery was performed.")
    except BaseException:
        rollback_ok = True
        try:
            current_config = cfg_path.read_bytes()
            if current_config == config_bytes_new:
                created_files.pop(temp_config, None)
                restore_tmp = directory / f".reviewed.json.rollback-{os.getpid()}.tmp"
                atomic_private_write(restore_tmp, original_config, created_files)
                os.replace(restore_tmp, cfg_path)
                created_files.pop(restore_tmp, None)
                fsync_dir(directory)
            elif current_config != original_config:
                rollback_ok = False
        except BaseException:
            rollback_ok = False
        for created_path in tuple(created_files):
            if created_path == approval_path:
                continue
            try:
                remove_owned_file(created_path, created_files)
            except BaseException:
                rollback_ok = False
        try:
            remove_owned_file(approval_path, created_files)
        except BaseException:
            rollback_ok = False
        if rollback_ok:
            raise Refusal("preparation_failed_and_changes_rolled_back") from None
        raise Refusal("rollback_incomplete_stop_do_not_capture") from None


if __name__ == "__main__":
    try:
        main()
    except Refusal as exc:
        print(f"STOP: {exc.code}; do not capture or retry blindly")
        sys.exit(1)
    except KeyboardInterrupt:
        print("STOP: interrupted; inspect config and approval state before any retry")
        sys.exit(1)
    except BaseException:
        print("STOP: unexpected failure; inspect config and approval state before any retry")
        sys.exit(1)
