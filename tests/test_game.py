import unittest

from app.game import FlappyGame


class FlappyGameTests(unittest.TestCase):
    def test_seeded_runs_produce_equal_frames(self) -> None:
        first = FlappyGame(seed=42)
        second = FlappyGame(seed=42)

        for frame in range(360):
            flap = frame in {5, 68, 129, 188, 247}
            first.step(1 / 120, flap)
            second.step(1 / 120, flap)

        self.assertEqual(first.snapshot(), second.snapshot())

    def test_a_flap_sets_upward_velocity(self) -> None:
        game = FlappyGame()
        game.step(1 / 120, flap=True)
        self.assertLess(game.bird_vy, 0)

    def test_first_pipe_is_centered(self) -> None:
        game = FlappyGame()
        for _ in range(40):
            game.step(1 / 60)

        self.assertEqual(game.pipes[0].gap_y, game.config.height / 2)


if __name__ == "__main__":
    unittest.main()
