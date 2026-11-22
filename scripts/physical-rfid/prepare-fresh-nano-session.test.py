"""Temporary-fictional-fixture tests for fresh Nano session preparation."""
from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import hmac
import importlib.util
import json
import os
import pathlib
import shutil
import sqlite3
import stat
import subprocess
import tempfile
import unittest
import uuid
from unittest import mock

SOURCE = pathlib.Path(__file__).resolve().parents[2]
HELPER = SOURCE / 'scripts/physical-rfid/prepare-fresh-nano-session.py'
SPEC = importlib.util.spec_from_file_location('fresh_nano_session_test_target', HELPER)
H = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(H)
QUEUE_READONLY = H.queue_readonly
NODE = shutil.which('node')
OLD = '11111111-1111-4111-8111-111111111111'
NEW = '22222222-2222-4222-8222-222222222222'
CARD = 'FA:CE:B0:0C'
KEY = 'a' * 64


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix='schovera-fresh-session-fixture-')
        self.repo = pathlib.Path(self.temp.name) / 'Schovera'
        self.root = self.repo / H.ROOT_REL
        self.source = self.root / H.SOURCE_DIR
        self.db = self.repo / H.DB_REL
        self.source.mkdir(parents=True)
        (self.repo / 'scripts/rfid-simulator').mkdir(parents=True)
        shutil.copyfile(SOURCE / 'scripts/rfid-simulator/event-v2.ts', self.repo / 'scripts/rfid-simulator/event-v2.ts')
        self.school, self.device, self.reader, self.assignment = [str(uuid.uuid4()) for _ in range(4)]
        self.request_id = str(uuid.uuid4())
        if NODE is None:
            raise RuntimeError('Node.js is required for local fictional signature tests')
        gen = r'''
import {generateKeyPairSync,createHash} from 'node:crypto';
import {signAssignmentCapability} from './scripts/rfid-simulator/event-v2.ts';
const [school,device,assignment]=process.argv.slice(2);const p=generateKeyPairSync('ed25519');
const now=Math.floor(Date.now()/1000);const claims={token_version:1,key_id:'fictional-test',assignment_id:assignment,assignment_version:1,credential_ref:'fictional-credential',device_id:device,school_id:school,not_before:now-60,expires_at:now+7200};
const cap=signAssignmentCapability(claims,p.privateKey);const expiredCap=signAssignmentCapability({...claims,not_before:now-7200,expires_at:now-1},p.privateKey);const pem=p.publicKey.export({type:'spki',format:'pem'}).toString();const privPem=p.privateKey.export({type:'pkcs8',format:'pem'}).toString();
process.stdout.write(JSON.stringify({cap,expiredCap,pem,privPem,pubHash:createHash('sha256').update(pem).digest('hex')}));
'''
        result = subprocess.run([NODE,'--input-type=module','-',self.school,self.device,self.assignment],input=gen,cwd=self.repo,capture_output=True,text=True)
        if result.returncode:
            raise RuntimeError('fictional signing fixture failed')
        keydata = json.loads(result.stdout)
        self.expired_capability=keydata['expiredCap']
        self.private_key=keydata['privPem']
        self.response = {'mode':'fictional_nano_enrollment_only','hardwareType':'nano_rc522','usbIdentity':H.USB_ID,
            'liveCaptureApproved':False,'deliveryApproved':False,'sourceDeploymentApproved':False,'requestId':self.request_id,
            'schoolId':self.school,'deviceId':self.device,'captureSessionId':OLD,'readerId':self.reader,
            'assignmentId':self.assignment,'assignmentVersion':1,'credentialRef':'fictional-credential',
            'capability':keydata['cap'],'capabilityPublicKey':keydata['pem'],'devicePublicKeySha256':keydata['pubHash']}
        self.request = {'requestId':self.request_id,'hardwareType':'nano_rc522','usbIdentity':H.USB_ID,'verificationPublicKey':keydata['pem']}
        uid_hash = hmac.new(bytes.fromhex(KEY),CARD.encode('ascii'),hashlib.sha256).hexdigest()
        self.config = {'version':1,'serial':{'port':H.PORT,'usbId':H.USB_ID,'seconds':30,'dtr':'off',
                'resetRiskAccepted':True,'monitorClosedConfirmed':True},
            'binding':{'version':1,'mode':'physical_legacy_host_receipt_time','sessionId':OLD,'schoolId':self.school,
                'sourceIdentity':H.USB_ID,'uidKey':KEY,'uidDigest':uid_hash,'eventType':'check_in','reviewedEnrollment':True,
                'capabilityPublicKey':keydata['pem']},
            'enrollment':{'readerId':self.reader,'readerKey':'c'*64,'deviceId':self.device,'assignmentId':self.assignment,
                'assignmentVersion':1,'credentialRef':'fictional-credential','capability':keydata['cap']}}
        self.cfg_bytes = self.dump(self.config)
        self.res_bytes = self.dump(self.response).ljust(1603,b' ')
        self.req_bytes = self.dump(self.request)
        self.approval = {'version':1,'hardwareType':'nano_rc522','fictionalOnly':True,'maxNewEvents':1,'maxRequests':2,
            'deviceId':self.device,'schoolId':self.school,'sessionId':OLD,'readerId':self.reader,
            'devicePublicKeySha256':keydata['pubHash'],
            'expiresAt':(dt.datetime.now(dt.timezone.utc)-dt.timedelta(minutes=2)).isoformat().replace('+00:00','Z')}
        self.approval_bytes = self.dump(self.approval)
        for name,data in [('reviewed.json',self.cfg_bytes),('transfer-response.json',self.res_bytes),
                          ('public-request.json',self.req_bytes),('live-approval.json',self.approval_bytes)]:
            (self.source/name).write_bytes(data)
        (self.source/'device-private.pem').write_text(self.private_key)
        for p in self.source.iterdir():
            if p.is_file():
                try: p.chmod(0o600)
                except OSError: pass
        canonical=json.dumps({'binding':self.config['binding'],'enrollment':self.config['enrollment']},separators=(',',':')).encode()
        self.binding_hash = hashlib.sha256(canonical).hexdigest()
        self.db.parent.mkdir(parents=True)
        con=sqlite3.connect(self.db)
        with con:
            con.executescript('''PRAGMA user_version=2;
                CREATE TABLE gateway_readers(reader_id TEXT PRIMARY KEY,device_id TEXT NOT NULL UNIQUE,token_sha256 TEXT NOT NULL,active INTEGER NOT NULL,created_at TEXT NOT NULL);
                CREATE TABLE gateway_events(device_id TEXT,remote_receipt_id TEXT);
                CREATE TABLE physical_legacy_sessions(session_id TEXT PRIMARY KEY,binding_hash TEXT,last_uptime INTEGER,needs_review INTEGER);
            ''')
            con.execute('INSERT INTO gateway_readers VALUES(?,?,?,?,?)',(self.reader,self.device,hashlib.sha256(('c'*64).encode()).hexdigest(),1,'fictional'))
            con.execute('INSERT INTO physical_legacy_sessions VALUES(?,?,NULL,0)',(OLD,self.binding_hash))
        con.close()
        self.db.chmod(0o600)
        self.db_hash = hashlib.sha256(self.db.read_bytes()).digest()
        self.new_id = NEW

    @staticmethod
    def dump(value):
        return (json.dumps(value,separators=(',',':'))+'\n').encode()

    def node_verify(self, repo, old, response, request, candidate, response_sha, private_key):
        # Execute the exact verifier over temp-only inputs, under Node with inherited
        # Node loader hooks removed. Windows fixture files cannot model POSIX owner
        # mode bits, so emulate 0600/owner metadata only for this temporary key file;
        # the production helper still checks actual Pi filesystem metadata.
        env = {k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
        script = H.NODE_VERIFY
        if os.name == 'nt':
            shim = r'''process.getuid=()=>0;
const __lstat=fs.lstatSync.bind(fs),__fstat=fs.fstatSync.bind(fs),__open=fs.openSync.bind(fs),__key=process.argv[7],__fds=new Set();
const __posix=s=>{s.uid=0;s.mode=(s.mode&~0o777)|0o600;return s};
fs.lstatSync=(p,...a)=>{const s=__lstat(p,...a);return String(p)===__key?__posix(s):s};
fs.openSync=(p,...a)=>{const fd=__open(p,...a);if(String(p)===__key)__fds.add(fd);return fd};
fs.fstatSync=(fd,...a)=>{const s=__fstat(fd,...a);return __fds.has(fd)?__posix(s):s};
'''
            script = script.replace("const [oldPath", shim + "\nconst [oldPath", 1)
        p = subprocess.run([NODE,'--input-type=module','-',str(old),str(response),str(request),str(candidate),response_sha,str(private_key)],
            input=script,cwd=repo,capture_output=True,text=True,env=env)
        if p.returncode:
            raise H.Refusal('fixture_node_verification')
        return json.loads(p.stdout)

    def queue_check(self, db, device, old_session, new_session, reader, reader_hash, binding_hash, previous_sessions=None):
        uri='file:'+H.urllib.parse.quote(str(db),safe='/')+'?mode=ro&immutable=1'
        con=sqlite3.connect(uri,uri=True)
        try:
            self.asserted=con.execute('SELECT COUNT(*) FROM gateway_events WHERE device_id=?',(device,)).fetchone()[0]
            rr=con.execute('SELECT reader_id,device_id,token_sha256,active FROM gateway_readers WHERE device_id=?',(device,)).fetchall()
            old=con.execute('SELECT binding_hash FROM physical_legacy_sessions WHERE session_id=?',(old_session,)).fetchall()
            new=con.execute('SELECT 1 FROM physical_legacy_sessions WHERE session_id=?',(new_session,)).fetchall()
            rows=con.execute('SELECT session_id,binding_hash,last_uptime,needs_review FROM physical_legacy_sessions').fetchall()
            if self.asserted or rr != [(reader,device,reader_hash,1)] or old != [(binding_hash,)] or new:
                raise H.Refusal('fictional_queue_scope')
            expected={old_session:binding_hash,**(previous_sessions or {})}
            for sid,stored,last_uptime,needs_review in rows:
                if sid not in expected or stored!=expected[sid] or (sid!=old_session and (last_uptime is not None or needs_review!=0)):
                    raise H.Refusal('fictional_previous_session_scope')
            if old_session not in {r[0] for r in rows}:
                raise H.Refusal('fictional_source_session_missing')
        finally: con.close()
        return (hashlib.sha256(db.read_bytes()).digest(),db.stat().st_size,db.stat().st_mtime_ns)

    @staticmethod
    def session_fingerprint(directory):
        result={}
        for p in sorted(directory.iterdir()):
            s=p.lstat();data=p.read_bytes();after=p.lstat()
            if not stat.S_ISREG(s.st_mode) or p.is_symlink() or (s.st_ino,s.st_size,s.st_mtime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns):
                raise H.Refusal('fixture_previous_session_changed')
            result[p.name]=(s.st_dev,s.st_ino,s.st_uid,s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns,hashlib.sha256(data).digest())
        return result

    def actual_approval_check(self, repo, config, approval):
        module=(SOURCE/'scripts/physical-rfid/bounded-gateway.mjs').as_uri()
        js=f"import fs from 'node:fs';const {{checkApproval}}=await import({json.dumps(module)});const c=JSON.parse(fs.readFileSync(process.argv[2]));const a=JSON.parse(fs.readFileSync(process.argv[3]));checkApproval(a,c);process.stdout.write('PASS');"
        env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','NODE_PATH')}
        p=subprocess.run([NODE,'--input-type=module','-',str(config),str(approval)],input=js,cwd=SOURCE,capture_output=True,text=True,env=env)
        if p.returncode or p.stdout!='PASS': raise H.Refusal('deployed_contract_rejected_fixture')

    def close(self): self.temp.cleanup()


class FreshSessionTests(unittest.TestCase):
    def setUp(self):
        self.fx=Fixture()
        self.cwd=pathlib.Path.cwd()
        os.chdir(self.fx.repo)
        self.stack=contextlib.ExitStack()
        self.stack.enter_context(mock.patch.object(H,'RESPONSE_SHA256',hashlib.sha256(self.fx.res_bytes).hexdigest()))
        self.stack.enter_context(mock.patch.object(H,'check_private_dir',lambda p: p.is_dir() and not p.is_symlink()))
        self.stack.enter_context(mock.patch.object(H,'check_private_file',lambda p: p.stat() if p.is_file() and not p.is_symlink() else (_ for _ in ()).throw(H.Refusal('fixture_private_key'))))
        self.stack.enter_context(mock.patch.object(H,'read_private_json',self.read_json))
        self.stack.enter_context(mock.patch.object(H,'queue_readonly',self.fx.queue_check))
        self.stack.enter_context(mock.patch.object(H,'private_tree_fingerprint',self.fx.session_fingerprint))
        self.stack.enter_context(mock.patch.object(H,'check_created_dir',lambda p: p.is_dir() and not p.is_symlink()))
        self.stack.enter_context(mock.patch.object(H,'check_created_file',lambda p: p.is_file() and not p.is_symlink()))
        self.stack.enter_context(mock.patch.object(H,'current_uid',lambda: self.fx.source.stat().st_uid))
        self.serial=mock.Mock()

    def tearDown(self):
        os.chdir(self.cwd);self.stack.close();self.fx.close()

    def read_json(self,path,exact_size=None):
        data=path.read_bytes()
        if exact_size is not None and len(data)!=exact_size: raise H.Refusal('fixture_size')
        return data,json.loads(data,object_pairs_hook=H.no_duplicate)

    def prepare(self, **changes):
        deps={'uid_prompt':lambda _:'FA:CE:B0:0C','confirm_prompt':lambda p:'CLOSED' if 'closed' in p.lower() else 'ACCEPT-RESET',
            'node_verify':self.fx.node_verify,'serial_check':self.serial,'platform_check':False,
            'session_factory':lambda:uuid.UUID(NEW),'approval_check':self.fx.actual_approval_check,
            'created_dir_check':lambda p:p.is_dir() and not p.is_symlink(),
            'created_file_check':lambda p:p.is_file() and not p.is_symlink(),
            'sync_directory':lambda _p:None}
        deps.update(changes)
        return H.prepare(self.fx.repo,**deps)

    def queue_read(self, db=None, **overrides):
        database=db or self.fx.db
        files=[database,*[pathlib.Path(str(database)+suffix) for suffix in ('-wal','-shm','-journal')]]
        fixture_contents={p:p.read_bytes() for p in files if p.exists()}
        options={'connect':sqlite3.connect,
            'run_process':lambda *a,**k:subprocess.CompletedProcess(a[0],1,b'',b''),
            'database_mode':None,'read_file':lambda p:fixture_contents[p],
            'atime_check':lambda _p:None}
        options.update(overrides)
        return QUEUE_READONLY(database,self.fx.device,OLD,NEW,self.fx.reader,
            hashlib.sha256(('c'*64).encode()).hexdigest(),self.fx.binding_hash,**options)

    def add_previous_session(self, *, age_after_expiry=180, last_uptime=None, needs_review=0, persist=True):
        session='33333333-3333-4333-8333-333333333333'
        directory=self.fx.root/('nano-session-'+session);directory.mkdir(mode=0o700)
        cfg=json.loads(self.fx.cfg_bytes);cfg['binding']['sessionId']=session
        cfg['serial']['resetRiskAccepted']=True;cfg['serial']['monitorClosedConfirmed']=True
        cfg_path=directory/'reviewed.json';cfg_path.write_bytes(Fixture.dump(cfg));cfg_path.chmod(0o600)
        response=json.loads(self.fx.res_bytes)
        response_sha=hashlib.sha256(self.fx.res_bytes).hexdigest()
        proof=self.fx.node_verify(self.fx.repo,self.fx.source/'reviewed.json',self.fx.source/'transfer-response.json',
            self.fx.source/'public-request.json',cfg_path,response_sha,self.fx.source/'device-private.pem')
        expires=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=age_after_expiry)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        approval={'version':1,'hardwareType':'nano_rc522','fictionalOnly':True,'maxNewEvents':1,'maxRequests':2,
            'deviceId':self.fx.device,'schoolId':self.fx.school,'sessionId':session,'readerId':self.fx.reader,
            'devicePublicKeySha256':self.fx.response['devicePublicKeySha256'],'expiresAt':expires}
        provenance={'version':1,'sourceResponseSha256':response_sha,'sourceSessionId':OLD,
            'sourceConfigSha256':hashlib.sha256(self.fx.cfg_bytes).hexdigest(),'newSessionId':session,
            'sourceDirectory':H.SOURCE_DIR}
        for name,value in [('live-approval.json',approval),('provenance.json',provenance)]:
            p=directory/name;p.write_bytes(Fixture.dump(value));p.chmod(0o600)
        fingerprint={p.name:(hashlib.sha256(p.read_bytes()).digest(),p.stat().st_size,p.stat().st_mtime_ns)
                     for p in directory.iterdir()}
        if persist:
            con=sqlite3.connect(self.fx.db)
            try:
                with con:con.execute('INSERT INTO physical_legacy_sessions VALUES(?,?,?,?)',
                    (session,proof['sessionBindingHash'],last_uptime,needs_review))
            finally:con.close()
        return directory,session,fingerprint,proof['sessionBindingHash']

    def test_success_preserves_historical_source_and_creates_one_scoped_session(self):
        out=__import__('io').StringIO()
        with contextlib.redirect_stdout(out): newdir=self.prepare()
        self.assertEqual(newdir.name,'nano-session-'+NEW)
        self.assertEqual((self.fx.source/'reviewed.json').read_bytes(),self.fx.cfg_bytes)
        self.assertEqual((self.fx.source/'live-approval.json').read_bytes(),self.fx.approval_bytes)
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),self.fx.db_hash)
        nc=json.loads((newdir/'reviewed.json').read_text()); ap=json.loads((newdir/'live-approval.json').read_text())
        self.assertEqual(nc['binding']['sessionId'],NEW)
        for section,fields in [('enrollment',('deviceId','readerId','assignmentId','assignmentVersion','credentialRef','capability','readerKey')),
                               ('binding',('schoolId','uidKey','uidDigest','capabilityPublicKey'))]:
            for field in fields:self.assertEqual(nc[section][field],self.fx.config[section][field])
        self.assertEqual(ap['sessionId'],NEW);self.assertEqual(ap['maxNewEvents'],1);self.assertEqual(ap['maxRequests'],2)
        self.assertEqual({p.name for p in newdir.iterdir()},{'reviewed.json','provenance.json','live-approval.json'})
        prov=json.loads((newdir/'provenance.json').read_text());self.assertEqual(prov['sourceSessionId'],OLD);self.assertEqual(prov['newSessionId'],NEW)
        self.assertEqual(prov['sourceResponseSha256'],hashlib.sha256(self.fx.res_bytes).hexdigest())
        self.assertEqual(prov['sourceConfigSha256'],hashlib.sha256(self.fx.cfg_bytes).hexdigest())
        self.assertNotIn(CARD,out.getvalue());self.assertNotIn(KEY,out.getvalue());self.assertNotIn(self.fx.response['capability'],out.getvalue());self.assertNotIn(self.fx.private_key,out.getvalue())
        self.serial.assert_called();self.assertEqual(len(list(self.fx.root.glob('nano-session-*'))),1)

    def test_card_hmac_match_and_mismatch_are_private(self):
        self.assertTrue(H.verify_card_a(CARD,KEY,self.fx.config['binding']['uidDigest']))
        self.assertFalse(H.verify_card_a('11:22:33:44',KEY,self.fx.config['binding']['uidDigest']))
        with self.assertRaises(H.Refusal):H.verify_card_a('bad',KEY,self.fx.config['binding']['uidDigest'])

    def test_owner_only_metadata_rejects_wrong_owner_mode_and_file_type(self):
        good=type('S',(),{'st_mode':stat.S_IFREG|0o600,'st_uid':41})()
        self.assertTrue(H.stat_matches(good,kind='file',owner=41,mode=0o600))
        self.assertFalse(H.stat_matches(good,kind='file',owner=42,mode=0o600))
        self.assertFalse(H.stat_matches(good,kind='file',owner=41,mode=0o640))
        self.assertFalse(H.stat_matches(good,kind='dir',owner=41,mode=0o700))

    def test_missing_card_uid_reports_pending_without_writing(self):
        out=__import__('io').StringIO()
        with contextlib.redirect_stdout(out),self.assertRaises(H.Refusal):self.prepare(uid_prompt=lambda _:'')
        self.assertIn('CARD A MAPPING: PENDING',out.getvalue());self.assertFalse(list(self.fx.root.glob('nano-session-*')))
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),self.fx.db_hash)

    def test_wrong_card_stops_before_any_new_session_or_queue_change(self):
        out=__import__('io').StringIO()
        with contextlib.redirect_stdout(out),self.assertRaises(H.Refusal):self.prepare(uid_prompt=lambda _:'11:22:33:44')
        self.assertIn('CARD A MAPPING: MISMATCH',out.getvalue());self.assertFalse(list(self.fx.root.glob('nano-session-*')))
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),self.fx.db_hash)

    def test_old_session_is_preserved_and_rejected_as_fresh_target(self):
        with self.assertRaises(H.Refusal):self.prepare(session_factory=lambda:uuid.UUID(OLD))
        self.assertTrue((self.fx.source/'live-approval.json').exists())
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),self.fx.db_hash)

    def test_invalid_or_expiring_capability_fails_before_serial_or_writes(self):
        r=json.loads((self.fx.source/'transfer-response.json').read_text())
        c=json.loads((self.fx.source/'reviewed.json').read_text())
        r['capability']=self.fx.expired_capability;c['enrollment']['capability']=self.fx.expired_capability
        rb=Fixture.dump(r).ljust(1603,b' ');(self.fx.source/'transfer-response.json').write_bytes(rb)
        (self.fx.source/'reviewed.json').write_bytes(Fixture.dump(c))
        with mock.patch.object(H,'RESPONSE_SHA256',hashlib.sha256(rb).hexdigest()),self.assertRaises(H.Refusal):self.prepare()
        self.serial.assert_not_called();self.assertFalse(list(self.fx.root.glob('nano-session-*')))

    def test_enrollment_scope_mismatch_fails_closed(self):
        r=json.loads((self.fx.source/'transfer-response.json').read_text())
        r['deviceId']=str(uuid.uuid4());data=Fixture.dump(r).ljust(1603,b' ');(self.fx.source/'transfer-response.json').write_bytes(data)
        with mock.patch.object(H,'RESPONSE_SHA256',hashlib.sha256(data).hexdigest()),self.assertRaises(H.Refusal):self.prepare()
        self.serial.assert_not_called();self.assertFalse(list(self.fx.root.glob('nano-session-*')))

    def test_existing_device_event_or_new_session_row_refuses(self):
        for sql,args in [('INSERT INTO gateway_events VALUES(?,?)',(self.fx.device,'fake-receipt')),
                         ('INSERT INTO physical_legacy_sessions VALUES(?,?,NULL,0)',(NEW,'fake-hash'))]:
            con=sqlite3.connect(self.fx.db)
            with con:con.execute(sql,args)
            con.close()
            with self.assertRaises(H.Refusal):self.prepare()
            con=sqlite3.connect(self.fx.db)
            with con:
                if 'gateway_events' in sql:con.execute('DELETE FROM gateway_events WHERE device_id=?',(self.fx.device,))
                else:con.execute('DELETE FROM physical_legacy_sessions WHERE session_id=?',(NEW,))
            con.close()

    def test_conflicting_approval_or_previous_session_artifact_refuses(self):
        another=self.fx.root/'other' ; another.mkdir();(another/'live-approval.json').write_text('{}')
        with self.assertRaises(H.Refusal):self.prepare()
        (another/'live-approval.json').unlink();another.rmdir()
        prior=self.fx.root/'nano-session-old';prior.mkdir()
        with self.assertRaises(H.Refusal):self.prepare()

    def test_completed_zero_scan_session_allows_fresh_subsequent_session_and_preserves_history(self):
        directory,previous,fingerprint,previous_hash=self.add_previous_session()
        self.queue_read(previous_sessions={previous:previous_hash})
        with self.assertRaisesRegex(H.Refusal,'fresh_uuid_invalid_or_reused'):
            self.prepare(session_factory=lambda:uuid.UUID(previous))
        before_db=hashlib.sha256(self.fx.db.read_bytes()).digest()
        with contextlib.redirect_stdout(__import__('io').StringIO()):newdir=self.prepare()
        self.assertNotEqual(newdir.name,'nano-session-'+previous)
        self.assertEqual({p.name:(hashlib.sha256(p.read_bytes()).digest(),p.stat().st_size,p.stat().st_mtime_ns)
                          for p in directory.iterdir()},fingerprint)
        self.assertEqual((self.fx.source/'reviewed.json').read_bytes(),self.fx.cfg_bytes)
        self.assertEqual((self.fx.source/'live-approval.json').read_bytes(),self.fx.approval_bytes)
        con=sqlite3.connect(self.fx.db)
        try:
            row=con.execute('SELECT session_id,last_uptime,needs_review FROM physical_legacy_sessions WHERE session_id=?',(previous,)).fetchone()
            self.assertEqual(row,(previous,None,0))
        finally:con.close()
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),before_db)

    def test_previous_unexpired_or_too_recent_approval_is_refused(self):
        self.add_previous_session(age_after_expiry=20,persist=False)
        with self.assertRaisesRegex(H.Refusal,'previous_attempt_active_or_ambiguous'):self.prepare()
        self.assertEqual(len(list(self.fx.root.glob('nano-session-*'))),1)

    def test_incomplete_previous_session_is_refused_and_preserved(self):
        directory=self.fx.root/'nano-session-44444444-4444-4444-8444-444444444444'
        directory.mkdir(mode=0o700);marker=directory/'partial';marker.write_text('fixture')
        with self.assertRaisesRegex(H.Refusal,'previous_session_incomplete'):self.prepare()
        self.assertEqual(marker.read_text(),'fixture')

    def test_previous_session_with_event_or_held_state_is_refused(self):
        directory,previous,_,previous_hash=self.add_previous_session()
        # The mock queue reader models the same fail-closed event check as production.
        con=sqlite3.connect(self.fx.db)
        try:
            with con:con.execute('INSERT INTO gateway_events VALUES(?,?)',(self.fx.device,'fictional-prior-event'))
        finally:con.close()
        with self.assertRaises(H.Refusal):self.queue_read(previous_sessions={previous:previous_hash})
        with self.assertRaises(H.Refusal):self.prepare()
        self.assertTrue((directory/'live-approval.json').exists())
        con=sqlite3.connect(self.fx.db)
        try:
            with con:con.execute('DELETE FROM gateway_events WHERE device_id=?',(self.fx.device,))
            with con:con.execute('UPDATE physical_legacy_sessions SET needs_review=1 WHERE session_id=?',(previous,))
        finally:con.close()
        with self.assertRaisesRegex(H.Refusal,'previous_session_unreviewed_state'):
            self.queue_read(previous_sessions={previous:previous_hash})
        with self.assertRaises(H.Refusal):self.prepare()
        self.assertTrue((directory/'reviewed.json').exists())

    def test_partial_file_failure_rolls_back_only_new_session(self):
        real=H.write_exclusive;calls=0
        def fail_second(path,data,created):
            nonlocal calls
            calls+=1
            if calls==2:raise OSError('fictional partial-write fault')
            return real(path,data,created)
        with self.assertRaises(H.Refusal):self.prepare(write_file=fail_second)
        self.assertFalse((self.fx.root/('nano-session-'+NEW)).exists())
        self.assertEqual((self.fx.source/'reviewed.json').read_bytes(),self.fx.cfg_bytes)
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),self.fx.db_hash)

    def test_bad_operator_confirmation_writes_nothing(self):
        with self.assertRaises(H.Refusal):self.prepare(confirm_prompt=lambda _:'NO')
        self.assertFalse(list(self.fx.root.glob('nano-session-*')))
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),self.fx.db_hash)

    def test_permission_refusal_and_conflicting_target_are_not_overwritten(self):
        with mock.patch.object(H,'check_private_dir',side_effect=H.Refusal('permissions')):
            with self.assertRaises(H.Refusal):self.prepare()
        target=self.fx.root/('nano-session-'+NEW);target.mkdir();marker=target/'marker';marker.write_text('keep')
        with self.assertRaises(H.Refusal):self.prepare()
        self.assertEqual(marker.read_text(),'keep')

    def test_sqlite_fixture_is_read_only_and_helper_has_no_capture_delivery_or_backend_call(self):
        before=hashlib.sha256(self.fx.db.read_bytes()).digest()
        uri='file:'+H.urllib.parse.quote(str(self.fx.db),safe='/')+'?mode=ro&immutable=1'
        con=sqlite3.connect(uri,uri=True)
        try:
            con.execute('PRAGMA query_only=ON')
            with self.assertRaises(sqlite3.OperationalError):
                con.execute("INSERT INTO gateway_events VALUES('fictional','receipt')")
        finally:con.close()
        self.assertEqual(hashlib.sha256(self.fx.db.read_bytes()).digest(),before)
        source=HELPER.read_text()
        for forbidden in ('LocalSupabaseV2Transport','serial.Serial','urllib.request','requests.'):
            self.assertNotIn(forbidden,source)

    def test_empty_wal_and_shm_are_accepted_read_only_and_unchanged(self):
        wal=pathlib.Path(str(self.fx.db)+'-wal');shm=pathlib.Path(str(self.fx.db)+'-shm')
        wal.write_bytes(b'');shm.write_bytes(b'SHM fixture only')
        before={p:(hashlib.sha256(p.read_bytes()).digest(),p.stat().st_size,p.stat().st_mtime_ns,p.stat().st_ctime_ns)
                for p in (self.fx.db,wal,shm)}
        self.queue_read()
        after={p:(hashlib.sha256(p.read_bytes()).digest(),p.stat().st_size,p.stat().st_mtime_ns,p.stat().st_ctime_ns)
               for p in (self.fx.db,wal,shm)}
        self.assertEqual(before,after)

    def test_nonempty_wal_fails_closed_without_touching_files(self):
        wal=pathlib.Path(str(self.fx.db)+'-wal');shm=pathlib.Path(str(self.fx.db)+'-shm')
        wal.write_bytes(b'committed-frame-fixture');shm.write_bytes(b'shm-fixture')
        before=[(p.read_bytes(),p.stat().st_size,p.stat().st_mtime_ns) for p in (self.fx.db,wal,shm)]
        with self.assertRaisesRegex(H.Refusal,'sqlite_wal_nonempty'):self.queue_read()
        after=[(p.read_bytes(),p.stat().st_size,p.stat().st_mtime_ns) for p in (self.fx.db,wal,shm)]
        self.assertEqual(before,after)

    def test_missing_database_fails_closed(self):
        with self.assertRaisesRegex(H.Refusal,'sqlite_missing'):
            self.queue_read(db=self.fx.db.parent/'missing.sqlite')

    def test_conflicting_session_and_existing_device_event_are_rejected(self):
        cases=[('INSERT INTO physical_legacy_sessions VALUES(?,?,NULL,0)',(NEW,'other-session')),
               ('INSERT INTO gateway_events VALUES(?,?)',(self.fx.device,'fictional-receipt'))]
        for sql,args in cases:
            con=sqlite3.connect(self.fx.db)
            try:
                with con:con.execute(sql,args)
            finally:con.close()
            with self.assertRaises(H.Refusal):self.queue_read()
            con=sqlite3.connect(self.fx.db)
            try:
              with con:
                if 'physical_legacy_sessions' in sql:con.execute('DELETE FROM physical_legacy_sessions WHERE session_id=?',(NEW,))
                else:con.execute('DELETE FROM gateway_events WHERE device_id=?',(self.fx.device,))
            finally:con.close()

    def test_database_errors_and_active_users_fail_closed(self):
        def broken_connect(*_a,**_k):raise sqlite3.DatabaseError('synthetic database fault')
        with self.assertRaisesRegex(H.Refusal,'sqlite_readonly_check'):
            self.queue_read(connect=broken_connect)
        locked=lambda *a,**k:subprocess.CompletedProcess(a[0],0,b'1234',b'')
        with self.assertRaisesRegex(H.Refusal,'sqlite_in_use'):
            self.queue_read(run_process=locked)


if __name__=='__main__':
    unittest.main(verbosity=2)
