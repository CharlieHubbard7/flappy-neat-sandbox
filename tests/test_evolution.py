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

    def test_snapshot_can_skip_topology_between_visual_updates(self) -> None:
        runner = EvolutionRunner()
        state = runner.snapshot(include_graph=False)

        self.assertNotIn("graph", state)
        self.assertEqual(state["population"], 50)

    def test_tuning_updates_real_neat_configuration(self) -> None:
        runner = EvolutionRunner()
        runner.tune(species="diverse", mutation="exploratory")

        self.assertEqual(runner.config.species_set_config.compatibility_threshold, 1.8)
        self.assertEqual(runner.config.genome_config.conn_add_prob, 0.30)
        self.assertEqual(runner.config.genome_config.node_add_prob, 0.18)


if __name__ == "__main__":
    unittest.main()
