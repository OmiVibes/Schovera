#!/usr/bin/env python3
"""Prepare a fresh, fictional Nano capture session without touching the queue.

The original enrollment response/configuration remain the immutable source of
provenance. This helper derives a new session config and one five-minute,
capture-only approval in a new owner-only directory. It never opens serial,
starts the gateway, contacts a backend, or writes SQLite.
"""
from __future__ import annotations

import datetime as dt
import getpass
import hashlib
import hmac
import json
import os
import pathlib
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import time
import urllib.parse
import uuid

REPO = pathlib.Path('/home/schovera/Schovera')
ROOT_REL = pathlib.Path('.local/physical-rfid')
DB_REL = pathlib.Path('.local/schovera-rfid-gateway/gateway.sqlite')
SOURCE_DIR = 'nano-enrollment-d906208d-8cc3-4220-8530-d83f1ffeb264'
USB_ID = '0403:6001:BG02XZ38'
PORT = '/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0'
RESPONSE_SHA256 = 'c52defb2ff39247e7214deca10b1684c3cd3c1d6996bbbb30abf182bb271e383'
MAX_APPROVAL_SECONDS = 300
MAX_CAPTURE_SECONDS = 30
TERMINATION_GRACE_SECONDS = 60
UUID4 = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
UID = re.compile(r'^(?:[0-9a-fA-F]{2}:){3}(?:[0-9a-fA-F]{2})(?::[0-9a-fA-F]{2}){0,6}$')

NODE_VERIFY = r'''
import fs from 'node:fs';
import {createHash,createPrivateKey,createPublicKey} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {verifyAssignmentCapability} from './scripts/rfid-simulator/event-v2.ts';
const [oldPath,responsePath,requestPath,nextPath,expectedResponseHash,privateKeyPath]=process.argv.slice(2);
const old=JSON.parse(fs.readFileSync(oldPath,'utf8'));
const r=JSON.parse(fs.readFileSync(responsePath,'utf8'));
const q=JSON.parse(fs.readFileSync(requestPath,'utf8'));
const sourceOnly=nextPath===oldPath;
const next=sourceOnly?old:JSON.parse(fs.readFileSync(nextPath,'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const privateKeyOk=(()=>{try{const ls=fs.lstatSync(privateKeyPath);if(!ls.isFile()||ls.isSymbolicLink()||ls.uid!==process.getuid()||(ls.mode&0o077)!==0||ls.size>16384)return false;const fd=fs.openSync(privateKeyPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o077)!==0||st.size>16384)return false;const key=createPrivateKey(fs.readFileSync(fd,'utf8'));if(key.asymmetricKeyType!=='ed25519')return false;const pem=createPublicKey(key).export({type:'spki',format:'pem'}).toString();return sha(pem)===r.devicePublicKeySha256;}finally{fs.closeSync(fd);}}catch{return false;}})();
const valid=old.version===1 && next.version===1 &&
  Object.keys(old).sort().join(',')==='binding,enrollment,serial,version' &&
  Object.keys(next).sort().join(',')==='binding,enrollment,serial,version' &&
  r.mode==='fictional_nano_enrollment_only' && r.hardwareType==='nano_rc522' &&
  r.usbIdentity==='0403:6001:BG02XZ38' && r.liveCaptureApproved===false &&
  r.deliveryApproved===false && r.sourceDeploymentApproved===false &&
  old.binding?.sessionId===r.captureSessionId && old.binding?.schoolId===r.schoolId &&
  old.enrollment?.deviceId===r.deviceId && old.enrollment?.readerId===r.readerId &&
  old.enrollment?.assignmentId===r.assignmentId &&
  old.enrollment?.assignmentVersion===r.assignmentVersion &&
  old.enrollment?.credentialRef===r.credentialRef &&
  old.enrollment?.capability===r.capability &&
  old.binding?.capabilityPublicKey===r.capabilityPublicKey &&
  old.serial?.port==='/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0' &&
  old.serial?.usbId===r.usbIdentity && old.serial?.seconds===30 && old.serial?.dtr==='off' &&
  old.binding?.sourceIdentity===r.usbIdentity && old.binding?.reviewedEnrollment===true &&
  old.binding?.mode==='physical_legacy_host_receipt_time' && old.binding?.eventType==='check_in' &&
  /^[0-9a-f]{64}$/.test(old.binding?.uidKey??'') && /^[0-9a-f]{64}$/.test(old.binding?.uidDigest??'') &&
  /^[0-9a-f]{64}$/.test(old.enrollment?.readerKey??'') &&
  !Object.hasOwn(old.binding,'uid') && !Object.hasOwn(old.enrollment,'studentId') &&
  !Object.hasOwn(old.enrollment,'devicePrivateKey') &&
  q.requestId===r.requestId && q.hardwareType===r.hardwareType && q.usbIdentity===r.usbIdentity &&
  sha(q.verificationPublicKey)===r.devicePublicKeySha256 &&
  privateKeyOk &&
  (sourceOnly || (old.binding?.schoolId===next.binding?.schoolId &&
  old.enrollment?.deviceId===next.enrollment?.deviceId &&
  old.enrollment?.readerId===next.enrollment?.readerId &&
  old.enrollment?.assignmentId===next.enrollment?.assignmentId &&
  old.enrollment?.assignmentVersion===next.enrollment?.assignmentVersion &&
  old.enrollment?.credentialRef===next.enrollment?.credentialRef &&
  old.enrollment?.capability===next.enrollment?.capability &&
  old.enrollment?.readerKey===next.enrollment?.readerKey &&
  old.binding?.uidKey===next.binding?.uidKey && old.binding?.uidDigest===next.binding?.uidDigest &&
  old.binding?.capabilityPublicKey===next.binding?.capabilityPublicKey &&
  next.binding?.sessionId!==old.binding?.sessionId &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(next.binding?.sessionId??'') &&
  next.serial?.resetRiskAccepted===true && next.serial?.monitorClosedConfirmed===true &&
  isDeepStrictEqual({...old,binding:{...old.binding,sessionId:next.binding.sessionId},serial:{...old.serial,resetRiskAccepted:true,monitorClosedConfirmed:true}},next))) &&
  sha(fs.readFileSync(responsePath))===expectedResponseHash;
if(!valid){console.error('source_scope_refused');process.exit(1);}
const now=Math.floor(Date.now()/1000);
const cap=verifyAssignmentCapability(r.capability,createPublicKey(r.capabilityPublicKey),now);
if(!cap.ok||!cap.timeValid||cap.claims.expires_at<=now+360||
 cap.claims.device_id!==r.deviceId||cap.claims.school_id!==r.schoolId||
 cap.claims.assignment_id!==r.assignmentId||cap.claims.assignment_version!==r.assignmentVersion||
 cap.claims.credential_ref!==r.credentialRef){console.error('capability_refused');process.exit(1);}
const bindingHash=sha(JSON.stringify({binding:old.binding,enrollment:old.enrollment}));
const sessionBindingHash=sha(JSON.stringify({binding:next.binding,enrollment:next.enrollment}));
process.stdout.write(JSON.stringify({sourceSession:old.binding.sessionId,newSession:next.binding.sessionId,bindingHash,sessionBindingHash,expiresAt:cap.claims.expires_at}));
'''


