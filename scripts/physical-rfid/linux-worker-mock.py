"""Native worker lifecycle tests. Every port, descriptor and OS ioctl is mocked.
Run only as a test, never as hardware detection. No termios/fcntl are imported.
"""
import importlib.util
import io
from pathlib import Path
import stat
import sys
import types
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('capture_worker', Path(__file__).with_name('linux-readonly.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def run_mock(self, failure=None):
        class Clock:
            now = 0.0
            def monotonic(self):
                return self.now
            def select(self, readers, _writers, _errors, timeout):
                if readers == [0]:
                    return ([0] if failure == 'cancel' else []), [], []
                self.now += max(0.05, timeout)
                return ([22] if failure != 'disconnect' else [22]), [], []
        clock = Clock()
        fcntl = types.SimpleNamespace(LOCK_EX=1, LOCK_NB=2, flock=Mock(), ioctl=Mock())
        if failure == 'busy':
            fcntl.flock.side_effect = OSError('PRIVATE_SENTINEL')
        termios = types.SimpleNamespace(TIOCEXCL=1, CS8=2, CREAD=4, CLOCAL=8,
                                      B115200=4098, VMIN=0, VTIME=1, TCSANOW=0,
                                      TIOCMBIS=1, TIOCMBIC=2, TIOCM_DTR=2, TIOCM_RTS=4,
                                      tcgetattr=Mock(return_value=[0, 0, 0, 0, 0, 0, [0, 0]]),
                                      tcsetattr=Mock())
        desc = types.SimpleNamespace(st_mode=stat.S_IFCHR, st_rdev=11)
        output = io.StringIO()
        reads = Mock(return_value=b'CLOSE\n' if failure == 'cancel' else b'' if failure == 'disconnect' else b'SCHOVERA_RFID_READY\n')
        identity = ('/dev/ttyUSB0', '1a86:7523:MOCK')
        if failure == 'identity':
            identity = ('/dev/ttyUSB0', '1a86:7523:WRONG')
        def slow_open(*_args, **_kwargs):
            clock.now += 20  # Simulate a slow but successful serial initialization.
            return 22
        with patch.dict(sys.modules, {'fcntl': fcntl, 'termios': termios,
                                      'select': types.SimpleNamespace(select=clock.select)}), \
                patch.object(worker, 'resolve_identity', return_value=identity), \
                patch.object(worker.os, 'stat', return_value=desc), \
                patch.object(worker.os, 'fstat', return_value=desc), \
                patch.object(worker.os, 'open', side_effect=slow_open) as opened, \
                patch.object(worker.os, 'close') as closed, \
                patch.object(worker.os, 'read', reads), \
                patch.object(worker.time, 'monotonic', side_effect=clock.monotonic), \
                patch.object(worker.sys, 'stdin', types.SimpleNamespace(fileno=lambda: 0)), \
                patch.object(worker.sys, 'stdout', output), \
                patch.object(worker.os, 'O_NOCTTY', 256, create=True), \
                patch.object(worker.os, 'O_CLOEXEC', 512, create=True), \
                patch.object(worker.os, 'O_NONBLOCK', 1024, create=True), \
                patch.object(worker.os, 'O_NOFOLLOW', 2048, create=True):
            worker.main(['/dev/serial/by-id/usb-MOCK', '1a86:7523:MOCK', '30', 'off', 'ack-reset-risk', 'monitor-closed'])
        return output.getvalue(), opened, closed

    def test_timeout_closes_exact_owned_descriptor(self):
        text, opened, closed = self.run_mock()
        self.assertIn('"reason":"deadline"', text)
        opened.assert_called_once()
        closed.assert_called_once_with(22)

    def test_identity_mismatch_never_opens(self):
        text, opened, closed = self.run_mock('identity')
        self.assertIn('identity_mismatch', text)
        opened.assert_not_called()
        closed.assert_not_called()

    def test_busy_port_is_closed_without_raw_error(self):
        text, _, closed = self.run_mock('busy')
        self.assertIn('port_busy_denied_or_unavailable', text)
        self.assertNotIn('PRIVATE_SENTINEL', text)
        closed.assert_called_once_with(22)

    def test_disconnect_is_not_a_successful_empty_read(self):
        text, _, closed = self.run_mock('disconnect')
        self.assertIn('serial_disconnected', text)
        self.assertIn('"reason":"disconnect"', text)
        closed.assert_called_once_with(22)

    def test_cancel_before_open_never_opens(self):
        text, opened, closed = self.run_mock('cancel')
        self.assertIn('"reason":"stop_requested"', text)
        opened.assert_not_called()
        closed.assert_not_called()

    def test_capture_window_starts_after_slow_port_open(self):
        text, opened, closed = self.run_mock()
        self.assertIn('"type":"opened"', text)
        self.assertIn('"reason":"deadline"', text)
        # Slow initialization is excluded: the worker continues through its
        # bounded post-open shutdown margin rather than ending at 30s total.
        self.assertGreater(text.count('"type":"bytes"'), 100)
        opened.assert_called_once()
        closed.assert_called_once_with(22)


if __name__ == '__main__':
    unittest.main()
