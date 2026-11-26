# Edge-Cloud Service Placement Simulator

Edge-Cloud Service Placement Simulator (ECSP-Sim) is a client-server simulator for studying service placement in multi-tier edge-to-cloud environments. It models access-point, edge, cloud, helper, and user nodes and supports configurable infrastructure resources, network characteristics, service requirements, and placement algorithms. The client generates or loads a use case and sends it to the server. The server runs the selected placement algorithm(s) and returns placement metrics, runtime, per-service results, and the final placement solution.

## Prerequisites

Install Node.js and npm on both the client and server machines, then install the dependencies in each directory:

```bash
cd server && npm install
cd ../client && npm install
```

## Configuration

The simulator is controlled through `configurations.json`. The main options are:

- `type`: `new` to generate a use case, or `current` to run an existing one.
- `algo`: one or more placement algorithms separated by commas.
- `scale`: directory used to save/load the use case.
- `dataGeneration`: enables repeated scenario generation and evaluation.
- `numOfInstances`: number of experiment instances.
- `requestTimeoutMs`: solver request timeout in milliseconds.

Example:

```json
{
    "type": "current",
    "algo": "GA,PSO,GWO",
    "scale": "Example-instances/instance-3",
    "dataGeneration": false,
    "numOfInstances": 1,
    "requestTimeoutMs": 1800000
}
```

The `useCase` section defines the infrastructure and service-generation ranges, including CPU, memory, disk, reliability, bandwidth, delay, number of nodes, service components, and service versions.

## Running the Simulator

Start the server:

```bash
node main-execution.js
```

Then run the client:

```bash
node platform-simulator.js
```

The server listens on port `3001` by default. The client uses the address configured in `configurations.json`.

### Generate a New Use Case

Set:

```json
"type": "new"
```

and run the client. The generated use case is stored in the selected `scale` directory. This mode only generates the use case; it does not run placement algorithms.

### Run an Existing Use Case

Set:

```json
"type": "current"
```

select the desired algorithm(s), and run the client again. The current scenario is loaded without modifying the saved use-case files.

### Example Instances