class Refusal(Exception):
    pass


def need(ok: bool, code: str) -> None:
    if not ok:
        raise Refusal(code)


def current_uid() -> int:
    return os.getuid() if hasattr(os, 'getuid') else -1


def stat_matches(s, *, kind: str, owner: int, mode: int) -> bool:
    type_ok = stat.S_ISREG(s.st_mode) if kind == 'file' else stat.S_ISDIR(s.st_mode)
    return type_ok and s.st_uid == owner and stat.S_IMODE(s.st_mode) == mode


def no_duplicate(pairs):
    obj = {}
    for k, v in pairs:
        if k in obj:
            raise ValueError('duplicate key')
        obj[k] = v
    return obj


def read_private_json(path: pathlib.Path, exact_size: int | None = None):
    s = path.lstat()
    need(stat_matches(s,kind='file',owner=current_uid(),mode=0o600) and not path.is_symlink(), 'private_file_permissions')
    if exact_size is not None:
        need(s.st_size == exact_size, 'source_response_size')
    try:
        return path.read_bytes(), json.loads(path.read_text(), object_pairs_hook=no_duplicate)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
        raise Refusal('private_json_invalid') from None


def check_private_file(path: pathlib.Path):
    s = path.lstat()
    need(stat_matches(s,kind='file',owner=current_uid(),mode=0o600) and not path.is_symlink(), 'private_file_permissions')
    return s


def check_private_dir(path: pathlib.Path):
    s = path.lstat()
    need(stat.S_ISDIR(s.st_mode) and not path.is_symlink() and s.st_uid == current_uid()
         and (s.st_mode & 0o022) == 0, 'private_directory_permissions')
    return s


def check_created_dir(path: pathlib.Path):
    s = path.lstat()
    need(stat_matches(s,kind='dir',owner=current_uid(),mode=0o700) and not path.is_symlink(), 'new_directory_permissions')


