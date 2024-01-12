# Edge-to-Cloud Service Placement Simulator
This project simulates a three-tier edge-to-cloud infrastructure and provides different solvers for the placement of AR/VR services in edge-to-cloud AR/VR systems. The simulator follows a server-client architecture, where the client-side entity sends infrastructure and service characteristics in JSON format to the server-side. On the server, the service placement is executed based on the configurations and algorithm determined by the client. Then, the results, such as total response time and system reliability, are sent back by the server to the client.

### Prerequisites
To run the simulator, you need to install certain dependencies. In this repository, there are two folders: one designed to run on the server-side and the other on the client-side. To execute the server-side simulator, install Node.js on the server machine (preferably Ubuntu), navigate to the project directory, and install the following dependencies.

```bash
npm init --yes
npm install express
npm install ip
npm install perf_hooks
npm install csv-writer
```
To run the client-side simulator, make sure you have Node.js installed on your client machine (preferably on Ubuntu). Then, navigate to the project directory and proceed to install the necessary dependencies.

```bash
npm init --yes
npm install axios
npm install fs
```

After installing the dependencies on both server-side and client-side, `./node_modules`, `package.json`, and `package-lock.json` will be added in the directory.

### Usage
To use the simulator, first, its configurations must be set. In the client-side directory, you'll find a `configuration.json` file. In this file, you can determine which algorithm you want to use for service placement; the `cmd` property is used for this purpose, accepting values such as GA, SA, PGA or heuristics. Additionally, the scale of systems is determined via the `scale` property, which accepts values including small, medium, large, and xlarge. If you want to create a new scale, the infrastructure properties are set in the `useCase` property. The configuration file also allows you to configure the algorithms settings and set the IP and Port of the server. Additional details about the configuration file can be found at the beginning of the configuration file.

After setting the configuration file, you can run the client-side simulator by executing the following command:

```bash
node platform-simulator.js
```

Make sure that the server-side simulator is run before the client-side simulator. The server-side simulator is executed using the following command:

```bash
node main-execution.js
```
### Dockerize the simulator
To dockerize the simulator, create a Dockerfile in each directory (both in the server-side and client-side) with the following contents:

Server-side Dockerfile:
```bash
FROM node:15
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD [ "node", "main-execution.js" ]
```


Client-side Dockerfile:
```bash
FROM node:15
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD [ "node", "platform-simulator.js" ]
```

Run the following commands to create Docker images and upload them to your DockerHub account for both the client and server-side simulators:
```bash
sudo docker build . --tag [image-name]:[tag-name]
sudo docker tag [image-name]:[tag-name] [your dockerhub username]/[image-name]:[tag-name]
sudo docker login --username [your dockerhub username] --password [your dockerhub password]
```

You can use the following commands to push the Docker image and run the simulator image in the container:
```bash
sudo docker push [your dockerhub password]/[image-name]:[tag-name]
sudo docker run --publish [port]:[port] --name [image-name] --rm [your dockerhub password]/[image-name]:[tag-name]
```

Use following command to stop the running of the docker container:
```bash
sudo docker stop [container-name]
```
### Running the simulator using Minikube
To run the server-side simulator using Minikube, first, you need to install Minikube. Instructions on how to install Minikube can be found [here](https://minikube.sigs.k8s.io/docs/start/). In the server-side directory, you'll find two YAML files. These files are utilized to specify the deployment and service configurations for the pod(s). Please note that if you intend to run your Dockerized simulator from your Docker Hub, you should replace the image address of the simulator in the YAML file.

Start Minikube using `minikube start` and use the following commands to deploy the pod and its service.

```bash
kubectl create -f server-side-dep.yaml
kubectl create -f server-side-dep-ser.yaml
```

By using 'minikube service list', you can observe the IP and Port of the pod running the server-side simulator. Utilize this IP and Port on the client-side configuration file.