`instances.zip` contains ready-made use cases of five sizes. To run one, set `"type": "current"` and, for example, `"scale": "Example-instances/instance-3"`. They were generated with the default settings (`capacityPercentage` 0.6), so the fault-tolerance algorithms need a use case generated with lower capacity (see [Fault Tolerance](#fault-tolerance)).

## Supported Algorithms

The simulator currently supports:

- Heuristics: TCA, LRC, MDS, MP, LP, MR
- Metaheuristics: GA, PSO, DE, SA, SCA, WOA, GWO, NSGAII. These are the enhanced (E-) variants, which repair every candidate solution with the healing operator. The basic (B-) variants are not included.
- NCO-Based Methods: NCOGA, NCOPSO, NCODE, NCOSA
- Other Optimization Methods: `OPT` — exact branch-and-bound optimization baseline
- Fault Tolerance: FLGA, FLPSO, FLDE, FLWOA, FLSA, FLPSOGA, FLGAPSO, FLRAS, FLUDL, FLTCA, FLRecTime, FLRelScore, FLExeTime, FLResTime (see [Fault Tolerance](#fault-tolerance))

## Fault Tolerance

The fault-tolerance algorithms (`FL*`) study how a placement recovers from failures over time. Each run:

1. Computes an initial placement with a pretrained NCO model.
2. For each of `faultTolerance.timeSlots` time slots, simulates node (hardware) failures and component (software) failures.
3. Recovers the affected components with the selected strategy and records response time, overall reliability (platform × service reliability), and recovery time.

| Algorithm | Recovery strategy |
|---|---|
| FLGA, FLPSO, FLDE, FLWOA, FLSA | Metaheuristic recovery (GA, PSO, DE, WOA, population-based SA) |
| FLPSOGA, FLGAPSO, FLRAS | Hybrid recovery: PSO followed by GA (FLPSOGA), GA followed by PSO (FLGAPSO), and random algorithm selection, where each iteration applies a randomly chosen GA, PSO, DE or WOA operator (FLRAS) |
| FLUDL | Learning-based recovery: an ensemble of pretrained models, optionally updated online |
| FLTCA, FLRecTime, FLRelScore, FLExeTime, FLResTime | Heuristic recovery (task-continuation affinity, recovery time, reliability score, execution time, response time) |

Run them like any other algorithm, e.g. `"algo": "FLGA,FLUDL,FLTCA"`. They are configured in the `faultTolerance` section of `configurations.json`:

```json
"faultTolerance": {
    "timeSlots": 500,
    "geneticAlgorithm": { "populationSize": 10, "iterations": 3, "mutationRate": 0.05, "crossoverRate": 0.7, "selectionPressure": 2 },
    "particleSwarmOptimization": { "populationSize": 5, "iteration": 3, "w": 0.5, "c1": 1.5, "c2": 1.5 },
    "differentialEvolution": { "populationSize": 6, "iteration": 5, "crossoverRate": 0.7, "F": 0.85 },
    "whaleOptimizationAlgorithm": { "populationSize": 6, "iteration": 5, "a": 0.5, "b": 0.2, "l": 2, "coefficient_A": 2, "coefficient_C": 2 },
    "simulatedAnnealing": { "populationSize": 2, "temperature": 10, "alpha": 0.8, "updatingRate": 0.05, "terminationValue": 0.01, "selectionPressure": 4 },
    "udl": { "numModels": 6, "drift": true, "updatingMethod": "bp" }
}
```

- `timeSlots`: number of failure time slots simulated after the initial placement.
- The metaheuristic settings are used for the recovery search in every time slot. They are separate from the placement settings above and are intentionally small, because the search runs once per time slot.
- `udl.numModels`: number of pretrained models in the FLUDL ensemble (1–6).
- `udl.drift`: whether the system characteristics drift over time.
- `udl.updatingMethod`: how the models are updated online: `no` (no update), `bp` (backpropagation), `es` (evolution strategy), or `ees` (enhanced evolution strategy).

Service versions carry two fields that the recovery-time model uses: `imageSize` and `installingTime`. They are generated from `useCase.serviceConfig` (`imageSize`, `minInstallingTime`, `maxInstallingTime`; defaults 1, 2 and 5 seconds). Use cases generated before these fields existed must be regenerated before running the `FL*` algorithms.

**Capacity.** The NCO-based initial placement and recovery place each component only on a computing node with enough free memory, so they need more spare capacity than the placement solvers. Generate fault-tolerance use cases with a lower `useCase.serviceConfig.capacityPercentage` (around `0.2`–`0.3`) and more computing nodes than users. If capacity runs out, the run stops with an error that says so.

**Models.** Pretrained models are in `server/fault-tolerance-models/`: `initial-placement-weights.txt` (initial NCO placement) and `udl/weights_0.txt` … `udl/weights_5.txt` (FLUDL ensemble).

**Outputs.** Besides the summary returned to the client (initial vs. after-failure response time, reliability, and recovery time), the server writes:

- `server/results/fault-tolerance/<algorithm>-overtime.csv`: one row per time slot.
- `server/results/fault-tolerance/per-service/`: per-service response time, reliability, and recovery time.
- `server/results/fault-tolerance/udl-models/`: FLUDL models after online updating.

The fault-tolerance code lives in `server/fault-tolerance.js` and is self-contained (it does not depend on `solvers.js`).

## Docker

The client and server can be containerised with Node.js images. The server container should expose port `3001`, and the client must be configured with the reachable server address.

## Kubernetes

The server can also be deployed using the Kubernetes deployment and service YAML files included with the project:

```bash
kubectl apply -f server-side-dep.yaml
kubectl apply -f server-side-dep-ser.yaml
```

Use the exposed service address in the client configuration.