def check_created_file(path: pathlib.Path):
    s = path.lstat()
    need(stat_matches(s,kind='file',owner=current_uid(),mode=0o600) and not path.is_symlink(), 'new_file_permissions')


def run_node_verify(repo: pathlib.Path, old: pathlib.Path, response: pathlib.Path,
                    request: pathlib.Path, candidate: pathlib.Path, response_sha: str,
                    private_key: pathlib.Path):
    version = subprocess.run(['node', '--version'], cwd=repo, capture_output=True, text=True)
    m = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', version.stdout.strip())
    need(version.returncode == 0 and m and tuple(map(int, m.groups())) >= (22, 18, 0), 'node_runtime_unsupported')
    env_bin = shutil.which('env')
    need(env_bin is not None, 'env_command_unavailable')
    result = subprocess.run([env_bin, '-u', 'NODE_OPTIONS', '-u', 'NODE_PATH', 'node', '--input-type=module', '-',
                             str(old), str(response), str(request), str(candidate), response_sha, str(private_key)],
                            input=NODE_VERIFY, cwd=repo, capture_output=True, text=True)
    need(result.returncode == 0, 'source_scope_or_capability_refused')
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError):
        raise Refusal('source_scope_or_capability_refused') from None


def check_serial_identity():
    port = pathlib.Path(PORT)
    need(port.is_symlink() and port.exists() and stat.S_ISCHR(port.stat().st_mode), 'serial_path_unavailable')
    u = subprocess.run(['udevadm', 'info', '--query=property', '--name', PORT], capture_output=True, text=True)
    need(u.returncode == 0 and not u.stderr, 'serial_identity_unavailable')
    props = dict(line.split('=', 1) for line in u.stdout.splitlines() if '=' in line)
    need((props.get('ID_VENDOR_ID'), props.get('ID_MODEL_ID'), props.get('ID_SERIAL_SHORT')) ==
         ('0403', '6001', 'BG02XZ38'), 'serial_identity_mismatch')
    f = subprocess.run(['fuser', '-s', PORT], capture_output=True)
    need(f.returncode == 1 and not f.stdout and not f.stderr, 'serial_port_owned')


def read_file_noatime(path: pathlib.Path) -> bytes:
    need(hasattr(os, 'O_NOATIME') and hasattr(os, 'O_NOFOLLOW'), 'sqlite_noatime_unavailable')
    fd = -1
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW)
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        return b''.join(chunks)
    except OSError:
        raise Refusal('sqlite_file_read') from None
    finally:
        if fd >= 0:
            os.close(fd)


def snapshot_file(path: pathlib.Path, *, required: bool, database_mode: int | None = None,
                  read_file=read_file_noatime):
    try:
        before = path.lstat()
    except FileNotFoundError:
        need(not required, 'sqlite_missing')
        return None
    need(stat.S_ISREG(before.st_mode) and not path.is_symlink() and before.st_uid == current_uid(),
         'sqlite_file_permissions')
    if database_mode is not None:
        need(stat.S_IMODE(before.st_mode) == database_mode, 'sqlite_permissions')
    try:
        digest = hashlib.sha256(read_file(path)).digest()
        after = path.lstat()
    except OSError:
        raise Refusal('sqlite_file_read') from None
    # Access time is guarded separately by check_sqlite_read_atime before SQLite
    # opens the file. Compare identity, ownership, mode, size, mtime and ctime here.
    before_meta = (before.st_dev, before.st_ino, before.st_uid, before.st_mode,
                   before.st_size, before.st_mtime_ns, before.st_ctime_ns)
    after_meta = (after.st_dev, after.st_ino, after.st_uid, after.st_mode,
                  after.st_size, after.st_mtime_ns, after.st_ctime_ns)
    need(before_meta == after_meta, 'sqlite_file_changed_during_check')
    return (*before_meta, digest)


def check_sqlite_read_atime(db: pathlib.Path):
    result = subprocess.run(['findmnt', '--noheadings', '--output', 'OPTIONS', '--target', str(db)],
                            capture_output=True, text=True)
    need(result.returncode == 0 and not result.stderr, 'sqlite_mount_policy_unavailable')
    options = set(result.stdout.strip().split(','))
    if 'noatime' in options:
        return
    s = db.stat()
    now_ns = time.time_ns()
    safe_relatime = ('relatime' in options and s.st_atime_ns > s.st_mtime_ns and
                     s.st_atime_ns > s.st_ctime_ns and now_ns - s.st_atime_ns < 24 * 60 * 60 * 1_000_000_000)
    need(safe_relatime, 'sqlite_atime_update_risk')


