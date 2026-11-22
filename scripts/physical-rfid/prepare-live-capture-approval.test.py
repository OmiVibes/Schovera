"""Isolated failure-path tests for the Pi approval-preparation helper.

Every enrollment/config/SQLite file is synthetic and temporary. Port checks,
Pi identity, and the current-user gate are mocked; Node performs real offline
signature verification using a disposable fictional Ed25519 capability.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import uuid
from unittest import mock


REPO_SOURCE = pathlib.Path(__file__).resolve().parents[2]
HELPER_PATH = REPO_SOURCE / "scripts/physical-rfid/prepare-live-capture-approval.py"
NODE = shutil.which("node")


def load_helper():
    spec = importlib.util.spec_from_file_location("approval_helper_test_target", HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


H = load_helper()


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="schovera-approval-fixture-")
        self.repo = pathlib.Path(self.temp.name) / "Schovera"
        self.physical_root = self.repo / ".local/physical-rfid"
        self.directory = self.physical_root / "nano-enrollment-fictional"
        self.config_path = self.directory / "reviewed.json"
        self.response_path = self.directory / "transfer-response.json"
        self.request_path = self.directory / "public-request.json"
        self.db_path = self.repo / ".local/schovera-rfid-gateway/gateway.sqlite"
        self.approval_path = self.directory / "live-approval.json"
        self.school = str(uuid.uuid4())
        self.device = str(uuid.uuid4())
        self.session = str(uuid.uuid4())
        self.reader = str(uuid.uuid4())
        self.assignment = str(uuid.uuid4())
        self.request_id = str(uuid.uuid4())
        self._make_files()

    def _make_files(self):
        self.directory.mkdir(parents=True)
        (self.repo / ".local/schovera-rfid-gateway").mkdir(parents=True)
        (self.repo / "scripts/rfid-simulator").mkdir(parents=True)
        shutil.copyfile(REPO_SOURCE / "scripts/rfid-simulator/event-v2.ts",
                        self.repo / "scripts/rfid-simulator/event-v2.ts")

        if NODE is None:
            raise RuntimeError("Node.js is required for the offline signature fixture")
        generator = r'''
import {generateKeyPairSync,createHash,randomUUID} from "node:crypto";
import {signAssignmentCapability} from "./scripts/rfid-simulator/event-v2.ts";
const [school,device,assignment] = process.argv.slice(2);
const {privateKey,publicKey} = generateKeyPairSync("ed25519");
const now = Math.floor(Date.now()/1000);
const claims = {token_version:1,key_id:"fictional-key-test",assignment_id:assignment,
  assignment_version:1,credential_ref:"fictional-credential-test",device_id:device,
  school_id:school,not_before:now-30,expires_at:now+3600};
const capability = signAssignmentCapability(claims,privateKey);
const pem = publicKey.export({type:"spki",format:"pem"}).toString();
console.log(JSON.stringify({capability,pem,publicKeySha256:createHash("sha256").update(pem).digest("hex")}));
'''
        generated = subprocess.run(
            [NODE, "--input-type=module", "-", self.school, self.device, self.assignment],
            input=generator, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=REPO_SOURCE, check=False,
        )
        if generated.returncode != 0:
            raise RuntimeError("fictional capability generation failed")
        key_material = json.loads(generated.stdout)

        self.response = {
            "mode": "fictional_nano_enrollment_only",
            "hardwareType": "nano_rc522",
            "usbIdentity": H.USB_ID,
            "liveCaptureApproved": False,
            "deliveryApproved": False,
            "sourceDeploymentApproved": False,
            "requestId": self.request_id,
            "schoolId": self.school,
            "deviceId": self.device,
            "captureSessionId": self.session,
            "readerId": self.reader,
            "assignmentId": self.assignment,
            "assignmentVersion": 1,
            "credentialRef": "fictional-credential-test",
            "capability": key_material["capability"],
            "capabilityPublicKey": key_material["pem"],
            "devicePublicKeySha256": key_material["publicKeySha256"],
        }
        self.request = {
            "requestId": self.request_id,
            "hardwareType": "nano_rc522",
            "usbIdentity": H.USB_ID,
            "verificationPublicKey": key_material["pem"],
        }
        self.config = {
            "version": 1,
            "serial": {
                "port": "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0",
                "usbId": H.USB_ID,
                "seconds": 30,
                "dtr": "off",
                "resetRiskAccepted": False,
                "monitorClosedConfirmed": False,
            },
            "binding": {
                "version": 1,
                "mode": "physical_legacy_host_receipt_time",
                "sessionId": self.session,
                "schoolId": self.school,
                "sourceIdentity": H.USB_ID,
                "uidKey": "a" * 64,
                "uidDigest": "b" * 64,
                "eventType": "check_in",
                "reviewedEnrollment": True,
                "capabilityPublicKey": key_material["pem"],
            },
            "enrollment": {
                "readerId": self.reader,
                "readerKey": "c" * 64,
                "deviceId": self.device,
                "assignmentId": self.assignment,
                "assignmentVersion": 1,
                "credentialRef": "fictional-credential-test",
                "capability": key_material["capability"],
            },
        }
        self.config_bytes = (json.dumps(self.config, separators=(",", ":")) + "\n").encode()
        self.response_bytes = (json.dumps(self.response, separators=(",", ":")) + "\n").encode()
        if len(self.response_bytes) > 1603:
            raise AssertionError("fictional enrollment response fixture exceeds size limit")
        self.response_bytes += b" " * (1603 - len(self.response_bytes))
        self.request_bytes = (json.dumps(self.request, separators=(",", ":")) + "\n").encode()
        self.config_path.write_bytes(self.config_bytes)
        self.response_path.write_bytes(self.response_bytes)
        self.request_path.write_bytes(self.request_bytes)
        # Metadata-only fixture. The helper is expected never to read its contents.
        (self.directory / "device-private.pem").write_text("SYNTHETIC-PRIVATE-MATERIAL-NOT-A-KEY")
        for path in (self.config_path, self.response_path, self.request_path,
                     self.directory / "device-private.pem"):
            path.chmod(0o600)

        con = sqlite3.connect(self.db_path)
        con.executescript("""
            PRAGMA journal_mode=DELETE;
            PRAGMA user_version=2;
            CREATE TABLE gateway_readers(reader_id TEXT, device_id TEXT);
            CREATE TABLE gateway_events(device_id TEXT, remote_receipt_id TEXT);
            INSERT INTO gateway_events VALUES('fictional-simulator-device','fictional-receipt');
        """)
        con.close()
        self.db_path.chmod(0o600)
        self.db_hash = hashlib.sha256(self.db_path.read_bytes()).digest()

    def close(self):
        self.temp.cleanup()


class ApprovalPreparationTests(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()
        self.cwd = pathlib.Path.cwd()
        self.patches = contextlib.ExitStack()
        fixture_uid = getattr(os, "getuid", lambda: 0)()
        self.patches.enter_context(mock.patch.object(H, "REPO", self.fx.repo))
        self.patches.enter_context(mock.patch.object(H, "EXPECTED_RESPONSE_SHA256",
            hashlib.sha256(self.fx.response_bytes).hexdigest()))
        self.patches.enter_context(mock.patch.object(H, "PORT", self.fx.repo / "fake-serial"))
        self.patches.enter_context(mock.patch.object(H, "check_dir", self.fake_check_dir))
        self.patches.enter_context(mock.patch.object(H, "safe_stat", self.fake_safe_stat))
        self.patches.enter_context(mock.patch.object(H, "check_serial_identity", mock.Mock()))
        self.patches.enter_context(mock.patch.object(H, "run_checked", self.fake_command))
        self.patches.enter_context(mock.patch.object(H, "fsync_dir", mock.Mock()))
        self.patches.enter_context(mock.patch.object(H, "call_node", self.run_real_node_check))
        self.patches.enter_context(mock.patch.object(H.os, "getuid", lambda: fixture_uid, create=True))
        self.patches.enter_context(mock.patch.object(H.stat, "S_IMODE", lambda mode: 0o600))
        real_require = H.require

        def test_require(condition, code):
            if code in {"linux_pi_required", "do_not_run_as_root"}:
                return
            real_require(condition, code)

        self.patches.enter_context(mock.patch.object(H, "require", test_require))
        os.chdir(self.fx.repo)

    def tearDown(self):
        os.chdir(self.cwd)
        self.patches.close()
        self.fx.close()

    def fake_check_dir(self, path):
        if not path.is_dir() or path.is_symlink():
            raise H.Refusal("fixture_directory")

    def fake_safe_stat(self, path, mode=0o600, size=None):
        s = path.lstat()
        if not path.is_file() or path.is_symlink() or (size is not None and s.st_size != size):
            raise H.Refusal("fixture_file")
        return s

    def fake_command(self, args, code, accepted={0}):
        return subprocess.CompletedProcess(args, 1 if "fuser" in args else 0, "", "")

    def run_real_node_check(self, config_path, response_path, request_path):
        env = {k: v for k, v in os.environ.items() if k not in {"NODE_OPTIONS", "NODE_PATH"}}
        result = subprocess.run(
            [NODE, "--input-type=module", "-", str(config_path), str(response_path), str(request_path)],
            input=H.NODE_VERIFY, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=self.fx.repo, env=env, check=False,
        )
        if result.returncode != 0 or result.stdout.strip() != "OFFLINE_SCOPE_PASS":
            raise H.Refusal("fictional_node_scope_check")

    def invoke(self, answers=("CLOSED", "ACCEPT-RESET")):
        stdout = io.StringIO()
        with mock.patch("builtins.input", side_effect=list(answers)), contextlib.redirect_stdout(stdout):
            H.main()
        return stdout.getvalue()

    def test_success_exact_capture_only_contract_and_read_only_queue(self):
        output = self.invoke()
        self.assertIn("AUTHORIZATION PREPARED", output)
        self.assertNotIn("SYNTHETIC-PRIVATE-MATERIAL-NOT-A-KEY", output)
        self.assertNotIn("a" * 64, output)
        self.assertNotIn(self.fx.response["capability"], output)
        expected_config = H.enable_confirmation_fields(self.fx.config_bytes)
        self.assertEqual(self.fx.config_path.read_bytes(), expected_config)
        final_config = json.loads(self.fx.config_path.read_text())
        self.assertTrue(final_config["serial"]["resetRiskAccepted"])
        self.assertTrue(final_config["serial"]["monitorClosedConfirmed"])
        self.assertEqual(hashlib.sha256(self.fx.db_path.read_bytes()).digest(), self.fx.db_hash)
        approval = json.loads(self.fx.approval_path.read_text())
        self.assertEqual(set(approval), {
            "version", "hardwareType", "fictionalOnly", "maxNewEvents", "maxRequests",
            "deviceId", "schoolId", "sessionId", "readerId", "devicePublicKeySha256", "expiresAt",
        })
        self.assertEqual(approval["maxNewEvents"], 1)
        self.assertEqual(approval["maxRequests"], 2)
        self.assertNotIn("eventId", approval)
        self.assertNotIn("payloadSha256", approval)
        expiry = H.dt.datetime.fromisoformat(approval["expiresAt"].replace("Z", "+00:00"))
        self.assertGreater(expiry, H.dt.datetime.now(H.dt.timezone.utc))
        self.assertLessEqual(expiry, H.dt.datetime.now(H.dt.timezone.utc) + H.dt.timedelta(minutes=5))
        contract_check = r'''
import fs from "node:fs";
import {checkApproval} from "./scripts/physical-rfid/bounded-gateway.mjs";
const c=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const a=JSON.parse(fs.readFileSync(process.argv[3],"utf8"));
checkApproval(a,c);
console.log("DEPLOYED_CONTRACT_PASS");
'''
        result = subprocess.run(
            [NODE, "--input-type=module", "-", str(self.fx.config_path), str(self.fx.approval_path)],
            input=contract_check, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=REPO_SOURCE, check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "DEPLOYED_CONTRACT_PASS")

    def test_sqlite_uri_is_immutable_read_only(self):
        before = hashlib.sha256(self.fx.db_path.read_bytes()).digest()
        uri = "file:" + H.urllib.parse.quote(str(self.fx.db_path), safe="/") + "?mode=ro&immutable=1"
        con = sqlite3.connect(uri, uri=True)
        try:
            con.execute("PRAGMA query_only=ON")
            with self.assertRaises(sqlite3.OperationalError):
                con.execute("INSERT INTO gateway_events VALUES('fictional-intruder','receipt')")
        finally:
            con.close()
        self.assertEqual(hashlib.sha256(self.fx.db_path.read_bytes()).digest(), before)
        self.assertFalse(pathlib.Path(str(self.fx.db_path) + "-wal").exists())
        self.assertFalse(pathlib.Path(str(self.fx.db_path) + "-shm").exists())

    def test_confirmation_refusal_leaves_config_and_approval_unchanged(self):
        with self.assertRaises(H.Refusal):
            self.invoke(("NO",))
        self.assertEqual(self.fx.config_path.read_bytes(), self.fx.config_bytes)
        self.assertFalse(self.fx.approval_path.exists())
        self.assertEqual(hashlib.sha256(self.fx.db_path.read_bytes()).digest(), self.fx.db_hash)

    def test_existing_approval_is_never_overwritten(self):
        sentinel = b"FICTIONAL PREEXISTING APPROVAL"
        self.fx.approval_path.write_bytes(sentinel)
        with self.assertRaises(H.Refusal):
            self.invoke()
        self.assertEqual(self.fx.approval_path.read_bytes(), sentinel)
        self.assertEqual(self.fx.config_path.read_bytes(), self.fx.config_bytes)

    def test_partial_approval_write_rolls_back_temp_and_preserves_config(self):
        original_fsync = H.os.fsync
        calls = 0

        def fail_second_fsync(fd):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("fictional fsync fault")
            return original_fsync(fd)

        with mock.patch.object(H.os, "fsync", fail_second_fsync):
            with self.assertRaises(H.Refusal):
                self.invoke()
        self.assertEqual(self.fx.config_path.read_bytes(), self.fx.config_bytes)
        self.assertFalse(self.fx.approval_path.exists())
        self.assertEqual(list(self.fx.directory.glob("*.tmp")), [])
        self.assertEqual(list(self.fx.directory.glob(".*.tmp")), [])
        self.assertEqual(hashlib.sha256(self.fx.db_path.read_bytes()).digest(), self.fx.db_hash)

    def test_config_replace_failure_removes_new_approval_and_temp(self):
        def fail_replace(source, destination):
            raise OSError("fictional rename fault")

        with mock.patch.object(H.os, "replace", fail_replace):
            with self.assertRaises(H.Refusal):
                self.invoke()
        self.assertEqual(self.fx.config_path.read_bytes(), self.fx.config_bytes)
        self.assertFalse(self.fx.approval_path.exists())
        self.assertEqual(list(self.fx.directory.glob(".*.tmp")), [])

    def test_post_replace_failure_restores_original_config_and_removes_approval(self):
        calls = 0

        def fail_after_replace(directory):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("fictional directory-fsync fault")

        with mock.patch.object(H, "fsync_dir", fail_after_replace):
            with self.assertRaises(H.Refusal):
                self.invoke()
        self.assertEqual(self.fx.config_path.read_bytes(), self.fx.config_bytes)
        self.assertFalse(self.fx.approval_path.exists())
        self.assertEqual(list(self.fx.directory.glob(".*.tmp")), [])
        self.assertEqual(hashlib.sha256(self.fx.db_path.read_bytes()).digest(), self.fx.db_hash)

    def test_rollback_failure_is_explicit_and_leaves_no_approval(self):
        calls = 0
        real_replace = H.os.replace

        def fail_after_replace(directory):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("fictional directory-fsync fault")

        def fail_restore(source, destination):
            if pathlib.Path(source).name.startswith(".reviewed.json.rollback-"):
                raise OSError("fictional rollback rename fault")
            return real_replace(source, destination)

        with mock.patch.object(H, "fsync_dir", fail_after_replace), \
             mock.patch.object(H.os, "replace", fail_restore):
            with self.assertRaises(H.Refusal) as raised:
                self.invoke()
        self.assertEqual(raised.exception.code, "rollback_incomplete_stop_do_not_capture")
        self.assertTrue(json.loads(self.fx.config_path.read_text())["serial"]["resetRiskAccepted"])
        self.assertFalse(self.fx.approval_path.exists())
        self.assertEqual(list(self.fx.directory.glob(".*.tmp")), [])

    def test_queue_change_before_write_stops_without_authorization_files(self):
        calls = 0

        def mutate_temp_database_after_initial_preflight(_port):
            nonlocal calls
            calls += 1
            if calls == 2:
                con = sqlite3.connect(self.fx.db_path)
                con.execute("INSERT INTO gateway_events VALUES('fictional-other-device','fictional-new-receipt')")
                con.commit()
                con.close()

        with mock.patch.object(H, "check_serial_identity", side_effect=mutate_temp_database_after_initial_preflight):
            with self.assertRaises(H.Refusal):
                self.invoke()
        self.assertEqual(self.fx.config_path.read_bytes(), self.fx.config_bytes)
        self.assertFalse(self.fx.approval_path.exists())
        self.assertFalse(list(self.fx.directory.glob(".*.tmp")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
