"""Private read-only IPC worker. No backend, serial writes, shell or third-party modules.

Top-level imports/helpers are portable for mock tests. Hardware access lives only
in main(), invoked by the reviewed Node transport, never during import.
"""
import base64
import errno
import json
import os
import re
import sys
import time


def validate_selection(port, identity, seconds, dtr):
    if (not re.fullmatch(r'/dev/serial/by-id/[A-Za-z0-9_.:+-]{1,200}', port)
            or not re.fullmatch(r'[0-9a-f]{4}:[0-9a-f]{4}:[A-Za-z0-9_.+-]{1,128}', identity)
            or not isinstance(seconds, int) or not 1 <= seconds <= 30
            or dtr not in ('on', 'off')):
        raise ValueError('preflight_refused')


def resolve_identity(port):
    from pathlib import Path
    target = Path(port).resolve(strict=True)
    if not re.fullmatch(r'/dev/tty(?:USB|ACM)[0-9]+', str(target)):
        raise ValueError('identity_mismatch')
    device = Path('/sys/class/tty', target.name, 'device').resolve(strict=True)
    for parent in [device, *list(device.parents)[:12]]:
        if (parent / 'idVendor').is_file() and (parent / 'idProduct').is_file():
            # A missing USB serial requires an operator-reviewed identity design;
            # do not silently substitute a USB bus address or tty number.
            identity = ':'.join((parent / name).read_text().strip()
                                for name in ('idVendor', 'idProduct', 'serial'))
            return str(target), identity
    raise ValueError('identity_mismatch')


def main(argv):
    import array
    import fcntl
    import select
    import stat
    import termios
    fd = None
    reason = 'failure'

    def emit(value):
        sys.stdout.write(json.dumps(value, separators=(',', ':')) + '\n')
        sys.stdout.flush()

    try:
        if len(argv) != 6 or argv[4:] != ['ack-reset-risk', 'monitor-closed']:
            raise ValueError('preflight_refused')
        port, identity, seconds_text, dtr = argv[:4]
        if not re.fullmatch(r'(?:[1-9]|[12][0-9]|30)', seconds_text):
            raise ValueError('preflight_refused')
        seconds = int(seconds_text)
        validate_selection(port, identity, seconds, dtr)
        target, found = resolve_identity(port)
        if found != identity:
            raise ValueError('identity_mismatch')
        before = os.stat(target, follow_symlinks=False)
        if not stat.S_ISCHR(before.st_mode):
            raise ValueError('identity_mismatch')
        # A delayed worker must not open after its parent already cancelled.
        pending, _, _ = select.select([sys.stdin.fileno()], [], [], 0)
        if sys.stdin.fileno() in pending:
            control = os.read(sys.stdin.fileno(), 64)
            if control not in (b'', b'CLOSE\n'):
                raise ValueError('preflight_refused')
            reason = 'stop_requested'
            return
        fd = os.open(target, os.O_RDONLY | os.O_NONBLOCK | os.O_NOCTTY | os.O_CLOEXEC | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.ioctl(fd, termios.TIOCEXCL)
        opened = os.fstat(fd)
        if before.st_rdev != opened.st_rdev or resolve_identity(port) != (target, identity):
            raise ValueError('identity_mismatch')
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0  # No software flow control or input conversions.
        attrs[1] = 0
        attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
        attrs[3] = 0  # No echo, canonical line discipline or signals.
        attrs[4] = attrs[5] = termios.B115200
        attrs[6][termios.VMIN] = attrs[6][termios.VTIME] = 0
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        # Explicit modem-line operations are not serial payload writes. Opening
        # the descriptor may already have pulsed DTR; never promise reset-free.
        fcntl.ioctl(fd, termios.TIOCMBIS if dtr == 'on' else termios.TIOCMBIC,
                    array.array('i', [termios.TIOCM_DTR]))
        fcntl.ioctl(fd, termios.TIOCMBIC, array.array('i', [termios.TIOCM_RTS]))
        # The Node supervisor enforces the exact <=30-second operator window
        # after it reports port readiness. Keep a one-second worker-side
        # shutdown margin so IPC/reporting latency cannot shorten that window;
        # the parent stops accepting bytes at the configured deadline.
        capture_started = time.monotonic()
        emit(dict(type='opened', port=port, baud=115200, dtr=dtr, rts='off', handshake='none'))
        checked = capture_started
        control = b''
        worker_deadline = capture_started + seconds + 1.0
        while time.monotonic() < worker_deadline:
            remaining = worker_deadline - time.monotonic()
            ready, _, _ = select.select([fd, sys.stdin.fileno()], [], [], min(0.05, max(0, remaining)))
            if sys.stdin.fileno() in ready:
                piece = os.read(sys.stdin.fileno(), 64)
                if not piece:
                    reason = 'stdin_closed'
                    break
                control += piece
                if len(control) > 64 or (b'\n' in control and control != b'CLOSE\n'):
                    raise ValueError('preflight_refused')
                if control == b'CLOSE\n':
                    reason = 'stop_requested'
                    break
            if time.monotonic() - checked >= 0.5:
                if resolve_identity(port) != (target, identity):
                    raise ValueError('identity_mismatch')
                checked = time.monotonic()
            if fd in ready:
                data = os.read(fd, 256)
                if not data:
                    raise ValueError('serial_disconnected')
                emit(dict(type='bytes', data=base64.b64encode(data).decode('ascii')))
        else:
            reason = 'deadline'
    except Exception as error:
        allowed = {'preflight_refused', 'identity_mismatch', 'serial_disconnected'}
        if fd is not None and isinstance(error, OSError) and error.errno in (errno.EIO, errno.ENODEV, errno.ENXIO, errno.ENOENT):
            code = 'serial_disconnected'
        else:
            code = str(error) if str(error) in allowed else 'port_busy_denied_or_unavailable'
        if code == 'serial_disconnected':
            reason = 'disconnect'
        emit(dict(type='error', code=code))
    finally:
        closed = True
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                closed = False
        if closed:
            emit(dict(type='closed', reason=reason))


if __name__ == '__main__':
    main(sys.argv[1:])
