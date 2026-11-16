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
        self.assertEqual(state["lastFirstGate"], 0)

    def test_fixed_course_improves_the_first_gate_pass_rate(self) -> None:
        runner = EvolutionRunner()
        for _ in range(5):
            runner.tick(1_500)

        self.assertGreaterEqual(runner.history[-1]["firstGate"], runner.history[0]["firstGate"])


if __name__ == "__main__":
    unittest.main()
