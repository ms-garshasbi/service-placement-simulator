//npm init --yes
//npm install express
//npm install ip
//npm install axios
//npm install csv-writer
//npm install csv-parser
//npm install perf_hooks

const algorithms = require('./solvers');
const express = require('express');
const ip = require('ip');
const fs = require('fs');

const app = express()
const ipAddress = ip.address()
const ipPort = 3001

app.use(express.json({
    inflate: true,
    limit: '200000kb',
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

// Flatten the nested JSON structure into a single level object
const path = require('path');
const flattenObject = (obj, prefix = '') =>
    Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '_' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null) {
        Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
        acc[pre + k] = obj[k];
    }
    return acc;
    }, {});



app.post('/json', (req, res) => {

    if (req.body['type'] == 'current' && req.body['algo'] == 'GA')
    {
        console.log('\ngeneticAlgorithm is running...');
        const gA = new algorithms.geneticAlgorithm({ans: req.body});
        const geneticAlgorithm = gA.run();
        res.json({GA_result: geneticAlgorithm['servicePlacementResults'], GA_runtime: geneticAlgorithm['runtime']}) 

    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSO')
    {
        console.log('\nparticleSwarmOptimization is running...');
        const pSO = new algorithms.particleSwarmOptimization({ans: req.body});
        const  particleSwarmOptimization = pSO.run();
        res.json({PSO_result: particleSwarmOptimization['servicePlacementResults'], PSO_runtime: particleSwarmOptimization['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSOGA')
    {
        console.log('\nPSOGA is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        const  PSOGA = hybrid.PSOGA();
        res.json({PSOGA_result: PSOGA['servicePlacementResults'], PSOGA_runtime: PSOGA['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'GAPSO')
    {
        console.log('\nGAPSO is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        const GAPSO = hybrid.GAPSO();
        res.json({PSOGA_result: GAPSO['servicePlacementResults'], PSOGA_runtime: GAPSO['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'heuristics')
    {
        const heuristics = heuristicAlgorithms(req.body);
        res.json({'TCA_result': heuristics['taskContinuationAffinity'],
        'LRC_result': heuristics['leastRequiredCPU'],
        'MDS_result': heuristics['mostDataSize'],
        'MR_result': heuristics['mostReliablity'],
        'MP_result': heuristics['mostPowerful'],
        'LP_result': heuristics['leastPowerful']}) 
    }
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "GA")
    {
        
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningGA();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of GA was completed.";
            res.json({'outcome': fineTuning}) 
        }
    }
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "PSO")
    {
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningPSO();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of SCA was completed.";
            res.json({'outcome': fineTuning}) 
        }
    }
    else if (req.body['type'] == 'optConfig')
    {
        const GATuning = new algorithms.fineTuning({ans: req.body});
        GATuning.optConfiguration(res);
    }
    else
    {
        console.log('Something went wrong...')
    }
})

const server = app.listen(ipPort, () => {
    console.log(`Listening on ${ipAddress}:${ipPort} !!!`);
});
server.setTimeout(0);
