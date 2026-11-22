#!/usr/bin/env python3
"""One supervised physical Nano scan -> scoped approval -> signed delivery.

The operator runs this once on the Pi. It never simulates a scan, selects a
session by directory ordering, retries an ambiguous capture, or uses the
unscoped gateway sync command. A fresh session is prepared only when no current
session approval exists and the established fresh-session helper accepts all
historical state.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import runpy
import stat
import subprocess
import sys
import time

REPO = pathlib.Path('/home/schovera/Schovera')
ROOT_REL = pathlib.Path('.local/physical-rfid')
DB = REPO / '.local/schovera-rfid-gateway/gateway.sqlite'
FRESH_HELPER = REPO / 'scripts/physical-rfid/prepare-fresh-nano-session.py'
CLI = REPO / 'scripts/physical-rfid/bounded-test-cli.mjs'
NODE_READ_EVENT = r'''import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const [file,device,eventId]=process.argv.slice(2);
const db=new DatabaseSync(file,{readOnly:true});
try {
 db.exec('PRAGMA query_only=ON');
 const row=db.prepare('SELECT device_id,event_id,reader_id,queue_state,payload_hash,canonical_payload FROM gateway_events WHERE device_id=? AND event_id=?').get(device,eventId);
 if(!row) throw Error('event_missing');
 const hash=createHash('sha256').update(row.canonical_payload).digest('hex');
 const e=JSON.parse(row.canonical_payload);
 if(hash!==row.payload_hash||e.device_id!==device||e.event_id!==eventId||e.event_type!=='check_in'||
    Object.hasOwn(e,'uid')||Object.hasOwn(e,'card_uid')) throw Error('event_integrity');
 process.stdout.write(JSON.stringify({eventId,readerId:row.reader_id,queueState:row.queue_state,
   payloadSha256:hash,eventType:e.event_type}));
} finally { db.close(); }
'''
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
UUID4 = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
DELIVERY_KEYS = {'version','hardwareType','fictionalOnly','maxNewEvents','maxRequests',
                 'deviceId','schoolId','sessionId','readerId','devicePublicKeySha256',
                 'expiresAt','eventId','payloadSha256'}


class Stop(Exception):
    pass


def delivery_approval(capture_approval: dict, event_id: str, payload_hash: str,
                      now: dt.datetime | None = None) -> dict:
    if not UUID.fullmatch(event_id) or not HEX64.fullmatch(payload_hash):
        raise Stop('captured_event_identity_invalid')
    base_keys = DELIVERY_KEYS - {'eventId','payloadSha256'}
    if set(capture_approval) != base_keys:
        raise Stop('capture_approval_contract_invalid')
    if (capture_approval.get('version') != 1 or capture_approval.get('hardwareType') != 'nano_rc522'
            or capture_approval.get('fictionalOnly') is not True
            or capture_approval.get('maxNewEvents') != 1 or capture_approval.get('maxRequests') != 2):
        raise Stop('capture_approval_scope_invalid')
    out = dict(capture_approval)
    out['eventId'] = event_id
    out['payloadSha256'] = payload_hash
    out['expiresAt'] = ((now or dt.datetime.now(dt.timezone.utc)) + dt.timedelta(seconds=300)
                        ).isoformat(timespec='milliseconds').replace('+00:00','Z')
    if set(out) != DELIVERY_KEYS:
        raise Stop('delivery_approval_contract_invalid')
    return out


def write_exclusive_private(path: pathlib.Path, content: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    created = True
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(content)
            stream.flush()
            os.fsync(fd)
        st = path.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o600:
            raise Stop('delivery_approval_permissions_failed')
        dfd = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        if created:
            try:
                st = path.lstat()
                if stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid():
                    path.unlink()
            except OSError:
                pass
        raise
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


def parse_session_arg(args: list[str]) -> pathlib.Path:
    if len(args) != 2 or args[0] != '--session-dir':
        raise Stop('usage: supervised-one-card-demo.py --session-dir .local/physical-rfid/nano-session-<uuid>')
    supplied = pathlib.Path(args[1])
    if supplied.is_absolute():
        candidate = supplied
    else:
        candidate = REPO / supplied
    try:
        resolved = candidate.resolve(strict=True)
        root = (REPO / ROOT_REL).resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, ValueError):
        raise Stop('explicit_session_path_refused') from None
    if candidate.is_symlink() or not resolved.is_dir() or not resolved.name.startswith('nano-session-'):
        raise Stop('explicit_session_path_refused')
    return resolved


def choose_session_action(explicit_session: str, active_sessions: list[tuple[str, dt.datetime]],
                          now: dt.datetime) -> str:
    if len(active_sessions) > 1:
        raise Stop('multiple_current_capture_approvals')
    if not active_sessions:
        return 'prepare_fresh'
    session, expiry = active_sessions[0]
    if session != explicit_session:
        raise Stop('another_session_has_active_approval')
    if expiry - now < dt.timedelta(seconds=45):
        raise Stop('active_approval_window_too_short')
    return 'reuse_explicit'


def load_workflow_helpers():
    if pathlib.Path.cwd() != REPO or os.name != 'posix' or not sys.platform.startswith('linux') or os.getuid() == 0:
        raise Stop('run_as_pi_user_from_repository_root')
    if not FRESH_HELPER.is_file() or FRESH_HELPER.is_symlink():
        raise Stop('reviewed_fresh_session_helper_missing')
    return runpy.run_path(str(FRESH_HELPER))


def private_json(helper, path: pathlib.Path, size: int | None = None):
    return helper['read_private_json'](path, size)


def verify_existing_sessions(helper, root: pathlib.Path, target: pathlib.Path):
    source = root / helper['SOURCE_DIR']
    helper['check_private_dir'](root)
    helper['check_private_dir'](source)
    old_path = source / 'reviewed.json'
    response_path = source / 'transfer-response.json'
    request_path = source / 'public-request.json'
    key_path = source / 'device-private.pem'
    old_bytes, old_config = private_json(helper, old_path)
    response_bytes, response = private_json(helper, response_path, 1603)
    private_json(helper, request_path)
    _, source_approval = private_json(helper, source / 'live-approval.json')
    helper['check_private_file'](key_path)
    response_sha = hashlib.sha256(response_bytes).hexdigest()
    helper['need'](response_sha == helper['RESPONSE_SHA256'], 'response_checksum')
    source_approval_keys={'version','hardwareType','fictionalOnly','maxNewEvents','maxRequests',
        'deviceId','schoolId','sessionId','readerId','devicePublicKeySha256','expiresAt'}
    helper['need'](set(source_approval)==source_approval_keys and source_approval.get('version')==1 and
        source_approval.get('hardwareType')=='nano_rc522' and source_approval.get('fictionalOnly') is True and
        source_approval.get('maxNewEvents')==1 and source_approval.get('maxRequests')==2 and
        source_approval.get('deviceId')==response.get('deviceId') and
        source_approval.get('schoolId')==response.get('schoolId') and
        source_approval.get('sessionId')==response.get('captureSessionId') and
        source_approval.get('readerId')==response.get('readerId') and
        source_approval.get('devicePublicKeySha256')==response.get('devicePublicKeySha256') and
        dt.datetime.fromisoformat(source_approval['expiresAt'].replace('Z','+00:00'))<=dt.datetime.now(dt.timezone.utc),
        'canonical_approval_not_historical')
    # The existing workflow verifies each session's provenance and signed scope.
    now = dt.datetime.now(dt.timezone.utc)
    previous, _ = helper['inspect_previous_sessions'](
        root, source, response_path, request_path, response_sha, key_path, old_bytes,
        response, now=now + dt.timedelta(minutes=10))
    target_bytes, config = private_json(helper, target / 'reviewed.json')
    _, approval = private_json(helper, target / 'live-approval.json')
    session = config.get('binding', {}).get('sessionId')
    helper['need'](UUID4.fullmatch(session or '') and target.name == f'nano-session-{session}',
                   'explicit_session_identity_mismatch')
    helper['need'](session in previous, 'explicit_session_provenance_missing')
    expiry = dt.datetime.fromisoformat(approval['expiresAt'].replace('Z','+00:00'))
    # Validate every currently live approval; there must be exactly one, and it
    # must be the exact directory supplied by the operator.
    current = []
    for sid in previous:
        d = root / f'nano-session-{sid}'
        _, a = private_json(helper, d / 'live-approval.json')
        exp = dt.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00'))
        if exp > now:
            if exp > now + dt.timedelta(seconds=300):
                raise Stop('approval_expiry_out_of_bounds')
            helper['verify_deployed_approval'](REPO, d / 'reviewed.json', d / 'live-approval.json')
            current.append((sid, exp))
    return source, old_path, response_path, request_path, key_path, response, old_config, config, approval, expiry, previous


def read_event(database: pathlib.Path, device: str, event_id: str) -> dict:
    env_bin = '/usr/bin/env'
    result = subprocess.run([env_bin,'-u','NODE_OPTIONS','-u','NODE_PATH','node',
        '--input-type=module','-',str(database),device,event_id], input=NODE_READ_EVENT,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=REPO, check=False)
    if result.returncode != 0:
        raise Stop('local_durable_event_verification_failed')
    try:
        row = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise Stop('local_durable_event_verification_failed') from None
    if row.get('eventId') != event_id or row.get('eventType') != 'check_in' or not HEX64.fullmatch(row.get('payloadSha256','')):
        raise Stop('local_durable_event_scope_failed')
    return row


def run_cli(args: list[str], on_ready=None):
    cmd = ['/usr/bin/env','-u','NODE_OPTIONS','-u','NODE_PATH','node',str(CLI),*args]
    proc = subprocess.Popen(cmd, cwd=REPO, stdin=None, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, bufsize=1)
    reports=[]
    for line in proc.stdout:
        try:
            report=json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(report, dict):
            continue
        code=report.get('code')
        if code == 'readonly_port_opened' and on_ready:
            on_ready()
        if code == 'local_observation_committed':
            reports.append(report)
            print('CAPTURE: mapped physical observation committed locally; UID withheld', flush=True)
        elif code == 'approved_event_delivery_result':
            reports.append(report)
        elif code == 'readonly_capture_finished':
            reports.append(report)
    proc.wait()
    return proc.returncode, reports


def capture_args(config_path, approval_path, config):
    return ['capture','--config',str(config_path),'--approval',str(approval_path),'--database',str(DB),
        '--confirm-school',config['binding']['schoolId'],
        '--confirm-session',config['binding']['sessionId'],
        '--confirm-device',config['enrollment']['deviceId']]


def main(args=None):
    helper = load_workflow_helpers()
    root = REPO / ROOT_REL
    requested = parse_session_arg(list(sys.argv[1:] if args is None else args))
    try:
        bundle = verify_existing_sessions(helper, root, requested)
        (source, old_path, response_path, request_path, key_path, response, old_config,
         config, capture_approval, expiry, previous) = bundle
        now = dt.datetime.now(dt.timezone.utc)
        current=[]
        for sid in previous:
            _, a=private_json(helper,root/f'nano-session-{sid}'/'live-approval.json')
            exp=dt.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00'))
            if exp>now:
                current.append((sid,exp))
        action=choose_session_action(config['binding']['sessionId'],current,now)
        if action=='prepare_fresh':
            # All prior attempts must satisfy the helper's real expiry/grace
            # rule before it will create one new session. No enrollment is redone.
            helper['inspect_previous_sessions'](
                root, source, response_path, request_path, helper['hashlib'].sha256(response_path.read_bytes()).hexdigest(),
                key_path, old_path.read_bytes(), response, now=now)
            print('All prior capture approvals are safely expired; preparing one fresh session with the reviewed workflow.', flush=True)
            new_dir=helper['prepare'](REPO)
            if not new_dir:
                raise Stop('fresh_session_not_prepared')
            requested=new_dir.resolve(strict=True)
            bundle=verify_existing_sessions(helper,root,requested)
            (source, old_path, response_path, request_path, key_path, response, old_config,
             config, capture_approval, expiry, previous)=bundle
            if expiry-dt.datetime.now(dt.timezone.utc)<dt.timedelta(seconds=45):
                raise Stop('fresh_approval_window_too_short')
        # Repeat hardware and queue freshness checks immediately before capture.
        proof=helper['run_node_verify'](REPO,old_path,response_path,request_path,
            old_path,hashlib.sha256(response_path.read_bytes()).hexdigest(),key_path)
        helper['check_serial_identity']()
        chosen=config['binding']['sessionId']
        other_previous=dict(previous); other_previous.pop(chosen,None)
        reader_hash=hashlib.sha256(config['enrollment']['readerKey'].encode()).hexdigest()
        helper['queue_readonly'](DB,response['deviceId'],response['captureSessionId'],chosen,
            response['readerId'],reader_hash,proof['bindingHash'],previous_sessions=other_previous)
        # The active reviewed config records CLOSED and ACCEPT-RESET from the
        # preparation prompts. The bounded CLI revalidates both booleans; the
        # serial-owner check below is refreshed immediately before opening.
        config_path=requested/'reviewed.json'
        approval_path=requested/'live-approval.json'
        helper['verify_deployed_approval'](REPO,config_path,approval_path)
        opened=[False]
        def tap_prompt():
            opened[0]=True
            print('\nTAP CARD A ONCE NOW. Present it briefly, then remove it; do not tap again.',flush=True)
        rc,reports=run_cli(capture_args(config_path,approval_path,config),tap_prompt)
        durable=[r for r in reports if r.get('code')=='local_observation_committed' and r.get('durable') is True and r.get('duplicate') is False]
        finishes=[r for r in reports if r.get('code')=='readonly_capture_finished']
        if rc!=0 or not opened[0] or len(durable)!=1 or len(finishes)!=1 or finishes[0].get('newDurableEvents')!=1 or finishes[0].get('closureEvidence')!='worker_closed_and_exited':
            if durable:
                print(f"CAPTURE=UNCERTAIN eventId={durable[0].get('eventId')} durable_report=true; do not retry",flush=True)
            elif finishes:
                print(f"CAPTURE=FAIL reason={finishes[-1].get('reason')} validScans={finishes[-1].get('validScanFrames')} newDurableEvents={finishes[-1].get('newDurableEvents')}",flush=True)
            else:
                print('CAPTURE=FAIL; no confirmed durable event',flush=True)
            raise Stop('capture_not_confirmed_stop_and_review_queue')
        event_id=durable[0].get('eventId')
        device=config['enrollment']['deviceId']
        row=read_event(DB,device,event_id)
        if row['queueState']!='pending':
            raise Stop('captured_event_not_pending_stop_and_review')
        print(f"DURABLE_CAPTURE=PASS eventId={event_id} payloadSha256={row['payloadSha256']} queue=pending",flush=True)
        print('Review the fictional scope and hash below; delivery requires a separate local confirmation.',flush=True)
        print(f"DELIVERY_SCOPE=fictional Nano device; eventId={event_id}; payloadSha256={row['payloadSha256']}",flush=True)
        if input(f'Type DELIVER {event_id} to authorize this exact signed event: ').strip()!=f'DELIVER {event_id}':
            print('DELIVERY=NOT_AUTHORIZED; event remains durably queued',flush=True)
            return 2
        delivery_dir=root/'delivery-approvals'
        if delivery_dir.exists():
            helper['check_private_dir'](delivery_dir)
        else:
            os.mkdir(delivery_dir,0o700)
            helper['check_private_dir'](delivery_dir)
        delivery_path=delivery_dir/f'{event_id}.json'
        if delivery_path.exists() or delivery_path.is_symlink():
            raise Stop('delivery_approval_already_exists')
        approval=delivery_approval(capture_approval,event_id,row['payloadSha256'])
        write_exclusive_private(delivery_path,(json.dumps(approval,separators=(',',':'),sort_keys=True)+'\n').encode())
        dargs=['deliver','--config',str(config_path),'--approval',str(delivery_path),'--database',str(DB),
            '--confirm-school',config['binding']['schoolId'],'--confirm-session',config['binding']['sessionId'],
            '--confirm-device',device,'--device-key-file',str(key_path),'--target','http://127.0.0.1:33106',
            '--receipt-mode','normal']
        drc,dreports=run_cli(dargs)
        delivered=[r for r in dreports if r.get('code')=='approved_event_delivery_result']
        final_row=read_event(DB,device,event_id)
        if drc!=0 or len(delivered)!=1 or final_row['queueState']!='delivered' or final_row['payloadSha256']!=row['payloadSha256']:
            raise Stop('delivery_or_receipt_unconfirmed_no_retry')
        print('SIGNED_DELIVERY=PASS; receipt persisted; one event only',flush=True)
        print(f'PI_RESULT=PASS eventId={event_id} payloadSha256={row["payloadSha256"]} queue=delivered',flush=True)
        print('WINDOWS_DASHBOARD=VERIFY_BY_ASSISTANT_USING_EVENT_ID',flush=True)
        return 0
    except helper['Refusal'] as error:
        print(f'STOP: {error}; no retry or alternate session selected',file=sys.stderr)
        return 1
    except Stop as error:
        print(f'STOP: {error}; preserve the event and approval for review',file=sys.stderr)
        return 1
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):
        print('STOP: supervised workflow failed closed; preserve all session and queue state',file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
