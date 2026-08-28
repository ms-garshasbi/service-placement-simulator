# Edge-Cloud Service Placement Simulator

Edge-Cloud Service Placement Simulator (ECSP-Sim) is a client-server simulator for studying service placement in multi-tier edge-to-cloud environments. It models access-point, edge, cloud, helper, and user nodes and supports configurable infrastructure resources, network characteristics, service requirements, and placement algorithms. The client generates or loads a use case and sends it to the server. The server runs the selected placement algorithm(s) and returns placement metrics, runtime, per-service results, and the final placement solution.

## Prerequisites

Install Node.js and npm on both the client and server machines, then install the dependencies in each directory:

```bash
npm install
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
    "scale": "small-scale",
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

## Supported Algorithms

The simulator currently supports:

- Heuristics: TCA, LRC, MDS, MP, LP, MR
- Metaheuristics: GA, PSO, DE, SA, SCA, WOA, GWO, NSGAII
- NCO-Based Methods: NCOGA, NCOPSO, NCODE, NCOSA
- Other Optimization Methods: `OPT` — exact branch-and-bound optimization baseline

## Docker

The client and server can be containerized with Node.js images. The server container should expose port `3001`, and the client must be configured with the reachable server address.

## Kubernetes

The server can also be deployed using the Kubernetes deployment and service YAML files included with the project:

```bash
kubectl apply -f server-side-dep.yaml
kubectl apply -f server-side-dep-ser.yaml
```

Use the exposed service address in the client configuration.

