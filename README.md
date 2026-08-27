# Edge-Cloud Service Placement Simulator

Edge-Cloud Service Placement Simulator (ECSP-Sim) is a client-server simulator for studying service placement in multi-tier edge-to-cloud environments. It models access-point, edge, cloud, helper, and user nodes and supports configurable infrastructure resources, network characteristics, service requirements, and placement algorithms. The client generates or loads a use case and sends it to the server in JSON format. The server executes the selected placement algorithm or algorithms and returns placement metrics, runtime, per-service metrics, and the final placement solution for each successful algorithm.

## Prerequisites

Install Node.js and npm on both the client and server machines. Install the committed dependencies in each directory:

```bash
cd server
npm install
```

and for the client:

```bash
cd client
npm install
```

`fs`, `path`, and `perf_hooks` are built into Node.js and do not need to be installed separately.

## Configuration

The simulator is controlled through `configurations.json`. A typical configuration begins with:

```json
{
    "type": "current",
    "algo": "GA",
    "scale": "scale",
    "dataGeneration": false,
    "numOfInstances": 1,
    "startInstance": 0,
}
```

Only two execution modes are supported. `"type": "new"` generates a new use case from the values in `configurations.json` and saves it in the selected `scale` directory `"type": "current"` loads a use case from the selected `scale` directory and runs the selected placement algorithm or algorithms. When `dataGeneration` is enabled, `current` mode instead starts a multi-instance experiment campaign in which a fresh use case is generated before every experiment, including the first one.

The `algo` property can contain one algorithm:

```json
"algo": "TCA"
```

or several algorithms:

```json
"algo": "GA,PSO,DE,SA,TCA,LRC,MDS,MP,LP,MR,NCOGA"
```

The `scale` property identifies the directory used to save or load a use case. For example, `"scale": "scale-1"` uses the `./scale-1/` directory. The `useCase` section defines the number of users, helpers, access points, edge nodes, cloud nodes, service components, and service versions. It also defines CPU, memory, disk, reliability, bandwidth, RTT, service data size, provider, and codec ranges used during scenario generation. Individual values are generated within the configured ranges.

### Request Timeout

`requestTimeoutMs` defines the maximum HTTP request duration in milliseconds:

```json
"requestTimeoutMs": 1800000
```

The value must be a positive integer. The server also supports the `REQUEST_TIMEOUT_MS` environment variable as its default when a request does not provide a timeout:

```bash
REQUEST_TIMEOUT_MS=3600000 node main-execution.js
```

The timeout prevents the HTTP client/server connection from waiting indefinitely. The placement solvers currently execute synchronously inside the Node.js process, so an HTTP timeout does not forcibly interrupt a CPU-bound solver that is already executing.

## Running the Simulator

Start the server first:

```bash
node main-execution.js
```

By default, the server listens on port `3001`. Set the server address in `configurations.json`:

```json
"address": {
    "ip": "localhost",
    "port": "3001"
}
```

If the client and server run on different machines, replace `localhost` with the server IP address or hostname.

### Generate a New Use Case

To generate a new use case, set:

```json
"type": "new"
```

Then run:

```bash
node platform-simulator.js
```

The simulator generates the infrastructure, users, helpers, services, and connection matrices and stores them in the selected `scale` directory. The `new` mode only creates the use case. It does not execute the placement algorithms.

### Run the Current Use Case

After a use case has been generated, change:

```json
"type": "current",
"dataGeneration": false
```

Select the desired algorithm:

```json
"algo": "GA"
```

Then run:

```bash
node platform-simulator.js
```

The client loads the current use case from the selected `scale` directory, sends it to the server, and the server executes the selected placement algorithm or algorithms. Several algorithms can be selected at the same time so that they are evaluated on exactly the same use case.

Before the request is sent, the client checks the loaded scenario for placement feasibility. If the existing `services.json` has no complete resource-feasible placement, the current implementation may repair service-version resource requirements and overwrite `services.json`. A repair is reported in the console.

## Generating Many Use Cases and Experiment Data

The simulator can generate and evaluate many independently generated use cases. This is useful for comparing algorithms across multiple scenarios rather than relying on a single experiment. Enable data generation with:

```json
{
    "type": "current",
    "dataGeneration": true,
    "numOfInstances": 10,
    "requestTimeoutMs": 1800000
}
```

Then run:

```bash
node platform-simulator.js
```

Generated experiment files are stored in the selected `scale` directory. If a file with the same instance index already exists, the current implementation overwrites it.

## Algorithm Configuration

The configuration file contains the parameters for the metaheuristic algorithms. For example, GA can be configured using:

```json
"geneticAlgorithm": {
    "iterations": 200,
    "populationSize": 200,
    "mutationRate": 0.01,
    "crossoverRate": 0.7,
    "selectionPressure": 20
}
```

## Results and Failure Handling

For each selected algorithm, the server returns one algorithm record. A successful algorithm record contains:

```text
status = "success"
overall placement metrics
algorithm runtime
per-service analysis
final placement solution
```

## Docker

A server Dockerfile can be created as follows:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3001
CMD ["node", "main-execution.js"]
```

A client Dockerfile can be created as follows:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "platform-simulator.js"]
```

Build and run the server image with:

```bash
docker build -t ecsp-server .
docker run --rm -p 3001:3001 ecsp-server
```

## Running the Server with Minikube

Start Minikube:

```bash
minikube start
```

Deploy the server deployment and service files:

```bash
kubectl apply -f server-side-dep.yaml
kubectl apply -f server-side-dep-ser.yaml
```

Check the exposed service with:

```bash
minikube service list
```

Use the exposed server IP address and port in the client-side `configurations.json`.