def queue_readonly(db: pathlib.Path, device: str, old_session: str, new_session: str,
                   reader: str, reader_hash: str, binding_hash: str,
                   *, connect=sqlite3.connect, run_process=subprocess.run,
                   database_mode: int | None = 0o600, read_file=read_file_noatime,
                   atime_check=check_sqlite_read_atime, previous_sessions=None):
    previous_sessions=previous_sessions or {}
    wal = pathlib.Path(str(db) + '-wal')
    shm = pathlib.Path(str(db) + '-shm')
    journal = pathlib.Path(str(db) + '-journal')
    initial = {
        'db': snapshot_file(db, required=True, database_mode=database_mode, read_file=read_file),
        'wal': snapshot_file(wal, required=False, read_file=read_file),
        'shm': snapshot_file(shm, required=False, read_file=read_file),
        'journal': snapshot_file(journal, required=False, read_file=read_file),
    }
    need(initial['wal'] is None or initial['wal'][4] == 0, 'sqlite_wal_nonempty')
    # Rollback journals may represent an interrupted transaction; never inspect
    # the main file as authoritative while one exists.
    need(initial['journal'] is None, 'sqlite_journal_present')
    atime_check(db)
    for path, snapshot in ((db, initial['db']), (wal, initial['wal']), (shm, initial['shm'])):
        if snapshot is None:
            continue
        owner = run_process(['fuser', '-s', str(path)], capture_output=True)
        need(owner.returncode == 1 and not owner.stdout and not owner.stderr, 'sqlite_in_use')
    uri = 'file:' + urllib.parse.quote(str(db), safe='/') + '?mode=ro&immutable=1'
    try:
        con = connect(uri, uri=True)
        try:
            con.execute('PRAGMA query_only=ON')
            need(con.execute('PRAGMA user_version').fetchone()[0] == 2, 'sqlite_schema')
            need(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'sqlite_integrity')
            tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            need({'gateway_readers','gateway_events','physical_legacy_sessions'} <= tables, 'sqlite_tables')
            events = con.execute('SELECT COUNT(*) FROM gateway_events WHERE device_id=?', (device,)).fetchone()[0]
            readers = con.execute('SELECT reader_id,device_id,token_sha256,active FROM gateway_readers WHERE device_id=?', (device,)).fetchall()
            session_rows = con.execute('SELECT session_id,binding_hash,last_uptime,needs_review FROM physical_legacy_sessions').fetchall()
            new_rows = con.execute('SELECT 1 FROM physical_legacy_sessions WHERE session_id=?', (new_session,)).fetchall()
        finally:
            con.close()
    except Refusal:
        raise
    except BaseException:
        raise Refusal('sqlite_readonly_check') from None
    after = {
        'db': snapshot_file(db, required=True, database_mode=database_mode, read_file=read_file),
        'wal': snapshot_file(wal, required=False, read_file=read_file),
        'shm': snapshot_file(shm, required=False, read_file=read_file),
        'journal': snapshot_file(journal, required=False, read_file=read_file),
    }
    need(initial == after, 'sqlite_changed_during_check')
    need(events == 0 and readers == [(reader, device, reader_hash, 1)], 'device_or_reader_scope')
    need(old_session not in previous_sessions and new_session not in previous_sessions and not new_rows,
         'session_provenance_or_freshness')
    known={old_session:binding_hash,**previous_sessions}
    seen=set()
    for session_id,stored_hash,last_uptime,needs_review in session_rows:
        need(session_id in known and stored_hash==known[session_id], 'session_provenance_or_freshness')
        need(session_id==old_session or (last_uptime is None and needs_review==0),
             'previous_session_unreviewed_state')
        seen.add(session_id)
    need(old_session in seen and seen <= set(known), 'session_provenance_or_freshness')
    return initial


def verify_card_a(uid: str, key_hex: str, expected_hex: str) -> bool:
    """Compare a privately supplied, normalized card UID without retaining it."""
    if not isinstance(uid, str) or not UID.fullmatch(uid) or len(uid.split(':')) not in (4, 7, 10):
        raise Refusal('card_uid_format')
    if not HEX64.fullmatch(key_hex or '') or not HEX64.fullmatch(expected_hex or ''):
        raise Refusal('card_mapping_format')
    digest = hmac.new(bytes.fromhex(key_hex), uid.upper().encode('ascii'), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected_hex)


