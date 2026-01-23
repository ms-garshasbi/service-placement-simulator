const algorithms = require('./solvers');
const express = require('express');
const ip = require('ip');
const fs = require('fs');

const app = express()
const ipAddress = ip.address()
const ipPort = 3003

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
        let geneticAlgorithm

        for (let i = 0; i < 1; i++)
        {
            geneticAlgorithm = gA.run();

            const data = {GA_result: geneticAlgorithm['servicePlacementResults'], GA_runtime: geneticAlgorithm['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'GA.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Results saved`);
        }
        res.json({GA_result: geneticAlgorithm['servicePlacementResults'], 
            GA_runtime: geneticAlgorithm['runtime'], 
            GA_perService_result: geneticAlgorithm['perServiceAnalysis'],
            GA_finalSolution: geneticAlgorithm['solution']
        }) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'NCOtrainGA')
    {
        console.log('\nNCOtrainGA is running...');
        for (let i = 0; i < 1; i++)
        {
            const startTime = performance.now();
            const nco = new algorithms.NCO(req.body);
            const NCO = nco.run_train_ga(i)
            const endTime = performance.now();
            const exeTime = endTime - startTime;
            const data = {NCO_result: NCO, Runtime: exeTime}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'NCO-GA.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Model has been saved in the server side and can be used for service placment`);
            res.json({Output: `${i} Model has been saved in the server side and can be used for service placment`}) 
        }
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'NCOtrainPSO')
    {
        for (let i = 0; i < 1; i++)
            {
                const startTime = performance.now();
                const nco = new algorithms.NCO(req.body);
                const NCO = nco.run_train_pso(i)
                const endTime = performance.now();
                const exeTime = endTime - startTime;
                const data = {NCO_result: NCO, Runtime: exeTime}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'NCO-PSO.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'NCOtrainPSOGA')
    {
        for (let i = 0; i < 1; i++)
            {
                const startTime = performance.now();
                const nco = new algorithms.NCO(req.body);
                const NCO = nco.run_train_psoga(i)
                const endTime = performance.now();
                const exeTime = endTime - startTime;
                const data = {NCO_result: NCO, Runtime: exeTime}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'NCO-PSOGA.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'NCOtrainPSODE')
        {
            for (let i = 0; i < 1; i++)
                {
                    const startTime = performance.now();
                    const nco = new algorithms.NCO(req.body);
                    const NCO = nco.run_train_psode(i)
                    const endTime = performance.now();
                    const exeTime = endTime - startTime;
                    const data = {NCO_result: NCO, Runtime: exeTime}
                    const flattenedData = flattenObject(data);
                    const titles = Object.keys(flattenedData).join(',');
                    const values = Object.values(flattenedData).join(',');
                    const csvContent = `${titles}\n${values}`;
                    const filePath = path.join(__dirname, 'NCO-PSODE.csv');
                    fs.appendFileSync(filePath, csvContent);
                    console.log(`${i} Resutls saved`);
                }
        }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'NCOtrainDE')
    {
        for (let i = 0; i < 1; i++)
            {
                const startTime = performance.now();
                const nco = new algorithms.NCO(req.body);
                const NCO = nco.run_train_de(i)
                const endTime = performance.now();
                const exeTime = endTime - startTime;
                const data = {NCO_result: NCO, Runtime: exeTime}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'NCO-DE.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'NCOtrainSA')
    {
        console.log('\nNCOtrainSA is running...');
        const startTime = performance.now();
        const nco = new algorithms.NCO(req.body);
        const NCO = nco.run_train_sa()
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        res.json({NCO_result: NCO, Runtime: exeTime}) 
    }
    else if (req.body['type'] == 'current' && (req.body['algo'] == 'NCOtest' || req.body['algo'] == 'NCOGA'))
    {
        console.log('\nNCOtest is running...');
        const startTime = performance.now();
        const nco = new algorithms.NCO(req.body);
        const NCO = nco.run_test()
        const endTime = performance.now();
        const exeTime = endTime - startTime;

        if (req.body['algo'] == 'NCOGA')
        {
            res.json({NCOGA_result: NCO['servicePlacementResults'], 
                NCOGA_runtime: exeTime,
                NCOGA_perService_result: NCO['perServiceAnalysis'],
                NCOGA_finalSolution: NCO['solution']}) 
        }
        else
        {
            const sizeInBytes = Buffer.byteLength(JSON.stringify( {NCOtest_result: NCO, Runtime: exeTime}));
            console.log("Size:", (sizeInBytes / 1024).toFixed(2), "KB");
            console.log("Size:", (sizeInBytes / (1024 * 1024)).toFixed(2), "MB");
            res.json({NCOtest_result: NCO, Runtime: exeTime}) 
        }
    }
    else if (req.body['type'] == 'current' && (req.body['algo'] == 'FLUDL' || req.body['algo'] == 'FLRAS' || req.body['algo'] == 'FLGAPSO' || req.body['algo'] == 'FLPSOGA' || req.body['algo'] == 'FLSA' || req.body['algo'] == 'FLWOA' || req.body['algo'] == 'FLDE' || req.body['algo'] == 'FLPSO' || req.body['algo'] == 'FLGA' || req.body['algo'] == 'FLTCA' || req.body['algo'] == 'FLRecTime' || req.body['algo'] == 'FLRelScore' || req.body['algo'] == 'FLExeTime'  || req.body['algo'] == 'FLResTime'))
    {
        console.log(`\n${req.body['algo']} is running...`);
        const startTime = performance.now();
        const fl = new algorithms.faultTolerance(req.body);
        const FL = fl.run()
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        res.json({[`${req.body['algo']}_result`]: FL, Runtime: exeTime})
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'rnd')
    {
        const startTime = performance.now();
        const rnd = new algorithms.randomly(req.body);
        const random = rnd.run()
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        res.json({Random_result: random, Runtime: exeTime})
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'SBGA')
    {
        console.log('\nserialSemiBatchGA is running...');
        const gA = new algorithms.semiBatchGA({ans: req.body});
        const semiBatchGA = gA.run();
        res.json({serialSemiBatchGA_result: semiBatchGA['servicePlacementResults'], serialSemiBatchGA_runtime: semiBatchGA['runtime']})
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'SBPSO')
    {
        console.log('\nserialSemiBatchPSO is running...');
        const pSO = new algorithms.semiBatchPSO({ans: req.body});
        const semiBatchPSO = pSO.run();
        res.json({serialSemiBatchPSO_result: semiBatchPSO['servicePlacementResults'], serialSemiBatchPSO_runtime: semiBatchPSO['runtime']})
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'SBpopSA')
    {
        console.log('\nserialSemiBatchpopSA is running...');
        const popSA = new algorithms.semiBatchPopSA({ans: req.body});
        const semiBatchpopSA = popSA.run();
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'SA')
    {
        console.log('\nsimulatedAnnealing is running...');
        const sA = new algorithms.simulatedAnnealing({ans: req.body});
        let simulatedAnnealing;
        
        for (let i = 0; i < 30; i++)
            {
                simulatedAnnealing = sA.run();
                const data = {SA_result: simulatedAnnealing['servicePlacementResults'], SA_runtime: simulatedAnnealing['runtime']}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'SA.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }
            res.json(  {SA_result: simulatedAnnealing['servicePlacementResults'], 
            SA_runtime: simulatedAnnealing['runtime'], 
            SA_perService_result: simulatedAnnealing['perServiceAnalysis'],
            SA_finalSolution: simulatedAnnealing['solution']})
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'popSA')
    {
        console.log('\npopSimulatedAnnealing is running...');
        const sA = new algorithms.popSimulatedAnnealing({ans: req.body});
        let simulatedAnnealing

        for (let i = 0; i < 1; i++)
            {
                simulatedAnnealing = sA.run();
                const data = {SA_result: simulatedAnnealing['servicePlacementResults'], SA_runtime: simulatedAnnealing['runtime']}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'SA.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }

            res.json(  {SA_result: simulatedAnnealing['servicePlacementResults'], 
                SA_runtime: simulatedAnnealing['runtime'], 
                SA_perService_result: simulatedAnnealing['perServiceAnalysis'],
                SA_finalSolution: simulatedAnnealing['solution']})
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSO')
    {
        console.log('\nparticleSwarmOptimization is running...');
        const pSO = new algorithms.particleSwarmOptimization({ans: req.body});
        let particleSwarmOptimization

        for (let i = 0; i < 1; i++)
        {
            particleSwarmOptimization = pSO.run();
            const data = {PSO_result: particleSwarmOptimization['servicePlacementResults'], PSO_runtime: particleSwarmOptimization['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'PSO.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Resutls saved`);
        }
            res.json({PSO_result: particleSwarmOptimization['servicePlacementResults'], 
            PSO_runtime: particleSwarmOptimization['runtime'], 
            PSO_perService_result: particleSwarmOptimization['perServiceAnalysis'],
            PSO_finalSolution: particleSwarmOptimization['solution']
        }) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'SCA')
    {
        console.log('\nsineCosineAlgorithm is running...');
        const sCA = new algorithms.sineCosineAlgorithm({ans: req.body});
        let sineCosineAlgorithm;

        for (let i = 0; i < 1; i++)
        {
            sineCosineAlgorithm = sCA.run();
            const data = {SCA_result: sineCosineAlgorithm['servicePlacementResults'], SCA_runtime: sineCosineAlgorithm['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'SCA.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Resutls saved`);
        }

        res.json({SCA_result: sineCosineAlgorithm['servicePlacementResults'], 
            SCA_runtime: sineCosineAlgorithm['runtime'], 
            SCA_perService_result: sineCosineAlgorithm['perServiceAnalysis'],
            SCA_finalSolution: sineCosineAlgorithm['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'GWO')
    {
        console.log('\ngreyWolfOptimizer is running...');
        const gWO = new algorithms.greyWolfOptimizer({ans: req.body});
        const  greyWolfOptimizer = gWO.run();
        res.json({GWO_result: greyWolfOptimizer['servicePlacementResults'], GWO_runtime: greyWolfOptimizer['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'WOA')
    {
        console.log('\nwhaleOptimizationAlgorithm is running...');
        const wOA = new algorithms.whaleOptimizationAlgorithm({ans: req.body});
        let whaleOptimizationAlgorithm

        for (let i = 0; i < 1; i++)
            {
                whaleOptimizationAlgorithm = wOA.run();
                const data = {WOA_result: whaleOptimizationAlgorithm['servicePlacementResults'], WOA_runtime: whaleOptimizationAlgorithm['runtime']}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'WOA.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }
            res.json({WOA_result: whaleOptimizationAlgorithm['servicePlacementResults'], 
                WOA_runtime: whaleOptimizationAlgorithm['runtime'], 
                WOA_perService_result: whaleOptimizationAlgorithm['perServiceAnalysis'],
                WOA_finalSolution: whaleOptimizationAlgorithm['solution']
            })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'DE')
    {
        console.log('\ndifferentialEvolution is running...');
        const dE = new algorithms.differentialEvolution({ans: req.body});
        let differentialEvolution;

        for (let i = 0; i < 1; i++)
        {
            differentialEvolution = dE.run();
            const data = {DE_result: differentialEvolution['servicePlacementResults'], DE_runtime: differentialEvolution['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'DE.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Resutls saved`);
        }

        res.json({DE_result: differentialEvolution['servicePlacementResults'], 
            DE_runtime: differentialEvolution['runtime'], 
            DE_perService_result: differentialEvolution['perServiceAnalysis'],
            DE_finalSolution: differentialEvolution['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'FA')
    {
        console.log('\nfireflyAlgorithm is running...');
        const fA = new algorithms.firefly({ans: req.body});
        const  firefly = fA.run();
        res.json({FA_result: firefly['servicePlacementResults'], FA_runtime: firefly['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'GASA')
    {
        console.log('\nGASA is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        const  GASA = hybrid.GASA();
        res.json({GASA_result: GASA['servicePlacementResults'], GASA_runtime: GASA['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSOGA')
    {
        console.log('\nPSOGA is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        let PSOGA

        for (let i = 0; i < 1; i++)
        {
            PSOGA = hybrid.PSOGA();
            const data = {PSOGA_result: PSOGA['servicePlacementResults'], PSOGA_runtime: PSOGA['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'PSOGA.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Resutls saved`);
        }
        res.json({PSOGA_result: PSOGA['servicePlacementResults'], 
            PSOGA_runtime: PSOGA['runtime'], 
            PSOGA_perService_result: PSOGA['perServiceAnalysis'],
            PSOGA_finalSolution: PSOGA['solution']
        }) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSODE')
        {
            console.log('\nPSODE is running...');
            const hybrid = new algorithms.hybrid({ans: req.body});
            let PSODE
    
            for (let i = 0; i < 1; i++)
            {
                PSODE = hybrid.PSODE();
                const data = {PSODE_result: PSODE['servicePlacementResults'], PSODE_runtime: PSODE['runtime']}
                const flattenedData = flattenObject(data);
                const titles = Object.keys(flattenedData).join(',');
                const values = Object.values(flattenedData).join(',');
                const csvContent = `${titles}\n${values}`;
                const filePath = path.join(__dirname, 'PSODE.csv');
                fs.appendFileSync(filePath, csvContent);
                console.log(`${i} Resutls saved`);
            }
            res.json({PSODE_result: PSODE['servicePlacementResults']['PSODE'], 
                PSODE_runtime: PSODE['runtime'], 
                PSODE_perService_result: PSODE['perServiceAnalysis'],
                PSODE_finalSolution: PSODE['solution']
            }) 
        }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'GAPSO')
    {
        console.log('\nGAPSO is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        let GAPSO

        for (let i = 0; i < 1; i++)
        {
            GAPSO = hybrid.GAPSO();
            const data = {PSOGA_result: GAPSO['servicePlacementResults'], PSOGA_runtime: GAPSO['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'GAPSO.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Results saved`);
        }
        res.json({GAPSO_result: GAPSO['servicePlacementResults'], 
            GAPSO_runtime: GAPSO['runtime'], 
            GAPSO_perService_result: GAPSO['perServiceAnalysis'],
            GAPSO_finalSolution: GAPSO['solution']
        }) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'pHybrid')
    {

        const hybrid = new algorithms.hybrid({ans: req.body});
        let pHybrid
        for (let i = 0; i < 1; i++)
        {
            pHybrid = hybrid.pHybrid()
            const data = {pHybrid_result: pHybrid['servicePlacementResults'], PSOGA_runtime: pHybrid['runtime']}
            const flattenedData = flattenObject(data);
            const titles = Object.keys(flattenedData).join(',');
            const values = Object.values(flattenedData).join(',');
            const csvContent = `${titles}\n${values}`;
            const filePath = path.join(__dirname, 'pHybrid.csv');
            fs.appendFileSync(filePath, csvContent);
            console.log(`${i} Results saved`);
        }
        res.json({pHybrid_result: pHybrid['servicePlacementResults'], 
            pHybrid_runtime: pHybrid['runtime'], 
            pHybrid_perService_result: pHybrid['perServiceAnalysis'],
            pHybrid_finalSolution: pHybrid['solution']
        }) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSOGApopSA')
    {
        console.log('\nPSOGApopSA is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        const PSOGApopSA = hybrid.PSOGApopSA();
        res.json({PSOGApopSA_result: PSOGApopSA['servicePlacementResults'], PSOGApopSA_runtime: PSOGApopSA['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'popSAPSOGA')
    {
        console.log('\npopSAPSOGA is running...');
        const hybrid = new algorithms.hybrid({ans: req.body});
        const PSOGApopSA = hybrid.popSAPSOGA();
        res.json({popSAPSOGA_result: PSOGApopSA['servicePlacementResults'], popSAPSOGA_runtime: PSOGApopSA['runtime']}) 
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PGA')
    {
        console.log('\nparalellGeneticAlgorithm is running...');
        const pGA = new algorithms.parallelGeneticAlgorithm();
        pGA.run(req).then(parallelGeneticAlgorithm => {
                res.json({pGA_result: parallelGeneticAlgorithm['servicePlacementResults'], pGA_runtime: parallelGeneticAlgorithm['runtime']}) 
            }).catch(error => {
                console.error('Error occurred:', error);
            });
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSBGA')
        {
            console.log('\nparalellGeneticAlgorithm is running...');
            const pGA = new algorithms.parallelGeneticAlgorithm();
            pGA.run(req).then(parallelGeneticAlgorithm => {
                    res.json({pSBGA_result: parallelGeneticAlgorithm['servicePlacementResults'], pSBGA_runtime: parallelGeneticAlgorithm['runtime']}) 
                }).catch(error => {
                    console.error('Error occurred:', error);
                });
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PSBPSO')
        {
            console.log('\nparalellPSO is running...');
            const pSO = new algorithms.parallelParticleSwarmOptimization();
            pSO.run(req).then(parallelParticleSwarmOptimization => {
                    res.json({pSBPSO_result: parallelParticleSwarmOptimization['servicePlacementResults'], pSBPSO_runtime: parallelParticleSwarmOptimization['runtime']}) 
                }).catch(error => {
                    console.error('Error occurred:', error);
                });
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'PpopSA')
    {
        console.log('\nparallelPopSimulatedAnnealing is running...');
        const pPopSA = new algorithms.parallelPopSimulatedAnnealing();
        pPopSA.run(req, res);
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
    else if (req.body['type'] == 'current' && req.body['algo'] == 'TCA')
    {
        const sys = JSON.parse(JSON.stringify(req.body));
        const tCA = new algorithms.taskContinuationAffinity(sys);
        const solTCA = tCA.run();
        res.json({TCA_result: solTCA['servicePlacementResults'], 
            TCA_runtime: solTCA['runtime'], 
            TCA_perService_result: solTCA['perServiceAnalysis'],
            TCA_finalSolution: solTCA['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'LRC')
    {
        const sys = JSON.parse(JSON.stringify(req.body));
        const lRC = new algorithms.leastRequiredCPU(sys);
        const sollRC = lRC.run();
        res.json({LRC_result: sollRC['servicePlacementResults'], 
            LRC_runtime: sollRC['runtime'], 
            LRC_perService_result: sollRC['perServiceAnalysis'],
            LRC_finalSolution: sollRC['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'MDS')
    {
        const sys = JSON.parse(JSON.stringify(req.body));
        const MDS = new algorithms.mostDataSize(sys);
        const solMDS = MDS.run();
        res.json({MDS_result: solMDS['servicePlacementResults'], 
            MDS_runtime: solMDS['runtime'], 
            MDS_perService_result: solMDS['perServiceAnalysis'],
            MDS_finalSolution: solMDS['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'MR')
    {
        const sys = JSON.parse(JSON.stringify(req.body));
        const MR = new algorithms.mostReliablity(sys);
        const solMR = MR.run();
        res.json({MR_result: solMR['servicePlacementResults'], 
            MR_runtime: solMR['runtime'], 
            MR_perService_result: solMR['perServiceAnalysis'],
            MR_finalSolution: solMR['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'MP')
    {
        const sys = JSON.parse(JSON.stringify(req.body));
        const MP = new algorithms.mostPowerful(sys);
        const solMP = MP.run();
        res.json({MP_result: solMP['servicePlacementResults'], 
            MP_runtime: solMP['runtime'], 
            MP_perService_result: solMP['perServiceAnalysis'],
            MP_finalSolution: solMP['solution']
        })
    }
    else if (req.body['type'] == 'current' && req.body['algo'] == 'LP')
    {
        const sys = JSON.parse(JSON.stringify(req.body));
        const LP = new algorithms.leastPowerful(sys);
        const solLP = LP.run();
        
        res.json({LP_result: solLP['servicePlacementResults'], 
            LP_runtime: solLP['runtime'], 
            LP_perService_result: solLP['perServiceAnalysis'],
            LP_finalSolution: solLP['solution']
        })
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
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "SA")
    {

        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningSA();

        if (r == true)
        {
            const fineTuning = "Fine-tuning of SA was completed.";
            res.json({'outcome': fineTuning}) 
        }
    }
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "popSA")
    {
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningPopSA();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of popSA was completed.";
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
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "SCA")
    {
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningSCA();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of SCA was completed.";
            res.json({'outcome': fineTuning}) 
        }
    }
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "DE")
    {
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningDE();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of DE was completed.";
            res.json({'outcome': fineTuning}) 
        }
    }
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "GWO")
    {
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningGWO();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of GWO was completed.";
            res.json({'outcome': fineTuning}) 
        }
    }
    else if (req.body['type'] == 'tuning' && req.body['algo'] == "WOA")
    {
        const config = {ans: req.body};
        const tuning = new algorithms.fineTuning(config);
        r = tuning.tuningWOA();
        if (r == true)
        {
            const fineTuning = "Fine-tuning of WOA was completed.";
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
        res.json({Output: "Something went wrong..."})
    }
})
const server = app.listen(ipPort, () => {
    console.log(`Listening on ${ipAddress}:${ipPort} !!!`);
});
server.setTimeout(0);
