from __future__ import annotations

from dataclasses import dataclass
from random import Random


@dataclass(frozen=True)
class GameConfig:
    width: int = 480
    height: int = 640
    bird_x: float = 130
    bird_radius: float = 14
    gravity: float = 1_100
    flap_velocity: float = -360
    pipe_width: float = 76
    pipe_speed: float = 175
    pipe_gap: float = 165
    pipe_interval: float = 1.55
    pipe_margin: float = 100


@dataclass
class Pipe:
    x: float
    gap_y: float
    counted: bool = False


class FlappyGame:
    """Deterministic game state shared by human play and simulation modes."""

    def __init__(
        self,
        seed: int = 7,
        config: GameConfig | None = None,
        waiting: bool = False,
    ) -> None:
        self.config = config or GameConfig()
        self.seed = seed
        self.starts_waiting = waiting
        self.waiting = waiting
        self._rng = Random(seed)
        self.reset()

    def reset(self, seed: int | None = None) -> None:
        if seed is not None:
            self.seed = seed
        self._rng = Random(self.seed)
        self.waiting = self.starts_waiting
        self.bird_y = self.config.height / 2
        self.bird_vy = 0.0
        self.pipes: list[Pipe] = []
        self._pipe_count = 0
        self.score = 0
        self.alive = True
        self.time_since_pipe = self.config.pipe_interval - 0.65

    def flap(self) -> None:
        if self.alive:
            self.bird_vy = self.config.flap_velocity

    def step(self, dt: float, flap: bool = False) -> None:
        """Advance by a fixed time slice; callers should cap dt before calling."""
        if not self.alive:
            return
        if self.waiting:
            if not flap:
                return
            self.waiting = False
        if flap:
            self.flap()

        self.bird_vy += self.config.gravity * dt
        self.bird_y += self.bird_vy * dt
        self.time_since_pipe += dt

        while self.time_since_pipe >= self.config.pipe_interval:
            self.time_since_pipe -= self.config.pipe_interval
            self.pipes.append(self._new_pipe())

        for pipe in self.pipes:
            pipe.x -= self.config.pipe_speed * dt
            if not pipe.counted and pipe.x + self.config.pipe_width < self.config.bird_x:
                pipe.counted = True
                self.score += 1

        self.pipes = [pipe for pipe in self.pipes if pipe.x + self.config.pipe_width > -20]
        self.alive = not self._collides()

    def _new_pipe(self) -> Pipe:
        config = self.config
        self._pipe_count += 1
        if self._pipe_count == 1:
            # A centered first gate gives both people and genomes a readable start.
            return Pipe(config.width + 20, config.height / 2)
        min_gap_y = config.pipe_margin + config.pipe_gap / 2
        max_gap_y = config.height - config.pipe_margin - config.pipe_gap / 2
        return Pipe(config.width + 20, self._rng.uniform(min_gap_y, max_gap_y))

    def _collides(self) -> bool:
        config = self.config
        if self.bird_y - config.bird_radius <= 0:
            return True
        if self.bird_y + config.bird_radius >= config.height:
            return True

        for pipe in self.pipes:
            overlaps_x = (
                self.config.bird_x + config.bird_radius > pipe.x
                and self.config.bird_x - config.bird_radius < pipe.x + config.pipe_width
            )
            outside_gap = (
                self.bird_y - config.bird_radius < pipe.gap_y - config.pipe_gap / 2
                or self.bird_y + config.bird_radius > pipe.gap_y + config.pipe_gap / 2
            )
            if overlaps_x and outside_gap:
                return True
        return False

    def snapshot(self) -> dict:
        return {
            "bird": {"x": self.config.bird_x, "y": self.bird_y, "vy": self.bird_vy},
            "pipes": [{"x": pipe.x, "gapY": pipe.gap_y} for pipe in self.pipes],
            "score": self.score,
            "alive": self.alive,
            "waiting": self.waiting,
        }
