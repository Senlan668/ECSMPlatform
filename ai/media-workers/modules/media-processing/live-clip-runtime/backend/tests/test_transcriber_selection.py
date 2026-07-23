import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

from app.services import transcriber


class TranscriberTests(unittest.TestCase):
    def test_get_transcriber_returns_groq(self):
        result = transcriber.get_transcriber()

        self.assertIsInstance(result, transcriber.GroqASRTranscriber)


if __name__ == '__main__':
    unittest.main()
