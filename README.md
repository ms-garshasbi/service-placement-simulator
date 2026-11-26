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

`instances.zip` contains ready-made use cases of five sizes. To run one, set `"type": "current"` and, for example, `"scale": "Example-instances/instance-3"`.

## Supported Algorithms

The simulator currently supports:

- Heuristics: TCA, LRC, MDS, MP, LP, MR
- Metaheuristics: GA, PSO, DE, SA, SCA, WOA, GWO, NSGAII. These are the enhanced (E-) variants, which repair every candidate solution with the healing operator.
- NCO-Based Methods: NCOGA (SNN-GA), NCOPSO, NCODE, NCOSA
- Other Optimisation Methods: `OPT` — exact branch-and-bound optimisation baseline
- Fault Tolerance: FLGA, FLPSO, FLDE, FLWOA, FLSA, FLPSOGA, FLGAPSO, FLRAS, FLUDL (EES-CND), FLTCA, FLRecTime, FLRelScore, FLExeTime, FLResTime.

## Fault Tolerance

The fault-tolerance algorithms (`FL*`) study how a placement recovers from failures over time. Each run:

1. Computes an initial placement with a pretrained NCO model.
2. For each of `faultTolerance.timeSlots` time slots, simulates node (hardware) failures and component (software) failures.
3. Recovers the affected components with the selected strategy and records response time, overall reliability, and recovery time.

Run them like any other algorithm, e.g. `"algo": "FLGA,FLUDL,FLTCA"`. They are configured in the `faultTolerance` section of `configurations.json`:

- `timeSlots`: number of failure time slots simulated after the initial placement.
- The metaheuristic settings are used for the recovery search in every time slot.
- `udl.numModels`: number of pretrained models in the EES-CND ensemble (1–6).
- `udl.drift`: whether the system characteristics drift over time.
- `udl.updatingMethod`: how the models are updated online: `no` (no update), `bp` (backpropagation), `es` (evolution strategy), or `ees` (enhanced evolution strategy).

## Docker

The client and server can be containerised with Node.js images. The server container should expose port `3001`, and the client must be configured with the reachable server address.

## Kubernetes

The server can also be deployed using the Kubernetes deployment and service YAML files included with the project:

```bash
kubectl apply -f server-side-dep.yaml
kubectl apply -f server-side-dep-ser.yaml
```

Use the exposed service address in the client configuration.

