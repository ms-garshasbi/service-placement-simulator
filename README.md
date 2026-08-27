# Edge-Cloud Service Placement Simulator

Edge-Cloud Service Placement Simulator (ECSP-Sim) is a client-server simulator for studying service placement in multi-tier edge-to-cloud environments. It models access-point, edge, cloud, helper, and user nodes and supports configurable infrastructure resources, network characteristics, service requirements, and placement algorithms. The client generates or loads a use case and sends it to the server in JSON format. The server executes the selected placement algorithm and returns the placement results, runtime, and per-service metrics.

## Prerequisites

Install Node.js and npm on both the client and server machines.

Install the committed dependencies in each directory:

```bash
cd server
npm install
```

and for the client:

```bash
cd client
npm install
```

`fs` and `perf_hooks` are built into Node.js and do not need to be installed separately.

## Configuration

The simulator is controlled through `configurations.json`.

A typical configuration begins with:

```json
{
    "type": "current",
    "algo": "GA",
    "scale": "scale-1",
    "dataGeneration": false,
    "numOfInstances": 1
}
```

The `type` property determines what the client does. Setting it to `new` generates a new use case from the values in `configurations.json`. Setting it to `current` loads the already generated use case from the selected `scale` directory and runs the selected placement algorithm or algorithms.

The `algo` property can contain one algorithm:

```json
"algo": "TCA"
```

or several algorithms:

```json
"algo": "GA,PSO,DE,SA,TCA,LRC,MDS,MP,LP,MR,NCOGA"
```

The `scale` property identifies the directory used to save or load a use case. For example, `"scale": "scale-1"` uses the `./scale-1/` directory. The `useCase` section defines the number of users, helpers, access points, edge nodes, cloud nodes, service components, and service versions. It also defines the CPU, memory, disk, reliability, bandwidth, RTT, service data size, provider, and codec ranges used during scenario generation. Individual values are generated within the configured ranges.

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

The simulator generates the infrastructure, users, helpers, services, and connection matrices and stores them in the selected `scale` directory. A generated use case normally contains:

```text
nodes.json
helpers.json
users.json
services.json
infraConnections.json
componentsConnections.json
```

The `new` mode only creates the use case. It does not execute the placement algorithms.

### Run the Current Use Case

After a use case has been generated, change:

```json
"type": "current"
```

Select the desired algorithm:

```json
"algo": "GA"
```

Then run:

```bash
node platform-simulator.js
```

The client loads the current use case from the selected `scale` directory, sends it to the server, and the server executes the selected placement algorithm. Several algorithms can be selected at the same time so that they are evaluated on the same use case.

## Generating Many Use Cases and Experiment Data

The simulator can also generate data from many different use cases. This is useful when evaluating algorithms across multiple scenarios instead of relying on a single experiment.

Enable data generation with:

```json
"type": "current",
"dataGeneration": true,
"numOfInstances": 10
```

Then run:

```bash
node platform-simulator.js
```

The simulator runs the current use case, saves the result, generates a new use case, runs the selected algorithm again, and repeats the process. Generated experiment files are stored in the selected `scale` directory. This mode can be used to create datasets for later analysis and to compare placement algorithms across many independently generated scenarios.

## Algorithm Configuration

The configuration file also contains the parameters for the metaheuristic algorithms. For example, GA can be configured using:

```json
"geneticAlgorithm": {
    "iterations": 100,
    "populationSize": 150,
    "mutationRate": 0.01,
    "crossoverRate": 0.7,
    "selectionPressure": 10,
    "termination": 200
}
```

## Results

For each selected algorithm, the server returns the overall placement metrics, algorithm runtime, per-service analysis, final placement solution, etc. When multiple algorithms are selected, one result object is returned for each algorithm.

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
