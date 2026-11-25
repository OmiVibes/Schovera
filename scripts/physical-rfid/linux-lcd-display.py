"""Private Linux serial writer used only after an accepted v2 API receipt.

No network, database, enrollment, or raw-UID handling is performed here.
"""
import errno
import json
import os
import re
import select
import stat
import sys
import time

# Linux-only transport modules are loaded only by the hardware entry point so
# the parser/selection tests can run on Windows without emulating termios.
fcntl = None
termios = None


def validate_selection(port, identity):
    if not re.fullmatch(r'/dev/serial/by-id/[A-Za-z0-9_.:+-]{1,200}', port):
        raise ValueError('device_selection_refused')
    if not re.fullmatch(r'[0-9a-f]{4}:[0-9a-f]{4}:[A-Za-z0-9_.+-]{1,128}', identity):
        raise ValueError('usb_identity_refused')


def validate_frame(frame):
    if not isinstance(frame, str) or len(frame) > 160:
        raise ValueError('display_frame_refused')
    match = re.fullmatch(r'SCHOVERA_LCD,1,WELCOME,([0-9A-F]{2,128})\n', frame)
    if not match or len(match.group(1)) % 2:
        raise ValueError('display_frame_refused')
    name = bytes.fromhex(match.group(1))
    if any(value < 0x20 or value > 0x7e for value in name):
        raise ValueError('display_frame_refused')
    if not any(chr(value).isalnum() for value in name):
        raise ValueError('display_frame_refused')
    return frame.encode('ascii')


def resolve_identity(port):
    from pathlib import Path
    target = Path(port).resolve(strict=True)
    if not re.fullmatch(r'/dev/tty(?:USB|ACM)[0-9]+', str(target)):
        raise ValueError('usb_identity_mismatch')
    device = Path('/sys/class/tty', target.name, 'device').resolve(strict=True)
    for parent in [device, *list(device.parents)[:12]]:
        if (parent / 'idVendor').is_file() and (parent / 'idProduct').is_file():
            identity = ':'.join((parent / name).read_text().strip()
                                for name in ('idVendor', 'idProduct', 'serial'))
            return str(target), identity
    raise ValueError('usb_identity_mismatch')


def configure(fd):
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0
    attrs[4] = attrs[5] = termios.B115200
    attrs[6][termios.VMIN] = attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    # Opening may already have pulsed DTR. This only requests both lines low;
    # the caller has explicitly accepted the possible Nano reset.
    fcntl.ioctl(fd, termios.TIOCMBIC, __import__('array').array('i', [termios.TIOCM_DTR | termios.TIOCM_RTS]))


def write_all(fd, payload, deadline):
    offset = 0
    while offset < len(payload):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('serial_write_timeout')
        _, writable, _ = select.select([], [fd], [], remaining)
        if not writable:
            raise ValueError('serial_write_timeout')
        count = os.write(fd, payload[offset:])
        if count <= 0:
            raise ValueError('serial_write_failed')
        offset += count


def wait_for_ack(fd, deadline):
    pending = bytearray()
    while time.monotonic() < deadline:
        readable, _, _ = select.select([fd], [], [], min(0.1, deadline - time.monotonic()))
        if not readable:
            continue
        chunk = os.read(fd, 128)
        for value in chunk:
            if value == 10:
                line = bytes(pending).rstrip(b'\r')
                pending.clear()
                if line == b'SCHOVERA_LCD_SHOWN,1':
                    return True
            elif 32 <= value <= 126 and len(pending) < 192:
                pending.append(value)
            else:
                pending.clear()
    return False


def main(argv):
    global fcntl, termios
    fd = None
    try:
        if len(argv) != 4 or argv[2:] != ['ack-reset-risk', 'monitor-closed']:
            raise ValueError('operator_confirmation_required')
        port, identity = argv[:2]
        validate_selection(port, identity)
        raw = sys.stdin.buffer.read(1025)
        if len(raw) > 1024:
            raise ValueError('display_request_too_large')
        message = json.loads(raw.decode('utf-8'))
        if not isinstance(message, dict) or set(message) != {'frame'}:
            raise ValueError('display_request_refused')
        payload = validate_frame(message['frame'])
        import fcntl as linux_fcntl
        import termios as linux_termios
        fcntl, termios = linux_fcntl, linux_termios
        target, found = resolve_identity(port)
        if found != identity:
            raise ValueError('usb_identity_mismatch')
        before = os.stat(target, follow_symlinks=False)
        if not stat.S_ISCHR(before.st_mode):
            raise ValueError('usb_identity_mismatch')
        fd = os.open(target, os.O_RDWR | os.O_NONBLOCK | os.O_NOCTTY | os.O_CLOEXEC | os.O_NOFOLLOW)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.ioctl(fd, termios.TIOCEXCL)
        if before.st_rdev != os.fstat(fd).st_rdev or resolve_identity(port) != (target, identity):
            raise ValueError('usb_identity_mismatch')
        configure(fd)
        # Give an AVR time to boot if open toggled DTR. No reader data or
        # enrollment is inferred during this wait.
        time.sleep(2.0)
        termios.tcflush(fd, termios.TCIFLUSH)
        write_all(fd, payload, time.monotonic() + 1.5)
        acknowledged = wait_for_ack(fd, time.monotonic() + 1.5)
        print(json.dumps({'code': 'lcd_command_acknowledged' if acknowledged else 'lcd_ack_timeout',
                          'serialPayloadWrites': 1, 'displayNameLogged': False}))
        return 0 if acknowledged else 1
    except Exception as error:
        allowed = {'device_selection_refused', 'usb_identity_refused', 'display_frame_refused',
                   'usb_identity_mismatch', 'operator_confirmation_required', 'display_request_too_large',
                   'display_request_refused', 'serial_write_timeout', 'serial_write_failed'}
        if isinstance(error, OSError) and error.errno in (errno.EIO, errno.ENODEV, errno.ENXIO, errno.ENOENT):
            code = 'serial_disconnected'
        else:
            code = str(error) if str(error) in allowed else 'lcd_port_busy_or_unavailable'
        print(json.dumps({'code': code, 'serialPayloadWrites': 0, 'displayNameLogged': False}))
        return 1
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
