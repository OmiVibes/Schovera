import datetime as dt
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).with_name('supervised-one-card-demo.py')
SPEC = importlib.util.spec_from_file_location('supervised_one_card_demo', PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeliveryApprovalTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 22, 12, 0, tzinfo=dt.timezone.utc)
        self.capture = {
            'version': 1, 'hardwareType': 'nano_rc522', 'fictionalOnly': True,
            'maxNewEvents': 1, 'maxRequests': 2,
            'deviceId': '11111111-1111-4111-8111-111111111111',
            'schoolId': '22222222-2222-4222-8222-222222222222',
            'sessionId': '33333333-3333-4333-8333-333333333333',
            'readerId': '44444444-4444-4444-8444-444444444444',
            'devicePublicKeySha256': 'a' * 64,
            'expiresAt': '2026-11-22T12:05:00.000Z',
        }

    def test_event_scoped_delivery_approval_is_exact_and_short_lived(self):
        event_id = '55555555-5555-8555-8555-555555555555'
        result = MODULE.delivery_approval(self.capture, event_id, 'b' * 64, self.now)
        self.assertEqual(set(result), MODULE.DELIVERY_KEYS)
        self.assertEqual(result['eventId'], event_id)
        self.assertEqual(result['payloadSha256'], 'b' * 64)
        self.assertEqual(result['maxNewEvents'], 1)
        self.assertEqual(result['maxRequests'], 2)
        self.assertEqual(result['expiresAt'], '2026-11-22T12:05:00.000Z')

    def test_rejects_wrong_capture_contract_or_bad_event_identity(self):
        for bad in ({**self.capture, 'maxNewEvents': 2},
                    {**self.capture, 'hardwareType': 'local_simulator'}):
            with self.assertRaises(MODULE.Stop):
                MODULE.delivery_approval(bad, '55555555-5555-8555-8555-555555555555', 'b' * 64, self.now)
        with self.assertRaises(MODULE.Stop):
            MODULE.delivery_approval(self.capture, 'not-an-event', 'b' * 64, self.now)
        with self.assertRaises(MODULE.Stop):
            MODULE.delivery_approval(self.capture, '55555555-5555-8555-8555-555555555555', 'bad', self.now)


class SessionSelectionTests(unittest.TestCase):
    def test_reuses_only_the_explicit_single_live_session(self):
        expiry = dt.datetime(2026, 11, 22, 12, 4, tzinfo=dt.timezone.utc)
        self.assertEqual(MODULE.choose_session_action('session-a', [('session-a', expiry)],
                         dt.datetime(2026, 11, 22, 12, 0, tzinfo=dt.timezone.utc)), 'reuse_explicit')

    def test_expired_sessions_prepare_once_and_ambiguity_stops(self):
        now = dt.datetime(2026, 11, 22, 12, 0, tzinfo=dt.timezone.utc)
        self.assertEqual(MODULE.choose_session_action('session-a', [], now), 'prepare_fresh')
        with self.assertRaises(MODULE.Stop):
            MODULE.choose_session_action('session-a', [('session-b', now + dt.timedelta(minutes=2))], now)
        with self.assertRaises(MODULE.Stop):
            MODULE.choose_session_action('session-a', [('session-a', now + dt.timedelta(minutes=2)),
                ('session-b', now + dt.timedelta(minutes=3))], now)
        with self.assertRaises(MODULE.Stop):
            MODULE.choose_session_action('session-a', [('session-a', now + dt.timedelta(seconds=20))], now)


if __name__ == '__main__':
    unittest.main()
