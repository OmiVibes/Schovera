import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('lcd_display', Path(__file__).with_name('linux-lcd-display.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class LcdDisplayTests(unittest.TestCase):
    def test_accepts_only_bounded_versioned_display_frame(self):
        self.assertEqual(worker.validate_frame('SCHOVERA_LCD,1,WELCOME,53796E746865746963204C6561726E6572\n'),
                         b'SCHOVERA_LCD,1,WELCOME,53796E746865746963204C6561726E6572\n')

    def test_rejects_injection_raw_names_controls_and_oversized_frames(self):
        for frame in ('SCHOVERA_LCD,1,WELCOME,Name\n', 'SCHOVERA_LCD,1,WELCOME,0A\n',
                      'SCHOVERA_SCAN,AA:BB:CC:DD,1\n', 'SCHOVERA_LCD,2,WELCOME,41\n',
                      'SCHOVERA_LCD,1,WELCOME,' + '41' * 90 + '\n'):
            with self.subTest(frame='shape-only'):
                with self.assertRaises(ValueError):
                    worker.validate_frame(frame)

    def test_requires_stable_by_id_path_and_exact_usb_identity_shape(self):
        with self.assertRaises(ValueError):
            worker.validate_selection('/dev/ttyUSB0', '0403:6001:SERIAL')
        with self.assertRaises(ValueError):
            worker.validate_selection('/dev/serial/by-id/usb-test', '0403:6001')
        worker.validate_selection('/dev/serial/by-id/usb-FTDI_123-if00-port0', '0403:6001:BG02XZ38')

    def test_name_bytes_must_be_printable_ascii(self):
        with self.assertRaises(ValueError):
            worker.validate_frame('SCHOVERA_LCD,1,WELCOME,FF\n')


if __name__ == '__main__':
    unittest.main()
