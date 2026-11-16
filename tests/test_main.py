import asyncio
import unittest

from app.main import health


class MainTests(unittest.TestCase):
    def test_health_endpoint_reports_ready(self) -> None:
        self.assertEqual(asyncio.run(health()), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