def write_exclusive(path: pathlib.Path, data: bytes, created: dict[pathlib.Path, tuple[int, int]]):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags, 0o600)
    st = os.fstat(fd)
    created[path] = (st.st_dev, st.st_ino)
    try:
        if hasattr(os, 'fchmod'):
            os.fchmod(fd, 0o600)
        else:
            os.chmod(path, 0o600)
        with os.fdopen(fd, 'wb', closefd=False) as f:
            f.write(data); f.flush(); os.fsync(fd)
    except BaseException:
        raise
    finally:
        os.close(fd)


def fsync_directory(path: pathlib.Path):
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def cleanup_created(created, directory: pathlib.Path, directory_identity):
    ok = True
    for path, identity in reversed(tuple(created.items())):
        try:
            s = path.lstat()
            if stat.S_ISREG(s.st_mode) and s.st_uid == current_uid() and (s.st_dev, s.st_ino) == identity:
                path.unlink()
            else:
                ok = False
        except FileNotFoundError:
            pass
        except OSError:
            ok = False
    try:
        if directory.exists():
            s = directory.lstat()
            if stat.S_ISDIR(s.st_mode) and not directory.is_symlink() and s.st_uid == current_uid() and (s.st_dev, s.st_ino) == directory_identity and not any(directory.iterdir()):
                directory.rmdir()
            else:
                ok = False
    except OSError:
        ok = False
    return ok


def verify_deployed_approval(repo: pathlib.Path, config_path: pathlib.Path, approval_path: pathlib.Path):
    contract = r'''
import fs from 'node:fs';import {checkApproval} from './scripts/physical-rfid/bounded-gateway.mjs';
const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const a=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));checkApproval(a,c);process.stdout.write('APPROVAL_CONTRACT_PASS');
'''
    env_bin = shutil.which('env')
    need(env_bin is not None, 'env_command_unavailable')
    cmd = [env_bin,'-u','NODE_OPTIONS','-u','NODE_PATH','node','--input-type=module','-',str(config_path),str(approval_path)]
    result = subprocess.run(cmd,input=contract,cwd=repo,capture_output=True,text=True)
    # Node may emit its standard experimental-SQLite warning to stderr; keep it
    # captured and require the exact success marker plus exit 0 instead.
    need(result.returncode == 0 and result.stdout == 'APPROVAL_CONTRACT_PASS',
         'approval_contract_refused')


