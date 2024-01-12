const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');

const algorithms = require('./solvers');
const express = require('express');
const ip = require('ip');

const app = express()
const ipAddress = ip.address()
const ipPort = 3000

app.use(express.json({
    inflate: true,
    limit: '100000kb',
    reviver: null,
    strict: true,
    type: 'application/json',
    verify: undefined
}))

function heuristicAlgorithms(ans)
{
    const sys = JSON.parse(JSON.stringify(ans));
    const tCA = new algorithms.taskContinuationAffinity(sys);
    const lRC = new algorithms.leastRequiredCPU(sys);
    const mDS = new algorithms.mostDataSize(sys);
    const mR = new algorithms.mostReliablity(sys);
    const mP = new algorithms.mostPowerful(sys);
    const lP = new algorithms.leastPowerful(sys);

    const solTCA = tCA.run();
    const solLRC = lRC.run();
    const solMDS = mDS.run();
    const solMR = mR.run();
    const solMP = mP.run();
    const soLP= lP.run();

    return {
        taskContinuationAffinity: solTCA,
        leastRequiredCPU: solLRC,
        mostDataSize: solMDS,
        mostReliablity: solMR,
        mostPowerful: solMP,
        leastPowerful: soLP
    };
}

function GA(ans)
{
    console.log('\ngeneticAlgorithm is running...');
    const config = {
        ans: ans,
        iteration: ans['configsGA']['iteration'],
        cProbability: ans['configsGA']['crossoverRate'],
        mProbability: ans['configsGA']['mutationRate'],
        numPopulation: ans['configsGA']['populationSize'],
        tournamentSize: ans['configsGA']['selectionSize']
    }
    const gA = new algorithms.geneticAlgorithm(config);
    return gA.run();
}

function SA(ans)
{
    console.log('\nsimulatedAnnealing is running...');
    const config = {
        ans: ans,
        termination: ans['configsSA']['termination'],
        temperature: ans['configsSA']['temperature'],
        alpha: ans['configsSA']['alpha'],
        rate: ans['configsSA']['rate']
    }
    const sA = new algorithms.simulatedAnnealing(config);
    return sA.run();
}

function fineTuningGA(ans)
{

    if (ans['cmd'] == 'tGA')
    {
        const config = {
            ans: ans,
            populationSizes: ans['gridSearch']['populationSizes'], 
            mutationRates: ans['gridSearch']['mutationRates'],
            crossoverRates: ans['gridSearch']['crossoverRates'],
            tournamentSelectionSize: ans['gridSearch']['tournamentSelectionSize'],
            iteration: ans['gridSearch']['iteration']
        }
        const GATuning = new algorithms.fineTuningGA(config);
        return GATuning.tuning();
    }
    else if (ans['cmd'] == 'oGA')
    {
        const GATuning = new algorithms.fineTuningGA({ans: ans});
        return GATuning.optConfiguration();
    }
}

function fineTuningSA(ans)
{
    if (ans['cmd'] == 'tSA')
    {
        const config = {
            ans: ans,
            termination:ans['gridSearch']['termination'], 
            temperature: ans['gridSearch']['temperature'],
            alpha: ans['gridSearch']['alpha'],
            rate:ans['gridSearch']['rate']
        }
        const SATuning = new algorithms.fineTuningSA(config);
        return SATuning.tuning();
    }
    else if (ans['cmd'] == 'oSA')
    {
        const SATuning = new algorithms.fineTuningSA({ans: ans});
        return SATuning.optConfiguration();
    }
}

function PGA(req, res)
{
    function saveJSON(jsonResult,str) 
    {
        fs.writeFile(str, JSON.stringify(jsonResult, null, 2), 'utf8', () => {
            //console.log('JSON file has been saved!');
        });
    }

    if (!fs.existsSync('useCase')) 
    {
        fs.mkdir('useCase', () => {
            //console.log(`Folder '${'useCase'}' created successfully.`);
        });
    }


    saveJSON(req.body['services'],'./useCase/services.json')
    saveJSON(req.body['computingNodes'],'./useCase/nodes.json')
    saveJSON(req.body['helperNodes'],'./useCase/helpers.json')
    saveJSON(req.body['usersNodes'],'./useCase/users.json')
    saveJSON(req.body['componentConnections'],'./useCase/connections.json')

    const config = {
        iteration: req.body['configsPGA']['iteration'],
        cProbability: req.body['configsPGA']['crossoverRate'],
        mProbability: req.body['configsPGA']['mutationRate'],
        numPopulation: req.body['configsPGA']['populationSize'],
        tournamentSize: req.body['configsPGA']['selectionSize'],
        numOfSlaves: req.body['configsPGA']['numOfSlaves']
    }

    const jsonString = JSON.stringify(config);
    process.env.DATA_TO_SEND = jsonString;

    exec('node PGA.js', (err,stdout) => {
        const resultsFromPGA = stdout.trim();

        const resultsPGA = JSON.parse(resultsFromPGA.replace(/\n/g, '')
                                                   .replace(/'/g, '"')
                                                   .replace(/([a-zA-Z0-9_]+):/g, '"$1":'));

        res.json({ 'Parallel MOGA': resultsPGA});
      });
}


app.post('/json', (req, res) => {

    if (req.body['cmd'] == 'GA')
    {
        const geneticAlgorithm = GA(req.body);
        res.json({
            'geneticAlgorithm': geneticAlgorithm
       }) 
    }
    else if (req.body['cmd'] == 'SA')
    {
        const simulatedAnnealing = SA(req.body);
        res.json({
            'simulatedAnnealing': simulatedAnnealing
       }) 
    }
    else if (req.body['cmd'] == 'PGA')
    {
        PGA(req, res);
    }
    else if (req.body['cmd'] == 'heuristics')
    {
        const heuristics = heuristicAlgorithms(req.body);
        res.json({
            'heuristicAlgorithms': heuristics
       }) 
    }
    else if (req.body['cmd'] == "tGA")
    {
        const r = fineTuningGA(req.body, "tGA");
        if (r == true)
        {
            fineTuning = "Fine-tuning of GA has been completed, and the results have been saved in the files for each scale on the server side." + 
                         "Run the 'optConfig' command to obtain the optimal configuration for GA.";
        }
    }
    else if (req.body['cmd'] == "tSA")
    {
        const r = fineTuningSA(req.body, "tSA");
        if (r == true)
        {
            fineTuning = "Fine-tuning of SA has been completed, and the results have been saved in the files for each scale on the server side." + 
                         "Run the 'optConfig' command to obtain the optimal configuration for SA.";
        }
    }
    else if (req.body['cmd'] == "oGA")
    {
        const optConfig = fineTuningGA(req.body);
        res.json({
            'optimalConfiguration': optConfig,
            'scale': req.body['scale']
        })
    }
    else if (req.body['cmd'] == "oSA")
    {
        const optConfig = fineTuningSA(req.body);
        res.json({
            'optimalConfiguration': optConfig,
            'scale': req.body['scale']
        })

    }
    else
    {
        console.log('Something went wrong...')
    }
})

app.listen(ipPort, console.log(`Listening to ${ipAddress}:${ipPort} !!!`))