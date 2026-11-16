import unittest

from app.evolution import EvolutionRunner


class EvolutionRunnerTests(unittest.TestCase):
    def test_snapshot_describes_the_full_population_and_graph(self) -> None:
        runner = EvolutionRunner()
        runner.tick(3)
        state = runner.snapshot()

        self.assertEqual(state["population"], 50)
        self.assertEqual(len(state["graph"]["nodes"][:4]), 4)
        self.assertIn("vy", state["leader"]["inputs"])


if __name__ == "__main__":
    unittest.main()