def private_tree_fingerprint(directory: pathlib.Path):
    result = {}
    for path in sorted(directory.iterdir()):
        s = path.lstat()
        need(stat_matches(s,kind='file',owner=current_uid(),mode=0o600) and not path.is_symlink(),
             'previous_session_artifact_permissions')
        try:
            data = path.read_bytes()
            after = path.lstat()
        except OSError:
            raise Refusal('previous_session_artifact_read') from None
        before_meta=(s.st_dev,s.st_ino,s.st_uid,s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        after_meta=(after.st_dev,after.st_ino,after.st_uid,after.st_mode,after.st_size,after.st_mtime_ns,after.st_ctime_ns)
        need(before_meta==after_meta,'previous_session_artifact_changed')
        result[path.name]=(*before_meta,hashlib.sha256(data).digest())
    return result


def inspect_previous_sessions(root: pathlib.Path, source: pathlib.Path, response_path: pathlib.Path,
                              request_path: pathlib.Path, response_sha: str, private_key_path: pathlib.Path,
                              source_config_bytes: bytes, response: dict, *, node_verify=run_node_verify,
                              now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    expected_names={'reviewed.json','provenance.json','live-approval.json'}
    previous={}
    fingerprints={}
    allowed_approvals={source/'live-approval.json'}
    for directory in sorted(root.iterdir()):
        if not directory.name.startswith('nano-session-'):
            continue
        match=re.fullmatch(r'nano-session-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})',directory.name)
        need(match is not None and directory.is_dir() and not directory.is_symlink(),
             'previous_session_ambiguous')
        session_id=match.group(1)
        check_private_dir(directory)
        need({p.name for p in directory.iterdir()}==expected_names,'previous_session_incomplete')
        cfg_path=directory/'reviewed.json'
        approval_path=directory/'live-approval.json'
        provenance_path=directory/'provenance.json'
        cfg_bytes,cfg=read_private_json(cfg_path)
        _,approval=read_private_json(approval_path)
        _,provenance=read_private_json(provenance_path)
        need(cfg.get('binding',{}).get('sessionId')==session_id and session_id!=response['captureSessionId'],
             'previous_session_identity_mismatch')
        need(set(provenance)=={'version','sourceResponseSha256','sourceSessionId','sourceConfigSha256','newSessionId','sourceDirectory'} and
             provenance.get('version')==1 and provenance.get('sourceResponseSha256')==response_sha and
             provenance.get('sourceSessionId')==response['captureSessionId'] and
             provenance.get('sourceConfigSha256')==hashlib.sha256(source_config_bytes).hexdigest() and
             provenance.get('newSessionId')==session_id and provenance.get('sourceDirectory')==SOURCE_DIR,
             'previous_session_provenance_mismatch')
        need(set(approval)=={'version','hardwareType','fictionalOnly','maxNewEvents','maxRequests','deviceId','schoolId','sessionId','readerId','devicePublicKeySha256','expiresAt'} and
             approval.get('version')==1 and approval.get('hardwareType')=='nano_rc522' and
             approval.get('fictionalOnly') is True and approval.get('maxNewEvents')==1 and
             approval.get('maxRequests')==2 and approval.get('deviceId')==response['deviceId'] and
             approval.get('schoolId')==response['schoolId'] and approval.get('sessionId')==session_id and
             approval.get('readerId')==response['readerId'] and
             approval.get('devicePublicKeySha256')==response['devicePublicKeySha256'],
             'previous_approval_scope_mismatch')
        serial=cfg.get('serial',{})
        need(serial.get('seconds')==MAX_CAPTURE_SECONDS and serial.get('usbId')==USB_ID and
             serial.get('port')==PORT and serial.get('dtr')=='off' and
             serial.get('resetRiskAccepted') is True and serial.get('monitorClosedConfirmed') is True,
             'previous_capture_confirmation_missing')
        try:
            expires=dt.datetime.fromisoformat(approval['expiresAt'].replace('Z','+00:00'))
            need(expires.tzinfo is not None and expires+dt.timedelta(seconds=MAX_CAPTURE_SECONDS+TERMINATION_GRACE_SECONDS)<=now,
                 'previous_attempt_active_or_ambiguous')
        except (ValueError,TypeError,AttributeError):
            raise Refusal('previous_approval_expiry_invalid') from None
        proof=node_verify(root.parent.parent, source/'reviewed.json', response_path, request_path,
                          cfg_path,response_sha,private_key_path)
        need(proof.get('sourceSession')==response['captureSessionId'] and proof.get('newSession')==session_id,
             'previous_session_signed_scope_mismatch')
        need(session_id not in previous,'previous_session_uuid_reused')
        previous[session_id]=proof.get('sessionBindingHash')
        need(isinstance(previous[session_id],str) and HEX64.fullmatch(previous[session_id]),
             'previous_session_binding_hash_invalid')
        fingerprints[session_id]=private_tree_fingerprint(directory)
        allowed_approvals.add(approval_path)
    for path in root.rglob('live-approval.json'):
        need(path in allowed_approvals,'conflicting_approval_exists')
    return previous,fingerprints


def prepare(repo: pathlib.Path, *, uid_prompt=getpass.getpass, confirm_prompt=input,
            node_verify=run_node_verify, serial_check=check_serial_identity,
            platform_check=True, session_factory=uuid.uuid4, write_file=write_exclusive,
            approval_check=verify_deployed_approval, created_dir_check=check_created_dir,
            created_file_check=check_created_file, sync_directory=fsync_directory):
    if platform_check:
        need(os.name == 'posix' and sys.platform.startswith('linux'), 'linux_pi_required')
        need(os.getuid() != 0, 'do_not_run_as_root')
    need(pathlib.Path.cwd() == repo, 'run_from_pi_repository_root')
    check_private_dir(repo / '.local')
    root = repo / ROOT_REL
    check_private_dir(root)
    for entry in root.rglob('*'):
        need(not entry.is_symlink(), 'symlink_under_private_root')
    source = root / SOURCE_DIR
    check_private_dir(source)
    old_cfg_path = source / 'reviewed.json'
    response_path = source / 'transfer-response.json'
    request_path = source / 'public-request.json'
    old_approval_path = source / 'live-approval.json'
    old_config_bytes, old_config = read_private_json(old_cfg_path)
    response_bytes, response = read_private_json(response_path, 1603)
    request_bytes, request = read_private_json(request_path)
    private_key_path = source / 'device-private.pem'
    private_key_stat = check_private_file(private_key_path)
    need(private_key_stat.st_size <= 16384, 'device_key_size')
    old_approval_bytes, old_approval = read_private_json(old_approval_path)
    response_sha = hashlib.sha256(response_bytes).hexdigest()
    need(response_sha == RESPONSE_SHA256, 'response_checksum')
    need(old_config['binding']['sessionId'] == response['captureSessionId'], 'source_session_scope')
    need(set(old_approval) == {'version','hardwareType','fictionalOnly','maxNewEvents','maxRequests','deviceId','schoolId','sessionId','readerId','devicePublicKeySha256','expiresAt'} and
         old_approval.get('version') == 1 and old_approval.get('hardwareType') == 'nano_rc522' and
         old_approval.get('fictionalOnly') is True and old_approval.get('devicePublicKeySha256') == response['devicePublicKeySha256'] and
         old_approval.get('sessionId') == response['captureSessionId'] and
         old_approval.get('deviceId') == response['deviceId'] and
         old_approval.get('schoolId') == response['schoolId'] and
         old_approval.get('readerId') == response['readerId'] and
         old_approval.get('maxNewEvents') == 1 and old_approval.get('maxRequests') == 2 and
         dt.datetime.fromisoformat(old_approval['expiresAt'].replace('Z','+00:00')) <= dt.datetime.now(dt.timezone.utc),
         'historical_approval_not_expired_or_scoped')
    previous_sessions, previous_fingerprints = inspect_previous_sessions(
        root, source, response_path, request_path, response_sha, private_key_path, old_config_bytes,
        response, node_verify=node_verify)

    new_session = str(session_factory())
    need(UUID4.fullmatch(new_session) and new_session != response['captureSessionId'] and
         new_session not in previous_sessions, 'fresh_uuid_invalid_or_reused')
    next_config = json.loads(json.dumps(old_config))
    next_config['binding']['sessionId'] = new_session
    # Old consent flags are historical; always require fresh confirmation for this run.
    next_config['serial']['resetRiskAccepted'] = False
    next_config['serial']['monitorClosedConfirmed'] = False
    new_dir = root / f'nano-session-{new_session}'
    need(not new_dir.exists() and not new_dir.is_symlink(), 'fresh_session_path_exists')
    candidate_bytes = (json.dumps(next_config, separators=(',', ':'), sort_keys=False) + '\n').encode()
    candidate_path = new_dir / 'reviewed.json'

    # The hidden UID prompt stores no copy. Verification is read-only and does not enroll.
    supplied_uid = uid_prompt('Enter Card A UID (hidden; empty means unavailable): ')
    if not supplied_uid:
        print('CARD A MAPPING: PENDING (no UID supplied)')
        raise Refusal('card_a_mapping_pending')
    if not verify_card_a(supplied_uid, old_config['binding']['uidKey'], old_config['binding']['uidDigest']):
        print('CARD A MAPPING: MISMATCH (mapping unchanged)')
        raise Refusal('card_a_mapping_mismatch')
    del supplied_uid
    print('CARD A MAPPING: MATCH (private HMAC comparison; no mapping changed)')

    proof = node_verify(repo, old_cfg_path, response_path, request_path, old_cfg_path, response_sha, private_key_path)
    serial_check()
    db_path = repo / DB_REL
    reader_hash = hashlib.sha256(old_config['enrollment']['readerKey'].encode()).hexdigest()
    before = queue_readonly(db_path, response['deviceId'], response['captureSessionId'], new_session,
                            response['readerId'], reader_hash, proof['bindingHash'],
                            previous_sessions=previous_sessions)
    print('PREFLIGHT PASS: source enrollment, signed capability and public-key fingerprint')
    print('PREFLIGHT PASS: historical sessions retained and safe; fresh session absent; Nano has zero events')
    print('PREFLIGHT PASS: existing reader binding matches fictional device')
    print('PREFLIGHT PASS: SQLite integrity and read-only state verified')
    need(confirm_prompt('Serial Monitor/Plotter closed? Type CLOSED: ').strip() == 'CLOSED', 'monitor_confirmation_missing')
    need(confirm_prompt('Accept possible Nano USB reset on open? Type ACCEPT-RESET: ').strip() == 'ACCEPT-RESET', 'reset_risk_not_accepted')

    # Fresh checks after user confirmation, before any new file is written.
    current_previous, current_fingerprints = inspect_previous_sessions(
        root, source, response_path, request_path, response_sha, private_key_path, old_config_bytes,
        response, node_verify=node_verify)
    need(current_previous==previous_sessions and current_fingerprints==previous_fingerprints,
         'previous_session_changed_after_confirmation')
    proof = node_verify(repo, old_cfg_path, response_path, request_path, old_cfg_path, response_sha, private_key_path)
    serial_check()
    after = queue_readonly(db_path, response['deviceId'], response['captureSessionId'], new_session,
                           response['readerId'], reader_hash, proof['bindingHash'],
                           previous_sessions=previous_sessions)
    need(before == after and hashlib.sha256(old_cfg_path.read_bytes()).digest() == hashlib.sha256(old_config_bytes).digest()
         and hashlib.sha256(response_path.read_bytes()).hexdigest() == RESPONSE_SHA256
         and hashlib.sha256(request_path.read_bytes()).digest() == hashlib.sha256(request_bytes).digest()
         and hashlib.sha256(old_approval_path.read_bytes()).digest() == hashlib.sha256(old_approval_bytes).digest(),
         'source_changed_after_prompt')
    next_config['serial']['resetRiskAccepted'] = True
    next_config['serial']['monitorClosedConfirmed'] = True
    candidate_bytes = (json.dumps(next_config, separators=(',', ':'), sort_keys=False) + '\n').encode()
    candidate_path = new_dir / 'reviewed.json'
    approval = {
        'version': 1, 'hardwareType': 'nano_rc522', 'fictionalOnly': True,
        'maxNewEvents': 1, 'maxRequests': 2, 'deviceId': response['deviceId'],
        'schoolId': response['schoolId'], 'sessionId': new_session,
        'readerId': response['readerId'], 'devicePublicKeySha256': response['devicePublicKeySha256'],
        'expiresAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=MAX_APPROVAL_SECONDS)).isoformat(timespec='milliseconds').replace('+00:00','Z'),
    }
    approval_bytes = (json.dumps(approval, separators=(',', ':'), sort_keys=True) + '\n').encode()
    provenance = {'version':1,'sourceResponseSha256':response_sha,'sourceSessionId':response['captureSessionId'],
                  'sourceConfigSha256':hashlib.sha256(old_config_bytes).hexdigest(),
                  'newSessionId':new_session,'sourceDirectory':SOURCE_DIR}
    provenance_bytes = (json.dumps(provenance, separators=(',', ':'), sort_keys=True) + '\n').encode()
    created = {}
    directory_identity = None
    try:
        os.mkdir(new_dir, 0o700)
        ds = new_dir.lstat()
        directory_identity = (ds.st_dev, ds.st_ino)
        os.chmod(new_dir, 0o700)
        created_dir_check(new_dir)
        write_file(candidate_path, candidate_bytes, created)
        proof = node_verify(repo, old_cfg_path, response_path, request_path, candidate_path, response_sha, private_key_path)
        write_file(new_dir / 'provenance.json', provenance_bytes, created)
        write_file(new_dir / 'live-approval.json', approval_bytes, created)
        sync_directory(new_dir)
        approval_check(repo, candidate_path, new_dir/'live-approval.json')
        need(before == queue_readonly(db_path, response['deviceId'], response['captureSessionId'], new_session,
             response['readerId'], reader_hash, proof['bindingHash'],
             previous_sessions=previous_sessions), 'sqlite_changed_during_prepare')
        created_dir_check(new_dir)
        for p in (candidate_path,new_dir/'provenance.json',new_dir/'live-approval.json'):
            created_file_check(p)
        print('SESSION PREPARED: fresh session, one-event capture-only approval, expires within five minutes')
        print(f'SESSION DIRECTORY: {new_dir.relative_to(repo).as_posix()}')
        print('Historical enrollment and prior attempts preserved; private key stayed Pi-local and was not displayed.')
        print('No serial open, queue write, backend request, or delivery.')
        return new_dir
    except BaseException as error:
        safe_code = error.args[0] if isinstance(error, Refusal) and error.args and isinstance(error.args[0], str) else type(error).__name__.lower()
        if not re.fullmatch(r'[a-z0-9_]{1,64}', safe_code):
            safe_code = 'io_or_runtime_failure'
        if directory_identity is not None and not cleanup_created(created,new_dir,directory_identity):
            raise Refusal('rollback_incomplete_stop_and_inspect') from None
        raise Refusal(f'fresh_session_prepare_failed_rolled_back:{safe_code}') from None


def main():
    try:
        prepare(REPO)
    except Refusal as exc:
        if str(exc) not in {'card_a_mapping_pending','card_a_mapping_mismatch'}:
            print(f'STOP: {exc}; no capture or delivery')
        sys.exit(1)
    except KeyboardInterrupt:
        print('STOP: interrupted; inspect new-session directory before retry')
        sys.exit(1)
    except BaseException:
        print('STOP: unexpected preparation failure; inspect state before retry')
        sys.exit(1)


if __name__ == '__main__':
    main()
