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

app.post('/json', (req, res) => {

    if (req.body['cmd'] == 'GA')
    {
        console.log('\ngeneticAlgorithm is running...');
        const gA = new algorithms.geneticAlgorithm({ans: req.body});
        const geneticAlgorithm = gA.run();
        res.json({'geneticAlgorithm': geneticAlgorithm}) 
    }
    else if (req.body['cmd'] == 'heuristics')
    {
        const heuristics = heuristicAlgorithms(req.body);
        res.json({'heuristicAlgorithms': heuristics}) 
    }
    else if (req.body['cmd'] == "tGA")
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
    else
    {
        console.log('Something went wrong...')
    }
})

app.listen(ipPort, console.log(`Listening to ${ipAddress}:${ipPort} !!!`))