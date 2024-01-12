const algorithms = require('./solvers');

const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const fs = require('fs');
const { performance } = require('perf_hooks');


function performGAoperators(task, m) 
{
    let population = task
    let crossoverPopulation = gA.crossover(population);
    let mutationPopulation = gA.mutation(crossoverPopulation);
    let healedPopulation = gA.healingSolution(mutationPopulation);

    let maxValue = m;
    let fitness = gA.fitness(healedPopulation, maxValue);

    return {'updatedPopulation': healedPopulation,
            'fitnessPopulation': fitness}
}

function divideArray(originalArray, m) {
  const arrayLength = originalArray.length;
  const subarraySize = Math.ceil(arrayLength / m);

  const resultArrays = [];
  let startIndex = 0;

  for (let i = 0; i < m; i++) {
    const endIndex = Math.min(startIndex + subarraySize, arrayLength);
    const subarray = originalArray.slice(startIndex, endIndex);
    resultArrays.push(subarray);
    startIndex = endIndex;
  }

  return resultArrays;
}

function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}

const usersNodes = readJSON(`./useCase/users.json`);
const helperNodes = readJSON(`./useCase/helpers.json`);
const computingNodes = readJSON(`./useCase/nodes.json`);
const services = readJSON(`./useCase/services.json`);
const componentConnections = readJSON(`./useCase/connections.json`);

const ansJSON = {
  computingNodes: computingNodes,
  helperNodes: helperNodes,
  usersNodes: usersNodes,
  services: services,
  componentConnections: componentConnections,
}

const receive = process.env.DATA_TO_SEND;
const configs = JSON.parse(receive);

const config = {
  ans: ansJSON, 
  iteration: configs['iteration'],
  cProbability: configs['cProbability'],
  mProbability: configs['mProbability'],
  numPopulation: configs['numPopulation'],
  tournamentSize: configs['tournamentSize']
}
const nTimes = config.iteration;
const numWorkers = configs['numOfSlaves']; //numCPUs
const gA = new algorithms.geneticAlgorithm(config);

let count = 0;
if (cluster.isMaster) {
  const startTime = performance.now();
  let iniPop = gA.initialPopulation();

  let calTimes = gA.calculateTimes(iniPop);
  let maxValue = 0;
  for (let i = 0; i < calTimes.length; i++) {
      if (maxValue < calTimes[i]['ResponseTime']) {
          maxValue = calTimes[i]['ResponseTime'];
      }
  }
  const maxV = maxValue;

  let splittedPop = divideArray(iniPop, numWorkers)
  let tasks = splittedPop;

  let allResults = [];
  let fitness = [];
  let bestFitness = -1;
  let solution;

  let resultsReceived = 0;

  // Function to perform the process 'nTimes (iterations)'
  function performProcess() {
    for (let i = 0; i < numWorkers; i++) {
      const worker = cluster.fork();

      // Send a task to each worker
      worker.send({ task: tasks[i], m:maxV });
    }
  }

  performProcess();

cluster.on('message', (worker, message) => {

    allResults.push(message.result['updatedPopulation']);
    fitness.push(message.result['fitnessPopulation'])
    resultsReceived++;

    if (resultsReceived === numWorkers) {

      let mergedResults = [];
      let mergedFitness = [];
      for (let x = 0; x < allResults.length; x++) {
        mergedResults = mergedResults.concat(allResults[x]);
        mergedFitness = mergedFitness.concat(fitness[x]);
      }

      let selectedPop = gA.tournamentSelection(mergedResults, mergedFitness)
      const minValue = Math.min(...mergedFitness);
      
      if (bestFitness > minValue || bestFitness == -1)
      {
        bestFitness = minValue;
        const index = mergedFitness.indexOf(minValue);
        solution = mergedResults[index];
      }

      if (count < nTimes) {
        let splittedPop = divideArray(selectedPop, numWorkers)
        tasks = JSON.parse(JSON.stringify(splittedPop));
        resultsReceived = 0;
        allResults = [];
        fitness = [];
  
        performProcess();
        count++;
      } else {

        const endTime = performance.now();
        const exeTime = endTime - startTime;
        const cost = new algorithms.objFuncCalculator(ansJSON)
        const costs = cost.calculate(solution);
        const loadDistribution = cost.loadAnalyser(solution);
        const resultPGA = {
          totalResponseTime: costs['ResponseTime'],
          platformReliability: costs['PlatformReliability'],
          serviceReliability: costs['ServiceReliability'],
          loadTier1: loadDistribution['tier1'],
          loadTier2: loadDistribution['tier2'],
          loadTier3: loadDistribution['tier3'],
          loadTierHelper: loadDistribution['helperTier'],
          loadTierUser: loadDistribution['userTier'],
          runtime: exeTime
        }
        console.log(resultPGA);
        process.exit();
        
      }
    }
  });
} 
else 
{

process.on('message', (message) => {
    if (message.task) {

      const result = performGAoperators(message.task, message.m);
      process.send({ result });
    }
    //Exit the worker process
    //process.exit();
  });
  //console.log(`Worker ${process.pid} started`);
}

