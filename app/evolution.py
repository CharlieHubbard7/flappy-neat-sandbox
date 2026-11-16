from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import pickle
import random

import neat
import numpy as np

from .game import FlappyGame

CONFIG_PATH = Path(__file__).with_name("neat_config.ini")
CHAMPION_PATH = Path("champion.pkl")
INPUT_NAMES = ("vy", "dx", "dy_top", "dy_bottom")


@dataclass
class Agent:
    genome_id: int
    genome: neat.DefaultGenome
    network: neat.nn.FeedForwardNetwork
    game: FlappyGame
    fitness: float = 0.0
    inputs: tuple[float, ...] = (0.0, 0.0, 0.0, 0.0)
    output: float = 0.0


class EvolutionRunner:
    """Runs generations incrementally so every rendered frame is real NEAT state."""

    def __init__(self, seed: int = 19) -> None:
        self.seed = seed
        random.seed(seed)
        self.config = neat.Config(
            neat.DefaultGenome,
            neat.DefaultReproduction,
            neat.DefaultSpeciesSet,
            neat.DefaultStagnation,
            str(CONFIG_PATH),
        )
        self.population = neat.Population(self.config)
        self.generation = 0
        self.paused = False
        self.history: list[dict[str, float]] = []
        self.champion: neat.DefaultGenome | None = None
        self._known_nodes: set[int] = set()
        self._known_connections: set[tuple[int, int]] = set()
        self._elapsed = 0.0
        self._start_generation()

    @property
    def alive_count(self) -> int:
        return sum(agent.game.alive for agent in self.agents)

    def reset(self) -> None:
        self.__init__(self.seed)

    def tick(self, frames: int = 1) -> None:
        if self.paused:
            return
        for _ in range(frames):
            for agent in self.agents:
                if agent.game.alive:
                    self._step_agent(agent)
            self._elapsed += 1 / 60
            if self.alive_count == 0 or self._elapsed >= 20:
                self._finish_generation()
                break

    def _start_generation(self) -> None:
        self._elapsed = 0.0
        # Every generation sees the same course. That makes the pass-rate chart
        # an honest measure of learned policy rather than changing test luck.
        course_seed = self.seed
        self.agents = []
        for genome_id, genome in self.population.population.items():
            genome.fitness = 0.0
            self.agents.append(
                Agent(
                    genome_id,
                    genome,
                    neat.nn.FeedForwardNetwork.create(genome, self.config),
                    FlappyGame(course_seed),
                )
            )

    def _step_agent(self, agent: Agent) -> None:
        agent.inputs = self._sensors(agent.game)
        agent.output = float(agent.network.activate(agent.inputs)[0])
        score_before = agent.game.score
        agent.game.step(1 / 60, flap=agent.output > 0.5)
        agent.fitness += 1 / 60
        if agent.game.score > score_before:
            # A pipe pass should outweigh several seconds of cautious stalling.
            agent.fitness += 20
        target_y = self._next_gap_center(agent.game)
        agent.fitness += 0.008 * (1 - abs(agent.game.bird_y - target_y) / agent.game.config.height)
        if not agent.game.alive:
            agent.fitness -= 0.35
        agent.genome.fitness = agent.fitness

    @staticmethod
    def _next_gap_center(game: FlappyGame) -> float:
        pipe = next((pipe for pipe in game.pipes if pipe.x + game.config.pipe_width >= game.config.bird_x), None)
        return pipe.gap_y if pipe else game.config.height / 2

    def _sensors(self, game: FlappyGame) -> tuple[float, float, float, float]:
        pipe = next((pipe for pipe in game.pipes if pipe.x + game.config.pipe_width >= game.config.bird_x), None)
        if pipe is None:
            pipe_x = game.config.width
            gap_y = game.config.height / 2
        else:
            pipe_x = pipe.x
            gap_y = pipe.gap_y
        half_gap = game.config.pipe_gap / 2
        return (
            float(np.clip(game.bird_vy / 450, -1, 1)),
            float(np.clip((pipe_x - game.config.bird_x) / game.config.width, 0, 1.2)),
            float(np.clip((gap_y - half_gap - game.bird_y) / game.config.height, -1, 1)),
            float(np.clip((gap_y + half_gap - game.bird_y) / game.config.height, -1, 1)),
        )

    def _finish_generation(self) -> None:
        genomes = list(self.population.population.values())
        best = max(genomes, key=lambda genome: genome.fitness or float("-inf"))
        self.champion = best
        scores = [genome.fitness or 0.0 for genome in genomes]
        self.history.append(
            {
                "max": round(max(scores), 3),
                "avg": round(float(np.mean(scores)), 3),
                "firstGate": sum(agent.game.score >= 1 for agent in self.agents),
            }
        )
        self.history = self.history[-60:]

        self.population.reporters.post_evaluate(
            self.config,
            self.population.population,
            self.population.species,
            best,
        )
        self.population.population = self.population.reproduction.reproduce(
            self.config,
            self.population.species,
            self.config.pop_size,
            self.population.generation,
        )
        if not self.population.species.species:
            self.population.reporters.complete_extinction()
            if self.config.reset_on_extinction:
                self.population.population = self.population.reproduction.create_new(
                    self.config.genome_type, self.config.genome_config, self.config.pop_size
                )
            else:
                raise neat.CompleteExtinctionException()
        self.population.species.speciate(self.config, self.population.population, self.population.generation)
        self.population.reporters.end_generation(self.config, self.population.population, self.population.species)
        self.population.generation += 1
        self.generation = self.population.generation
        self._start_generation()

    def save_champion(self, path: Path = CHAMPION_PATH) -> bool:
        if self.champion is None:
            return False
        with path.open("wb") as destination:
            pickle.dump(self.champion, destination)
        return True

    def load_champion(self, path: Path = CHAMPION_PATH) -> bool:
        if not path.exists():
            return False
        with path.open("rb") as source:
            champion = pickle.load(source)
        champion.key = next(iter(self.population.population))
        self.population.population[champion.key] = champion
        self.champion = champion
        self._start_generation()
        return True

    def snapshot(self) -> dict:
        leader = max(self.agents, key=lambda agent: agent.fitness)
        graph = self._graph(leader)
        active = [agent for agent in self.agents if agent.game.alive]
        pipe_source = active[0].game if active else leader.game
        return {
            "generation": self.generation,
            "alive": self.alive_count,
            "population": self.config.pop_size,
            "species": len(self.population.species.species),
            "bestFitness": round(max(agent.fitness for agent in self.agents), 3),
            "passedFirstGate": sum(agent.game.score >= 1 for agent in self.agents),
            "lastFirstGate": self.history[-1]["firstGate"] if self.history else 0,
            "history": self.history,
            "pipes": [{"x": pipe.x, "gapY": pipe.gap_y} for pipe in pipe_source.pipes],
            "birds": [
                {"y": agent.game.bird_y, "vy": agent.game.bird_vy, "leader": agent is leader}
                for agent in active
            ],
            "leader": {
                "y": leader.game.bird_y,
                "vy": leader.game.bird_vy,
                "inputs": dict(zip(INPUT_NAMES, leader.inputs)),
                "output": leader.output,
            },
            "graph": graph,
        }

    def _graph(self, leader: Agent) -> dict:
        genome = leader.genome
        nodes = set(genome.nodes) | {0}
        connections = [connection for connection in genome.connections.values() if connection.enabled]
        node_list = [-1, -2, -3, -4] + sorted(nodes)
        current_nodes = set(genome.nodes)
        current_connections = {connection.key for connection in connections}
        new_nodes = sorted(current_nodes - self._known_nodes)
        new_connections = sorted(current_connections - self._known_connections)
        self._known_nodes |= current_nodes
        self._known_connections |= current_connections
        return {
            "nodes": node_list,
            "connections": [
                {"from": connection.key[0], "to": connection.key[1], "weight": connection.weight}
                for connection in connections
            ],
            "activations": {str(key): value for key, value in leader.network.values.items()},
            "newNodes": new_nodes,
            "newConnections": [list(key) for key in new_connections],
        }
