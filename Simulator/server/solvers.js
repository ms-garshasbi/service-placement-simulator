const fs = require('fs');
const { performance } = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const seedrandom = require('seedrandom');
let path = require('path');

function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
}

function deepCopy(input)
{
    return JSON.parse(JSON.stringify(input))
}

function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}

function flattenJson(data) {
  return {
    totalResponseTime: data.totalResponseTime,
    platformReliability: data.platformReliability,
    serviceReliability: data.serviceReliability,
    loadTier1: data.loadTier1,
    loadTier2: data.loadTier2,
    loadTier3: data.loadTier3,
    loadTierHelper: data.loadTierHelper,
    loadTierUser: data.loadTierUser,
    cpu_entropy_tier1: data.entropyAnalysis.cpu_entropy_tier1,
    cpu_entropy_tier2: data.entropyAnalysis.cpu_entropy_tier2,
    cpu_entropy_tier3: data.entropyAnalysis.cpu_entropy_tier3,
    cpu_entropy_infra: data.entropyAnalysis.cpu_entropy_infrastructure,
    memory_entropy_tier1: data.entropyAnalysis.memory_entropy_tier1,
    memory_entropy_tier2: data.entropyAnalysis.memory_entropy_tier2,
    memory_entropy_tier3: data.entropyAnalysis.memory_entropy_tier3,
    memory_entropy_infra: data.entropyAnalysis.memory_entropy_infrastructure 
  };
}

function appendJsonToCsv(jsonObject, filename) 
{
  const csvFilePath = `${filename}.csv`;
  const flattenedData = flattenJson(jsonObject);
  const json2csvParser = new Parser({ header: false });
  const csvData = json2csvParser.parse([flattenedData]);
  if (!fs.existsSync(csvFilePath)) {
    const header = new Parser().parse([flattenedData]);
    fs.writeFileSync(csvFilePath, header + '\n');
  }
  fs.appendFileSync(csvFilePath, csvData + '\n');
}

class solutionOperation {
    constructor(sysConfig) {
        const config = sysConfig;
        this.services = config['services'];
        this.computingNodes = config['computingNodes'];
        this.componentConnections = config['componentConnections'];
        this.helpers = config['helperNodes'];
        this.users = config['usersNodes'];
        this.infraConnections = config['infraConnections'];
        this.ans = config;

        //For calculating Ave BW //If metaheuristics is use, these are not required //When using metaheuristcs, these line should be commented
        //this.dv = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1))
        //this.copy_bw = JSON.parse(JSON.stringify(this.infraConnections))
    }

    randomSolution()
    {
        let solution = [];
        const numServices = this.services.length;
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numComponents = (this.services[0]['components']).length;
        const numHelpers = this.helpers.length;
        const numUsers = this.users.length;

        for (let i = 1; i <= numServices; i++) {
            for (let j = 1; j <= numComponents; j++) {
                solution.push([i, j, Math.floor(getRandomValue(1, numVersions + 1)), Math.floor(getRandomValue(1, this.computingNodes.length + numHelpers + numUsers + 1))]);
            }
        }
        return solution;
    }

    validation(solution)
    {
        const numComponents = (this.services[0]['components']).length;
        for (let i = 0; i < solution.length; i++) 
        {
            if (solution[i][1] == 1)
            {
                solution[i][3] = this.services[solution[i][0]-1]['userID']
            }
            if (solution[i][1] == numComponents)
            {
                solution[i][3] = this.services[solution[i][0]-1]['helperID']
            }

            let nodeID = solution[i][3];
            let serviceID = solution[i][0];
            let compatible = false;
            for (let j = 0; j < this.services.length; j++) {
                if (nodeID > this.computingNodes.length) 
                {
                    if (this.services[j]['serviceID'] == serviceID && (this.services[j]['userID'] == nodeID || this.services[j]['helperID'] == nodeID)) 
                    {
                        compatible = true;
                        break;
                    }
                }
            }
            if (nodeID > this.computingNodes.length && compatible == false) {
                solution[i][3] = Math.floor(getRandomValue(1, this.computingNodes.length));
            }
        }
        return solution;
    }

    healing(solution) 
    {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));

        const numHelpers = (this.helpers).length;
        const numComputingNodes = this.computingNodes.length;
        const userID = this.users[0]["nodeID"];
        const helperID = this.helpers[0]["nodeID"];

        for (let s = 0; s < solution.length; s++) {
            let placed = false;
            const cn = solution[s][3]

            if (cn >= userID) //So the node is a user node
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                //const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] &&
                    placedComponentDisk < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] //&&
                    //placedComponentCPU < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['cpu']
                ) 
                {
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                    //userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['cpu'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk //&&
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU
                            ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
                            placed = true;
                            break;
                        }
                    }
                }       
            }
            if (cn >= helperID && cn < userID) //So the node is a helper node
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                //const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['memory'] &&
                    placedComponentDisk < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['disk'] //&&
                    //placedComponentCPU < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['cpu']
                ) 
                {
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['memory'] -= placedComponentMem;
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['disk'] -= placedComponentDisk;
                    //helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['cpu'] -= placedComponentCPU;
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = computingNodesFreeCapacity.length - 1; cN > 0; cN--) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk //&&
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU
                        ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
                            placed = true;
                            
                            break;
                        }
                    }
                }  
            }
            if (solution[s][3] < helperID) //So node is a computing node
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                //const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] &&
                    placedComponentDisk < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] //&&
                    //placedComponentCPU < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['cpu']
                ) 
                {
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] -= placedComponentMem;
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] -= placedComponentDisk;
                    //computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['cpu'] -= placedComponentCPU;
                    placed = true;
                   
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk //&&
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU
                        ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
                            placed = true;
                            break;
                        }
                    }
                }
            }

            if (placed == false)
            {
                console.log("Some of service components can not run due to lack of enough resource...");
            }
        }
        return solution;
    }

    simpleInitialSolutions(solutionSize) {
        let solutions = [];
        for (let i = 0; i < solutionSize; i++) {
            solutions.push(this.validation(this.randomSolution()))
        }
        return solutions;
    }

    initialSolutions(solutionSize) {
        let solutions = [];
        for (let i = 0; i < solutionSize; i++) {
            solutions.push(this.healing(this.validation(this.randomSolution())))
        }
        return solutions;
    }

    solutionsQualitySort(solutions, quality) 
    {
        let indices = solutions.map((_, index) => index);
        indices.sort((a, b) => quality[a] - quality[b]);
        let sortedSolutions = indices.map(index => solutions[index]);
        let sortedQuality = indices.map(index => quality[index]);
    
        return {
            bestSolution: sortedSolutions[0],
            worstSolution: sortedSolutions[sortedSolutions.length - 1],
            medianSolution: sortedSolutions[Math.ceil(sortedSolutions.length / 2)],
            bestQuality: sortedQuality[0],
            medianQuality: sortedQuality[Math.ceil(sortedQuality.length / 2)],
            worstQuality: sortedQuality[sortedQuality.length - 1]
        };
    }

    infraReliability(solution) //for fault tolerance
    {
        const numComponents = this.services[0]['components'].length;
        let totalRC = 0;

        for (let s = 0; s < solution.length / numComponents; s++) 
        {
            let reliabilityTier1 = 1;
            let reliabilityTier2 = 1;
            let reliabilityTier3 = 1;
            let reliabilityUsers = 1;
            let reliabilityHelpers = 1;
            let counterUser = 0, counterHelper = 0;

            for (let i = s*numComponents; i < (s+1)*numComponents; i++) 
            {   const node = solution[i][3];
                
                if (node < this.helpers[0]["nodeID"])
                {
                    reliabilityTier1 *= (this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                }
                else if (node >= this.helpers[0]["nodeID"] && node < this.users[0]["nodeID"])
                {
                    counterHelper++;
                    reliabilityHelpers *= this.helpers[node-this.helpers[0]["nodeID"]]['characteristics']['reliability']

                }
                else if (node >= this.users[0]["nodeID"])
                {
                    counterUser++;
                    reliabilityUsers *= this.users[node-this.users[0]["nodeID"]]['characteristics']['reliability']

                }
            }

            if (reliabilityTier1 == 0) {reliabilityTier1 = 1}
            if (reliabilityTier2 == 0) {reliabilityTier2 = 1}
            if (reliabilityTier3 == 0) {reliabilityTier3 = 1}
            if (reliabilityUsers == 0) {reliabilityUsers = 0.99; counterUser = 1;}
            if (reliabilityHelpers == 0) {reliabilityHelpers = 0.99; counterHelper = 1;}
            totalRC += reliabilityTier1*reliabilityUsers*reliabilityHelpers;
            
        }
        return totalRC/(solution.length/numComponents)
    } 

    serviceReliability(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let aveRS = 0;

            if (solution.length < numComponents)
            {
                
                let RS_rest = 1;
                for (let s = 0; s < solution.length; s++)
                {
                    RS_rest *= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['reliabilityScore'];
                }
                aveRS = aveRS + RS_rest
            }

            if (solution.length >= numComponents)
            {
                for (let s = 0; s < (solution.length - (solution.length%numComponents)) / numComponents; s++)
                {
                    let RS = 1;
                    for (let i = s*numComponents; i < (s+1)*numComponents; i++)
                    {
                        RS *= this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['reliabilityScore'];
                    }
                    aveRS = aveRS + RS
                }
                aveRS = aveRS/((solution.length - (solution.length%numComponents)) / numComponents) 
            }

            if (solution.length%numComponents != 0 && solution.length > numComponents)
            {
                let RS_rest = 1;
                for (let s = solution.length - (solution.length%numComponents); s < solution.length;s++)
                {
                    RS_rest *= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['reliabilityScore'];
                }
    
                
                aveRS = aveRS + RS_rest
                aveRS = aveRS/2
            }
        return aveRS;
    }

    executionTime(solution)
    {
        //exe time with waiting time
        let eT = 0 //wT
        for (let k = 0; k < solution.length; k++)
        {

            let node_id = solution[k][3];
            for (let i = 0; i <= k; i++)
            {
                let CC, CR;
                if (solution[i][3] == node_id && node_id < this.helpers[0]["nodeID"])
                {
                    CR = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['cpu'];
                    CC = this.computingNodes[solution[i][3] - 1]['characteristics']['cpu'];
                    eT = eT + CR/CC;
                }
                else if (solution[i][3] == node_id && node_id >= this.helpers[0]["nodeID"] && node_id < this.users[0]["nodeID"])
                {
                    CR = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['cpu'];
                    CC = this.helpers[solution[i][3] - this.helpers[0]["nodeID"]]['characteristics']['cpu'];
                    eT = eT + CR/CC;
                }
                else if (solution[i][3] == node_id && node_id >= this.users[0]["nodeID"])
                {
                    CR = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['cpu'];
                    CC = this.users[solution[i][3] - this.users[0]["nodeID"]]['characteristics']['cpu'];
                    eT = eT + CR/CC;
                }
            }
        }
        return eT;
    }

    currentBW(solution)
    {
        this.bwd(solution,this.dv)
        const bandwidth = this.aveBW()
        return bandwidth;
    }

    bwDivision(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let conn = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1));

        for (let s = 0; s < (solution.length - (solution.length%numComponents)) / numComponents; s++)
        {
            for (let i = s * this.componentConnections[0].length; i < (s + 1) * this.componentConnections[0].length; i++)
            {
                const sc_id = solution[i][1] - 1;
                const cn_id = solution[i][3] - 1;
                for (let j = i; j < (s + 1) * this.componentConnections[0].length; j++)
                {
                    const scd_id = solution[j][1] - 1; //Dependent SC
                    if (this.componentConnections[sc_id][scd_id] != 0)
                    {
                        const cnd_id = solution[j][3] - 1;
                        if (this.infraConnections[cn_id][cnd_id][0] != 0)
                        {
                            conn[cn_id][cnd_id] += 1; 
                        }     
                    }
                }
            }
        }
        return conn;
    }

    transmissionDelay(solution)
    {
        const numComponents = this.services[0]['components'].length;
        const conn = this.bwDivision(solution)
        

        let cT = 0;
        for (let s = 0; s < (solution.length - (solution.length%numComponents)) / numComponents; s++)
        {
            for (let i = s * this.componentConnections[0].length; i < (s + 1) * this.componentConnections[0].length; i++)
            {
                const ds = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['dataSize'];
                const sc_id = solution[i][1] - 1;
                const cn_id = solution[i][3] - 1;
                for (let j = i; j < (s + 1) * this.componentConnections[0].length; j++)
                {
                    const scd_id = solution[j][1] - 1;
                    if (this.componentConnections[sc_id][scd_id] != 0)
                    {
                        const cnd_id = solution[j][3] - 1;
                        if (this.infraConnections[cn_id][cnd_id][0] != 0)
                        {
                            const bw = this.infraConnections[cn_id][cnd_id][0]/conn[cn_id][cnd_id];
                            cT = cT + (ds/bw + this.infraConnections[cn_id][cnd_id][1])
                        }     
                    }
                }
            }
        }
        return cT;
    }

    providerDelay(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let totalPrDelay = 0;
        for(let s = 0; s < solution.length/numComponents; s++)
        {
            let pDelay = 0;
            for (let i = s*numComponents; i < (s+1)*numComponents;i++)
            {
                const pr = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['provider'];
                switch (pr) {
                    case 'AWS':
                        pDelay += 0.0;
                        break;
                    case 'Azure':
                        pDelay += 0.0;
                        break;
                    case 'Ericsson':
                        pDelay += 0.0;
                        break;
                    case 'K8w':
                        pDelay += 0.0;
                        break;
                    default:
                        pDelay += 0;
                        break;
                }
            }
            totalPrDelay += pDelay;
        }
        return totalPrDelay;
    }

    codecDelay(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let totalCodecDelay = 0;
        for(let s = 0; s < solution.length/numComponents; s++)
        {
            let cDelay = 0;
            for (let i = s*numComponents; i < (s+1)*numComponents;i++)
            {
                const codecType = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['codecType'];
                switch (codecType) {
                    case 'H256':
                        cDelay = 0.0;
                        break;
                    case 'H264':
                        cDelay = 0.0;
                        break;
                    default:
                        cDelay = 0;
                        break;
                }
            }
            totalCodecDelay += cDelay;
        }
        return totalCodecDelay;
    }

    configurationTime(solution)
    {
        let totalCost = 0;
        for (let k = 0; k < solution.length; k++)
        {
            let node_id = solution[k][3];
            let cost = 0;
            if (node_id < this.helpers[0]["nodeID"])
            {
                const imageSize = this.services[solution[k][0] - 1]['components'][solution[k][1] - 1]['versions'][solution[k][2] - 1]['characteristics']['imageSize'];
                const installingTime = this.services[solution[k][0] - 1]['components'][solution[k][1] - 1]['versions'][solution[k][2] - 1]['characteristics']['installingTime'];
                const nodeBandwidth = 500//this.infraConnections[node_id-1][0][0]
                cost = imageSize/nodeBandwidth + installingTime
            }
            totalCost = totalCost + cost;
        }
        return totalCost;
    }

    calculateAll(solution)
    {
        const ResponseTime = this.executionTime(solution) + 
                             this.transmissionDelay(solution); //+ 
                             //this.providerDelay(solution) + 
                             //this.codecDelay(solution);
        const PlatformReliability = this.infraReliability(solution);
        const ServiceReliability = this.serviceReliability(solution);

        return {
            ResponseTime,
            PlatformReliability,
            ServiceReliability,
            OverallReliabilty: PlatformReliability * ServiceReliability
        }
    }

    calculateAllwithRecoveryTime(solution)
    {
        const ResponseTime = this.executionTime(solution) + 
        this.transmissionDelay(solution) + 
        this.providerDelay(solution) + 
        this.codecDelay(solution);
        const PlatformReliability = this.infraReliability(solution);
        const ServiceReliability = this.serviceReliability(solution);
        const RecoveryTime = this.recoveryTime(solution);

        return {
            ResponseTime,
            PlatformReliability,
            ServiceReliability,
            RecoveryTime,
        }
    }

    recoveryTime(solution)
    {
        let totalRecoveryTime = 0
        for (let i = 0; i < solution.length; i++)
        {
            let node_id = solution[i][3];
            if (node_id < this.helpers[0]["nodeID"])
            {
                const imgSize = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['imageSize'];
                const installigTime = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['installingTime'];
                const nodeBW = 500//this.infraConnections[node_id]
                totalRecoveryTime += (imgSize/nodeBW + installigTime)
            }
        }
        return totalRecoveryTime;
    }

    loadCalculatorOnNode(solution)
    {

        let load = new Array(this.computingNodes.length).fill(0);
        for(let i = 0; i < solution.length; i++)
        {
            const nodeID = solution[i][3];
            if (nodeID < this.helpers[0]['nodeID'])
            {
                load[solution[i][3]-1]++;
            }
        }

        const minValue = Math.min(...load);
        const maxValue = Math.max(...load);
        const difference = maxValue - minValue

        return {
            loadNodes: load,
            loadMin: minValue,
            loadMax: maxValue,
            loadDifference: difference
        }
    }

    loadCalculator(solution)
    {
        let users = 0;
        let helpers = 0;
        let tier1 = 0;
        let tier2 = 0;
        let tier3 = 0;

        for (let i = 0; i < solution.length; i++)
        {
            const nodeID = solution[i][3];
            if (nodeID < this.helpers[0]['nodeID'])
            {
                if (this.computingNodes[nodeID - 1]['nodeTier'] == 1)
                {
                    tier1++;
                }
                else if (this.computingNodes[nodeID - 1]['nodeTier'] == 2)
                {
                    tier2++;
                }
                else if (this.computingNodes[nodeID - 1]['nodeTier'] == 3)
                {
                    tier3++;
                }
            }
            else if (nodeID >= this.helpers[0]['nodeID'] && nodeID < this.users[0]['nodeID'])
            {
                helpers++
            }
            else if (nodeID >= this.users[0]['nodeID'])
            {
                users++;
            }
        }
        const sum = tier1 + tier2 + tier3 + helpers + users;
        const percentage = {tier1: tier1/sum,
            tier2: tier2/sum,
            tier3: tier3/sum, 
            helperTier: helpers/sum, 
            userTier: users/sum}
        return percentage;
    }

    entropyCalculator(solution)
    {
        let usedMemory = new Array(this.computingNodes.length).fill(0);
        let usedCPU = new Array(this.computingNodes.length).fill(0);

        for (let i = 0; i < solution.length; i++) {
            let nodeIndex = solution[i][3] >= this.computingNodes.length ? this.computingNodes.length - 1 : solution[i][3] - 1;
            let service = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics'];
            usedMemory[nodeIndex] += service['memory'];
            usedCPU[nodeIndex] += service['cpu'];
        }
        
        let totalMemory = 0, totalCPU = 0;
        let totalMemoryTier1 = 0, totalMemoryTier2 = 0, totalMemoryTier3 = 0;
        let totalCPUTier1 = 0, totalCPUTier2 = 0, totalCPUTier3 = 0;
        let tier1_memory_entropy = 0, tier1_cpu_entropy = 0;
        let tier2_memory_entropy = 0, tier2_cpu_entropy = 0;
        let tier3_memory_entropy = 0, tier3_cpu_entropy = 0;
        
        let num_tier1 = 0, num_tier2 = 0, num_tier3 = 0;
        
        for (let i = 0; i < this.computingNodes.length; i++) {
            let node = this.computingNodes[i];
            let nodeTier = node['nodeTier'];
            let cpuCapacity = node['characteristics']['cpu'];
            let memoryCapacity = node['characteristics']['memory'];
        
            usedCPU[i] /= cpuCapacity;
            usedMemory[i] /= memoryCapacity;
        
            totalCPU += usedCPU[i];
            totalMemory += usedMemory[i];
        
            if (nodeTier == 1) {
                num_tier1++;
                totalMemoryTier1 += usedMemory[i];
                totalCPUTier1 += usedCPU[i];
            } else if (nodeTier == 2) {
                num_tier2++;
                totalMemoryTier2 += usedMemory[i];
                totalCPUTier2 += usedCPU[i];
            } else if (nodeTier == 3) {
                num_tier3++;
                totalMemoryTier3 += usedMemory[i];
                totalCPUTier3 += usedCPU[i];
            }
        }
        
        for (let i = 0; i < this.computingNodes.length; i++) {
            let nodeTier = this.computingNodes[i]['nodeTier'];
            let memoryFrac = usedMemory[i];
            let cpuFrac = usedCPU[i];
        
            if (nodeTier == 1 && totalMemoryTier1 > 0 && totalCPUTier1 > 0) {
                memoryFrac /= totalMemoryTier1;
                cpuFrac /= totalCPUTier1;
                if (memoryFrac > 0) tier1_memory_entropy -= memoryFrac * Math.log2(memoryFrac);
                if (cpuFrac > 0) tier1_cpu_entropy -= cpuFrac * Math.log2(cpuFrac);
            } else if (nodeTier == 2 && totalMemoryTier2 > 0 && totalCPUTier2 > 0) {
                memoryFrac /= totalMemoryTier2;
                cpuFrac /= totalCPUTier2;
                if (memoryFrac > 0) tier2_memory_entropy -= memoryFrac * Math.log2(memoryFrac);
                if (cpuFrac > 0) tier2_cpu_entropy -= cpuFrac * Math.log2(cpuFrac);
            } else if (nodeTier == 3 && totalMemoryTier3 > 0 && totalCPUTier3 > 0) {
                memoryFrac /= totalMemoryTier3;
                cpuFrac /= totalCPUTier3;
                if (memoryFrac > 0) tier3_memory_entropy -= memoryFrac * Math.log2(memoryFrac);
                if (cpuFrac > 0) tier3_cpu_entropy -= cpuFrac * Math.log2(cpuFrac);
            }
        }
        
        let H_memory = 0, H_cpu = 0;
        for (let i = 0; i < this.computingNodes.length; i++) {
            let memoryFrac = usedMemory[i] / totalMemory;
            let cpuFrac = usedCPU[i] / totalCPU;
            if (memoryFrac > 0) H_memory -= memoryFrac * Math.log2(memoryFrac);
            if (cpuFrac > 0) H_cpu -= cpuFrac * Math.log2(cpuFrac);
        }
        
        return {
            cpu_entropy_tier1: tier1_cpu_entropy,
            cpu_entropy_tier2: tier2_cpu_entropy,
            cpu_entropy_tier3: tier3_cpu_entropy,
            cpu_entropy_infrastructure: H_cpu,
            memory_entropy_tier1: tier1_memory_entropy,
            memory_entropy_tier2: tier2_memory_entropy,
            memory_entropy_tier3: tier3_memory_entropy,
            memory_entropy_infrastructure: H_memory,
        };
    }

    faultToleranceHeuSolutionAnalyser(solution, recTime)
    {
        const cost = this.calculateAll(solution)
        const loadOnTiers = this.loadCalculator(solution)
        const entropy = this.entropyCalculator(solution)
        return {
            totalResponseTime: cost['ResponseTime'],
            aveResponseTime: cost['ResponseTime']/this.users.length,
            overallReliability: cost['PlatformReliability'] * cost['ServiceReliability'],
            reconfigurationCost: 1,
            loadTier1: loadOnTiers['tier1'],
            loadTier2: loadOnTiers['tier2'],
            loadTier3: loadOnTiers['tier3'],
            loadTierHelper: loadOnTiers['helperTier'],
            loadTierUser: loadOnTiers['userTier'],
            entropyAnalysis: entropy,
        }
    }

    solutionAnalyser(solution)
    {
        const cost = this.calculateAll(solution)
        const loadOnTiers = this.loadCalculator(solution)
        const entropy = this.entropyCalculator(solution)
        const configCost = this.configurationTime(solution)
        
        return {
            totalResponseTime: cost['ResponseTime'],
            aveResponseTime: cost['ResponseTime']/this.users.length,
            platformReliability: cost['PlatformReliability'],
            serviceReliability: cost['ServiceReliability'],
            loadTier1: loadOnTiers['tier1'],
            loadTier2: loadOnTiers['tier2'],
            loadTier3: loadOnTiers['tier3'],
            loadTierHelper: loadOnTiers['helperTier'],
            loadTierUser: loadOnTiers['userTier'],
            entropyAnalysis: entropy,
            confCost: configCost
        }
    }

    nodeFailureSimulator(prevSolution, times = 0)
    {
        const failedNodes = [];
        const listLosts = [];
        const affectedServices = [];
        
        for (let i = 0; i < this.computingNodes.length; i++)
        {
            const rng = seedrandom(times * i); 
            const rnd = rng()
            if (/*this.computingNodes[i]['characteristics']['reliabilityScore']*/ 0.9 < rnd) 
            {
                const failedNode = this.computingNodes[i]['nodeID']
                failedNodes.push(failedNode)

                for(let k = 0; k < prevSolution.length; k++)
                {
                    if (prevSolution[k][3] == failedNode)
                    {
                        listLosts.push(prevSolution[k]);
                    }
                }
                //break
            }
        }

        for (let x = 0; x < listLosts.length; x++)
            {
                if (affectedServices.includes(listLosts[x][0]) == false)
                {
                    affectedServices.push(listLosts[x][0])
                }
            }
            return {listLosts: listLosts , failedNodes: failedNodes, affectedServices: affectedServices};
    }

    componentFailureSimulator(prevSolution, times = 1)
    {
        const listLosts = [];
        const affectedServices = [];

        for (let i = 0; i < prevSolution.length; i++)
        {
            const rng = seedrandom(times * i); 
            const rnd = rng()
            
            let serviceID = prevSolution[i][0]
            let componentID = prevSolution[i][1]
            let versionID = prevSolution[i][2]
            if (/*this.services[serviceID-1].components[componentID-1].versions[versionID-1].characteristics.reliabilityScore-*/0.9 < rnd && componentID != 1 && componentID != this.services[0].components.length) 
            {
                listLosts.push(prevSolution[i])
            }
        }

        return listLosts;
    }

    lostComponents(prevSolution)
    {
        let countLosts = 0;
        let listLosts = [];
        const failedNodes = this.nodeFailureSimulator(prevSolution, 1);

        for (let k = 0; k < failedNodes.length; k++)
        {
            for(let i = 0; i < prevSolution.length; i++)
            {
                if (prevSolution[i][3] == failedNodes[k])
                {
                    listLosts.push(prevSolution[i]);
                }
            }
        }

        const affectedServices = []
        for (let x = 0; x < listLosts.length; x++)
        {
            if (affectedServices.includes(listLosts[x][0]) == false)
            {
                affectedServices.push(listLosts[x][0])
            }
        }

        return {listLosts: listLosts , failedNodes: failedNodes, affectedServices: affectedServices}
    }

    quality(solutions)
    {
        const solutionQualities = [];
        const maxValue = this.initialMaxRT();
        let quality = [];
        for (let i = 0; i < solutions.length; i++) 
        {
            solutionQualities.push(this.calculateAll(solutions[i]));
            solutionQualities[i]['ResponseTime'] = 0.33*solutionQualities[i]['ResponseTime'] / maxValue;
            solutionQualities[i]['PlatformReliability'] =  -0.33*solutionQualities[i]['PlatformReliability'];
            solutionQualities[i]['ServiceReliability'] =  -0.33*solutionQualities[i]['ServiceReliability'];
            quality.push(solutionQualities[i]['ResponseTime'] + solutionQualities[i]['PlatformReliability'] + solutionQualities[i]['ServiceReliability']);
        }
        return quality;
    }

    quality_fl(solutions, recoveryTime)
    {

        const solutionQualities = [];
        const maxValue = this.initialMaxRT();
        let quality = [];
        for (let i = 0; i < solutions.length; i++) 
        {
            solutionQualities.push(this.calculateAll(solutions[i]));
            const q =  (0.33*solutionQualities[i]['ResponseTime'] / this.users.length / 1 /*maxValue*/) + (-0.33*solutionQualities[i]['OverallReliabilty']) + (0.33*recoveryTime[i]/5)
            quality.push(q);
        }
        
        return quality;
    }

    quality_configurationCost(solutions)
    {
        const solutionQualities = [];
        const maxValue = this.initialMaxRT();
        let quality = [];
        for (let i = 0; i < solutions.length; i++) 
        {
            solutionQualities.push(this.calculateAll(solutions[i]));
            let configurationCost = this.configurationTime(solutions[i])/solutions[i].length
            const q =  (0.33*solutionQualities[i]['ResponseTime'] / this.users.length /1/*maxValue*/) + (-0.33*(solutionQualities[i]['OverallReliabilty'])/0.9) + (0.33*(configurationCost/5))
            quality.push(q);
        }
        return quality;
    }

    perServiceAnalysis(solution, file_path = "file_name")
    {
        const numServices = this.users.length
        const result = [];
        const chunkSize = Math.ceil(solution.length / numServices);

        for (let i = 0; i < solution.length; i += chunkSize) 
        {
            result.push(solution.slice(i, i + chunkSize));
        }

        const sol = []
        let prevTotalResTime = 0;
        let currentTotalResTime = 0;
        let totalResTimePerService = [];
        let csvData_resTime = "";

        for (let i = 0; i < result.length; i++)
        {
            for(let j = 0; j < result[i].length;j++)
            {
                sol.push(result[i][j])
            }
            const r = this.solutionAnalyser(sol)
            currentTotalResTime = r['totalResponseTime']
            totalResTimePerService.push(currentTotalResTime - prevTotalResTime)
            csvData_resTime += `${Number(totalResTimePerService[i].toFixed(4))}\n`;
            prevTotalResTime = currentTotalResTime;
        }
        let filePath = path.join(__dirname, 'csv', `rt_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_resTime, 'utf8');

        let csvData_platRel = "";
        let csvData_serRel = "";
        let csvData_overallRel = "";
        for (let i = 0; i < result.length; i++) 
        {
            const r = this.solutionAnalyser(result[i]);
            csvData_platRel += `${Number(r['platformReliability'].toFixed(4))}\n`;
            csvData_serRel += `${Number(r['serviceReliability'].toFixed(4))}\n`;
            csvData_overallRel += `${Number(r['platformReliability'].toFixed(4))*Number(r['serviceReliability'].toFixed(4))}\n`
        }
        filePath = path.join(__dirname, 'csv', `platRel_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_platRel, 'utf8');
        filePath = path.join(__dirname, 'csv', `serRel_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_serRel, 'utf8');
        filePath = path.join(__dirname, 'csv', `overallRel_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_overallRel, 'utf8');
        return {
            resTimePerService: csvData_resTime,
            platReliability: csvData_platRel,
            servReliability: csvData_serRel,
        }
    }

    costPerService(solution)
    {
        const numServices = this.users.length

        const result = [];
        const chunkSize = Math.ceil(solution.length / numServices);

        for (let i = 0; i < solution.length; i += chunkSize) 
        {
            result.push(solution.slice(i, i + chunkSize));
        }
    }

    mapIntoInteger(solutions)
    {
        let solutionsINT = JSON.parse(JSON.stringify(solutions));
        let healedSolutions = [];
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numNodes = this.computingNodes.length + this.users.length + this.helpers.length

        for (let i = 0; i < solutionsINT.length; i++)
        {
            for (let j = 0; j < solutionsINT[i].length; j++)
            {
                const r1 = JSON.parse(JSON.stringify(solutionsINT[i][j][2]))
                
                if (r1 < 1 || r1 > numVersions)
                {
                    solutionsINT[i][j][2] = 1//numVersions
                }
                else
                {
                    solutionsINT[i][j][2] = Math.floor(r1);
                }
                
                const r2 = JSON.parse(JSON.stringify(solutionsINT[i][j][3]))
                if (r2 < 1 || r2 > numNodes)
                {
                    solutionsINT[i][j][3] = numNodes
                }
                else
                {
                    solutionsINT[i][j][3] = Math.floor(r2);
                }
            }
            healedSolutions.push(this.healing(this.validation(solutionsINT[i])));
        }
        return healedSolutions;
    }

    initialMaxRT() 
    {
        const sys = JSON.parse(JSON.stringify(this.ans));
        const lP = new taskContinuationAffinity(sys);
        const soLP = lP.run();
        return soLP['servicePlacementResults']['totalResponseTime'];
    }
}

class NCO extends solutionOperation {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
        this.algo = ans['algo']
        this.ans = ans


        if (ans['algo'] == "NCOtrainGA")
        {
            this.pp = ans['configsGA']['populationSize'];
            this.mr = ans['configsGA']['mutationRate'];
            this.cr = ans['configsGA']['crossoverRate'];
            this.ss = ans['configsGA']['selectionSize'];
            this.it = ans['configsGA']['iteration'];
            this.termination = ans['configsGA']['termination'];
            this.sig = 1.5;
        }
        else if (ans['algo'] == "NCOtrainPSO")
        {
            this.pp = ans['configsPSO']['populationSize'];
            this.it = ans['configsPSO']['iteration'];
            this.termination = ans['configsPSO']['termination'];
            this.inertia = ans['configsPSO']['w'];
            this.c1 = ans['configsPSO']['c1'];
            this.c2 = ans['configsPSO']['c2'];
        }
        else if (ans['algo'] == "NCOtrainDE")
        {
            this.pp = ans['configsDE']['populationSize'];
            this.it = ans['configsDE']['iteration'];
            this.termination = ans['configsDE']['termination'];
            this.F = ans['configsDE']['F'];
            this.cr = ans['configsDE']['crossoverRate'];
        }
        else if (ans['algo'] == "NCOtrainPSOGA")
        {
            this.ppGA = ans['configsPSOGA']['populationSizeGA'];
            this.itGA = ans['configsPSOGA']['iterationGA'];
            this.terminationGA = ans['configsPSOGA']['terminationGA'];
            this.ppPSO = ans['configsPSOGA']['populationSizePSO']; 
            this.itPSO = ans['configsPSOGA']['iterationPSO']; 
            this.terminationPSO = ans['configsPSOGA']['terminationPSO']; 
            this.mr = ans['configsPSOGA']['mutationRate']; 
            this.cr = ans['configsPSOGA']['crossoverRate']; 
            this.ss = ans['configsPSOGA']['selectionSize'];
            this.sig = 1.5;
            this.inertia = ans['configsPSOGA']['w'];
            this.c1 = ans['configsPSOGA']['c1'];
            this.c2 = ans['configsPSOGA']['c2'];
        }
        else if (ans['algo'] == "NCOtrainPSODE")
        {
            this.ppDE = ans['configsPSODE']['populationSizeDE'];
            this.itDE = ans['configsPSODE']['iterationDE'];
            this.terminationDE = ans['configsPSODE']['terminationDE'];
            this.ppPSO = ans['configsPSODE']['populationSizePSO']; 
            this.itPSO = ans['configsPSODE']['iterationPSO']; 
            this.terminationPSO = ans['configsPSODE']['terminationPSO']; 
            this.F = ans['configsPSODE']['F']; 
            this.cr = ans['configsPSODE']['crossoverRate'];
            this.inertia = ans['configsPSODE']['w'];
            this.c1 = ans['configsPSODE']['c1'];
            this.c2 = ans['configsPSODE']['c2'];
        }
        this.min = -1
        this.max = 1
        this.CHlenght = 55; // = 8 if the function is linear, = 18 if it is for fault tolerance
        this.model = "M1"; // nonlinear-power, nonlinear-sigmoid, nonlinear-leakyRelu, nonlinear-tanh, linear, ft models (M1(55), M2(165), M3(116), M4(127), M5(296), M6(68))
        this.dv = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1))
        this.copy_bw = JSON.parse(JSON.stringify(this.infraConnections))
    }

    relu(x) {
        return Math.max(0, x);
    }

    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }

    leakyRelu(x, alpha = 0.01) {
        return x > 0 ? x : alpha * x;
    }

    tanh(x) {
        return Math.tanh(x);
    }

    bwd(solution, dv = Array( this.copy_bw[0].length).fill(1).map(() => Array( this.copy_bw[0].length).fill(1)))
    {
        const current_component = solution[solution.length - 1][1] - 1;

        if (current_component > 0)
        {
            let node_id = solution[solution.length - 1][3]-1
            
            for (let i = solution.length - 1 - 1, j = current_component-1; j>=0; i--, j--)
            {
                if (this.componentConnections[j][current_component] == 1)
                {
                    let node_id2 = solution[i][3]-1
                    if (node_id != node_id2)
                    {
                        dv[node_id][node_id2]++;
                        dv[node_id2][node_id]++;

                        this.copy_bw[node_id][node_id2][0] = this.copy_bw[node_id][node_id2][2]/dv[node_id][node_id2]
                        this.copy_bw[node_id2][node_id][0] = this.copy_bw[node_id2][node_id][2]/dv[node_id2][node_id]
                    }
                }
            }
        }
        return dv
    }

    aveBW()
    {
        const aveBW = []
        for (let j = 0; j < this.computingNodes.length; j++)
        {
            let a = 0;
            for (let i = 0; i < this.computingNodes.length; i++)
            {
                a = a + this.copy_bw[i][j][0]
            }
            aveBW.push(a/this.computingNodes.length)
        }
        return aveBW
    }

    model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H = 5;     // hidden neurons
            let t = 0;       // index into weight vector w

            // ----- First layer: 10 -> H -----
            const hidden = new Array(H);
            for (let j = 0; j < H; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];   // W1[j,i]
            }
            hidden[j] = s//Math.max(0, s);  // ReLU
            }

            // ----- Second layer: H -> 1 -----
            let ver_value = 0;
            for (let j = 0; j < H; j++) {
            ver_value += w[t++] * hidden[j];   // W2[0,j]
            }

            return ver_value
    }

    model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H = 15;     // hidden neurons
            let t = 0;       // index into weight vector w

            // ----- First layer: 10 -> H -----
            const hidden = new Array(H);
            for (let j = 0; j < H; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];   // W1[j,i]
            }
            hidden[j] = s//Math.max(0, s);  // ReLU
            }

            // ----- Second layer: H -> 1 -----
            let ver_value = 0;
            for (let j = 0; j < H; j++) {
            ver_value += w[t++] * hidden[j];   // W2[0,j]
            }

            return ver_value
    }

    model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 8;   // hidden layer 1 size
            const H2 = 4;   // hidden layer 2 size
            let t = 0;      // index into flat weight vector w

            // ----- Layer 1: 10 -> H1 -----
            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];            // W1[j,i]
            }
            h1[j] = s; // Math.max(0, s) for ReLU
            }

            // ----- Layer 2: H1 -> H2 -----
            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];           // W2[k,j]
            }
            h2[k] = s; // Math.max(0, s) for ReLU
            }

            // ----- Output: H2 -> 1 -----
            let ver_value = 0;
            for (let k = 0; k < H2; k++) {
            ver_value += w[t++] * h2[k];     // W3[0,k]
            }

            return ver_value;
    }

    model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9  = version.imageSize / 10;
            const f10 = version.installingTime / 5;
            const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 8;   // hidden layer 1 size
            const H2 = 4;   // hidden layer 2 size
            const H3 = 3;   // hidden layer 3 size (new)

            let t = 0;      // index into flat weight vector w

            // ----- Layer 1: 10 -> H1 -----
            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];           // W1[j,i]
            }
            h1[j] = s; // Math.max(0, s) for ReLU
            }

            // ----- Layer 2: H1 -> H2 -----
            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];          // W2[k,j]
            }
            h2[k] = s; // Math.max(0, s) for ReLU
            }

            // ----- Layer 3: H2 -> H3 (NEW) -----
            const h3 = new Array(H3);
            for (let m = 0; m < H3; m++) {
            let s = 0;
            for (let k = 0; k < H2; k++) {
                s += w[t++] * h2[k];          // W3[m,k]
            }
            h3[m] = s; // Math.max(0, s) for ReLU
            }

            // ----- Output: H3 -> 1 -----
            let ver_value = 0;
            for (let m = 0; m < H3; m++) {
            ver_value += w[t++] * h3[m];    // W4[0,m]
            }

            return ver_value
    }

    model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 16;   // hidden layer 1 size
            const H2 = 8;   // hidden layer 2 size
            let t = 0;      // index into flat weight vector w

            // ----- Layer 1: 10 -> H1 -----
            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];            // W1[j,i]
            }
            h1[j] = s; // Math.max(0, s) for ReLU
            }

            // ----- Layer 2: H1 -> H2 -----
            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];           // W2[k,j]
            }
            h2[k] = s; // Math.max(0, s) for ReLU
            }

            // ----- Output: H2 -> 1 -----
            let ver_value = 0;
            for (let k = 0; k < H2; k++) {
            ver_value += w[t++] * h2[k];     // W3[0,k]
            }

            return ver_value;
    }

    model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9  = version.imageSize / 10;
            const f10 = version.installingTime / 5;
            const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 2;   // hidden layer 1 size
            const H2 = 4;   // hidden layer 2 size
            const H3 = 8;   // hidden layer 3 size (new)

            let t = 0;      // index into flat weight vector w

            // ----- Layer 1: 10 -> H1 -----
            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];           // W1[j,i]
            }
            h1[j] = s; // Math.max(0, s) for ReLU
            }

            // ----- Layer 2: H1 -> H2 -----
            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];          // W2[k,j]
            }
            h2[k] = s; // Math.max(0, s) for ReLU
            }

            // ----- Layer 3: H2 -> H3 (NEW) -----
            const h3 = new Array(H3);
            for (let m = 0; m < H3; m++) {
            let s = 0;
            for (let k = 0; k < H2; k++) {
                s += w[t++] * h2[k];          // W3[m,k]
            }
            h3[m] = s; // Math.max(0, s) for ReLU
            }

            // ----- Output: H3 -> 1 -----
            let ver_value = 0;
            for (let m = 0; m < H3; m++) {
            ver_value += w[t++] * h3[m];    // W4[0,m]
            }

            return ver_value
    }

    ft_formula(bandwidth, node, version, w, maxMemory, maxCPU, model_type = "")
    { 
        const f1 = node.characteristics.memory / maxMemory;
        const f2 = node.characteristics.cpu / maxCPU;
        const f3 = node.characteristics.reliabilityScore;
        const f4 = version.memory / 569
        const f5 = version.cpu / 1080
        const f6 = version.dataSize / 5//500
        const f7 = version.reliabilityScore;
        let f8;
        if (bandwidth == undefined)
        {
            f8 = 1
        }
        else
        {
            f8 = bandwidth/500
        }

        if (model_type == "nonlinear-power")
        {
                let ver_value = (w[0] * f1 ** w[8] + w[1] * f2 ** w[9] + w[2] * f3 ** w[10] +
                    w[3] * f4 ** w[11] + w[4] * f5 ** w[12] + w[5] * f6 ** w[13] +
                    w[6] * f7 ** w[14] + w[7] * f8 * w[15]);
                    return ver_value;
        }
        else if (model_type == 0) //M1
        {
            return this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (model_type == 1) //M2
        {
            return this.model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        } 
        else if (model_type == 2) //M3
        {
            return this.model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (model_type == 3) //M4
        {
            return this.model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        } 
        else if (model_type == 4) //M5
        {
            return this.model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (model_type == 5) //M5
        {
            return this.model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }      
    }
    
    formula(bandwidth, node, version, w, maxMemory, maxCPU)
    {
        const f1 = node.characteristics.memory / maxMemory;
        const f2 = node.characteristics.cpu / maxCPU;
        const f3 = node.characteristics.reliabilityScore;
        const f4 = version.memory / 2500
        const f5 = version.cpu / 1100
        const f6 = version.dataSize / 500
        const f7 = version.reliabilityScore;

        let f8;
        if (bandwidth == undefined)
        {
            f8 = 1
        }
        else
        {
            f8 = bandwidth/500
        }

        if (this.model === "nonlinear-power")
        {
                let ver_value = (w[0] * f1 ** w[8] + w[1] * f2 ** w[9] + w[2] * f3 ** w[10] +
                    w[3] * f4 ** w[11] + w[4] * f5 ** w[12] + w[5] * f6 ** w[13] +
                    w[6] * f7 ** w[14] + w[7] * f8 * w[15]);
                    return ver_value;
        }

        else if (this.model === "nonlinear-leakyRelu")
        {
            let ver_value = (w[0] * f1 + w[1] * f2 + w[2] * f3 + w[3] * f4 + w[4] * f5 + w[5] * f6 + w[6] * f7 + w[7] * f8);
            ver_value = this.leakyRelu(ver_value)
            return ver_value;
        }
        else if (this.model === "nonlinear-sigmoid")
        {
            let ver_value = (w[0] * f1 + w[1] * f2 + w[2] * f3 + w[3] * f4 + w[4] * f5 + w[5] * f6 + w[6] * f7 + w[7] * f8);
            ver_value = this.sigmoid(ver_value)
            return ver_value;
        }
        else if (this.model === "nonlinear-tanh")
        {
            let ver_value = (w[0] * f1 + w[1] * f2 + w[2] * f3 + w[3] * f4 + w[4] * f5 + w[5] * f6 + w[6] * f7 + w[7] * f8);
            ver_value = this.tanh(ver_value)
            return ver_value;
        }
        else if (this.model === "linear")
        {
            let ver_value = (w[0] * f1 + w[1] * f2 + w[2] * f3 + w[3] * f4 + w[4] * f5 + w[5] * f6 + w[6] * f7 + w[7] * f8);
            return ver_value;
        }
        else if (this.model == "M3") //M3
        {
            return this.model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (this.model == "M1") //M1
        {
            return this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (this.model == "M2") //M2 
        {
            return this.model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (this.model == "M4") //M4
        {
            return this.model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (this.model == "M5") //M5
        {
            return this.model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        else if (this.model == "M6") //M6
        {
            return this.model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }     
    }

    fitness(w) {
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));
        
        let computingNodesFreeCapacity = this.computingNodes.map(node => ({
            nodeID: node.nodeID,
            characteristics: { ...node.characteristics }
        }));

        let load = new Array(this.computingNodes.length).fill(0);
    
        let solution = [];
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let bandwidth = 0;
    
        let cumulative = 0;

        for (let u = 0; u < this.users.length; u++) {
            for (let c = 0; c < numComponents; c++) {
                const node_value = [];
    
                for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                    const versionValue = [];
                    const node = computingNodesFreeCapacity[cN];
                    
                    for (let v = 0; v < numVersions; v++) {
                        const version = this.services[u].components[c].versions[v].characteristics;
    
                        if (node.characteristics.memory > version.memory //&& node.characteristics.cpu > version.cpu
                           ) 
                        {
                            versionValue.push(this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU)); 
                        } 
                        else 
                        {
                            versionValue.push(-Infinity);
                        }
                    }
    
                    const { max: versionMax, index: versionIndex } = versionValue.reduce(
                        (acc, val, idx) => (val > acc.max ? { max: val, index: idx } : acc),
                        { max: -Infinity, index: -1 }
                    );
    
                    node_value.push([versionIndex, versionMax]);
                }
    
                const { max: nodeMax, index: nodeIndex } = node_value.reduce(
                    (acc, val, idx) => (val[1] > acc.max ? { max: val[1], index: idx } : acc),
                    { max: -Infinity, index: -1 }
                );

                solution.push([
                    this.services[u].serviceID,
                    this.services[u].components[c].componentID,
                    this.services[u].components[c].versions[node_value[nodeIndex][0]].versionNumber,
                    computingNodesFreeCapacity[nodeIndex].nodeID
                ]);

                if (solution.length > 0)
                    {
                            this.bwd(solution,this.dv)
                            bandwidth = this.aveBW()
                    }
    
                const chosenVersion = this.services[u].components[c].versions[node_value[nodeIndex][0]].characteristics;
                computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
            }
        }

        solution = this.validation(solution);
        if (this.model == "M1" || this.model == "M2" || this.model == "M3" || this.model == "M4" || this.model == "M5"|| this.model == "M6")
        {
            return {quality: this.quality_configurationCost([solution])[0], sol: solution};
        }
        return {quality: this.quality([solution])[0], sol: solution};
    }
    
    resultTrain(w) {
        const solution = this.healing(this.fitness(w)['sol']);
        return this.solutionAnalyser(solution);
    }
    
    test(w) {
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

        let computingNodesFreeCapacity = this.computingNodes.map(node => ({
            nodeID: node.nodeID,
            nodeTier: node.nodeTier,
            characteristics: { ...node.characteristics }
        }));

        let load = new Array(this.computingNodes.length).fill(0);
    
        let solution = [];
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let bandwidth = 0;

    
        for (let u = 0; u < this.users.length; u++) {
            for (let c = 0; c < numComponents; c++) {
                const node_value = [];
    
                for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                    const versionValue = [];
                    const node = computingNodesFreeCapacity[cN];                 

                    for (let v = 0; v < numVersions; v++) {
                        const version = this.services[u].components[c].versions[v].characteristics;
    
                        if (node.characteristics.memory > version.memory //&& node.characteristics.cpu > version.cpu
                           ) 
                        {
                            versionValue.push(this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU));
                        } 
                        else 
                        {
                            versionValue.push(-Infinity);
                        }
                    }
    
                    const { max: versionMax, index: versionIndex } = versionValue.reduce(
                        (acc, val, idx) => (val > acc.max ? { max: val, index: idx } : acc),
                        { max: -Infinity, index: -1 }
                    );
    
                    node_value.push([versionIndex, versionMax]);
                }
    
                const { max: nodeMax, index: nodeIndex } = node_value.reduce(
                    (acc, val, idx) => (val[1] > acc.max ? { max: val[1], index: idx } : acc),
                    { max: -Infinity, index: -1 }
                );
    
                solution.push([
                    this.services[u].serviceID,
                    this.services[u].components[c].componentID,
                    this.services[u].components[c].versions[node_value[nodeIndex][0]].versionNumber,
                    computingNodesFreeCapacity[nodeIndex].nodeID
                ]);

                if (solution.length > 0)
                {
                        this.bwd(solution,this.dv)
                        bandwidth = this.aveBW()
                }
    
                const chosenVersion = this.services[u].components[c].versions[node_value[nodeIndex][0]].characteristics;
                computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
            }            
            solution = this.validation(solution);
            appendJsonToCsv(this.solutionAnalyser(solution),this.algo);
        }
        
        solution = this.validation(solution);

        return {
            solution: solution, 
            servicePlacementResults: this.solutionAnalyser(solution),
            nodesFreeCapacity: computingNodesFreeCapacity,
            perServiceAnalysis: this.perServiceAnalysis(solution, "NCO-per-service")
        }
    }

    SA()
    {
        const initialSolution = [];
        const sol_len = 18;
        for (let j = 0; j < sol_len; j++)
        {
            initialSolution.push(getRandomValue(this.min, this.max));
        }

        const alpha = 0.98;
        const termination = 0.000001;
        let temperature = 1000;
        let bestSolution = initialSolution;
        let mutationRate = 0.05;

        let overallBest = bestSolution
        while(temperature > termination)
        {
            const newSolution = [];
            for (let i = 0; i < bestSolution.length; i++) 
            {
                if (Math.random() < mutationRate) 
                {
                    newSolution.push(getRandomValue(this.min, this.max))
                }
                else
                {
                    newSolution.push(bestSolution[i]);
                }
            }

            const f1 = this.fitness(bestSolution)
            const f2 = this.fitness(newSolution)

            if (this.fitness(bestSolution) < this.fitness(overallBest))
            {
                overallBest = JSON.parse(JSON.stringify(bestSolution));
                console.log(this.fitness(overallBest))
            }

            if (f2 < f1) 
            {
                bestSolution = JSON.parse(JSON.stringify(newSolution));
            }
            else
            {
                const diff = f2 - f1;
                if (Math.random() < Math.exp((-diff) / (temperature)))
                {
                    bestSolution = JSON.parse(JSON.stringify(newSolution));
                }
            }
            temperature = temperature * alpha
        }

        return overallBest;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    DE({population = [], numPop = this.pp, numIteration = this.it, termination = this.termination})
    {
        const sol_len = this.CHlenght;
        let counter = 0;

        for (let i = 0; i < numPop; i++)
        {
            const sol = [];
            for (let j = 0; j < sol_len; j++)
            {
                sol.push(getRandomValue(this.min, this.max));
            }
            population.push(sol);
        }

        let previous_best_fit = Infinity
        let previous_best_sol = 0;
        let minIndex
        for (let iteration = 0; iteration < numIteration; iteration++)
        {
            let fitness_target = this.cost(population)
            let mutantVector = JSON.parse(JSON.stringify(population));
            let minValue = Math.min(...fitness_target)
            minIndex = fitness_target.indexOf(minValue);
            if (previous_best_fit > minValue)
            {
                previous_best_fit = minValue
                previous_best_sol = population[minIndex]
                counter = 0
            }
            else
            {
                counter++;
                if (counter > termination)
                {
                    break;
                }
            }

            console.log(previous_best_fit)
            for (let i = 0; i < population.length; i++) 
            {
                const r1 = Math.round(getRandomValue(0,population[0].length))
                const r2 = Math.round(getRandomValue(0,population[0].length))
                const r3 = Math.round(getRandomValue(0,population[0].length))
                const r4 = Math.round(getRandomValue(0,population[0].length))
                const r5 = Math.round(getRandomValue(0,population[0].length))
        
                for (let j = 0; j < population[i].length; j++) {
                    const mV1 = population[i][j] + this.F * (population[minIndex][j] - population[i][j]) + this.F * (population[r1][j] - population[r2][j]);
                    mutantVector[i][j] = mV1;
                }
            }

            const pc = this.cr;
            const trialVector = [];

            for (let delta = 0; delta < mutantVector.length; delta++)
            {
                const trvec = []
                for (let i = 0; i < mutantVector[0].length;i++)
                    {
                        if (Math.random() > pc && i != delta)
                        {
                            trvec.push(population[delta][i])
                        }
                        else
                        {
                            trvec.push(mutantVector[delta][i])
                        }
                    }
                    trialVector.push(trvec)
            }

            const allPopulation = population.concat(trialVector);
            population = this.selection(allPopulation, 6)
        }
        return {w: previous_best_sol, population: population}
    }

    GA({population = [], numPop = this.pp, numIteration = this.it, termination = this.termination})
    {
        let fitness = []
        const sol_len = this.CHlenght;
        let counter = 0;

        for (let i = 0; i < numPop; i++)
        {
            const sol = [];
            for (let j = 0; j < sol_len; j++)
            {
                sol.push(getRandomValue(this.min, this.max)); 
            }
            population.push(sol);
        }

        fitness = this.cost(population)
        let previous_best_fit = Math.min(...fitness);
        let previous_best_fit_index = fitness.indexOf(previous_best_fit);
        let previous_best_sol = population[previous_best_fit_index];

        for (let i = 0; i < numIteration; i++) 
        {
            let changed_population = this.singlePointCrossover(population)
            changed_population = this.mutatePopulation(changed_population)
            const allPopulation = population.concat(changed_population);
            population = this.selection(allPopulation)
            fitness = this.cost(population)

            const K = Math.min(...fitness)
            if (K >= previous_best_fit)
            {
                counter++;
                if (counter == termination)
                {
                    break;
                }
            }
            else
            {
                counter = 0;
                previous_best_fit = K;
                previous_best_fit_index = fitness.indexOf(previous_best_fit);
                previous_best_sol = population[previous_best_fit_index];
            }

            console.log(previous_best_fit);
        }
        return previous_best_sol
    }

    PSO({population = [], numPop = this.pp, numIteration = this.it, termination = this.termination})
    {
        let velocities = [];
        const sol_len = this.CHlenght;

        for (let i = 0; i < numPop; i++)
        {
            const sol = [];
            const v = [];
            for (let j = 0; j < sol_len; j++)
            {
                sol.push(getRandomValue(this.min, this.max));
                v.push(getRandomValue(0,1));
            }
            population.push(sol);
            velocities.push(v)
        }

        let pBest = deepCopy(population)
        let gBest;
        let fitness_gBest = Infinity
        let previous_best_fitness = Infinity;
        let counter = 0;
        let previous_best1 = Infinity;

        for (let iteration = 0; iteration < numIteration; iteration++ )
        {
            let fitness = deepCopy(this.cost(population))
            let fitness_pBest = deepCopy(this.cost(pBest))
            for (let i = 0; i < fitness.length; i++)
            {
                if (fitness_gBest > fitness_pBest[i])
                {
                    fitness_gBest = deepCopy(fitness_pBest[i])
                    gBest = deepCopy(pBest[i])
                }
                if (fitness[i] < fitness_pBest[i])
                {
                    pBest[i] = deepCopy(population[i])
                }
            }
            if (fitness_gBest == previous_best_fitness || iteration == numIteration-1)
            {
                counter++;
                if (counter == termination || iteration == numIteration-1)
                {
                    return {w: previous_best1, population: population};
                }
            }
            else
            {
                previous_best_fitness = deepCopy(fitness_gBest)
                previous_best1 = JSON.parse(JSON.stringify(gBest))
                counter = 0;
            }

            const w = this.inertia;
            const r1 = getRandomValue(0,1);
            const r2 = getRandomValue(0,1);
            const c1 = this.c1;
            const c2 = this.c2;
            for (let i = 0; i < velocities.length; i++)
            {
                for (let j = 0; j < velocities[i].length; j++)
                {
                    velocities[i][j] = deepCopy(w * velocities[i][j] + c1*r1*(pBest[i][j] - population[i][j]) + c2*r2*(gBest[j] - population[i][j]))
                    population[i][j] = deepCopy(population[i][j] + velocities[i][j])
                
                }
            }
            console.log(previous_best_fitness)
        }
    }

    singlePointCrossover(population, crossoverRate = this.cr) {
        if (population.length % 2 !== 0) {
            throw new Error("Population size must be even.");
        }
    
        const offspringPopulation = [];
    
        for (let i = 0; i < population.length; i += 2) {
            const parent1 = population[i];
            const parent2 = population[i + 1];

            if (Math.random() < crossoverRate) {
                const crossoverPoint = Math.floor(Math.random() * (parent1.length - 1)) + 1;
                const offspring1 = [...parent1.slice(0, crossoverPoint), ...parent2.slice(crossoverPoint)];
                const offspring2 = [...parent2.slice(0, crossoverPoint), ...parent1.slice(crossoverPoint)];
                offspringPopulation.push(offspring1, offspring2);
            } else {
                offspringPopulation.push([...parent1], [...parent2]);
            }
        }
        return offspringPopulation;
    }

    blendCrossover(population, crossoverRate = this.cr, alpha = 0.5) {
        const offspringPopulation = [];
        for (let i = 0; i < population.length; i += 2) {
            const parent1 = population[i];
            const parent2 = population[i + 1];
    
            if (Math.random() < crossoverRate) {
                const offspring1 = [];
                const offspring2 = [];
    
                for (let j = 0; j < parent1.length; j++) {
                    const minGene = Math.min(parent1[j], parent2[j]);
                    const maxGene = Math.max(parent1[j], parent2[j]);
                    const range = maxGene - minGene;
                    offspring1.push(Math.random() * range * (1 + 2 * alpha) + (minGene - alpha * range));
                    offspring2.push(Math.random() * range * (1 + 2 * alpha) + (minGene - alpha * range));
                }
    
                offspringPopulation.push(offspring1, offspring2);
            } else {
                offspringPopulation.push([...parent1], [...parent2]);
            }
        }
        return offspringPopulation;
    }

    mutatePopulation(population, mutationRate = this.mr) {
        const mutatedPopulation = population.map(solution => [...solution]);
        for (let i = 0; i < mutatedPopulation.length; i++) {
            for (let j = 0; j < mutatedPopulation[i].length; j++) {
                if (Math.random() < mutationRate) {
                    mutatedPopulation[i][j] = this.gaussianMutation(mutatedPopulation[i][j])
                }
            }
        }
        return mutatedPopulation;
    }

    gaussianMutation(value, sigma = this.sig) 
    {
        let gaussianNoise
        if (Math.random() > 0.5)
        {
            gaussianNoise = -sigma * (Math.random());
        }
        else
        {
            gaussianNoise = sigma * (Math.random());
        }
        return value + gaussianNoise;
    }

    cost(population)
    {
        const cost = [];
        for (let i = 0; i < population.length; i++)
        {
            cost.push(this.fitness(population[i])['quality'])
        }
        return cost;
    }

    selection(population, selectionSize = this.ss) {
        const fitness = this.cost(population);
        const selectedPopulation = [];
        const numSelections = Math.floor(population.length / 2);
    
        for (let x = 0; x < numSelections; x++) {
            let minCostIndex = Math.floor(Math.random() * fitness.length);
            for (let i = 0; i < selectionSize - 1; i++) {
                const rndIndex = Math.floor(Math.random() * population.length);
                if (fitness[rndIndex] < fitness[minCostIndex]) {
                    minCostIndex = rndIndex;
                }
            }
            selectedPopulation.push(population[minCostIndex]);
        }
        return selectedPopulation;
    }
    
    run_train_ga(model_index = 0)
    {
        const w = this.GA({});
        const data = JSON.stringify(w);
        fs.writeFile(`weights_${model_index}.txt`, data, (err) => {
            if (err) {
                console.error('Error writing to file:', err);
                return;
            }
        });
        return {
            weights: w, resultTrain: this.resultTrain(w)
        }
    }

    run_train_pso(model_index = 0)
    {
        const w = this.PSO({numPop: this.pp, numIteration: this.it, termination: this.termination}).w;
        const data = JSON.stringify(w);
        fs.writeFile(`weights_${model_index}.txt`, data, (err) => {
            if (err) {
                console.error('Error writing to file:', err);
                return;
            }
        });

        return {
            weights: w, resultTrain: this.resultTrain(w)
        }
    }

    run_train_sa()
    {
        const w = this.SA()
        const data = JSON.stringify(w);
        fs.writeFile('weights.txt', data, (err) => {
            if (err) {
                console.error('Error writing to file:', err);
                return;
            }
        });
        return {weights: w, resultTrain: this.resultTrain(w)}
    }

    run_train_de(model_index = 0)
    {
       const w = this.DE({}).w
       const data = JSON.stringify(w);
       fs.writeFile(`weights_${model_index}.txt`, data, (err) => {
           if (err) {
               console.error('Error writing to file:', err);
               return;
           }
       });

       return {
        weights: w, resultTrain: this.resultTrain(w)
        }
    }

    run_train_psode(model_index = 0)
    {
        console.log("PSO...")
        const population = this.PSO({numPop: this.ppPSO, numIteration: this.itPSO, termination: this.terminationPSO}).population;
        console.log("DE...")
        const w = this.DE({numPop: this.ppDE, population: population, numIteration: this.itDE, termination: this.terminationDE}).w;
        const data = JSON.stringify(w);
        fs.writeFile(`weights_${model_index}.txt`, data, (err) => {
            if (err) {
                console.error('Error writing to file:', err);
                return;
            }
        });

        return {
            weights: w, resultTrain: this.resultTrain(w)
        }
    }

    run_train_psoga(model_index = 0)
    {
        console.log("PSO...")
        const population = this.PSO({numPop: this.ppPSO, numIteration: this.itPSO, termination: this.terminationPSO}).population;
        console.log("GA...")
        const w = this.GA({numPop: this.ppGA, population: population, numIteration: this.itGA, termination: this.terminationGA});
        const data = JSON.stringify(w);
        fs.writeFile(`weights_${model_index}.txt`, data, (err) => {
            if (err) {
                console.error('Error writing to file:', err);
                return;
            }
        });

        return {
            weights: w, resultTrain: this.resultTrain(w)
        }
    }

    run_test(model_index = 0)
    {
        let w;
        w = readJSON(`weights_${model_index}.txt`)
        return this.test(w)
    }

    faultToleranceNCOTest(initialState, failes, m)
    {
        const mode = m
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let w;
        w = readJSON(`weights_${0}.txt`)
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let initialSolution = JSON.parse(JSON.stringify(initialState['solution']));
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));
        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts']
        console.log("failedList", failes)

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(initialSolution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }

                initialSolution[service_id*numComponents+component_id][3] = failedNodes[0]
            }

            failedList = affectedServiceList 
        }

        let reconfCost = 0
        const cost = []

        for (let i = 0; i < failedList.length; i++)
        {
            const node_value = [];
            const bandwidth = this.currentBW(initialSolution)  
            for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) 
            {
                const versionValue = [];
                const node = computingNodesFreeCapacity[cN];                 
                for (let v = 0; v < numVersions; v++) {
                    const version = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[v].characteristics;
    
                    if (node.characteristics.memory > version.memory //&& node.characteristics.cpu > version.cpu
                       ) 
                    {
                        versionValue.push(this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU));
                    } 
                    else 
                    {
                        versionValue.push(-Infinity);
                    }
                }
    
                const { max: versionMax, index: versionIndex } = versionValue.reduce(
                    (acc, val, idx) => (val > acc.max ? { max: val, index: idx } : acc),
                    { max: -Infinity, index: -1 }
                );
    
                node_value.push([versionIndex, versionMax]);
            }

            const { max: nodeMax, index: nodeIndex } = node_value.reduce(
                (acc, val, idx) => (val[1] > acc.max ? { max: val[1], index: idx } : acc),
                { max: -Infinity, index: -1 }
            );

            let ReconfCalculationMode = 0
            for (let x = 0; x < initialSolution.length; x++)
            {
                if (initialSolution[x][3] == computingNodesFreeCapacity[nodeIndex].nodeID && initialSolution[x][2] == node_value[nodeIndex][0]+1 && initialSolution[x][1] == failedList[i][1])
                {
                    ReconfCalculationMode = 1;
                }
            }

            initialSolution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = computingNodesFreeCapacity[nodeIndex].nodeID
            initialSolution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = node_value[nodeIndex][0]+1

            const serviceID = initialSolution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][0] - 1
            const componentID = initialSolution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][1] - 1
            const versionID = initialSolution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] - 1
            const nodeID = initialSolution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] - 1

            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
            const bwNode = bandwidth[nodeID]

            if (ReconfCalculationMode == 0)
            {
                reconfCost += imgSize/bwNode + imgInstalling
                cost.push([serviceID + 1, componentID + 1, imgSize/bwNode + imgInstalling])
            }
            else if (ReconfCalculationMode == 1)
            {
                reconfCost += imgInstalling
                cost.push([serviceID + 1, componentID + 1, imgInstalling]) 
            }

            const chosenVersion = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[node_value[nodeIndex][0]].characteristics;
            computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
            //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
        }

        console.log("TotalRecoveryTime", reconfCost)
        this.costPerService(initialSolution, `NCO_FT-${mode}`)
        const path = require('path');
        const responseTime = path.join(__dirname, 'csv', `rt_NCO_FT-${mode}.csv`);
        const serviceReliability = path.join(__dirname, 'csv', `serRel_NCO_FT-${mode}.csv`);
        const platformReliability = path.join(__dirname, 'csv', `plarRel_NCO_FT-${mode}.csv`);
        const data_rt = fs.readFileSync(responseTime, 'utf8');
        const data_ser = fs.readFileSync(serviceReliability, 'utf8');
        const data_plat = fs.readFileSync(platformReliability, 'utf8');
        const numbers_rt = data_rt
        .trim()
        .split('\n')
        .map(line => parseFloat(line));

        const numbers_ser = data_ser
        .trim()
        .split('\n')
        .map(line => parseFloat(line));

        const numbers_plar = data_plat
        .trim()
        .split('\n')
        .map(line => parseFloat(line));

        // Log the result
        let totalRTAffectedServices = 0
        let totalSerRelAffectedServices = 0
        let totalPlatRelAffectedServices = 0

        for(let i = 0; i < failes['affectedServices'].length; i++)
        {
            totalRTAffectedServices += numbers_rt[failes['affectedServices'][i]-1]
            totalSerRelAffectedServices += numbers_ser[failes['affectedServices'][i]-1]
            totalPlatRelAffectedServices += numbers_plar[failes['affectedServices'][i]-1]
        }
        console.log("totalRTAffectedServices", totalRTAffectedServices)
        console.log("AveRTAffectedServices", totalRTAffectedServices/(failes['affectedServices']).length)
        console.log("totalSerRelAffectedServices", totalSerRelAffectedServices/(failes['affectedServices']).length)
        console.log("totalPlatRelAffectedServices", totalPlatRelAffectedServices/(failes['affectedServices']).length)
        console.log("totalReliability", (totalSerRelAffectedServices/(failes['affectedServices']).length)* (totalPlatRelAffectedServices/(failes['affectedServices']).length))
    }
}

class faultTolerance extends NCO {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
        this.algo = ans['algo']
        this.ans = ans

        this.models = false
        this.sigmaVec_backprob = [];

        this.flAlgo = ans['algo']
        this.timeSlots = 500;

            this.population = ans['configsGA']['populationSize'],
            this.iterations = ans['configsGA']['iteration'],
            this.tSize = ans['configsGA']['selectionSize'],
            this.crossP = ans['configsGA']['crossoverRate'],
            this.mutationP = ans['configsGA']['mutationRate']

        //GA configurations
        if (this.flAlgo == "FLGA")
        {
            this.population = ans['configsGA']['populationSize'],
            this.iterations = ans['configsGA']['iteration'],
            this.tSize = ans['configsGA']['selectionSize'],
            this.crossP = ans['configsGA']['crossoverRate'],
            this.mutationP = ans['configsGA']['mutationRate']
        }
        else if (this.flAlgo == "FLPSO")
        {
            this.population = ans['configsPSO']['populationSize'],
            this.iterations = ans['configsPSO']['iteration'],
            this.w = ans['configsPSO']['w'],
            this.c1 = ans['configsPSO']['c1'],
            this.c2 = ans['configsPSO']['c2']
        }
        else if (this.flAlgo == "FLDE")
        {
            this.population = ans['configsDE']['populationSize'],
            this.iterations = ans['configsDE']['iteration'],
            this.crossoverRate = ans['configsDE']['crossoverRate'],
            this.F = ans['configsDE']['F']
        }
        else if (this.flAlgo == "FLWOA")
        {
            this.population = ans['configsWOA']['populationSize'],
            this.iterations = ans['configsWOA']['iteration'],
            this.coefficient_A = ans['configsWOA']['coefficient_A'],
            this.coefficient_C = ans['configsWOA']['coefficient_C'],
            this.a = ans['configsWOA']['a'],
            this.b = ans['configsWOA']['b'],
            this.l = ans['configsWOA']['l']
        }
        else if (this.flAlgo == "FLSA")
        {
            this.terminationValue = ans['configsSA']['terminationValue'],
            this.population = ans['configsSA']['populationSize'],
            this.temperature = ans['configsSA']['temperature'],
            this.alpha = ans['configsSA']['alpha'],
            this.updatingRate = ans['configsSA']['updatingRate'],
            this.selectionPressure = ans['configsSA']['selectionPressure']
        }
        else if (this.flAlgo == "FLPSOGA" || this.flAlgo == "FLGAPSO")
        {
            this.populationGA = ans['configsGA']['populationSize'],
            this.iterationsGA = ans['configsGA']['iteration'],
            this.tSize = ans['configsGA']['selectionSize'],
            this.crossP = ans['configsGA']['crossoverRate'],
            this.mutationP = ans['configsGA']['mutationRate'],
            this.populationPSO = ans['configsPSO']['populationSize'],
            this.iterationsPSO = ans['configsPSO']['iteration'],
            this.w = ans['configsPSO']['w'],
            this.c1 = ans['configsPSO']['c1'],
            this.c2 = ans['configsPSO']['c2']
        }
        else if (this.flAlgo == "FLRAS")
        {
            this.populationGA = ans['configsGA']['populationSize'],
            this.iterationsGA = ans['configsGA']['iteration'],
            this.tSize = ans['configsGA']['selectionSize'],
            this.crossP = ans['configsGA']['crossoverRate'],
            this.mutationP = ans['configsGA']['mutationRate'],
            this.populationPSO = ans['configsPSO']['populationSize'],
            this.iterationsPSO = ans['configsPSO']['iteration'],
            this.w = ans['configsPSO']['w'],
            this.c1 = ans['configsPSO']['c1'],
            this.c2 = ans['configsPSO']['c2'],
            this.populationWOA = ans['configsWOA']['populationSize'],
            this.iterationsWOA = ans['configsWOA']['iteration'],
            this.coefficient_A = ans['configsWOA']['coefficient_A'],
            this.coefficient_C = ans['configsWOA']['coefficient_C'],
            this.a = ans['configsWOA']['a'],
            this.b = ans['configsWOA']['b'],
            this.l = ans['configsWOA']['l'],
            this.populationDE = ans['configsDE']['populationSize'],
            this.iterationsDE = ans['configsDE']['iteration'],
            this.crossoverRate = ans['configsDE']['crossoverRate'],
            this.F = ans['configsDE']['F']
        }
    }

    writeToCSV(fileName, data) {
        const csvLine = data.join(',') + '\n';
        fs.appendFile(fileName, csvLine, (err) => {
            if (err) {
                console.log('Error writing to CSV file:', err);
            } else {
                //console.log('Data written to CSV');
            }
        });
    }

    save_results(alg, aveRT_alg, aveRange_alg, aveOvlRel_alg, aveRecTime_alg, t = 0)
    {
        this.perServiceAnalysis(alg['solution'], `${this.flAlgo}_${t}`)
        const maxValues = {};
        for (let i = 0; i < alg['fList'].length; i++) 
        {
            const key = alg['fList'][i][0];
            const value = alg['recTime'][i];

            if (!(key in maxValues) || value > maxValues[key]) 
            {
                maxValues[key] = value;
            }
        }

        const sortedKeys = Object.keys(maxValues).map(Number).sort((a, b) => a - b);
        let csvContent = 'Service_ID, Recovery_time\n';
        for (const key of sortedKeys) {
        csvContent += `${key},${maxValues[key]}\n`;
        }

        fs.writeFile(`csv/recTimePerService_${this.flAlgo}_${t}.csv`, csvContent, (err) => {
        if (err) {
            console.error('Error writing CSV file:', err);
        } else {
            //console.log('CSV file saved as max_values.csv');
        }
        });

        if (t >= this.timeSlots)
        {
            for(let time = 0; time < aveRT_alg.length; time++)
            {
                this.writeToCSV(`csv/${this.flAlgo}.csv`, [aveRT_alg[time]/aveRange_alg, aveOvlRel_alg[time]/aveRange_alg, aveRecTime_alg[time]/aveRange_alg]);
            }
        }
    }

    recoveryTimeStats(fList, recTime) 
    {
        const sums = {}, counts = {};

        for (let i = 0; i < fList.length; i++) {
            const service = fList[i][0];
            const rt = recTime[i];
            sums[service] = (sums[service] || 0) + rt;
            counts[service] = (counts[service] || 0) + 1;
        }

        let total = 0, min = Infinity, max = -Infinity, numServices = 0;
        for (const service in sums) {
            const avg = sums[service] / counts[service];
            total += avg;
            if (avg < min) min = avg;
            if (avg > max) max = avg;
            numServices++;
        }

        return {
            average: numServices ? total / numServices : 0,
            min: numServices ? min : 0,
            max: numServices ? max : 0
        };
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    ras_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts']

        const failedComponents = this.componentFailureSimulator(solution, t)
        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t //Keep the time step that the node is failed (we need to when we recover the node)
        }
    
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1 //If a node failed two time step ago, it will recover
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        //Mode 1
        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0] 
            }
            failedList = affectedServiceList 
        }

        let complete_solutions
        let recoveryTime
        let failedList_solutions
        let copy_solutions_failedList
        let copy_solution;
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let gBest
        let minIndex
        let new_particles

        const algorithms = ['GA', 'PSO', 'WOA', 'DE']

        for (let com = 0; com < 1; com++)
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime
            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.populationGA; i++) 
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                failedList_solutions.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))

                    let palced = false
                    while(palced == false)
                    {
                        
                        if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                        {
                            if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else
                            {
                                failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]

                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }
                recoveryTime.push(Math.max(...recTime))
                complete_solutions.push(copy_solution)
            }

            for (let x = 0; x < algorithms.length; x++)
            {
                const rnd = Math.floor(getRandomValue(0, algorithms.length))
                if (algorithms[rnd] == 'GA')
                {
                    let initial_chromosomes = complete_solutions
                    let initial_solutions_failedList = failedList_solutions

                    for(let iteration = 0; iteration < this.iterationsGA; iteration++)
                    {
                        let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                        const selectedChromosomes = [];
                        const selectedFailedList = [];
                        const selectedRecoveryTimes = [];
                        let tournamentSize = this.tSize
                        for (let n = 0; n < initial_chromosomes.length; n++) 
                        {
                            let rndIndividual = Math.floor(getRandomValue(0, initial_chromosomes.length));
                            let minCost = fitness[rndIndividual];
                            for (let i = 1; i < tournamentSize; i++) 
                            { 
                                let K = Math.floor(getRandomValue(0, initial_chromosomes.length));
                                if (fitness[K] < minCost) 
                                {
                                    rndIndividual = K;
                                    minCost = fitness[K];
                                }
                            }
                            selectedChromosomes.push(JSON.parse(JSON.stringify(initial_chromosomes[rndIndividual])));
                            selectedFailedList.push(JSON.parse(JSON.stringify(initial_solutions_failedList[rndIndividual])));
                            selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                        }
        
                        let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                        let cProbability = this.crossP
                        for (let i = 0; i < crossover.length; i += 2) 
                        {
                            if (Math.random() < cProbability) 
                            {
                                let parentIndex1 = i//Math.floor(getRandomValue(0, population.length));
                                let parentIndex2 = i+1//Math.floor(getRandomValue(0, population.length));
                                let crossoverPoint = Math.floor(getRandomValue(0, crossover[0].length - 1));
                                const offspring1 = [...crossover[parentIndex1].slice(0, crossoverPoint), ...crossover[parentIndex2].slice(crossoverPoint)];
                                const offspring2 = [...crossover[parentIndex2].slice(0, crossoverPoint), ...crossover[parentIndex1].slice(crossoverPoint)];
                                crossover[parentIndex1] = offspring1;
                                crossover[parentIndex2] = offspring2;
                            }
                        }
        
                        let mutation = JSON.parse(JSON.stringify(crossover));
                        let mProbability = this.mutationP
                        for (let m = 0; m < mutation.length; m++) 
                        {
                            for (let i = 0; i < mutation[0].length; i++) 
                            {
                                if (Math.random() < mProbability) 
                                {
                                    mutation[m][i][2] = Math.floor(getRandomValue(1, numVersions));
                                    mutation[m][i][3] = Math.floor(getRandomValue(1, this.computingNodes.length));
                                }
                            }
                        }
        
                        initial_solutions_failedList = []
                        initial_chromosomes = []
                        recoveryTime = []
                        copy_computingNodesFreeCapacity = []
                        const bandwidth = this.currentBW(solution)
    
                        for (let i = 0; i < selectedChromosomes.length; i++)
                        {
                            recTime = []
                            copy_solution = JSON.parse(JSON.stringify(selectedChromosomes[i]))
                            const copy = JSON.parse(JSON.stringify(mutation[i])); 
                            initial_solutions_failedList.push(copy);
                            copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                            for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                            {
                                let palced = false
                                while(palced == false)
                                {
                                    if (copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory)
                                    {
                                        if (initial_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                        {
                                            initial_solutions_failedList[i][j][3] = 1
                                        }
                                        else
                                        {
                                            initial_solutions_failedList[i][j][3] = initial_solutions_failedList[i][j][3] + 1
                                        }
                                    }
                                    else
                                    {
                                        palced = true
                                        copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory
                                        copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] = initial_solutions_failedList[i][j][3]
                                        copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] = initial_solutions_failedList[i][j][2]
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                    
                                        const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0) 
                                        {
                                            recTime.push(imgSize/bwNode + imgInstalling)
                                        }
                                        else if (ReconfCalculationMode == 1)
                                        {
                                            recTime.push(imgInstalling)
                                        }
                    
                                    }
                                }
                            }
                            recoveryTime.push(Math.max(...recTime))
                            initial_chromosomes.push(copy_solution)
                        }
                    }
                    complete_solutions = initial_chromosomes
                    failedList_solutions = initial_solutions_failedList
                }
                else if (algorithms[rnd] == 'PSO')
                {
                    let velocities = failedList_solutions.map(row =>
                        row.map(p => [p[0], p[1], 1, 1])
                    );

                    let pBest = JSON.parse(JSON.stringify(failedList_solutions))
                    let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
                    minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                        currVal < arr[minIdx] ? idx : minIdx, 0);
                    gBest = failedList_solutions[minIndex]
                    let gBestFitness = pBestFitness[minIndex]

                    for (let i = 0; i < this.iterationsPSO; i++)
                    {
                        const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                        for (let i = 0; i < velocities.length; i++)
                        {
                            for (let j = 0; j < velocities[0].length; j++)
                            {
                                velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                                velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
                                if (failedList_solutions[i][j][2] + velocities[i][j][2] < numVersions && failedList_solutions[i][j][2] + velocities[i][j][2] > 0)
                                {
                                    failedList_solutions[i][j][2] = Math.ceil(failedList_solutions[i][j][2] + velocities[i][j][2])
                                }
                                else if (failedList_solutions[i][j][2] + velocities[i][j][2] < 1)
                                {
                                    failedList_solutions[i][j][2] = 1
                                }
                                else if (failedList_solutions[i][j][2] + velocities[i][j][2] > numVersions)
                                {
                                    failedList_solutions[i][j][2] = numVersions
                                }
                
                                if (failedList_solutions[i][j][3] + velocities[i][j][3] < this.computingNodes.length && failedList_solutions[i][j][3] + velocities[i][j][3] > 0)
                                {
                                    failedList_solutions[i][j][3] = Math.ceil(failedList_solutions[i][j][3] + velocities[i][j][3])
                                }
                                else if (failedList_solutions[i][j][3] + velocities[i][j][3] < 1)
                                {
                                    failedList_solutions[i][j][3] = 1
                                }
                                else if (failedList_solutions[i][j][3] + velocities[i][j][3] > this.computingNodes.length)
                                {
                                    failedList_solutions[i][j][3] = this.computingNodes.length
                                }
                            }
                        }

                        copy_solutions_failedList = []
                        new_particles = []
                        recoveryTime = []
                        copy_computingNodesFreeCapacity = []
                        const bandwidth = this.currentBW(solution)

                        for (let i = 0; i < complete_solutions.length; i++)
                        {
                            recTime = []
                            copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                            const copy = JSON.parse(JSON.stringify(failedList_solutions[i])); 
                            copy_solutions_failedList.push(copy);
                            copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                            for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                            {
                                let palced = false
                                while(palced == false)
                                {
                                    if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                                    {
                                        if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                        {
                                            copy_solutions_failedList[i][j][3] = 1
                                        }
                                        else
                                        {
                                            copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                        }
                                    }
                                    else
                                    {
                                        palced = true
                                        copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                        copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                        copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                    
                                        const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime

                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0)
                                        {
                                            recTime.push(imgSize/bwNode + imgInstalling)
                                        }
                                        else if (ReconfCalculationMode == 1)
                                        {
                                            recTime.push(imgInstalling)
                                        }
                    
                                    }
                                }
                            }
                            recoveryTime.push(Math.max(...recTime))
                            new_particles.push(copy_solution)
                        }

                        let fitness = this.quality_fl(new_particles, recoveryTime)
                        minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                            currVal < arr[minIdx] ? idx : minIdx, 0);

                        if (gBestFitness > fitness[minIndex])
                        {
                            gBest = copy_solutions_failedList[minIndex]
                            gBestFitness = fitness[minIndex]
                        }

                        for (let i = 0; i < fitness.length; i++)
                        {
                            if (fitness[i] < pBestFitness[i])
                            {
                                pBest[i] = copy_solutions_failedList[i]
                                pBestFitness[i] = fitness[i]
                            }
                        }
                    }
                    complete_solutions = new_particles
                    failedList_solutions = copy_solutions_failedList   
                }
                else if (algorithms[rnd] == 'DE')
                {
                    for(let iteration = 0; iteration < this.iterationsDE; iteration++)
                    {
                        let fitness = this.quality_fl(complete_solutions, recoveryTime)

                        const selectedChromosomes = [];
                        const selectedFailedList = [];
                        const selectedRecoveryTimes = [];
                        let tournamentSize = 0.1 * this.populationSize
                        for (let n = 0; n < complete_solutions.length; n++) 
                        {
                            let rndIndividual = Math.floor(getRandomValue(0, complete_solutions.length));
                            let minCost = fitness[rndIndividual];
                            for (let i = 1; i < tournamentSize; i++) 
                            { 
                                let K = Math.floor(getRandomValue(0, complete_solutions.length));
                                if (fitness[K] < minCost) 
                                {
                                    rndIndividual = K;
                                    minCost = fitness[K];
                                }
                            }
                            selectedChromosomes.push(JSON.parse(JSON.stringify(complete_solutions[rndIndividual])));
                            selectedFailedList.push(JSON.parse(JSON.stringify(failedList_solutions[rndIndividual])));
                            selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                        }

                        let mutantVector = selectedFailedList.map(innerArray => innerArray.map(subArray => [...subArray]));
                        for (let i = 0; i < selectedFailedList.length; i++) {
                            let indices = Array.from({length: selectedFailedList.length}, (_, idx) => idx);
                            this.shuffleArray(indices);
                            let [r1, r2, r3] = indices.slice(0, 3);
                    
                            for (let j = 0; j < selectedFailedList[i].length; j++) {
                                const mV1 = selectedFailedList[r1][j][2] + this.F * (selectedFailedList[r2][j][2] - selectedFailedList[r3][j][2]);
                                const mV2 = selectedFailedList[r1][j][3] + this.F * (selectedFailedList[r2][j][3] - selectedFailedList[r3][j][3]);
                                if (mV1 < 1)
                                {
                                    mutantVector[i][j][2] = 1
                                }
                                else if (mV1 > numVersions)
                                {
                                    mutantVector[i][j][2] = numVersions
                                }
        
                                if (mV2 < 1)
                                {
                                    mutantVector[i][j][3] = 1
                                }
                                else if (mV2 > this.computingNodes.length)
                                {
                                    mutantVector[i][j][3] = this.computingNodes.length
                                }
                            }
                        }          

                        const trialVector = mutantVector.map((sol, i) => 
                            sol.map((component, j) => {
                                const r = Math.random();
                                if (r < this.crossoverRate) {
                                    return [component[0], component[1], mutantVector[i][j][2], mutantVector[i][j][3]];
                                } else {
                                    return [...component];
                                }
                            })
                        );
        
                        failedList_solutions = []
                        complete_solutions = []
                        recoveryTime = []
                        copy_computingNodesFreeCapacity = []

                        const bandwidth = this.currentBW(solution)
        
                        for (let i = 0; i < selectedChromosomes.length; i++)
                        {
                            recTime = []
                            copy_solution = JSON.parse(JSON.stringify(selectedChromosomes[i]))
                            const copy = JSON.parse(JSON.stringify(trialVector[i])); 
                            failedList_solutions.push(copy);
                            copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                            for (let j = 0; j < failedList_solutions[i].length; j++)
                            {
                                let palced = false
                                while(palced == false)
                                {
                                    if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                                    {
                                        if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                                        {
                                            failedList_solutions[i][j][3] = 1
                                        }
                                        else
                                        {
                                            failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                                        }
                                    }
                                    else
                                    {
                                        palced = true
                                        copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                                        copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                                        copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                                        const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0)
                                        {
                                            recTime.push(imgSize/bwNode + imgInstalling)
                                        }
                                        else if (ReconfCalculationMode == 1)
                                        {
                                            recTime.push(imgInstalling)
                                        }
                    
                                    }
                                }
                            }
                    
                            recoveryTime.push(Math.max(...recTime))
                            complete_solutions.push(copy_solution)
                        }
                    }
                    complete_solutions = complete_solutions
                    failedList_solutions = failedList_solutions
                }
                else if (algorithms[rnd] == 'WOA')
                {
                    let new_whales
                    let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
                    minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                        currVal < arr[minIdx] ? idx : minIdx, 0);
        
                    gBest = failedList_solutions[minIndex]
                    let gBestFitness = pBestFitness[minIndex]
        
                    let _a = this.a
                    let b = this.b
                    let L = this.l
                    let coefficient_C = this.coefficient_C
                    let coefficient_A = this.coefficient_A
                    for (let i = 0; i < this.iterationsWOA; i++)
                    {
                        const newPosition = [];
                        const C1 = [], A1 = [];
                        for (let ca = 0; ca < failedList_solutions[0].length; ca++) 
                        {
                            C1.push(coefficient_C * Math.random());
                            A1.push((coefficient_A * _a) * Math.random() - _a)
                        }
                        
                        for (let x = 0; x < failedList_solutions.length; x++)
                        {
                            const rnd = Math.random();
                            if (rnd < 0.5)
                            {
                                let D = JSON.parse(JSON.stringify(gBest));
                                if (Math.abs(A1[x]) < 1)
                                {
                                    for (let i = 0; i < failedList_solutions[x].length; i++)
                                    {
                                        D[i][2] = Math.abs(C1[i] * gBest[i][2] - failedList_solutions[x][i][2])
                                        D[i][3] = Math.abs(C1[i] * gBest[i][3] - failedList_solutions[x][i][3])
                                        failedList_solutions[x][i][2] = gBest[i][2] - (A1[i])*D[i][2];
                                        failedList_solutions[x][i][3] = failedList_solutions[x][i][3] - (A1[i])*D[i][3];
                                    }
                                }
                                else if (Math.abs(A1[x]) >= 1)
                                {
                                    const k = Math.floor(Math.random() * (failedList_solutions.length - 1));
                                    for (let i = 0; i < failedList_solutions[x].length; i++)
                                    {
                                        D[i][2] = Math.abs(C1[i] * failedList_solutions[k][i][2] - failedList_solutions[x][i][2])
                                        D[i][3] = Math.abs(C1[i] * failedList_solutions[k][i][3] - failedList_solutions[x][i][3])
                                        failedList_solutions[x][i][2] = failedList_solutions[k][i][2] - (A1[i])*D[i][2];
                                        failedList_solutions[x][i][3] = failedList_solutions[k][i][3] - (A1[i])*D[i][3];
                                    }
                                }
                            }
                            else if (rnd >= 0.5)
                            {
                                let D = JSON.parse(JSON.stringify(gBest));
                                const l = getRandomValue(-L, L);
                                for (let i = 0; i < failedList_solutions[x].length; i++)
                                {
                                    D[i][2] = Math.abs(gBest[i][2] - failedList_solutions[x][i][2])
                                    D[i][3] = Math.abs(gBest[i][3] - failedList_solutions[x][i][3])
                                    failedList_solutions[x][i][2] = D[i][2] * (Math.exp()^(b*l)) * Math.cos(2*Math.PI*l) + gBest[i][2];
                                    failedList_solutions[x][i][3] = D[i][3] * (Math.exp()^(b*l)) * Math.cos(2*Math.PI*l) + gBest[i][3];
                                }
                            }
        
                            for (let x1 = 0; x1 < failedList_solutions.length;x1++)
                            {
                                for (let x2 = 0; x2 < failedList_solutions[0].length;x2++)
                                {
                                    if (failedList_solutions[x1][x2][2] < 1)
                                    {
                                        failedList_solutions[x1][x2][2] = 1
                                    }
                                    else if (failedList_solutions[x1][x2][2] > numVersions)
                                    {
                                        failedList_solutions[x1][x2][2] = numVersions
                                    }
                                    else
                                    {
                                        failedList_solutions[x1][x2][2] = Math.ceil(failedList_solutions[x1][x2][2])
                                    }
                
                                    if (failedList_solutions[x1][x2][3] < 1)
                                    {
                                        failedList_solutions[x1][x2][3] = 1
                                    }
                                    else if (failedList_solutions[x1][x2][3] > this.computingNodes.length)
                                    {
                                        failedList_solutions[x1][x2][3] = this.computingNodes.length
                                    }
                                    else
                                    {
                                        failedList_solutions[x1][x2][3] = Math.floor(getRandomValue(2, this.computingNodes.length))
                                    }
                                }
                            }      
                            newPosition.push(failedList_solutions[x]);
                        }
    
                        copy_solutions_failedList = []
                        new_whales = []
                        recoveryTime = []
                        copy_computingNodesFreeCapacity = []
                        const bandwidth = this.currentBW(solution)
        
                        for (let i = 0; i < complete_solutions.length; i++)
                        {
                            recTime = []
                            copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                            const copy = JSON.parse(JSON.stringify(newPosition[i])); 
                            copy_solutions_failedList.push(copy);
                            copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                            for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                            {
                                let palced = false
                                while(palced == false)
                                {
                                    if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                                    {
                                        if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                        {
                                            copy_solutions_failedList[i][j][3] = 1
                                        }
                                        else
                                        {
                                            copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                        }
                                    }
                                    else
                                    {
                                        palced = true
                                        copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                        copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                        copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }

                                        const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1                   
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0)
                                        {
                                            recTime.push(imgSize/bwNode + imgInstalling)
                                        }
                                        else if (ReconfCalculationMode == 1)
                                        {
                                            recTime.push(imgInstalling)
                                        }
                    
                                    }
                                }
                            }
                            recoveryTime.push(Math.max(...recTime))
                            new_whales.push(copy_solution)
                        }
        
                        let fitness = this.quality_fl(new_whales, recoveryTime)
                        minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                            currVal < arr[minIdx] ? idx : minIdx, 0);
        
                        if (gBestFitness > fitness[minIndex])
                        {
                            gBest = copy_solutions_failedList[minIndex]
                            gBestFitness = fitness[minIndex]
                        }
                    }
                    complete_solutions = new_whales
                    failedList_solutions = copy_solutions_failedList
                }
            }

            let fitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            recTimeComponents += recoveryTime[minIndex]
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }

        return {
            solution: complete_solutions[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: complete_solutions[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }

    }

    gapso_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] 
        let failedList = failes['listLosts'] 

        const failedComponents = this.componentFailureSimulator(solution, t)      

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }
        
        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t 
        }
    
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1 //If a node failed two time step ago, it will recover
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        //Mode 1
        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0] 
            }
            failedList = affectedServiceList 
        }

        let initial_chromosomes
        let recoveryTime
        let initial_solutions_failedList
        let copy_solution
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let minIndex

        for (let com = 0; com < 1; com++)
        {
            initial_chromosomes = []
            recoveryTime = []
            initial_solutions_failedList = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.populationGA; i++)
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                initial_solutions_failedList.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                {
                    initial_solutions_failedList[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    initial_solutions_failedList[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))

                    let palced = false
                    while(palced == false)
                    {
                        if (copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory)
                        {
                            if (initial_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                            {
                                initial_solutions_failedList[i][j][3] = 1
                            }
                            else
                            {
                                initial_solutions_failedList[i][j][3] = initial_solutions_failedList[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory
                            copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] = initial_solutions_failedList[i][j][3]
                            copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] = initial_solutions_failedList[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }
                        }
                    }
                }

                recoveryTime.push(Math.max(...recTime))
                initial_chromosomes.push(copy_solution)
            }

            for(let iteration = 0; iteration < this.iterations; iteration++)
            {
                let fitness = this.quality_fl(initial_chromosomes, recoveryTime)

                const selectedChromosomes = [];
                const selectedFailedList = [];
                const selectedRecoveryTimes = [];
                let tournamentSize = this.tSize
                for (let n = 0; n < initial_chromosomes.length; n++) 
                {
                    let rndIndividual = Math.floor(getRandomValue(0, initial_chromosomes.length));
                    let minCost = fitness[rndIndividual];
                    for (let i = 1; i < tournamentSize; i++) 
                    { 
                        let K = Math.floor(getRandomValue(0, initial_chromosomes.length));
                        if (fitness[K] < minCost) 
                        {
                            rndIndividual = K;
                            minCost = fitness[K];
                        }
                    }
                    selectedChromosomes.push(JSON.parse(JSON.stringify(initial_chromosomes[rndIndividual])));
                    selectedFailedList.push(JSON.parse(JSON.stringify(initial_solutions_failedList[rndIndividual])));
                    selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                }

                let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                let cProbability = this.crossP
                
                for (let i = 0; i < crossover.length; i += 2) 
                {
                    if (Math.random() < cProbability) 
                    {
                        let parentIndex1 = i//Math.floor(getRandomValue(0, population.length));
                        let parentIndex2 = i+1//Math.floor(getRandomValue(0, population.length));
                        let crossoverPoint = Math.floor(getRandomValue(0, crossover[0].length - 1));
                        const offspring1 = [...crossover[parentIndex1].slice(0, crossoverPoint), ...crossover[parentIndex2].slice(crossoverPoint)];
                        const offspring2 = [...crossover[parentIndex2].slice(0, crossoverPoint), ...crossover[parentIndex1].slice(crossoverPoint)];
                        crossover[parentIndex1] = offspring1;
                        crossover[parentIndex2] = offspring2;
                    }
                }

                let mutation = JSON.parse(JSON.stringify(crossover));
                let mProbability = this.mutationP
                for (let m = 0; m < mutation.length; m++) 
                {
                    for (let i = 0; i < mutation[0].length; i++) 
                    {
                        if (Math.random() < mProbability) 
                        {
                            mutation[m][i][2] = Math.floor(getRandomValue(1, numVersions));
                            mutation[m][i][3] = Math.floor(getRandomValue(1, this.computingNodes.length));
                        }
                    }
                }

                initial_solutions_failedList = []
                initial_chromosomes = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []
                const bandwidth = this.currentBW(solution)

                for (let i = 0; i < selectedChromosomes.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(selectedChromosomes[i]))
                    const copy = JSON.parse(JSON.stringify(mutation[i])); 
                    initial_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (initial_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    initial_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    initial_solutions_failedList[i][j][3] = initial_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] = initial_solutions_failedList[i][j][3]
                                copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] = initial_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }

                                const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0)
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
            
                    recoveryTime.push(Math.max(...recTime))
                    initial_chromosomes.push(copy_solution)
                }
            }

            
                let failedList_solutions = initial_solutions_failedList
                let complete_solutions = initial_chromosomes
                let velocities = failedList_solutions.map(row =>
                    row.map(p => [p[0], p[1], 1, 1])
                );
    
                let pBest = JSON.parse(JSON.stringify(failedList_solutions))
                let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
                minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                    currVal < arr[minIdx] ? idx : minIdx, 0);
    
                let gBest = failedList_solutions[minIndex]
                let gBestFitness = pBestFitness[minIndex]
    
                for (let i = 0; i < this.iterationsPSO; i++)
                {
                    const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                    for (let i = 0; i < velocities.length; i++)
                    {
                        for (let j = 0; j < velocities[0].length; j++)
                        {
                            velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                            velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
            
                            if (failedList_solutions[i][j][2] + velocities[i][j][2] < numVersions && failedList_solutions[i][j][2] + velocities[i][j][2] > 0)
                            {
                                failedList_solutions[i][j][2] = Math.ceil(failedList_solutions[i][j][2] + velocities[i][j][2])
                            }
                            else if (failedList_solutions[i][j][2] + velocities[i][j][2] < 1)
                            {
                                failedList_solutions[i][j][2] = 1
                            }
                            else if (failedList_solutions[i][j][2] + velocities[i][j][2] > numVersions)
                            {
                                failedList_solutions[i][j][2] = numVersions
                            }
            
                            if (failedList_solutions[i][j][3] + velocities[i][j][3] < this.computingNodes.length && failedList_solutions[i][j][3] + velocities[i][j][3] > 0)
                            {
                                failedList_solutions[i][j][3] = Math.ceil(failedList_solutions[i][j][3] + velocities[i][j][3])
                            }
                            else if (failedList_solutions[i][j][3] + velocities[i][j][3] < 1)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else if (failedList_solutions[i][j][3] + velocities[i][j][3] > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = this.computingNodes.length
                            }
                        }
                    }

                    let copy_solutions_failedList = []
                    let new_particles = []
                    recoveryTime = []
                    copy_computingNodesFreeCapacity = []

                    const bandwidth = this.currentBW(solution)
    
                    for (let i = 0; i < complete_solutions.length; i++)
                    {
                        recTime = []
                        copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                        const copy = JSON.parse(JSON.stringify(failedList_solutions[i])); 
                        copy_solutions_failedList.push(copy);
                        copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                        for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                        {
                            let palced = false
                            while(palced == false)
                            {
                                if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                                {
                                    if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                    {
                                        copy_solutions_failedList[i][j][3] = 1
                                    }
                                    else
                                    {
                                        copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                    }
                                }
                                else
                                {
                                    palced = true
                                    copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                    copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                    copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                    let ReconfCalculationMode = 0
                                    for (let x = 0; x < copy_solution.length; x++)
                                    {
                                        if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                        {
                                            ReconfCalculationMode = 1;
                                            break
                                        }
                                    }

                                    const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                    const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                    const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                    const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                                    const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                    const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                    const bwNode = bandwidth[nodeID]
                
                                    if (ReconfCalculationMode == 0)
                                    {
                                        recTime.push(imgSize/bwNode + imgInstalling)
                                    }
                                    else if (ReconfCalculationMode == 1)
                                    {
                                        recTime.push(imgInstalling)
                                    }
                
                                }
                            }
                        }
                
                        recoveryTime.push(Math.max(...recTime))
                        new_particles.push(copy_solution)
                    }
    
                    let fitness = this.quality_fl(new_particles, recoveryTime)
                    minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                        currVal < arr[minIdx] ? idx : minIdx, 0);
    
                    if (gBestFitness > fitness[minIndex])
                    {
                        gBest = copy_solutions_failedList[minIndex]
                        gBestFitness = fitness[minIndex]
                    }
    
                    for (let i = 0; i < fitness.length; i++)
                    {
                        if (fitness[i] < pBestFitness[i])
                        {
                            pBest[i] = copy_solutions_failedList[i]
                            pBestFitness[i] = fitness[i]
                        }
                    }
                }
            
                recTimeComponents += recoveryTime[minIndex]
                solution = complete_solutions[minIndex]
                console.log(`Component Failure Time Step... ${com}`)
        }

        return {
            solution: initial_chromosomes[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: initial_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    psoga_fl(initialState, failes, m, t, failedDuration)
    {        
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] 
        let failedList = failes['listLosts'] 

        const failedComponents = this.componentFailureSimulator(solution, t)     

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t
        }
    
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        //Mode 1
        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0]
            }
            failedList = affectedServiceList
        }

        let complete_solutions
        let recoveryTime
        let failedList_solutions
        let copy_solutions_failedList
        let copy_solution;
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let gBest
        let minIndex
        let new_particles


        for (let com = 0; com < 1; com++) 
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)
            

            for (let i = 0; i < this.populationPSO; i++)
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 

                

                failedList_solutions.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))
                    let palced = false
                    while(palced == false)
                    {
                        
                        if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                        {
                            if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else
                            {
                                failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }
                recoveryTime.push(Math.max(...recTime))
                complete_solutions.push(copy_solution)
            }

            let velocities = failedList_solutions.map(row =>
                row.map(p => [p[0], p[1], 1, 1])
            );

            let pBest = JSON.parse(JSON.stringify(failedList_solutions))
            let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            gBest = failedList_solutions[minIndex]
            let gBestFitness = pBestFitness[minIndex]

            for (let i = 0; i < this.iterationsPSO; i++)
            {
                const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                for (let i = 0; i < velocities.length; i++)
                {
                    for (let j = 0; j < velocities[0].length; j++)
                    {
                        velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                        velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
                        if (failedList_solutions[i][j][2] + velocities[i][j][2] < numVersions && failedList_solutions[i][j][2] + velocities[i][j][2] > 0)
                        {
                            failedList_solutions[i][j][2] = Math.ceil(failedList_solutions[i][j][2] + velocities[i][j][2])
                        }
                        else if (failedList_solutions[i][j][2] + velocities[i][j][2] < 1)
                        {
                            failedList_solutions[i][j][2] = 1
                        }
                        else if (failedList_solutions[i][j][2] + velocities[i][j][2] > numVersions)
                        {
                            failedList_solutions[i][j][2] = numVersions
                        }
        
                        if (failedList_solutions[i][j][3] + velocities[i][j][3] < this.computingNodes.length && failedList_solutions[i][j][3] + velocities[i][j][3] > 0)
                        {
                            failedList_solutions[i][j][3] = Math.ceil(failedList_solutions[i][j][3] + velocities[i][j][3])
                        }
                        else if (failedList_solutions[i][j][3] + velocities[i][j][3] < 1)
                        {
                            failedList_solutions[i][j][3] = 1
                        }
                        else if (failedList_solutions[i][j][3] + velocities[i][j][3] > this.computingNodes.length)
                        {
                            failedList_solutions[i][j][3] = this.computingNodes.length
                        }
                    }
                }

                copy_solutions_failedList = []
                new_particles = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []
                const bandwidth = this.currentBW(solution)

                for (let i = 0; i < complete_solutions.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                    const copy = JSON.parse(JSON.stringify(failedList_solutions[i])); 
                    copy_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    copy_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0)
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
            
                    recoveryTime.push(Math.max(...recTime))
                    new_particles.push(copy_solution)
                }

                let fitness = this.quality_fl(new_particles, recoveryTime)
                minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                    currVal < arr[minIdx] ? idx : minIdx, 0);


                if (gBestFitness > fitness[minIndex])
                {
                    gBest = copy_solutions_failedList[minIndex]
                    gBestFitness = fitness[minIndex]
                }

                for (let i = 0; i < fitness.length; i++)
                {
                    if (fitness[i] < pBestFitness[i])
                    {
                        pBest[i] = copy_solutions_failedList[i]
                        pBestFitness[i] = fitness[i]
                    }
                }
            }

            let initial_chromosomes = new_particles;
            let initial_solutions_failedList = copy_solutions_failedList
            for(let iteration = 0; iteration < this.iterationsGA; iteration++)
            {
                let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                const selectedChromosomes = [];
                const selectedFailedList = [];
                const selectedRecoveryTimes = [];
                let tournamentSize = this.tSize
                for (let n = 0; n < initial_chromosomes.length; n++) 
                {
                    let rndIndividual = Math.floor(getRandomValue(0, initial_chromosomes.length));
                    let minCost = fitness[rndIndividual];
                    for (let i = 1; i < tournamentSize; i++) 
                    { 
                        let K = Math.floor(getRandomValue(0, initial_chromosomes.length));
                        if (fitness[K] < minCost) 
                        {
                            rndIndividual = K;
                            minCost = fitness[K];
                        }
                    }
                    selectedChromosomes.push(JSON.parse(JSON.stringify(initial_chromosomes[rndIndividual])));
                    selectedFailedList.push(JSON.parse(JSON.stringify(initial_solutions_failedList[rndIndividual])));
                    selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                }

                let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                let cProbability = this.crossP
                
                for (let i = 0; i < crossover.length; i += 2) 
                {
                    if (Math.random() < cProbability) 
                    {
                        let parentIndex1 = i//Math.floor(getRandomValue(0, population.length));
                        let parentIndex2 = i+1//Math.floor(getRandomValue(0, population.length));
                        let crossoverPoint = Math.floor(getRandomValue(0, crossover[0].length - 1));
                        const offspring1 = [...crossover[parentIndex1].slice(0, crossoverPoint), ...crossover[parentIndex2].slice(crossoverPoint)];
                        const offspring2 = [...crossover[parentIndex2].slice(0, crossoverPoint), ...crossover[parentIndex1].slice(crossoverPoint)];
                        crossover[parentIndex1] = offspring1;
                        crossover[parentIndex2] = offspring2;
                    }
                }

                let mutation = JSON.parse(JSON.stringify(crossover));
                let mProbability = this.mutationP
                for (let m = 0; m < mutation.length; m++) 
                {
                    for (let i = 0; i < mutation[0].length; i++) 
                    {
                        if (Math.random() < mProbability) 
                        {
                            mutation[m][i][2] = Math.floor(getRandomValue(1, numVersions));
                            mutation[m][i][3] = Math.floor(getRandomValue(1, this.computingNodes.length));
                        }
                    }
                }

                initial_solutions_failedList = []
                initial_chromosomes = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []

                const bandwidth = this.currentBW(solution)

                for (let i = 0; i < selectedChromosomes.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(selectedChromosomes[i]))
                    const copy = JSON.parse(JSON.stringify(mutation[i])); 
                    initial_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                    {

                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (initial_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    initial_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    initial_solutions_failedList[i][j][3] = initial_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] = initial_solutions_failedList[i][j][3]
                                copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] = initial_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }

                                const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) 
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
            
                    recoveryTime.push(Math.max(...recTime))
                    initial_chromosomes.push(copy_solution)
                }
            }

            let fitness = this.quality_fl(initial_chromosomes, recoveryTime)

            minIndex = fitness.reduce((minIdx, val, idx, arr) =>
                val < arr[minIdx] ? idx : minIdx, 0
            );

            recTimeComponents += recoveryTime[minIndex]
            solution = initial_chromosomes[minIndex]
            console.log(`Failure Time Step...`)
        }
        
        return {
            solution: solution,
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }

    }

    sa_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts']

        const failedComponents = this.componentFailureSimulator(solution, t)      

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t
        }

        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0]
            }
            failedList = affectedServiceList
        }
        let complete_solutions
        let recoveryTime
        let failedList_solutions
        let copy_solutions_failedList
        let copy_solution;
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let gBest
        let minIndex
        let new_whales


        for (let com = 0; com < 1; com++)
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.population; i++) 
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 

                failedList_solutions.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))
                    let palced = false
                    while(palced == false)
                    {
                        
                        if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                        {
                            if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else
                            {
                                failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }

                recoveryTime.push(Math.max(...recTime))
                complete_solutions.push(copy_solution)
            }

            const rate = this.updatingRate
            let temp = this.temperature
            const alpha = this.alpha
            while(temp > this.terminationValue)
            {
                const numVersions = (this.services[0]['components'][0]['versions']).length;
                const numNodes = this.computingNodes.length
                const neighboringSolutions = []
                for (let x1 = 0; x1 < failedList_solutions.length; x1++)
                {
                    let neighboringSolution = JSON.parse(JSON.stringify(failedList_solutions[x1]));
                    for (let i = 0; i < neighboringSolution.length; i++) 
                    {
                        if (Math.random() < rate) {
                            neighboringSolution[i][2] = Math.floor(getRandomValue(1, numVersions));
                        }
                        if (Math.random() < rate) {
                            neighboringSolution[i][3] = Math.floor(getRandomValue(1, numNodes));
                        }
                    }
                    neighboringSolutions.push(neighboringSolution)
                }

                copy_solutions_failedList = []
                let new_solutions = []
                let recoveryTimeN = []
                copy_computingNodesFreeCapacity = []

                const bandwidth = this.currentBW(solution)

                for (let i = 0; i < complete_solutions.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                    const copy = JSON.parse(JSON.stringify(neighboringSolutions[i])); 
                    copy_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    copy_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }

                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0)
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
            
                    recoveryTimeN.push(Math.max(...recTime))
                    new_solutions.push(copy_solution)
                }
                let fitness1 = this.quality_fl(complete_solutions, recoveryTime)
                let fitness2 = this.quality_fl(new_solutions, recoveryTimeN)

                for (let x2 = 0; x2 < complete_solutions.length; x2++)
                {
                    if (fitness1[x2] > fitness2[x2])
                    {
                        complete_solutions[x2] = new_solutions[x2]
                        failedList_solutions[x2] = neighboringSolutions[x2]
                        recoveryTime[x2] = recoveryTimeN[x2]
                    }
                    else
                    {
                        const diff = Math.abs(fitness2[x2] - fitness1[x2]);
                        const P = Math.exp(- diff / temp);
                        if (Math.random() < P) {
                            complete_solutions[x2] = new_solutions[x2]
                            failedList_solutions[x2] = neighboringSolutions[x2]
                            recoveryTime[x2] = recoveryTimeN[x2]
                        }
                    }
                }

                temp = temp * alpha;
                let fitness = this.quality_fl(complete_solutions, recoveryTime)
                const selectedsolutions = [];
                const selectedFailedList = [];
                const selectedRecoveryTimes = [];
                let tournamentSize = this.selectionPressure
                for (let n = 0; n < complete_solutions.length; n++) 
                {
                    let rndIndividual = Math.floor(getRandomValue(0, complete_solutions.length));
                    let minCost = fitness[rndIndividual];
                    for (let i = 1; i < tournamentSize; i++) 
                    { 
                        let K = Math.floor(getRandomValue(0, selectedsolutions.length));
                        if (fitness[K] < minCost) 
                        {
                            rndIndividual = K;
                            minCost = fitness[K];
                        }
                    }
                    selectedsolutions.push(JSON.parse(JSON.stringify(complete_solutions[rndIndividual])));
                    selectedFailedList.push(JSON.parse(JSON.stringify(failedList_solutions[rndIndividual])));
                    selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                }
                failedList_solutions = selectedFailedList
                complete_solutions = selectedsolutions

                
                minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                    currVal < arr[minIdx] ? idx : minIdx, 0);
            }

            let fitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            recTimeComponents += recoveryTime[minIndex]
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }

        return {
            solution: complete_solutions[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }

    }

    woa_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts']

        const failedComponents = this.componentFailureSimulator(solution, t)

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t
        }
    
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }
            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0]
            }
            failedList = affectedServiceList 
        }

        let complete_solutions
        let recoveryTime
        let failedList_solutions
        let copy_solutions_failedList
        let copy_solution;
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let gBest
        let minIndex
        let new_whales

        for (let com = 0; com < 1; com++)
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.population; i++)
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 

                failedList_solutions.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))
                    let palced = false
                    while(palced == false)
                    {
                        
                        if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                        {
                            if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else
                            {
                                failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }
                recoveryTime.push(Math.max(...recTime))
                complete_solutions.push(copy_solution)
            }

            let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);
            gBest = failedList_solutions[minIndex]
            let gBestFitness = pBestFitness[minIndex]
            let _a = this.a
            let b = this.b
            let L = this.l
            let coefficient_C = this.coefficient_C
            let coefficient_A = this.coefficient_A
            for (let i = 0; i < this.iterations; i++)
            {
                const newPosition = [];
                const C1 = [], A1 = [];
                for (let ca = 0; ca < failedList_solutions[0].length; ca++) 
                {
                    C1.push(coefficient_C * Math.random());
                    A1.push((coefficient_A * _a) * Math.random() - _a)
                }
                
                for (let x = 0; x < failedList_solutions.length; x++)
                {
                    const rnd = Math.random();
                    if (rnd < 0.5)
                    {
                        let D = JSON.parse(JSON.stringify(gBest));
                        if (Math.abs(A1[x]) < 1)
                        {
                            for (let i = 0; i < failedList_solutions[x].length; i++)
                            {
                                D[i][2] = Math.abs(C1[i] * gBest[i][2] - failedList_solutions[x][i][2])
                                D[i][3] = Math.abs(C1[i] * gBest[i][3] - failedList_solutions[x][i][3])
                                failedList_solutions[x][i][2] = gBest[i][2] - (A1[i])*D[i][2];
                                failedList_solutions[x][i][3] = failedList_solutions[x][i][3] - (A1[i])*D[i][3];
                            }
                        }
                        else if (Math.abs(A1[x]) >= 1)
                        {
                            const k = Math.floor(Math.random() * (failedList_solutions.length - 1));
                            for (let i = 0; i < failedList_solutions[x].length; i++)
                            {
                                D[i][2] = Math.abs(C1[i] * failedList_solutions[k][i][2] - failedList_solutions[x][i][2])
                                D[i][3] = Math.abs(C1[i] * failedList_solutions[k][i][3] - failedList_solutions[x][i][3])
                                failedList_solutions[x][i][2] = failedList_solutions[k][i][2] - (A1[i])*D[i][2];
                                failedList_solutions[x][i][3] = failedList_solutions[k][i][3] - (A1[i])*D[i][3];
                            }
                        }
                    }
                    else if (rnd >= 0.5)
                    {
                        let D = JSON.parse(JSON.stringify(gBest));
                        const l = getRandomValue(-L, L);
                        for (let i = 0; i < failedList_solutions[x].length; i++)
                        {
                            D[i][2] = Math.abs(gBest[i][2] - failedList_solutions[x][i][2])
                            D[i][3] = Math.abs(gBest[i][3] - failedList_solutions[x][i][3])
                            failedList_solutions[x][i][2] = D[i][2] * (Math.exp()^(b*l)) * Math.cos(2*Math.PI*l) + gBest[i][2];
                            failedList_solutions[x][i][3] = D[i][3] * (Math.exp()^(b*l)) * Math.cos(2*Math.PI*l) + gBest[i][3];
                        }
                    }

                    for (let x1 = 0; x1 < failedList_solutions.length;x1++)
                    {
                        for (let x2 = 0; x2 < failedList_solutions[0].length;x2++)
                        {
                            if (failedList_solutions[x1][x2][2] < 1)
                            {
                                failedList_solutions[x1][x2][2] = 1
                            }
                            else if (failedList_solutions[x1][x2][2] > numVersions)
                            {
                                failedList_solutions[x1][x2][2] = numVersions
                            }
                            else
                            {
                                failedList_solutions[x1][x2][2] = Math.ceil(failedList_solutions[x1][x2][2])
                            }
        
                            if (failedList_solutions[x1][x2][3] < 1)
                            {
                                failedList_solutions[x1][x2][3] = 1
                            }
                            else if (failedList_solutions[x1][x2][3] > this.computingNodes.length)
                            {
                                failedList_solutions[x1][x2][3] = this.computingNodes.length
                            }
                            else
                            {
                                failedList_solutions[x1][x2][3] = Math.floor(getRandomValue(2, this.computingNodes.length))
                            }
                        }
                    }
                    newPosition.push(failedList_solutions[x]);
                }
                copy_solutions_failedList = []
                new_whales = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []
                const bandwidth = this.currentBW(solution)

                for (let i = 0; i < complete_solutions.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                    const copy = JSON.parse(JSON.stringify(newPosition[i])); 
                    copy_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    copy_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0)
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
                    recoveryTime.push(Math.max(...recTime))
                    new_whales.push(copy_solution)
                }

                let fitness = this.quality_fl(new_whales, recoveryTime)
                minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                    currVal < arr[minIdx] ? idx : minIdx, 0);

                if (gBestFitness > fitness[minIndex])
                {
                    gBest = copy_solutions_failedList[minIndex]
                    gBestFitness = fitness[minIndex]
                }
            }

            recTimeComponents += recoveryTime[minIndex]
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }
        
        return {
            solution: new_whales[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    de_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts'] 

        const failedComponents = this.componentFailureSimulator(solution, t)   

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }
        
        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t
        }

        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }
            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0]
            }
            failedList = affectedServiceList
        }

        let complete_solutions
        let recoveryTime
        let failedList_solutions
        let copy_solution
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let minIndex
        let copy_failedList_solutions
        let new_solutions

        for (let com = 0; com < 1; com++)
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.population; i++)
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                failedList_solutions.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))
                    let palced = false
                    while(palced == false)
                    {
                        if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                        {
                            if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else
                            {
                                failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }

                recoveryTime.push(Math.max(...recTime))
                complete_solutions.push(copy_solution)
            }

            for(let iteration = 0; iteration < this.iterations; iteration++)
            {
                let fitnessPrev = this.quality_fl(complete_solutions, recoveryTime)
                const selectedChromosomes = [];
                const selectedFailedList = [];
                const selectedRecoveryTimes = [];
                let tournamentSize = this.populationSize
                for (let n = 0; n < complete_solutions.length; n++) 
                {
                    let rndIndividual = Math.floor(getRandomValue(0, complete_solutions.length));
                    let minCost = fitnessPrev[rndIndividual];
                    for (let i = 1; i < tournamentSize; i++) 
                    { 
                        let K = Math.floor(getRandomValue(0, complete_solutions.length));
                        if (fitnessPrev[K] < minCost) 
                        {
                            rndIndividual = K;
                            minCost = fitnessPrev[K];
                        }
                    }
                    selectedChromosomes.push(JSON.parse(JSON.stringify(complete_solutions[rndIndividual])));
                    selectedFailedList.push(JSON.parse(JSON.stringify(failedList_solutions[rndIndividual])));
                    selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                }

                failedList_solutions = selectedFailedList
                complete_solutions = selectedChromosomes
                recoveryTime = selectedRecoveryTimes
                let mutantVector = failedList_solutions.map(innerArray => innerArray.map(subArray => [...subArray]));
                for (let i = 0; i < failedList_solutions.length; i++) {
                    let indices = Array.from({length: failedList_solutions.length}, (_, idx) => idx);
                    this.shuffleArray(indices);
                    let [r1, r2, r3] = indices.slice(0, 3);
            
                    for (let j = 0; j < failedList_solutions[i].length; j++) {
                        const mV1 = failedList_solutions[r1][j][2] + this.F * (failedList_solutions[r2][j][2] - failedList_solutions[r3][j][2]);
                        const mV2 = failedList_solutions[r1][j][3] + this.F * (failedList_solutions[r2][j][3] - failedList_solutions[r3][j][3]);
                        if (mV1 < 1)
                        {
                            mutantVector[i][j][2] = 1
                        }
                        else if (mV1 > numVersions)
                        {
                            mutantVector[i][j][2] = numVersions
                        }

                        if (mV2 < 1)
                        {
                            mutantVector[i][j][3] = 1
                        }
                        else if (mV2 > this.computingNodes.length)
                        {
                            mutantVector[i][j][3] = this.computingNodes.length
                        }
                    }
                }          

                const trialVector = mutantVector.map((sol, i) => 
                    sol.map((component, j) => {
                        const r = Math.random();
                        if (r < this.crossoverRate) {
                            return [component[0], component[1], mutantVector[i][j][2], mutantVector[i][j][3]];
                        } else {
                            return [...component];
                        }
                    })
                );

                copy_failedList_solutions = []
                new_solutions = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []
                const bandwidth = this.currentBW(solution)
                for (let i = 0; i < complete_solutions.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                    const copy = JSON.parse(JSON.stringify(trialVector[i])); 
                    copy_failedList_solutions.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < copy_failedList_solutions[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][copy_failedList_solutions[i][j][3]-1].characteristics.memory < this.services[copy_failedList_solutions[i][j][0]-1].components[copy_failedList_solutions[i][j][1]-1].versions[copy_failedList_solutions[i][j][2]-1].characteristics.memory)
                            {
                                if (copy_failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    copy_failedList_solutions[i][j][3] = 1
                                }
                                else
                                {
                                    copy_failedList_solutions[i][j][3] = copy_failedList_solutions[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][copy_failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[copy_failedList_solutions[i][j][0]-1].components[copy_failedList_solutions[i][j][1]-1].versions[copy_failedList_solutions[i][j][2]-1].characteristics.memory
                                copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][3] = copy_failedList_solutions[i][j][3]
                                copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][2] = copy_failedList_solutions[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_failedList_solutions[i][j][3] && solution[x][2] == copy_failedList_solutions[i][j][2] && solution[x][1] == copy_failedList_solutions[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
                                const serviceID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0)
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
            
                    recoveryTime.push(Math.max(...recTime))
                    new_solutions.push(copy_solution)
                }
            }
            let fitness = this.quality_fl(new_solutions, recoveryTime)
            minIndex = fitness.reduce((minIdx, val, idx, arr) =>
                val < arr[minIdx] ? idx : minIdx, 0
            );
            recTimeComponents += recoveryTime[minIndex]
            solution = new_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }
        return {
            solution: new_solutions[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: failedList_solutions[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    pso_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts']

        const failedComponents = this.componentFailureSimulator(solution, t)

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t 
        }

        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }
            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0] 
            }
            failedList = affectedServiceList 
        }

        let complete_solutions
        let recoveryTime
        let failedList_solutions
        let copy_solutions_failedList
        let copy_solution;
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let gBest
        let minIndex
        let new_particles

        for (let com = 0; com < 1; com++) 
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            for (let i = 0; i < this.population; i++)
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                failedList_solutions.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                const bandwidth = this.currentBW(solution)
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))
                    let palced = false
                    while(palced == false)
                    {
                        
                        if (copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory < this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory)
                        {
                            if (failedList_solutions[i][j][3] + 1 > this.computingNodes.length)
                            {
                                failedList_solutions[i][j][3] = 1
                            }
                            else
                            {
                                failedList_solutions[i][j][3] = failedList_solutions[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][failedList_solutions[i][j][3]-1].characteristics.memory -= this.services[failedList_solutions[i][j][0]-1].components[failedList_solutions[i][j][1]-1].versions[failedList_solutions[i][j][2]-1].characteristics.memory
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] = failedList_solutions[i][j][3]
                            copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] = failedList_solutions[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }

                recoveryTime.push(Math.max(...recTime))
                complete_solutions.push(copy_solution)
            }
            let velocities = failedList_solutions.map(row =>
                row.map(p => [p[0], p[1], 1, 1])
            );

            let pBest = JSON.parse(JSON.stringify(failedList_solutions))
            let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            gBest = failedList_solutions[minIndex]
            let gBestFitness = pBestFitness[minIndex]
            for (let i = 0; i < this.iterations; i++)
            {
                const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                for (let i = 0; i < velocities.length; i++)
                {
                    for (let j = 0; j < velocities[0].length; j++)
                    {
                        velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                        velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
                        if (failedList_solutions[i][j][2] + velocities[i][j][2] < numVersions && failedList_solutions[i][j][2] + velocities[i][j][2] > 0)
                        {
                            failedList_solutions[i][j][2] = Math.ceil(failedList_solutions[i][j][2] + velocities[i][j][2])
                        }
                        else if (failedList_solutions[i][j][2] + velocities[i][j][2] < 1)
                        {
                            failedList_solutions[i][j][2] = 1
                        }
                        else if (failedList_solutions[i][j][2] + velocities[i][j][2] > numVersions)
                        {
                            failedList_solutions[i][j][2] = numVersions
                        }
        
                        if (failedList_solutions[i][j][3] + velocities[i][j][3] < this.computingNodes.length && failedList_solutions[i][j][3] + velocities[i][j][3] > 0)
                        {
                            failedList_solutions[i][j][3] = Math.ceil(failedList_solutions[i][j][3] + velocities[i][j][3])
                        }
                        else if (failedList_solutions[i][j][3] + velocities[i][j][3] < 1)
                        {
                            failedList_solutions[i][j][3] = 1
                        }
                        else if (failedList_solutions[i][j][3] + velocities[i][j][3] > this.computingNodes.length)
                        {
                            failedList_solutions[i][j][3] = this.computingNodes.length
                        }
                    }
                }

                copy_solutions_failedList = []
                new_particles = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []
                const bandwidth = this.currentBW(solution)
                for (let i = 0; i < complete_solutions.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(complete_solutions[i]))
                    const copy = JSON.parse(JSON.stringify(failedList_solutions[i])); 
                    copy_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < copy_solutions_failedList[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (copy_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    copy_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    copy_solutions_failedList[i][j][3] = copy_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][copy_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[copy_solutions_failedList[i][j][0]-1].components[copy_solutions_failedList[i][j][1]-1].versions[copy_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] = copy_solutions_failedList[i][j][3]
                                copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] = copy_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }

                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) 
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
                    recoveryTime.push(Math.max(...recTime))
                    new_particles.push(copy_solution)
                }

                let fitness = this.quality_fl(new_particles, recoveryTime)
                minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                    currVal < arr[minIdx] ? idx : minIdx, 0);

                if (gBestFitness > fitness[minIndex])
                {
                    gBest = copy_solutions_failedList[minIndex]
                    gBestFitness = fitness[minIndex]
                }

                for (let i = 0; i < fitness.length; i++)
                {
                    if (fitness[i] < pBestFitness[i])
                    {
                        pBest[i] = copy_solutions_failedList[i]
                        pBestFitness[i] = fitness[i]
                    }
                }
            }

            recTimeComponents += recoveryTime[minIndex]
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }
        
        return {
            solution: new_particles[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    ga_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m;
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));
        const failedNodes = failes['failedNodes']
        let failedList = failes['listLosts']
        const failedComponents = this.componentFailureSimulator(solution, t)     
        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;

            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t 
        }
    
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0] 
            }
            failedList = affectedServiceList 
        }

        let initial_chromosomes
        let recoveryTime
        let initial_solutions_failedList
        let copy_solution
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let minIndex

        for (let com = 0; com < 1; com++)
        {
            initial_chromosomes = []
            recoveryTime = []
            initial_solutions_failedList = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)
            for (let i = 0; i < this.population; i++) 
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                initial_solutions_failedList.push(copy);
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                {
                    initial_solutions_failedList[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    initial_solutions_failedList[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))
                    let palced = false
                    while(palced == false)
                    {
                        if (copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory)
                        {
                            if (initial_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                            {
                                initial_solutions_failedList[i][j][3] = 1
                            }
                            else
                            {
                                initial_solutions_failedList[i][j][3] = initial_solutions_failedList[i][j][3] + 1
                            }
                        }
                        else
                        {
                            palced = true
                            copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory
                            copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] = initial_solutions_failedList[i][j][3]
                            copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] = initial_solutions_failedList[i][j][2]
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }
                            const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0)
                            {
                                recTime.push(imgSize/bwNode + imgInstalling)
                            }
                            else if (ReconfCalculationMode == 1)
                            {
                                recTime.push(imgInstalling)
                            }

                        }
                    }
                }

                recoveryTime.push(Math.max(...recTime))
                initial_chromosomes.push(copy_solution)
            }

            for(let iteration = 0; iteration < this.iterations; iteration++)
            {
                let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                const selectedChromosomes = [];
                const selectedFailedList = [];
                const selectedRecoveryTimes = [];
                let tournamentSize = this.tSize
                for (let n = 0; n < initial_chromosomes.length; n++) 
                {
                    let rndIndividual = Math.floor(getRandomValue(0, initial_chromosomes.length));
                    let minCost = fitness[rndIndividual];
                    for (let i = 1; i < tournamentSize; i++) 
                    { 
                        let K = Math.floor(getRandomValue(0, initial_chromosomes.length));
                        if (fitness[K] < minCost) 
                        {
                            rndIndividual = K;
                            minCost = fitness[K];
                        }
                    }
                    selectedChromosomes.push(JSON.parse(JSON.stringify(initial_chromosomes[rndIndividual])));
                    selectedFailedList.push(JSON.parse(JSON.stringify(initial_solutions_failedList[rndIndividual])));
                    selectedRecoveryTimes.push(recoveryTime[rndIndividual]);
                }

                let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                let cProbability = this.crossP
                
                for (let i = 0; i < crossover.length; i += 2) 
                {
                    if (Math.random() < cProbability) 
                    {
                        let parentIndex1 = i//Math.floor(getRandomValue(0, population.length));
                        let parentIndex2 = i+1//Math.floor(getRandomValue(0, population.length));
                        let crossoverPoint = Math.floor(getRandomValue(0, crossover[0].length - 1));
                        const offspring1 = [...crossover[parentIndex1].slice(0, crossoverPoint), ...crossover[parentIndex2].slice(crossoverPoint)];
                        const offspring2 = [...crossover[parentIndex2].slice(0, crossoverPoint), ...crossover[parentIndex1].slice(crossoverPoint)];
                        crossover[parentIndex1] = offspring1;
                        crossover[parentIndex2] = offspring2;
                    }
                }

                let mutation = JSON.parse(JSON.stringify(crossover));
                let mProbability = this.mutationP
                for (let m = 0; m < mutation.length; m++) 
                {
                    for (let i = 0; i < mutation[0].length; i++) 
                    {
                        if (Math.random() < mProbability) 
                        {
                            mutation[m][i][2] = Math.floor(getRandomValue(1, numVersions));
                            mutation[m][i][3] = Math.floor(getRandomValue(1, this.computingNodes.length));
                        }
                    }
                }

                initial_solutions_failedList = []
                initial_chromosomes = []
                recoveryTime = []
                copy_computingNodesFreeCapacity = []
                const bandwidth = this.currentBW(solution)
                for (let i = 0; i < selectedChromosomes.length; i++)
                {
                    recTime = []
                    copy_solution = JSON.parse(JSON.stringify(selectedChromosomes[i]))
                    const copy = JSON.parse(JSON.stringify(mutation[i])); 
                    initial_solutions_failedList.push(copy);
                    copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity)))
                    for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                    {
                        let palced = false
                        while(palced == false)
                        {
                            if (copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory < this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory)
                            {
                                if (initial_solutions_failedList[i][j][3] + 1 > this.computingNodes.length)
                                {
                                    initial_solutions_failedList[i][j][3] = 1
                                }
                                else
                                {
                                    initial_solutions_failedList[i][j][3] = initial_solutions_failedList[i][j][3] + 1
                                }
                            }
                            else
                            {
                                palced = true
                                copy_computingNodesFreeCapacity[i][initial_solutions_failedList[i][j][3]-1].characteristics.memory -= this.services[initial_solutions_failedList[i][j][0]-1].components[initial_solutions_failedList[i][j][1]-1].versions[initial_solutions_failedList[i][j][2]-1].characteristics.memory
                                copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] = initial_solutions_failedList[i][j][3]
                                copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] = initial_solutions_failedList[i][j][2]
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }

                                const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0)
                                {
                                    recTime.push(imgSize/bwNode + imgInstalling)
                                }
                                else if (ReconfCalculationMode == 1)
                                {
                                    recTime.push(imgInstalling)
                                }
            
                            }
                        }
                    }
                    recoveryTime.push(Math.max(...recTime))
                    initial_chromosomes.push(copy_solution)
                }
            }

            let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
            minIndex = fitness.reduce((minIdx, val, idx, arr) =>
                val < arr[minIdx] ? idx : minIdx, 0
            );
            recTimeComponents += recoveryTime[minIndex]
            solution = initial_chromosomes[minIndex]
            console.log(`Failure Time Step...`)
        }
        return {
            solution: initial_chromosomes[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recoveryTime[minIndex],
            fList: initial_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    heuristics_fl(initialState, failes, m, t, failedDuration)
    {
        let w;
        w = readJSON(`weights_${0}.txt`)
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

        const mode = m; 
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));
        const failedNodes = failes['failedNodes'] 
        let failedList = failes['listLosts']
        const failedComponents = this.componentFailureSimulator(solution, t)

        for (let i = 0; i < failedComponents.length; i++) {
            let found = false;
            for (let j = 0; j < failedList.length; j++) 
            {
                if (failedComponents[i][0] === failedList[j][0] && failedComponents[i][1] === failedList[j][1]) 
                {
                    found = true;
                    break;
                }
            }
            if (!found) 
            {
                failedList.push(failedComponents[i]);
            }
        }

        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t
        }

        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1
                if (duration >= reCovTime) 
                {
                    failedDuration[i] = 0;
                    computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                }
            }
        }

        if (mode == 1)
        {
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }
            for (let i = 0; i < affectedServiceList.length; i++)
            {
                const node_id = affectedServiceList[i][3] - 1
                const service_id = affectedServiceList[i][0] - 1
                const component_id = affectedServiceList[i][1] - 1
                const version_id = affectedServiceList[i][2] - 1
                if (failedNodes.includes(node_id + 1) == false)
                {
                    const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
                    computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
                    //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
                }
                solution[service_id*numComponents+component_id][3] = failedNodes[0]
            }
            failedList = affectedServiceList 
        }
        const recTime = [] 
        let recTimeComponents = 0
        for (let com = 0; com < 1; com++)
        {
            for (let i = 0; i < failedList.length; i++)
            {
                const node_value = []
                const bandwidth = this.currentBW(solution)

                for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) 
                {
                    const versionValue = [];
                    const node = computingNodesFreeCapacity[cN];
                    
                    for (let v = 0; v < numVersions; v++) 
                    {
                        const version = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[v].characteristics;

                        if (node.characteristics.memory > version.memory //&& node.characteristics.cpu > version.cpu
                        ) 
                        {
                            if (this.flAlgo == "FLTCA")
                            {
                                versionValue.push(v/numVersions + cN/computingNodesFreeCapacity.length)
                            }
                            else if (this.flAlgo == "FLRecTime")
                            {
                                versionValue.push(version.imageSize/bandwidth[cN] + version.installingTime)
                            }
                            else if (this.flAlgo == "FLResTime")
                            {
                                let ss = JSON.parse(JSON.stringify(solution));
                                ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
                                ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
                                versionValue.push(this.transmissionDelay(ss) + this.executionTime(ss)) 
                            }
                            else if (this.flAlgo == "FLRelScore")
                            {                                
                                versionValue.push(-version.reliabilityScore * node.characteristics.reliabilityScore)
                            }
                            else if (this.flAlgo == "FLExeTime")
                            {

                                versionValue.push(version.cpu/node.characteristics.cpu);
                            }
                        }
                        else 
                        {
                            versionValue.push(Infinity);
                        }
                    }

                    const { min: versionMin, index: versionIndex } = versionValue.reduce(
                        (acc, val, idx) => (val < acc.min ? { min: val, index: idx } : acc),
                        { min: Infinity, index: -1 }
                    );
        
                    node_value.push([versionIndex, versionMin]);
                }

                const { min: nodeMin, index: nodeIndex } = node_value.reduce(
                    (acc, val, idx) => (val[1] < acc.min ? { min: val[1], index: idx } : acc),
                    { min: Infinity, index: -1 }
                );

                let ReconfCalculationMode = 0
                for (let x = 0; x < solution.length; x++)
                {
                    if (solution[x][3] == computingNodesFreeCapacity[nodeIndex].nodeID && solution[x][2] == node_value[nodeIndex][0]+1 && solution[x][1] == failedList[i][1])
                    {
                        ReconfCalculationMode = 1;
                    }
                }

                solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = computingNodesFreeCapacity[nodeIndex].nodeID
                solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = node_value[nodeIndex][0]+1
                const serviceID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][0] - 1
                const componentID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][1] - 1
                const versionID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] - 1
                const nodeID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] - 1
                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                const bwNode = bandwidth[nodeID]

                if (ReconfCalculationMode == 0) 
                {
                    recTime.push(imgSize/bwNode + imgInstalling)
                }
                else if (ReconfCalculationMode == 1)
                {
                    recTime.push(imgInstalling)
                }
                const chosenVersion = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[node_value[nodeIndex][0]].characteristics;
                computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
            }
            recTimeComponents += Math.max(...recTime)
            console.log(`Component Failure Time Step... ${com}`)
        }

        return {solution: solution,
            nodesFreeCapacity: computingNodesFreeCapacity,
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,
            fList: failedList,
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    run(model_index = 0)
    {
        let w
        w = readJSON(`weights_${model_index}.txt`)
        let initialState = this.test(w);
        let failedDuration = Array(initialState['nodesFreeCapacity'].length).fill(0);
        let failes = this.nodeFailureSimulator(initialState['solution'], 0)
        console.log(this.solutionAnalyser(initialState['solution'])['serviceReliability'])
        const initial_solution = {
            aveResponseTime: this.solutionAnalyser(initialState['solution'])['aveResponseTime'],
            overallReliability:  this.solutionAnalyser(initialState['solution'])['platformReliability']*this.solutionAnalyser(initialState['solution'])['serviceReliability'],
            recoveryTime: 0 
        }

        const slots = this.timeSlots;
        const aveRT = Array(slots).fill(0);
        const aveOvlRel = Array(slots).fill(0);
        const aveRecTime = Array(slots).fill(0);
        let results 
        const aveRange = 1 
        
        if (this.flAlgo == "FLGA")
        {
            let ga
            const filePath = path.join(__dirname, 'FLGA-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}

            for(let a = 0; a < aveRange; a++)
            {
                ga = this.ga_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(ga['solution'], time+1)
                    ga = this.ga_fl(ga, failes, 2, time, ga['failedDuration'])
                    results = this.solutionAnalyser(ga['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${ga['recoveryTime']},${ga['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                results = this.solutionAnalyser(ga['solution'])
            }
            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: ga['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLPSO")
        {
            let pso
            const filePath = path.join(__dirname, 'FLPSO-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                pso = this.pso_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(pso['solution'], time+1)
                    pso = this.ga_fl(pso, failes, 2, time, pso['failedDuration'])
                    results = this.solutionAnalyser(pso['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${pso['recoveryTime']},${pso['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
            }
            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: pso['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLDE")
        {
            let de
            const filePath = path.join(__dirname, 'FLDE-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                de = this.de_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(de['solution'], time+1)
                    de = this.de_fl(de, failes, 2, time, de['failedDuration'])
                    results = this.solutionAnalyser(de['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${de['recoveryTime']},${de['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
            }
            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: de['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLWOA")
        {
            let woa
            const filePath = path.join(__dirname, 'FLWOA-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                woa = this.woa_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(woa['solution'], time+1)
                    woa = this.woa_fl(woa, failes, 2, time, woa['failedDuration'])
                    results = this.solutionAnalyser(woa['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${woa['recoveryTime']},${woa['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
            }
            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: woa['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLSA")
        {
            let sa
            const filePath = path.join(__dirname, 'FLSA-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                sa = this.sa_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(sa['solution'], time+1)
                    sa = this.sa_fl(sa, failes, 2, time, sa['failedDuration'])
                    results = this.solutionAnalyser(sa['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${sa['recoveryTime']},${sa['aveRecPerSer'].average}\n`;                   
                    fs.appendFileSync(filePath, row);
                }
            }
            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: sa['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLPSOGA")
        {
            let psoga
            const filePath = path.join(__dirname, 'FLPSOGA-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                psoga = this.psoga_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(psoga['solution'], time+1)
                    psoga = this.psoga_fl(psoga, failes, 2, time, psoga['failedDuration'])
                    results = this.solutionAnalyser(psoga['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${psoga['recoveryTime']},${psoga['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                this.save_results(psoga, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }
            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: psoga['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLGAPSO")
        {
            let gapso
            const filePath = path.join(__dirname, 'FLGAPSO-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                gapso = this.gapso_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(gapso['solution'], time+1)
                    gapso = this.gapso_fl(gapso, failes, 2, time, gapso['failedDuration'])
                    results = this.solutionAnalyser(gapso['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${gapso['recoveryTime']},${gapso['aveRecPerSer'].average}\n`;
                    fs.appendFileSync(filePath, row);
                }
            }
            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: gapso['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLRAS")
        {
            let ras
            const filePath = path.join(__dirname, 'FLRAS-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            for(let a = 0; a < aveRange; a++)
            {
                ras = this.ras_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(ras['solution'], time+1)
                    ras = this.ras_fl(ras, failes, 2, time, ras['failedDuration'])
                    results = this.solutionAnalyser(ras['solution'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${ras['recoveryTime']},${ras['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
            }
            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: ras['recoveryTime']}
            }
        }
        else
        {
            const slots_heu = this.timeSlots;
            const aveRT_heu = Array(slots_heu).fill(0);
            const aveOvlRel_heu = Array(slots_heu).fill(0);
            const aveRecTime_heu = Array(slots_heu).fill(0);
            let results_heu_fl
            let heu_fl
    
            const aveRange_heu = 1
            for(let a = 0; a < aveRange_heu; a++)
            {
                
                const filePath = path.join(__dirname, `FL${this.flAlgo}-overtime.csv`);
                if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
                heu_fl = this.heuristics_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots_heu; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(heu_fl['solution'], time+1)
                    heu_fl = this.heuristics_fl(heu_fl, failes, 2, time, heu_fl['failedDuration'])
                    results_heu_fl = this.solutionAnalyser(heu_fl['solution'])
                    const row = `${results_heu_fl['aveResponseTime']},${results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability']},${heu_fl['recoveryTime']},${heu_fl['aveRecPerSer'].average}\n`;
                    fs.appendFileSync(filePath, row);

                }
            }
    
            this.perServiceAnalysis(heu_fl['solution'], `${this.flAlgo}`)
                        const maxValues = {};
                        for (let i = 0; i < heu_fl['fList'].length; i++) 
                        {
                            const key = heu_fl['fList'][i][0];
                            const value = heu_fl['recTime'][i];
                
                            if (!(key in maxValues) || value > maxValues[key]) 
                            {
                                maxValues[key] = value;
                            }
                        }
                        const sortedKeys = Object.keys(maxValues).map(Number).sort((a, b) => a - b);
                        let csvContent = 'Service_ID, Recovery_time\n';
                        for (const key of sortedKeys) {
                        csvContent += `${key},${maxValues[key]}\n`;
                        }
                        fs.writeFile(`csv/recTimePerService_${this.flAlgo}.csv`, csvContent, (err) => {
                        if (err) {
                            console.error('Error writing CSV file:', err);
                        } else {
                            //console.log('CSV file saved as max_values.csv');
                        }
                        });
                
                        for(let time = 0; time < aveRT_heu.length; time++)
                        {
                            this.writeToCSV(`csv/${this.flAlgo}.csv`, [aveRT_heu[time]/aveRange_heu, aveOvlRel_heu[time]/aveRange_heu, aveRecTime_heu[time]/aveRange_heu]);
                        }
            return { initial_placement: initial_solution,
                fl_results: {aveResponseTime: results_heu_fl['aveResponseTime'],
                             overallReliability: results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability'],
                             recoveryTime: heu_fl['recoveryTime']} 
            }
        }
    }
}

class taskContinuationAffinity extends solutionOperation {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    run() {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));

        let solution = [];
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numComponents = (this.services[0]['components']).length
        const startTime = performance.now();

        for (let u = 0; u < userFreeCapacity.length; u++) {
            if (userFreeCapacity[u]['nodeID'] == this.services[u]['userID']) {
                for (let c = 0; c < numComponents; c++) {
                    let cuPlaced = false;
                    for (let v = 0; v < numVersions; v++) {
                        if (userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] /*&&
                            userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']*/) {

                            solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], userFreeCapacity[u]['nodeID']]);

                            userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                            //userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];

                            cuPlaced = true;
                            break;
                        }
                    }
                    if (cuPlaced == false) {
                        for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                            for (let v = 0; v < numVersions; v++) {
                                if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] /*&&
                                    computingNodesFreeCapacity[cN]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'] &&
                                    computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize']*/) {
                                    solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                    computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                    //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
                                    //computingNodesFreeCapacity[cN]['characteristics']['networkBW'] -=  this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize'];

                                    cuPlaced = true;
                                    break;

                                }
                            }
                            if (cuPlaced == true) {
                                break;
                            }
                        }
                    }
                    if (cuPlaced == false)
                    {
                        const hID = this.services[u]['helperID'];
                        for (let h = 0; h < this.helpers.length; h++)
                        {
                            if (hID == this.helpers[h]['nodeID'])
                            {
                                for (let v = 0; v < numVersions; v++) {
                                    if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] /*&&
                                        helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']*/) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                        //helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
            
                                        cuPlaced = true;
                                        break;
                                    }
                                }
                            }
                            if (cuPlaced == true)
                            {
                                break;
                            }
                        }
                    }
                }
            }
            solution = this.validation(solution)
            appendJsonToCsv(this.solutionAnalyser(solution),"TCA");           
        }
        solution = this.validation(solution)
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            nodesFreeCapacity: computingNodesFreeCapacity,
            runtime: exeTime,
            perServiceAnalysis: this.perServiceAnalysis(solution, "TCA-per-service")
        };
    }
}

class leastRequiredCPU extends solutionOperation {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    run() {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));
        let solution = [];
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numComponents = (this.services[0]['components']).length
        const startTime = performance.now();
        for (let u = 0; u < userFreeCapacity.length; u++) {
            if (userFreeCapacity[u]['nodeID'] == this.services[u]['userID']) {
                for (let c = 0; c < numComponents; c++) {
                    let cuPlaced = false;
                    let min = this.services[u]['components'][c]['versions'][0]['characteristics']['cpu'];
                    let inx = 0;
                    for (let v = 0; v < numVersions; v++) {
                        if (this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'] < min) {
                            min = this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
                            inx = v;
                        }
                    }
                    if (userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {

                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);

                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        cuPlaced = true;
                    }
                    if (cuPlaced == false) {
                        for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                            if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                                computingNodesFreeCapacity[cN]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'] &&
                                computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                                solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                                //computingNodesFreeCapacity[cN]['characteristics']['networkBW'] -=  this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize'];

                                cuPlaced = true;
                                break;
                            }
                        }
                    }
                    if (cuPlaced == false)
                    {
                        const hID = this.services[u]['helperID'];
                        for (let h = 0; h < this.helpers.length; h++)
                        {
                            if (hID == this.helpers[h]['nodeID'])
                            {
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        //helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
                                        cuPlaced = true;
                                        break;
                                }
                            }
                        }
                    }
                }
            }
            solution = this.validation(solution)
            appendJsonToCsv(this.solutionAnalyser(solution),"LRC"); 
        }
        solution = this.validation(solution)
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime,
            nodesFreeCapacity: computingNodesFreeCapacity,
            solution: solution,
            perServiceAnalysis: this.perServiceAnalysis(solution, "LRC-per-service")
        };
    }
}

class mostDataSize extends solutionOperation {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    run() {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));
        let solution = [];
        const startTime = performance.now();
        for (let u = 0; u < this.users.length; u++) {
            for (let c = 0; c < (this.services[0]['components']).length; c++) {
                let max = this.services[u]['components'][c]['versions'][0]['characteristics']['dataSize'];
                let inx = 0;
                for (let v = 0; v < (this.services[0]['components'][0]['versions']).length; v++) {
                    if (this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize'] > max) {
                        max = this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize'];
                        inx = v;
                    }
                }

                for (let n = 0; n < computingNodesFreeCapacity.length; n++) {
                    if (
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'] &&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        //computingNodesFreeCapacity[n]['characteristics']['networkBW'] -=  this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize'];
                        break;
                    }
                    else
                    {
                        const hID = this.services[u]['helperID'];
                        let cuPlaced = false;
                        for (let h = 0; h < this.helpers.length; h++)
                        {
                            
                            if (hID == this.helpers[h]['nodeID'])
                            {
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
                                        cuPlaced = true;
                                        break;
                                }
                            }
                        }
                        if (cuPlaced == true)
                        {
                            break;
                        }
                    }
                }
            }
            solution = this.validation(solution)
            appendJsonToCsv(this.solutionAnalyser(solution),"MDS"); 
        }

        solution = this.validation(solution)
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime,
            perServiceAnalysis: this.perServiceAnalysis(solution, "MDS-per-service"),
            solution: solution
        };
    }
}

class mostReliablity extends solutionOperation {
    constructor(ans) {
        super(ans)
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    run() {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));
        let solution = [];
        const startTime = performance.now();
        for (let i = 0; i < this.computingNodes.length - 1; i++) {
            for (let j = 0; j < this.computingNodes.length - 1; j++) {
                if (computingNodesFreeCapacity[j]['characteristics']['reliabilityScore'] < computingNodesFreeCapacity[j + 1]['characteristics']['reliabilityScore']) {
                    let tmp = computingNodesFreeCapacity[j];
                    computingNodesFreeCapacity[j] = computingNodesFreeCapacity[j + 1];
                    computingNodesFreeCapacity[j + 1] = tmp;
                }
            }
        }

        for (let u = 0; u < this.users.length; u++) {
            for (let c = 0; c < (this.services[0]['components']).length; c++) {
                let max = this.services[u]['components'][c]['versions'][0]['characteristics']['reliabilityScore'];
                let inx = 0;
                for (let v = 0; v < (this.services[0]['components'][0]['versions']).length; v++) {
                    if (this.services[u]['components'][c]['versions'][v]['characteristics']['reliabilityScore'] > max) {
                        max = this.services[u]['components'][c]['versions'][v]['characteristics']['reliabilityScore'];
                        inx = v;
                    }
                }

                for (let n = 0; n < computingNodesFreeCapacity.length; n++) {
                    if (userFreeCapacity[u]['characteristics']['reliability'] > computingNodesFreeCapacity[n]['characteristics']['reliabilityScore'] &&
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory']/* &&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'] &&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        //computingNodesFreeCapacity[n]['characteristics']['networkBW'] -=  this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize'];
                        break;
                    }
                    else
                    {
                        const hID = this.services[u]['helperID'];
                        let cuPlaced = false;
                        for (let h = 0; h < this.helpers.length; h++)
                        {
                            
                            if (hID == this.helpers[h]['nodeID'])
                            {
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
        
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        //helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
                                        cuPlaced = true;
                                        break;
                                }
                            }
                        }
                        if (cuPlaced == true)
                        {
                            break;
                        }
                    }
                }
            }
            solution = this.validation(solution)
            appendJsonToCsv(this.solutionAnalyser(solution),"MR"); 
        }
        solution = this.validation(solution)
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            runtime: exeTime,
            perServiceAnalysis: this.perServiceAnalysis(solution, "MR-per-service")
        };
    }
}

class randomly extends solutionOperation {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    healingRND(solution) {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));

        const numHelpers = (this.helpers).length;
        const numComputingNodes = this.computingNodes.length;
        const userID = this.users[0]["nodeID"];
        const helperID = this.helpers[0]["nodeID"];

        for (let s = 0; s < solution.length; s++) {
            let placed = false;
            const cn = solution[s][3]

            if (cn >= userID)
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                //const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] &&
                    placedComponentDisk < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] /*&&
                    placedComponentCPU < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['cpu']*/
                ) 
                {
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                    //userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['cpu'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk /*&&
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU*/) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
                            placed = true;
                            break;
                        }
                    }
                }       
            }
            if (cn >= helperID && cn < userID)
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                //const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['memory'] &&
                    placedComponentDisk < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['disk'] /*&&
                    placedComponentCPU < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['cpu']*/) 
                {
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['memory'] -= placedComponentMem;
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['disk'] -= placedComponentDisk;
                    //helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['cpu'] -= placedComponentCPU;
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = computingNodesFreeCapacity.length - 1; cN > 0; cN--) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk /*&&
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU*/
                        ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
                            placed = true;
                            break;
                        }
                    }
                }  
            }
            if (solution[s][3] < helperID)
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                //const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] &&
                    placedComponentDisk < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] /*&&
                    placedComponentCPU < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['cpu']*/) 
                {
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] -= placedComponentMem;
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] -= placedComponentDisk;
                    //computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['cpu'] -= placedComponentCPU;
                    placed = true;
                   
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk /*&&
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU*/
                        ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
                            placed = true;
                            break;
                        }
                    }
                }
            }

            if (placed == false)
            {
                console.log("Some of service components can not run due to lack of enough resource...");
            }
        }
        return {solution: solution, 
            nodesFreeCapacity: computingNodesFreeCapacity}
    }

    run()
    {
        let rndSolution = this.randomSolution()
        let validatedSolution = this.validation(rndSolution)
        let healedSolution = this.healingRND(validatedSolution)
        return healedSolution;
    }
}

class mostPowerful extends solutionOperation { 
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    run() {

        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));
        let solution = [];
        const startTime = performance.now();

        for (let i = 0; i < this.computingNodes.length - 1; i++) {
            for (let j = 0; j < this.computingNodes.length - 1; j++) {
                if (computingNodesFreeCapacity[j]['characteristics']['cpu'] < computingNodesFreeCapacity[j + 1]['characteristics']['cpu']) {
                    let tmp = computingNodesFreeCapacity[j];
                    computingNodesFreeCapacity[j] = computingNodesFreeCapacity[j + 1];
                    computingNodesFreeCapacity[j + 1] = tmp;
                }
            }
        }

        for (let u = 0; u < this.users.length; u++) {
            for (let c = 0; c < (this.services[0]['components']).length; c++) {
                let min = this.services[u]['components'][c]['versions'][0]['characteristics']['cpu'];
                let inx = 0;
                for (let v = 0; v < (this.services[0]['components'][0]['versions']).length; v++) {
                    if (this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'] < min) {
                        min = this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
                        inx = v;
                    }
                }

                for (let n = 0; n < computingNodesFreeCapacity.length; n++) {
                    if (userFreeCapacity[u]['characteristics']['cpu'] > computingNodesFreeCapacity[n]['characteristics']['cpu'] &&
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'] &&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        //computingNodesFreeCapacity[n]['characteristics']['networkBW'] -=  this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize'];
                        break;
                    }
                    else
                    {
                        const hID = this.services[u]['helperID'];
                        let cuPlaced = false;
                        for (let h = 0; h < this.helpers.length; h++)
                        {
                            
                            if (hID == this.helpers[h]['nodeID'])
                            {
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        //helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
                                        cuPlaced = true;
                                        break;
                                }
                            }
                        }
                        if (cuPlaced == true)
                        {
                            break;
                        }
                    }
                    
                }
            }
            solution = this.validation(solution)
            appendJsonToCsv(this.solutionAnalyser(solution),"MP");
        }
        solution = this.validation(solution)
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            nodesFreeCapacity: computingNodesFreeCapacity,
            runtime: exeTime,
            perServiceAnalysis: this.perServiceAnalysis(solution, "MP-per-service")
        };
    }

}

class leastPowerful extends solutionOperation {
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }

    run() {
        let userFreeCapacity = JSON.parse(JSON.stringify(this.users));
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))
        let helperFreeCapacity = JSON.parse(JSON.stringify(this.helpers));
        let solution = [];
        const startTime = performance.now();
        for (let i = 0; i < this.computingNodes.length - 1; i++) {
            for (let j = 0; j < this.computingNodes.length - 1; j++) {
                if (computingNodesFreeCapacity[j]['characteristics']['cpu'] > computingNodesFreeCapacity[j + 1]['characteristics']['cpu']) {
                    let tmp = computingNodesFreeCapacity[j];
                    computingNodesFreeCapacity[j] = computingNodesFreeCapacity[j + 1];
                    computingNodesFreeCapacity[j + 1] = tmp;
                }
            }
        }

        for (let u = 0; u < this.users.length; u++) {
            for (let c = 0; c < (this.services[0]['components']).length; c++) {
                let min = this.services[u]['components'][c]['versions'][0]['characteristics']['cpu'];
                let inx = 0;
                for (let v = 0; v < (this.services[0]['components'][0]['versions']).length; v++) {
                    if (this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'] > min) {
                        min = this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
                        inx = v;
                    }
                }

                for (let n = 0; n < computingNodesFreeCapacity.length; n++) {
                    if (userFreeCapacity[u]['characteristics']['cpu'] > computingNodesFreeCapacity[n]['characteristics']['cpu'] &&
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'] &&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        //computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        //computingNodesFreeCapacity[n]['characteristics']['networkBW'] -=  this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize'];
                        break;
                    }
                    else
                    {
                        const hID = this.services[u]['helperID'];
                        let cuPlaced = false;
                        for (let h = 0; h < this.helpers.length; h++)
                        {
                            
                            if (hID == this.helpers[h]['nodeID'])
                            {
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] /*&&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']*/) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        //helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
                                        cuPlaced = true;
                                        break;
                                }
                            }
                        }
                        if (cuPlaced == true)
                        {
                            break;
                        }
                    }
                }
            }
            solution = this.validation(solution)
            appendJsonToCsv(this.solutionAnalyser(solution),"LP");
        }
        solution = this.validation(solution)
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            runtime: exeTime,
            perServiceAnalysis: this.perServiceAnalysis(solution, "LP-per-service")
        };
    }
}

class geneticAlgorithm extends solutionOperation {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.ans = config.ans
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        
        this.cProbability = config.ans['configsGA']['crossoverRate'];
        this.mProbability = config.ans['configsGA']['mutationRate'];
        this.numPopulation = config.ans['configsGA']['populationSize'];
        this.tournamentSize = config.ans['configsGA']['selectionSize'];
        this.iteration = config.ans['configsGA']['iteration'];
    }

    tournamentSelection(population, fitness) 
    {
        let selectedPopulation = [];
        for (let n = 0; n < population.length; n++) 
        {
            let rndIndividual = Math.floor(getRandomValue(0, population.length));
            let minCost = fitness[rndIndividual];
            for (let i = 1; i < this.tournamentSize; i++) 
            { 
                let K = Math.floor(getRandomValue(0, population.length));
                if (fitness[K] < minCost) 
                {
                    rndIndividual = K;
                    minCost = fitness[K];
                }
            }
            selectedPopulation.push(population[rndIndividual]);
        }
        return selectedPopulation;
    }
  
    crossover(population) {
        let crossoverPopulation = JSON.parse(JSON.stringify(population));
        
        for (let i = 0; i < population.length; i+=2) {
            if (Math.random() < this.cProbability) {
                let parentIndex1 = Math.floor(getRandomValue(0, population.length));
                let parentIndex2 = Math.floor(getRandomValue(0, population.length));
                let crossoverPoint = Math.floor(getRandomValue(0, population[0].length - 1));
                const offspring1 = [...population[parentIndex1].slice(0, crossoverPoint), ...population[parentIndex2].slice(crossoverPoint)];
                const offspring2 = [...population[parentIndex2].slice(0, crossoverPoint), ...population[parentIndex1].slice(crossoverPoint)];
                crossoverPopulation[parentIndex1] = offspring1;
                crossoverPopulation[parentIndex2] = offspring2;
            }
        }
        return crossoverPopulation;
    }

    mutation(population) {
        let mutationPopulation = JSON.parse(JSON.stringify(population));
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        for (let m = 0; m < mutationPopulation.length; m++) {
            for (let i = 0; i < mutationPopulation[0].length; i++) {
                if (Math.random() < this.mProbability) {
                    mutationPopulation[m][i][2] = Math.floor(getRandomValue(1, numVersions));
                    mutationPopulation[m][i][3] = Math.floor(getRandomValue(1, this.computingNodes.length));
                }
            }
        }
        return mutationPopulation;
    }

    healingSolution(population) {
        let healingPopulation = JSON.parse(JSON.stringify(population));
        for (let i = 0; i < population.length; i++) {
            healingPopulation[i] = this.healing(this.validation(population[i]));
        }
        return healingPopulation;
    }

    elitism(population, newPopulation)
    {
        let sortedTotalPop = newPopulation.concat(population);
        let fit = this.quality(sortedTotalPop); 

        for (let i = 0; i < sortedTotalPop.length; i++)
        {
            for (let j = 0; j < sortedTotalPop.length; j++)
            {
                if (fit[j] > fit[j + 1])
                {
                    const tempF = JSON.parse(JSON.stringify(fit[j]))
                    fit[j] = JSON.parse(JSON.stringify(fit[j + 1]))
                    fit[j + 1] = JSON.parse(JSON.stringify(tempF))
                    const tempP = JSON.parse(JSON.stringify(sortedTotalPop[j]))
                    sortedTotalPop[j] = JSON.parse(JSON.stringify(sortedTotalPop[j + 1]))
                    sortedTotalPop[j + 1] = JSON.parse(JSON.stringify(tempP))
                }
            }
        }

        const nextG = [];
        for (let i = 0; i < population.length; i++)
        {
            nextG.push(sortedTotalPop[i]);
        }
        return nextG;
    }

    run(iniSols = this.initialSolutions(this.numPopulation), itr = this.iteration) 
    {
        let condition = 0;
        const startTime = performance.now();
        let population = iniSols;
        const K = population.length ;
        if (K < this.numPopulation)
        {
            for (let i = K - 1; i < this.numPopulation - 1; i++)
            {
                population.push(this.initialSolutions(1)[0])
            }
        }
        let fitness = this.quality(population);
        let fitnessInfoPrev = this.solutionsQualitySort(population,fitness);
        let fitnessInfoCurrent;
        for (let i = 0; i < itr; i++) {
            console.log("iteration: ", i)
            let fitness = this.quality(population);
            let selectedPopulation = this.tournamentSelection(population, fitness);
            let crossoverPopulation = this.crossover(selectedPopulation);
            let mutationPopulation = this.mutation(crossoverPopulation);
            population = this.healingSolution(mutationPopulation);
            fitnessInfoCurrent = this.solutionsQualitySort(population,fitness);
           if (fitnessInfoCurrent['bestQuality'] < fitnessInfoPrev['bestQuality']) 
           {
                condition = 0;
                fitnessInfoPrev['bestQuality'] = fitnessInfoCurrent['bestQuality'];
                fitnessInfoPrev['bestSolution'] = fitnessInfoCurrent['bestSolution'];
            }
            else
            {
                condition++;
                if (condition > itr*0.1)
                {
                    //console.log(i);
                    break;
                }
            }

            fitnessInfoPrev['medianQuality'] = fitnessInfoCurrent['medianQuality'];
            fitnessInfoPrev['worstQuality'] = fitnessInfoCurrent['worstQuality'];
        }

        const endTime = performance.now();
        const exeTime = endTime - startTime;
        console.log(fitnessInfoPrev['bestSolution'])
        return {
            servicePlacementResults: this.solutionAnalyser(fitnessInfoPrev['bestSolution']),
            runtime: exeTime,
            fitness: fitnessInfoPrev['bestQuality'],
            bestSolution: fitnessInfoPrev['bestSolution'],
            solution: fitnessInfoPrev['bestSolution'],
            population: population,
            perServiceAnalysis: this.perServiceAnalysis(fitnessInfoPrev['bestSolution'], "GA-per-service")
        }
    }
}

class simulatedAnnealing extends solutionOperation {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.ans = config.ans
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.termination = config.ans['configsSA']['termination'];
        this.temperature = config.ans['configsSA']['temperature'];
        this.alpha = config.ans['configsSA']['alpha'];
        this.rate = config.ans['configsSA']['rate'];
    }

    initialSolution() 
    {
        return this.healing(this.validation(this.randomSolution()));
    }

    neighborSolution2(solution) 
    {
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numNodes = this.computingNodes.length + this.users.length + this.helpers.length;
        let neighboringSolution = JSON.parse(JSON.stringify(solution));
        for (let i = 0; i < neighboringSolution.length; i++) {
            if (Math.random() < this.rate) {
                neighboringSolution[i][2] = Math.floor(getRandomValue(1, numVersions));
            }
            if (Math.random() < this.rate) {
                neighboringSolution[i][3] = Math.floor(getRandomValue(1, numNodes));
            }
        }
        return this.healing(this.validation(neighboringSolution));
    }

    neighborSolution(solution) {
        const numVersions = this.services[0]['components'][0]['versions'].length;
        const numNodes = this.computingNodes.length + this.users.length + this.helpers.length;
        let neighboringSolution = JSON.parse(JSON.stringify(solution)); 
    
        for (let i = 0; i < neighboringSolution.length; i++) {
            const randomValue = Math.random(); 
    
            if (randomValue < this.rate) {
                neighboringSolution[i][2] = Math.floor(getRandomValue(1, numVersions));
                if (randomValue < this.rate / 2) {
                    neighboringSolution[i][3] = Math.floor(getRandomValue(1, numNodes));
                }
            } else if (randomValue < this.rate * 2) {
                neighboringSolution[i][3] = Math.floor(getRandomValue(1, numNodes));
            }
        }
        return this.healing(this.validation(neighboringSolution));
    }
    
    run(iniSol = this.initialSolution()) 
    {
        const startTime = performance.now();
        let solution = iniSol;
        let bestPrevCost = this.quality([solution]);
        let bestPrevSolution = JSON.parse(JSON.stringify(solution));
        while (this.temperature > this.termination) 
        {
            const currentFitness = this.quality([solution])[0];
            if (bestPrevCost > currentFitness) 
            {
                bestPrevCost = currentFitness;
                bestPrevSolution = solution;
            }

            let neighbor = this.neighborSolution(solution);
            const neighborFitness = this.quality([neighbor])[0];
            if (currentFitness > neighborFitness) 
            {
                solution = neighbor;
            }
            else 
            {
                const diff = neighborFitness - currentFitness;
                const P = Math.exp(- diff / this.temperature);
                this.temperature = this.temperature * this.alpha
                if (Math.random() < P) 
                {
                    solution = neighbor;
                }
            }
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(bestPrevSolution),
            runtime: exeTime,
            fitness: bestPrevCost,
            bestSolution: bestPrevSolution,
            solution: bestPrevSolution,
            perServiceAnalysis: this.perServiceAnalysis(bestPrevSolution, "SA-per-service")
        }
    }
}

class fineTuning {
    constructor(algoConfig) {
        const config = algoConfig;
        this.ans = config.ans;
        this.folds = config.folds;
        if (config.ans['type'] == "tuning" && config.ans['algo'] == "GA")
        {
            this.populationSizes = config.ans['gridSearch']['populationSizes'];
            this.mutationRates = config.ans['gridSearch']['mutationRates'];
            this.crossoverRates = config.ans['gridSearch']['crossoverRates'];
            this.tournamentSelectionSize = config.ans['gridSearch']['tournamentSelectionSize'];
            this.iteration = config.ans['gridSearch']['iteration'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "SA")
        {
            this.termination = config.ans['gridSearch']['termination'];
            this.temperature = config.ans['gridSearch']['temperature'];
            this.alpha = config.ans['gridSearch']['alpha'];
            this.rate = config.ans['gridSearch']['rate'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "popSA")
        {
            this.termination = config.ans['gridSearch']['termination'];
            this.temperature = config.ans['gridSearch']['temperature'];
            this.alpha = config.ans['gridSearch']['alpha'];
            this.rate = config.ans['gridSearch']['rate'];
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.selectionSize = config.ans['gridSearch']['selectionSize'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "PSO")
        {
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.w = config.ans['gridSearch']['w'];
            this.c1 = config.ans['gridSearch']['c1'];
            this.c2 = config.ans['gridSearch']['c2'];
            this.iteration = config.ans['gridSearch']['iteration'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "SCA")
        {
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.b = config.ans['gridSearch']['b'];
            this.iteration = config.ans['gridSearch']['iteration'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "DE")
        {
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.crossoverRate = config.ans['gridSearch']['crossoverRate'];
            this.F = config.ans['gridSearch']['F'];
            this.iteration = config.ans['gridSearch']['iteration'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "GWO")
        {
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.a = config.ans['gridSearch']['a'];
            this.coefficient_A = config.ans['gridSearch']['coefficient_A'];
            this.coefficient_C = config.ans['gridSearch']['coefficient_C'];
            this.iteration = config.ans['gridSearch']['iteration'];
        }
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "WOA")
        {
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.a = config.ans['gridSearch']['a'];
            this.b = config.ans['gridSearch']['b'];
            this.l = config.ans['gridSearch']['l'];
            this.coefficient_A = config.ans['gridSearch']['coefficient_A'];
            this.coefficient_C = config.ans['gridSearch']['coefficient_C'];
            this.iteration = config.ans['gridSearch']['iteration'];
        }
    }

    tuningGA() {
        let params = {
            mutationRate: 0,
            crossoverRate: 0,
            populationSize: 0,
            tournamentSelectionSize: 0,
            runtime: 0,
            fitness: 0,
            score: 0,
        };

        let results = [];
        let popSize, mutRate, crossRate, tourSize, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let pSize = 0; pSize < this.populationSizes.length; pSize++) {
            for (let mRate = 0; mRate < this.mutationRates.length; mRate++) {
                for (let cRate = 0; cRate < this.crossoverRates.length; cRate++) {
                    for (let tSize = 0; tSize < this.tournamentSelectionSize.length; tSize++) {
                        let aveFitness = 0;
                        let aveRuntime = 0;
                        for (let f = 0; f < folds.length; f++) {
                            popSize = this.populationSizes[pSize];
                            mutRate = this.mutationRates[mRate];
                            crossRate = this.crossoverRates[cRate];
                            tourSize = this.tournamentSelectionSize[tSize];
                            console.log(`Fine-tuning of GA is running ${r++}...`);
                            
                            const config = {
                                computingNodes: folds[f]['computingNodes'],
                                services: folds[f]['services'],
                                usersNodes: folds[f]['usersNodes'],
                                helperNodes: folds[f]['helperNodes'],
                                componentConnections: folds[f]['componentConnections'],
                                infraConnections: folds[f]['infraConnections'],

                                configsGA: {
                                    crossoverRate: crossRate,
                                    mutationRate: mutRate,
                                    populationSize: popSize,
                                    selectionSize: Math.ceil(tourSize * popSize),
                                    iteration: this.iteration
                                }
                            }
                            
                            const gA = new geneticAlgorithm({ans: config});
                            const gAresult = gA.run();
                            aveRuntime += gAresult['runtime'];
                            aveFitness += gAresult['fitness'];
                        }

                        aveFitness /= folds.length;
                        aveRuntime /= folds.length;
                        params.mutationRate = mutRate;
                        params.crossoverRate = crossRate;
                        params.populationSize = popSize;
                        params.tournamentSelectionSize = Math.ceil(tourSize * popSize);
                        params.fitness = aveFitness;
                        params.runtime = aveRuntime;
                        const prm ={
                            pop: params.populationSize,
                            mutation: params.mutationRate,
                            crossover: params.crossoverRate,
                            tourSize: params.tournamentSelectionSize,
                            fitness: params.fitness,
                            runtime: params.runtime
                        }

                        results.push(prm);
                    }
                }
            }
        }
        if (!fs.existsSync('./tuningGA')) {
            fs.mkdirSync('./tuningGA');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningGA/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });
        csvWriter.writeRecords(results)

        return true;
    }

    tuningSA() {
        let results = [];

        let varTerm, varTemp, varAlph, varRate, folds, r = 0;

        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let i = 0; i < this.termination.length; i++) {
            for (let j = 0; j < this.temperature.length; j++) {
                for (let z = 0; z < this.alpha.length; z++) {
                    for (let x = 0; x < this.rate.length; x++) {
                        let aveFitness = 0;
                        let aveRuntime = 0;
                        for (let f = 0; f < folds.length; f++) {
                            varTerm = this.termination[i];
                            varTemp = this.temperature[j];
                            varAlph = this.alpha[z];
                            varRate = this.rate[x];
                            console.log(`Fine-tuning of SA is running ${r++}...`);
                            const config = {
                                computingNodes: folds[f]['computingNodes'],
                                services: folds[f]['services'],
                                usersNodes: folds[f]['usersNodes'],
                                helperNodes: folds[f]['helperNodes'],
                                componentConnections: folds[f]['componentConnections'],
                                infraConnections: folds[f]['infraConnections'],
                                configsSA: {
                                    termination: varTerm,
                                    temperature: varTemp,
                                    alpha: varAlph,
                                    rate: varRate,
                                }
                            }

                            const b = 5;
                            for (let i = 0; i < b; i++)
                            {
                                const sA = new simulatedAnnealing({ans: config});
                                const sAresult = sA.run();
                                aveRuntime += sAresult['runtime'];
                                aveFitness += sAresult['fitness'];
                            }
                            aveRuntime = aveRuntime/b
                            aveFitness = aveFitness/b
                        }

                        aveFitness /= folds.length;
                        aveRuntime /= folds.length;
                        const prm = {
                            termination: varTerm,
                            temperature: varTemp,
                            alpha: varAlph,
                            rate: varRate,
                            fitness: aveFitness,
                            runtime: aveRuntime
                        }
                        results.push(prm);
                    }
                }
            }
        }
        if (!fs.existsSync('./tuningSA')) {
            fs.mkdirSync('./tuningSA');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningSA/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });

        csvWriter.writeRecords(results)
        return true;
    }

    tuningPopSA() {
        let results = [];
        let varTerm, varTemp, varAlph, varRate, varPop, varSel, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let i = 0; i < this.termination.length; i++) {
            for (let j = 0; j < this.temperature.length; j++) {
                for (let z = 0; z < this.alpha.length; z++) {
                    for (let x = 0; x < this.rate.length; x++) {
                        for (let p = 0; p < this.populationSize.length; p++) {
                            for (let s = 0; s < this.selectionSize.length; s++) {
                                let aveFitness = 0;
                                let aveRuntime = 0;
                                for (let f = 0; f < folds.length; f++) {
                                    varTerm = this.termination[i];
                                    varTemp = this.temperature[j];
                                    varAlph = this.alpha[z];
                                    varRate = this.rate[x];
                                    varPop = this.populationSize[p];
                                    varSel = this.selectionSize[s];
                                    console.log(`Fine-tuning of popSA is running ${r++}...`);
                                    const config = {
                                        computingNodes: folds[f]['computingNodes'],
                                        services: folds[f]['services'],
                                        usersNodes: folds[f]['usersNodes'],
                                        helperNodes: folds[f]['helperNodes'],
                                        componentConnections: folds[f]['componentConnections'],
                                        infraConnections: folds[f]['infraConnections'],
                                        configsPopSA: {
                                            termination: varTerm,
                                            temperature: varTemp,
                                            alpha: varAlph,
                                            rate: varRate,
                                            popSize: varPop,
                                            selectionSize: varSel
                                        }
                                    }
                                    const sA = new popSimulatedAnnealing({ans: config});
                                    const sAresult = sA.run();
                                    aveRuntime += sAresult['runtime'];
                                    aveFitness += sAresult['fitness'];
                                }

                                aveFitness /= folds.length;
                                aveRuntime /= folds.length;
                                const prm = {
                                    termination: varTerm,
                                    temperature: varTemp,
                                    alpha: varAlph,
                                    rate: varRate,
                                    popSize: varPop,
                                    selSize: varSel,
                                    fitness: aveFitness,
                                    runtime: aveRuntime
                                }
                                results.push(prm);
                            }
                        }
                    }
                }
            }
        }
        if (!fs.existsSync('./tuningpopSA')) {
            fs.mkdirSync('./tuningpopSA');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningpopSA/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });

        csvWriter.writeRecords(results)
        return true;
    }

    tuningPSO() {
        let results = [];
        let varPopSize, varW, varC1, varC2, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }
        for (let i = 0; i < this.populationSize.length; i++) {
            for (let j = 0; j < this.w.length; j++) {
                for (let z = 0; z < this.c1.length; z++) {
                    for (let x = 0; x < this.c2.length; x++) {
                        let aveFitness = 0;
                        let aveRuntime = 0;
                        for (let f = 0; f < folds.length; f++) {
                            varPopSize = this.populationSize[i];
                            varW = this.w[j];
                            varC1 = this.c1[z];
                            varC2 = this.c2[x];
                            console.log(`Fine-tuning of PSO is running ${r++}...`);
                            const config = {
                                computingNodes: folds[f]['computingNodes'],
                                services: folds[f]['services'],
                                usersNodes: folds[f]['usersNodes'],
                                helperNodes: folds[f]['helperNodes'],
                                componentConnections: folds[f]['componentConnections'],
                                infraConnections: folds[f]['infraConnections'],
                                configsPSO: {
                                    populationSize: varPopSize,
                                    w: varW,
                                    c1: varC1,
                                    c2: varC2,
                                    iteration: this.iteration
                                }
                            }
                            const pSO = new particleSwarmOptimization({ans: config});
                            const sAresult = pSO.run();
                            aveRuntime += sAresult['runtime'];
                            aveFitness += sAresult['fitness'];
                        }
                        aveFitness /= folds.length;
                        aveRuntime /= folds.length;
                        const prm = {
                            populationSize: varPopSize,
                            w: varW,
                            c1: varC1,
                            c2: varC2,
                            fitness: aveFitness,
                            runtime: aveRuntime
                        }
                        results.push(prm);
                    }
                }
            }
        }
        if (!fs.existsSync('./tuningPSO')) {
            fs.mkdirSync('./tuningPSO');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningPSO/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });
        csvWriter.writeRecords(results)
        return true;
    }

    tuningSCA()
    {
        let results = [];
        let varPopSize, varB, varIteration, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let i = 0; i < this.populationSize.length; i++) {
            for (let j = 0; j < this.b.length; j++) {
                let aveFitness = 0;
                let aveRuntime = 0;
                for (let f = 0; f < folds.length; f++) {
                    varPopSize = this.populationSize[i];
                    varB = this.b[j];
                    varIteration = this.iteration;
                    console.log(`Fine-tuning of SCA is running ${r++}...`);
                    const config = {
                        computingNodes: folds[f]['computingNodes'],
                        services: folds[f]['services'],
                        usersNodes: folds[f]['usersNodes'],
                        helperNodes: folds[f]['helperNodes'],
                        componentConnections: folds[f]['componentConnections'],
                        infraConnections: folds[f]['infraConnections'],
                        configsSCA: {
                            populationSize: varPopSize,
                            b: varB,
                            iteration: varIteration
                        }
                    }
                    const sA = new sineCosineAlgorithm({ans: config});
                    const sAresult = sA.run();
                    aveRuntime += sAresult['runtime'];
                    aveFitness += sAresult['fitness'];
                }
                aveFitness /= folds.length;
                aveRuntime /= folds.length;
                const prm = {
                    populationSize: varPopSize,
                    b: varB,
                    iteration: varIteration,
                    fitness: aveFitness,
                    runtime: aveRuntime
                }
                results.push(prm);
            }
        }
        if (!fs.existsSync('./tuningSCA')) {
            fs.mkdirSync('./tuningSCA');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningSCA/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });
        csvWriter.writeRecords(results)
        return true;
    }

    tuningDE() {
        let results = [];
        let varPopSize, varCross, varF, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let i = 0; i < this.populationSize.length; i++) {
            for (let j = 0; j < this.crossoverRate.length; j++) {
                for (let z = 0; z < this.F.length; z++) {
                    let aveFitness = 0;
                    let aveRuntime = 0;
                    for (let f = 0; f < folds.length; f++) {
                        varPopSize = this.populationSize[i];
                        varCross = this.crossoverRate[j];
                        varF = this.F[z];
                        console.log(`Fine-tuning of DE is running ${r++}...`);
                        const config = {
                            computingNodes: folds[f]['computingNodes'],
                            services: folds[f]['services'],
                            usersNodes: folds[f]['usersNodes'],
                            helperNodes: folds[f]['helperNodes'],
                            componentConnections: folds[f]['componentConnections'],
                            infraConnections: folds[f]['infraConnections'],
                            configsDE: {
                                populationSize: varPopSize,
                                crossoverRate: varCross,
                                F: varF,
                                iteration: this.iteration,
                            }
                        }

                        const b = 1; //Ave of b times
                        for (let i = 0; i < b; i++)
                        {
                            const dE = new differentialEvolution({ans: config});
                            const dEresult = dE.run();
                            aveRuntime += dEresult['runtime'];
                            aveFitness += dEresult['fitness'];
                        }
                        aveRuntime = aveRuntime/b
                        aveFitness = aveFitness/b
                    }
                    aveFitness /= folds.length;
                    aveRuntime /= folds.length;
                    const prm = {
                        populationSize: varPopSize,
                        crossoverRate: varCross,
                        F: varF,
                        fitness: aveFitness,
                        runtime: aveRuntime
                    }
                    results.push(prm);
                }
            }
        }
        if (!fs.existsSync('./tuningDE')) {
            fs.mkdirSync('./tuningDE');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningDE/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });
        csvWriter.writeRecords(results)
        return true;
    }

    tuningGWO()
    {
        let results = [];
        let varPopSize, varA, varCA, varCC, varIteration, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let i = 0; i < this.populationSize.length; i++) {
            for (let j = 0; j < this.a.length; j++) {
                for (let z = 0; z < this.coefficient_A.length; z++) {
                    for (let x = 0; x < this.coefficient_C.length; x++) {
                        let aveFitness = 0;
                        let aveRuntime = 0;
                        for (let f = 0; f < folds.length; f++) {
                            varPopSize = this.populationSize[i];
                            varA = this.a[j];
                            varCA = this.coefficient_A[z];
                            varCC = this.coefficient_C[x];
                            varIteration = this.iteration;
                            console.log(`Fine-tuning of GWO is running ${r++}...`);
                            const config = {
                                computingNodes: folds[f]['computingNodes'],
                                services: folds[f]['services'],
                                usersNodes: folds[f]['usersNodes'],
                                helperNodes: folds[f]['helperNodes'],
                                componentConnections: folds[f]['componentConnections'],
                                infraConnections: folds[f]['infraConnections'],
                                configsGWO: {
                                    populationSize: varPopSize,
                                    a: varA,
                                    coefficient_A: varCA,
                                    coefficient_C: varCC,
                                    iteration: varIteration
                                }
                            }
                            const gWO = new greyWolfOptimizer({ans: config});
                            const gWOresult = gWO.run();
                            aveRuntime += gWOresult['runtime'];
                            aveFitness += gWOresult['fitness'];
                        }
                        aveFitness /= folds.length;
                        aveRuntime /= folds.length;
                        const prm = {
                            populationSize: varPopSize,
                            a: varA,
                            coefficient_A: varCA,
                            coefficient_C: varCC,
                            fitness: aveFitness,
                            runtime: aveRuntime
                        }
                        results.push(prm);
                    }
                }
            }
        }
        if (!fs.existsSync('./tuningGWO')) {
            fs.mkdirSync('./tuningGWO');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningGWO/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });
        csvWriter.writeRecords(results)
        return true;
    }

    tuningWOA()
    {
        let results = [];
        let varPopSize, varA, varB, varL, varCA, varCC, varIteration, folds, r = 0;
        if (this.ans['scale'] == 'ave')
        {
            folds = [this.ans['small'], this.ans['medium'], this.ans['large'], this.ans['xLarge']];
        }
        else
        {
            folds = [this.ans['characteristics']];
        }

        for (let i = 0; i < this.populationSize.length; i++) {
            for (let va = 0; va < this.a.length; va++){
                for (let vb = 0; vb < this.b.length; vb++) {
                    for (let vl = 0; vl < this.l.length; vl++) {
                        for (let x = 0; x < this.coefficient_A.length; x++) {
                            for (let p = 0; p < this.coefficient_C.length; p++) {
                                let aveFitness = 0;
                                let aveRuntime = 0;
                                for (let f = 0; f < folds.length; f++) {
                                    varPopSize = this.populationSize[i];
                                    varA = this.a[va];
                                    varB = this.b[vb];
                                    varL = this.l[vl];
                                    varCA = this.coefficient_A[x];
                                    varCC = this.coefficient_C[p];
                                    varIteration = this.iteration;
                                    console.log(`Fine-tuning of WOA is running ${r++}...`);
                                    const config = {
                                        computingNodes: folds[f]['computingNodes'],
                                        services: folds[f]['services'],
                                        usersNodes: folds[f]['usersNodes'],
                                        helperNodes: folds[f]['helperNodes'],
                                        componentConnections: folds[f]['componentConnections'],
                                        infraConnections: folds[f]['infraConnections'],
                                        configsWOA: {
                                            populationSize: varPopSize,
                                            a: varA,
                                            b: varB,
                                            l: varL,
                                            coefficient_A: varCA,
                                            coefficient_C: varCC,
                                            iteration: varIteration
                                        }
                                    }
                                    const wOA = new whaleOptimizationAlgorithm({ans: config});
                                    const wOAresult = wOA.run();
                                    aveRuntime += wOAresult['runtime'];
                                    aveFitness += wOAresult['fitness'];
                                }

                                aveFitness /= folds.length;
                                aveRuntime /= folds.length;
                                const prm = {
                                    populationSize: varPopSize,
                                    a: varA,
                                    b: varB,
                                    l: varL,
                                    coefficient_A: varCA,
                                    coefficient_C: varCC,
                                    fitness: aveFitness,
                                    runtime: aveRuntime
                                }
                                results.push(prm);
                            }
                        }
                    }
                }
            }
        }
        if (!fs.existsSync('./tuningWOA')) {
            fs.mkdirSync('./tuningWOA');
        }
        const csvWriter = createCsvWriter({
            path: `./tuningWOA/${this.ans['scale']}.csv`,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });
        csvWriter.writeRecords(results)
        return true;
    }

    optConfiguration(res)
    {
        const csvFilePath = `./tuning${this.ans['algo']}/${this.ans['scale']}.csv`;
        const data = [];
        fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
            data.push(row);
        })
        .on('end', () => {
            
            const sortType = "runtime";
            const copyData = JSON.parse(JSON.stringify(data));

            let min = parseFloat(copyData[0]['fitness'])
            let index = 0;
            for (let i = 0; i < copyData.length; i++)
            {
                if (min > parseFloat(copyData[i]['fitness']))
                {
                    min = parseFloat(copyData[i]['fitness']);
                    index = i;
                }
            }

            console.log("-------------------------------");
            console.log("BestInFitness:", copyData[index]);
            console.log("-------------------------------");

            const x = Math.floor(data.length * 0.1);
            let unchangeCounter = 0;
            while (unchangeCounter < x)
            {
                let change = false;
                const rnd = Math.floor(getRandomValue(0, data.length));
                const fit = parseFloat(data[rnd]['fitness']);
                const rt = parseFloat(data[rnd]['runtime']);
                for (let j = 0; j < data.length; j++)
                {
                    if (fit < parseFloat(data[j]['fitness']) && rt < parseFloat(data[j]['runtime']))
                    {
                        data.splice(j, 1);
                        change = true;
                    }
                }
                if (change == false)
                {
                    unchangeCounter++;
                }
            }

            for (let i = 0; i < data.length - 1; i++)
            {
                for (let j = 0; j < data.length - 1; j++)
                {
                    if (parseFloat(data[j][6]) > parseFloat(data[j + 1][6])) // 1: temp, 2: alpha, 3: rate
                    {
                        const temp = JSON.parse(JSON.stringify(parseFloat(data[j + 1])));
                        data[j + 1] = JSON.parse(JSON.stringify(parseFloat(data[j])));
                        data[j] = temp;
                    }
                }
            }

            const indexes = [];
            for (let k = 0; k < data.length; k++)
            {
                for (let i = 0; i < copyData.length; i++)
                {
                    if (parseFloat(data[k]['fitness']) == parseFloat(copyData[i]['fitness']) && parseFloat(data[k]['runtime']) == parseFloat(copyData[i]['runtime']))
                    {
                        indexes.push(i);
                    }
                }
            }

            console.log("Pareto Front points:", indexes);
            console.log("-------------------------------");
            console.log("Index of the optimal point:", indexes[Math.floor(indexes.length / 2)]);
            console.log("-------------------------------");
            console.log("The optimal config:", copyData[indexes[Math.floor(indexes.length / 2)]]);
            console.log("-------------------------------");
            res.json({optimalConfig: copyData[indexes[Math.floor(indexes.length / 2)]]});
        });
    }

    optConfiguration3(res)
    {
        const csvFilePath = `./tuning${this.ans['algo']}/${this.ans['scale']}.csv`;
        const data = [];
        fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
            data.push(row);
        })
        .on('end', () => {
            const selectedConfigs = [];
            const min3 = []; 
            for (let i = 0; i < data.length; i++)
            {
                let min = data[i]['fitness'];
                let min2 = data[i];
                let minIndex = i;
                while(data[i]['pop'] == data[i + 1]['pop'])
                {
                    if (min > data[i]['fitness'])
                    {
                        min = data[i]['fitness'];
                        min2 = data[i]
                        minIndex = i;
                    }
                    i++;
                    if (i >= data.length - 1)
                    {
                        break;
                    }
                }
                min3.push(min2);
                selectedConfigs.push(minIndex);
            }
            console.log("-------------------------------");
            console.log("Selected points:", selectedConfigs);
            console.log("-------------------------------");

            let i = 0;
            while (i < min3.length)
            {
                for (let j = i; j < min3.length; j++)
                {
                    if (min3[i]['fitness'] < min3[j]['fitness'])
                    {
                        min3.splice(j, 1);
                        selectedConfigs.splice(j, 1);
                        j--;
                    }
                }
                i++;
            }
            
            const sortType = "runtime";
            let temp;
            for (let i = 0; i < min3.length - 1; i++) {
                for (let j = 0; j < min3.length - 1 - i; j++) {
                    if (min3[j][5] > min3[j + 1][5]) {
                        temp = JSON.parse(JSON.stringify(min3[j + 1]));
                        min3[j + 1] = JSON.parse(JSON.stringify(min3[j]));
                        min3[j] = JSON.parse(JSON.stringify(temp));
                    }
                }
            }
            console.log("-------------------------------");
            console.log("Selected point:", selectedConfigs[Math.floor(selectedConfigs.length / 2)]);
            console.log("-------------------------------");
            console.log("The optimal config:", min3[Math.floor(min3.length / 2)]);
            console.log("-------------------------------");
            res.json({optimalConfig: min3[Math.floor(min3.length / 2)]});

        });
    }

    optConfiguration4(res)
    {
        const csvFilePath = `./tuning${this.ans['algo']}/${this.ans['scale']}.csv`;
        const data = [];
        fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
            data.push(row);
        })
        .on('end', () => {
            const selectedConfigs = [];
            const min3 = []; 
            for (let i = 0; i < data.length; i++)
            {
                let min = data[i]['fitness'];
                let min2 = data[i];
                let minIndex = i;
                while(data[i]['pop'] == data[i + 1]['pop'])
                {
                    if (min > data[i]['fitness'])
                    {
                        min = data[i]['fitness'];
                        min2 = data[i]
                        minIndex = i;
                    }
                    i++;
                    if (i >= data.length - 1)
                    {
                        break;
                    }
                }
                min3.push(min2);
                selectedConfigs.push(minIndex);
            }
            console.log("-------------------------------");
            console.log("Selected points:", selectedConfigs);
            console.log("-------------------------------");

            let arr = [];
            for (let i = 0; i < min3.length - 1; i++)
            {
                if (min3[i]['fitness'] > min3[i + 1]['fitness'])
                {
                    arr.push(min3[i]);
                }
                else
                {
                    break;
                }
            }
            console.log(arr);
            res.json({optimalConfig: min3[Math.floor(min3.length / 2)]});
        });
    }
}

class popSimulatedAnnealing extends solutionOperation {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.ans = config.ans
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.termination = config.ans['configsPopSA']['termination'];
        this.temperature = config.ans['configsPopSA']['temperature'];
        this.alpha = config.ans['configsPopSA']['alpha'];
        this.rate = config.ans['configsPopSA']['rate'];
        this.numPopulation = config.ans['configsPopSA']['popSize'];
        this.selectionSize = config.ans['configsPopSA']['selectionSize'];
    }

    generateNeighborSolution(solution) {
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numNodes = this.computingNodes.length + this.users.length + this.helpers.length;
        let neighboringSolution = JSON.parse(JSON.stringify(solution));
        for (let i = 0; i < neighboringSolution.length; i++) {
            if (Math.random() < this.rate) {
                neighboringSolution[i][2] = Math.floor(getRandomValue(1, numVersions));
            }
            if (Math.random() < this.rate) {
                neighboringSolution[i][3] = Math.floor(getRandomValue(1, numNodes));
            }
        }
        return this.healing(this.validation(neighboringSolution));
    }

    operateSA(solutions, temp) 
    {
        const nSolutions = [];
        const qualities = this.quality(solutions);
        for (let i = 0; i < solutions.length; i++)
        {
            nSolutions.push(this.generateNeighborSolution(solutions[i]));
        }

        const nQualities = this.quality(nSolutions);
        for (let i = 0; i < nSolutions.length; i++) 
        {
            if (qualities[i] > nQualities[i]) 
            {
                solutions[i] = nSolutions[i];
            }
            else
            {
                const diff = Math.abs(qualities[i] - nQualities[i]);
                const P = Math.exp(- diff / temp);
                if (Math.random() < P) {
                    solutions[i] = nSolutions[i];
                }
            }
        }
        return solutions;
    }

    tournamentSelection(solutions, qualities) {
        let selectedSolutions = [];
        for (let n = 0; n < solutions.length; n++) 
        {
            let rndSolution = Math.floor(getRandomValue(0, solutions.length));
            let minQuality = qualities[rndSolution];
            for (let i = 1; i < this.selectionSize; i++) { 
                let K = Math.floor(getRandomValue(0, solutions.length));
                if (qualities[K] < minQuality) {
                    rndSolution = K;
                    minQuality = qualities[K];
                }
            }
            selectedSolutions.push(solutions[rndSolution]);
        }
        return selectedSolutions;
    }

    run(iniSols = this.initialSolutions(this.numPopulation)) 
    {
        const startTime = performance.now();
        let solutions = iniSols;
        let quality = this.quality(solutions);
        let qualityInfo = this.solutionsQualitySort(solutions, quality)
        let bestQualityCheck = qualityInfo['bestQuality'];
        let terminationCounter = 0;
        
        while (this.temperature > this.termination && terminationCounter < 20)
        {
            solutions = this.operateSA(solutions, this.temperature)
            quality = this.quality(solutions);
            solutions = this.tournamentSelection(solutions, quality)
            qualityInfo = this.solutionsQualitySort(solutions, quality)
            if (qualityInfo['bestQuality'] >= bestQualityCheck)
            {
                terminationCounter++;
            }
            else
            {
                bestQualityCheck = qualityInfo['bestQuality'];
                terminationCounter = 0;
            }

            convergenceBest.push(qualityInfo['bestQuality']);
            convergenceMedian.push(qualityInfo['medianQuality']);
            convergenceWorst.push(qualityInfo['worstQuality']);
            this.temperature = this.temperature * this.alpha;
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(qualityInfo['bestSolution']),
            runtime: exeTime,
            fitness: qualityInfo['bestQuality'],
            bestSolution: qualityInfo['bestSolution'],
            population: solutions,
            perServiceAnalysis: this.perServiceAnalysis(qualityInfo['bestSolution'], "popSA-per-service")}
    }
}

class particleSwarmOptimization extends solutionOperation {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.ans = config.ans,
        this.numParticles = config.ans['configsPSO']['populationSize'],
        this.w = config.ans['configsPSO']['w'],
        this.c1 = config.ans['configsPSO']['c1'],
        this.c2 = config.ans['configsPSO']['c2'],
        this.iteration = config.ans['configsPSO']['iteration']
    }

    initialVelocity() {
        const numServices = this.services.length;
        const numComponents = this.services[0]['components'].length;
        const serviceComponentPairs = [];
        for (let i = 1; i <= numServices; i++) {
            for (let j = 1; j <= numComponents; j++) {
                serviceComponentPairs.push([i, j, 0, 0]);
            }
        }
        const velocities = Array(this.numParticles).fill(null).map(() => {
            return [...serviceComponentPairs.map(component => [...component])];
        });
        return velocities;
    }
    
    updateVelocityPosition(particles, velocities, pBest, gBest) {
        let updatedVelocity = velocities.map((particle, i) => 
            particle.map((velocity, j) => {
                let newVelocity = [...velocity];
                for (let z = 2; z < 4; z++) {
                    const r1 = Math.random();
                    const r2 = Math.random();
                    newVelocity[z] = this.w * velocity[z] + this.c1 * r1 * (pBest[i][j][z] - particles[i][j][z]) + this.c2 * r2 * (gBest[j][z] - particles[i][j][z]);
                }
                return newVelocity;
            })
        );
    
        let updatedPosition = particles.map((particle, i) => 
            particle.map((pos, j) => {
                let newPos = [...pos]; 
                for (let z = 2; z < 4; z++) {
                    newPos[z] = pos[z] + updatedVelocity[i][j][z];
                }
                return newPos;
            })
        );
        return { velocities: updatedVelocity, positions: updatedPosition };
    }

    updatepBestgBest(pBest, gBest, particles) {
        const particles2 = this.mapIntoInteger(particles);
        const qualities = this.quality(particles2);
        const pBestQuality = this.quality(pBest);
        let gBestQuality = this.quality([gBest])[0];
        let updatedpBest = pBest.map((p, i) => {
            if (pBestQuality[i] > qualities[i]) {
                pBestQuality[i] = qualities[i];
                return particles2[i];
            }
            return p;
        });
    
        let minQuality = pBestQuality[0];
        let index = 0;
        for (let i = 1; i < pBestQuality.length; i++) {
            if (minQuality > pBestQuality[i]) {
                minQuality = pBestQuality[i];
                index = i;
            }
        }
        const newgBest = minQuality < gBestQuality ? updatedpBest[index] : gBest;
        return { pBest: updatedpBest, gBest: newgBest };
    }
    
    run(iniSols = this.initialSolutions(this.numParticles), itr = this.iteration)
    {
        const startTime = performance.now();
        let particles = iniSols;
        if (iniSols.length > this.numParticles)
        {
            const solForPSO = []
            for (let i = 0; i < this.numParticles; i++)
            {
                solForPSO.push(iniSols[0])
            }
            particles = solForPSO
        }
        let qualities = this.quality(particles);
        let pBest = particles;
        let gBest = particles[qualities.indexOf(Math.min(...qualities))];
        let velocities = this.initialVelocity();
        let bestQ = 0;
        let counter = 0;

        for (let i = 0; i < itr; i++)
        {
            console.log("iteration:", i)
            const updatedVP = this.updateVelocityPosition(particles, velocities, pBest, gBest)
            const updatedBests = this.updatepBestgBest(pBest, gBest, particles);
            pBest = updatedBests['pBest']; 
            gBest = updatedBests['gBest'];
            velocities = updatedVP['velocities'];
            particles = updatedVP['positions'];
            const r = this.solutionsQualitySort(particles,this.quality(this.mapIntoInteger(particles)))
            if (bestQ > r['bestQuality'])
            {
                bestQ = r['bestQuality']
                counter = 0;
            }
            else
            {
                counter++;
                if (counter > itr*0.1)
                {
                    //break;
                }
            }
        }

        const endTime = performance.now();
        const exeTime = endTime - startTime;
        const bestSolution = this.mapIntoInteger([gBest])[0]
        const bestFitness = this.quality([bestSolution])[0]
        return {
            servicePlacementResults: this.solutionAnalyser(bestSolution),
            runtime: exeTime,
            fitness: bestFitness,
            bestParticle: bestSolution,
            particles: this.mapIntoInteger(particles),
            solution: bestSolution,
            pBest: this.mapIntoInteger(pBest),
            perServiceAnalysis: this.perServiceAnalysis(bestSolution, "PSO-per-service")
        }
    }
}

class sineCosineAlgorithm extends solutionOperation {
    constructor(sysAlgoConfig)
    {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.ans = config.ans
        this.numSolutions = config.ans['configsSCA']['populationSize'],
        this.iteration = config.ans['configsSCA']['iteration'],
        this.b = config.ans['configsSCA']['b']
    }

    bestSolution(solutions, qualities)
    {
        let cSolutions = JSON.parse(JSON.stringify(solutions))
        let best = qualities[0];
        let bestIndex = 0;
        for (let i = 1; i < qualities.length; i++)
        {
            if (best > qualities[i])
            {
                best = qualities[i];
                bestIndex = i;
            }
        }
        return {solution: cSolutions[bestIndex], quality: best};
    }

    regenerate(solutions, qualities, gbestAgent) {
        let indexedQualities = qualities.map((quality, index) => ({ index, quality }));
        indexedQualities.sort((a, b) => a.quality - b.quality);
        let sortedSolutions = indexedQualities.map(item => solutions[item.index]);
        solutions = sortedSolutions;
        const landa = this.landa;
        const beta = this.mRate;
        const rm = Math.round(landa * solutions.length);
        const numVersions = this.services[0]['components'][0]['versions'].length;
        const numComponents = this.computingNodes.length;

        for (let i = solutions.length - rm; i < solutions.length; i++) {
            solutions[i] = JSON.parse(JSON.stringify(gbestAgent)); 
    
            for (let j = 0; j < solutions[i].length; j++) {
                if (Math.random() < beta) {
                    solutions[i][j][2] = Math.floor(Math.random() * numVersions) + 1;
                    solutions[i][j][3] = Math.floor(Math.random() * numComponents) + 1;
                }
            }
        }
        return solutions;
    }

    run(iniSols = this.initialSolutions(this.numSolutions), itr = this.iteration)
    {
        const startTime = performance.now();
        let solutions = iniSols;
        let qualities = this.quality(solutions);
        let gbestAgent = this.bestSolution(solutions, qualities);

        for (let it = 1; it <= itr; it++)
        {
            for (let i = 0; i < this.numSolutions; i++)
            {
                let r1 = (this.b - (it * (this.b/this.iteration)));
                const p = 0.5;
                for (let x = 0; x < solutions[i].length; x++)
                {
                    let r2 = 2 * Math.random() * Math.PI;
                    let r3 = 2 * Math.random();
                    let r4 = Math.random();
                    if (r4 < p)
                    {
                        solutions[i][x][2] = solutions[i][x][2] + r1 * Math.sin(r2) * Math.abs(r3 * gbestAgent['solution'][x][2] - solutions[i][x][2])
                        solutions[i][x][3] = solutions[i][x][3] + r1 * Math.sin(r2) * Math.abs(r3 * gbestAgent['solution'][x][3] - solutions[i][x][3])
                    }
                    else if (r4 >= p)
                    {
                        solutions[i][x][2] = solutions[i][x][2] + r1 * Math.cos(r2) * Math.abs(r3 * gbestAgent['solution'][x][2] - solutions[i][x][2])
                        solutions[i][x][3] = solutions[i][x][3] + r1 * Math.cos(r2) * Math.abs(r3 * gbestAgent['solution'][x][3] - solutions[i][x][3])
                    }
                }
            }
            solutions = this.mapIntoInteger(solutions)
            let qualities = this.quality(solutions);
            let bestAgent = this.bestSolution(solutions, qualities);
            
            if (bestAgent['quality'] < gbestAgent['quality'])
            {
                gbestAgent['quality'] = bestAgent['quality'];
                gbestAgent['solution'] = bestAgent['solution'];
            }
            
            console.log(gbestAgent['quality']);
            const r = this.solutionsQualitySort(solutions,this.quality(this.mapIntoInteger(solutions)));
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(gbestAgent['solution']),
            runtime: exeTime,
            fitness: gbestAgent['quality'],
            bestSolution: gbestAgent['solution'],
            solutions: solutions,
            solution: gbestAgent['solution'],
            perServiceAnalysis: this.perServiceAnalysis(gbestAgent['solution'], "SCA-per-service")
        }
    }
}

class greyWolfOptimizer extends solutionOperation {
    constructor(sysAlgoConfig)
    {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.ans = config.ans
        this.numWolfs = config.ans['configsGWO']['populationSize'],
        this.a = config.ans['configsGWO']['a'],
        this.coefficient_A = config.ans['configsGWO']['coefficient_A'],
        this.coefficient_C = config.ans['configsGWO']['coefficient_C'],
        this.iteration = config.ans['configsGWO']['iteration']
    }

    selectAlphaBetaDelta(wolfs)
    {
        let cWolfs = JSON.parse(JSON.stringify(wolfs));
        const qualities = this.quality(cWolfs);
        for (let i = 0; i < qualities.length - 1; i++)
        {
            for (let j = 0; j < qualities.length - 1; j++)
            {
                if (qualities[j] > qualities[j+1])
                {
                    const tempF = JSON.parse(JSON.stringify(qualities[j]));
                    const tempP = JSON.parse(JSON.stringify(cWolfs[j]));
                    qualities[j] = JSON.parse(JSON.stringify(qualities[j + 1]));
                    cWolfs[j] = JSON.parse(JSON.stringify(cWolfs[j + 1]));
                    qualities[j + 1] = JSON.parse(JSON.stringify(tempF));
                    cWolfs[j + 1] = JSON.parse(JSON.stringify(tempP));
                }
            }
        }
        return {alpha: cWolfs[0], 
                beta: cWolfs[1],
                delta: cWolfs[2],
                omega: cWolfs}
    }

    updatePosition(alpha, beta, delta, omega, _a)
    {
        const newPosition = [];
        const C1 = [], C2 = [], C3 = [], A1 = [], A2 = [], A3 = [];
        for (let i = 0; i < omega[0].length; i++) 
        {
            C1.push(this.coefficient_C * Math.random());
            C2.push(this.coefficient_C * Math.random());
            C3.push(this.coefficient_C * Math.random());
            A1.push((this.coefficient_A * _a) * Math.random() - _a)
            A2.push((this.coefficient_A * _a) * Math.random() - _a)
            A3.push((this.coefficient_A * _a) * Math.random() - _a)
        }

        for (let x = 0; x < omega.length; x++)
        {
            if (x > 2)
            {
                let alphaD = JSON.parse(JSON.stringify(alpha));
                let betaD = JSON.parse(JSON.stringify(beta));
                let deltaD = JSON.parse(JSON.stringify(delta));
                for (let i = 0; i < omega[x].length; i++)
                {
                    alphaD[i][2] = Math.abs(C1[i] * alpha[i][2] - omega[x][i][2])
                    alphaD[i][3] = Math.abs(C1[i] * alpha[i][3] - omega[x][i][3])
                    betaD[i][2] = Math.abs(C2[i] * beta[i][2] - omega[x][i][2])
                    betaD[i][3] = Math.abs(C2[i] * beta[i][3] - omega[x][i][3])
                    deltaD[i][2] = Math.abs(C3[i] * delta[i][2] - omega[x][i][2])
                    deltaD[i][3] = Math.abs(C3[i] * delta[i][3] - omega[x][i][3])
                }

                let X1 = JSON.parse(JSON.stringify(alphaD)); 
                let X2 = JSON.parse(JSON.stringify(betaD)); 
                let X3 = JSON.parse(JSON.stringify(deltaD));
                let X = JSON.parse(JSON.stringify(omega[x]));
                for (let i = 0; i < omega[x].length; i++)
                {
                    X1[i][2] = alpha[i][2] - A1[i] * alphaD[i][2]
                    X1[i][3] = alpha[i][3] - A1[i] * alphaD[i][3]
                    X2[i][2] = beta[i][2] - A2[i] * betaD[i][2]
                    X2[i][3] = beta[i][3] - A2[i] * betaD[i][3]
                    X3[i][2] = delta[i][2] - A3[i] * deltaD[i][2]
                    X3[i][3] = delta[i][3] - A3[i] * deltaD[i][3]
                    const X_2 = (X1[i][2] + X2[i][2] + X3[i][2]) / 3;
                    const X_3 = (X1[i][3] + X2[i][3] + X3[i][3]) / 3;
                    X[i][2] = X_2;
                    X[i][3] = X_3;
                }
                newPosition.push(X);
            }
            else
            {
                newPosition.push(omega[x]);
            }
        }
        return newPosition;
    }

    run(iniSols = this.initialSolutions(this.numWolfs), itr = this.iteration)
    {
        const startTime = performance.now();
        let wolfs = iniSols;
        let ABDO = this.selectAlphaBetaDelta(wolfs);
        let alpha = ABDO['alpha'];
        let beta = ABDO['beta'];
        let delta = ABDO['delta'];
        let omega = ABDO['omega'];
        for (let i = 0; i < itr; i++)
        {
            const _a = this.a - (i * (this.a/this.iteration))
            wolfs = this.updatePosition(alpha, beta, delta, omega, _a)
            wolfs = this.mapIntoInteger(wolfs);
            ABDO = this.selectAlphaBetaDelta(wolfs);
            alpha = ABDO['alpha'];
            beta = ABDO['beta'];
            delta = ABDO['delta'];
            omega = ABDO['omega'];
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(ABDO['alpha']),
            runtime: exeTime,
            fitness: this.quality([ABDO['alpha']])[0],
            bestWolf: ABDO['alpha'],
            wolfs: omega
        }
    }
}

class whaleOptimizationAlgorithm extends solutionOperation {
    constructor(sysAlgoConfig)
    {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.ans = config.ans
        this.numPopulation = config.ans['configsWOA']['populationSize'],
        this.a = config.ans['configsWOA']['a'],
        this.l = config.ans['configsWOA']['l'],
        this.coefficient_A = config.ans['configsWOA']['coefficient_A'],
        this.coefficient_C = config.ans['configsWOA']['coefficient_C'],
        this.iteration = config.ans['configsWOA']['iteration']
    }

    bestAgent(whales)
    {
        let cWhales = JSON.parse(JSON.stringify(whales))
        const qualities = this.quality(cWhales);
        let best = qualities[0];
        let bestIndex = 0;
        for (let i = 0; i < qualities.length; i++)
        {
            if (best > qualities[i])
            {
                best = qualities[i];
                bestIndex = i;
            }
        }
        return {solution: cWhales[bestIndex], quality: best};
    }

    updatePosition(best, whales, _a)
    {
        const newPosition = [];
        const C1 = [], A1 = [];
        for (let i = 0; i < whales[0].length; i++) 
        {
            C1.push(this.coefficient_C * Math.random());
            A1.push((this.coefficient_A * _a) * Math.random() - _a)
        }
        
        for (let x = 0; x < whales.length; x++)
        {
            const rnd = Math.random();
            if (rnd < 0.5)
            {
                let D = JSON.parse(JSON.stringify(best));
                if (Math.abs(A1[x]) < 1)
                {
                    for (let i = 0; i < whales[x].length; i++)
                    {
                        D[i][2] = Math.abs(C1[i] * best[i][2] - whales[x][i][2])
                        D[i][3] = Math.abs(C1[i] * best[i][3] - whales[x][i][3])
                        whales[x][i][2] = best[i][2] - (A1[i])*D[i][2];
                        whales[x][i][3] = best[i][3] - (A1[i])*D[i][3];
                    }
                }
                else if (Math.abs(A1[x]) >= 1)
                {
                    const k = Math.floor(Math.random() * (whales.length - 1));
                    for (let i = 0; i < whales[x].length; i++)
                    {
                        D[i][2] = Math.abs(C1[i] * whales[k][i][2] - whales[x][i][2])
                        D[i][3] = Math.abs(C1[i] * whales[k][i][3] - whales[x][i][3])
                        whales[x][i][2] = whales[k][i][2] - (A1[i])*D[i][2];
                        whales[x][i][3] = whales[k][i][3] - (A1[i])*D[i][3];
                    }
                }
            }
            else if (rnd >= 0.5)
            {
                let D = JSON.parse(JSON.stringify(best));
                const l = getRandomValue(-this.l, this.l);
                for (let i = 0; i < whales[x].length; i++)
                {
                    D[i][2] = Math.abs(best[i][2] - whales[x][i][2])
                    D[i][3] = Math.abs(best[i][3] - whales[x][i][3])
                    whales[x][i][2] = D[i][2] * (Math.exp()^(this.b*l)) * Math.cos(2*Math.PI*l) + best[i][2];
                    whales[x][i][3] = D[i][3] * (Math.exp()^(this.b*l)) * Math.cos(2*Math.PI*l) + best[i][3];
                }
            }
            newPosition.push(whales[x]);
        }
        return this.mapIntoInteger(newPosition);
    }

    run(iniSols = this.initialSolutions(this.numPopulation), itr = this.iteration)
    {
        const startTime = performance.now();
        let whales = iniSols;
        let best = this.bestAgent(whales);

        for (let i = 0; i < itr; i++)
        {
            const _a = this.a - (i * (this.a/this.iteration))
            whales = this.updatePosition(best['solution'], whales, _a);

            const b2 = this.bestAgent(whales);
            if (b2['quality'] < best['quality'])
            {
                best = b2;
            }

            const r = this.solutionsQualitySort(whales, this.quality(whales));
            bestConv.push(r['bestQuality']);
            medianConv.push(r['medianQuality']);
            worstConv.push(r['worstQuality']);
            console.log(best['quality']);
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(best['solution']),
            runtime: exeTime,
            fitness: best['quality'],
            bestWhale: best['solution'],
            whales: whales,
            solution: best['solution'],
            perServiceAnalysis: this.perServiceAnalysis(best['solution'], "WOA-per-service")
        }
    }
}

class differentialEvolution extends solutionOperation {
    constructor(sysAlgoConfig)
    {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.ans = config.ans
        this.numSolutions = config.ans['configsDE']['populationSize'],
        this.crossoverRate = config.ans['configsDE']['crossoverRate'],
        this.F = config.ans['configsDE']['F'],
        this.iteration = config.ans['configsDE']['iteration']
    }

    mutantVector(solutions) {
        let mutantVector = solutions.map(innerArray => innerArray.map(subArray => [...subArray]));
    
        for (let i = 0; i < solutions.length; i++) {
            let indices = Array.from({length: solutions.length}, (_, idx) => idx);
            this.shuffleArray(indices);
            let [r1, r2, r3] = indices.slice(0, 3);
    
            for (let j = 0; j < solutions[i].length; j++) {
                const mV1 = solutions[r1][j][2] + this.F * (solutions[r2][j][2] - solutions[r3][j][2]);
                const mV2 = solutions[r1][j][3] + this.F * (solutions[r2][j][3] - solutions[r3][j][3]);
                mutantVector[i][j][2] = mV1;
                mutantVector[i][j][3] = mV2;
            }
        }
        return this.mapIntoInteger(mutantVector);
    }
    
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    trialVector(solutions, mutantVector) {
        const pc = this.crossoverRate;
        const trialVector = solutions.map((sol, i) => 
            sol.map((component, j) => {
                const r = Math.random();
                if (r < pc) {
                    return [component[0], component[1], mutantVector[i][j][2], mutantVector[i][j][3]];
                } else {
                    return [...component];
                }
            })
        );
        return trialVector;
    }

    selection(solutions, trVector)
    {
        let fitnessPop = this.quality(solutions);
        let fitnessTrV = this.quality(trVector);
        for (let i = 0; i < solutions.length; i++)
        {
            if (fitnessTrV[i] < fitnessPop[i])
            {
                solutions[i] = trVector[i];
            }
        }
        return solutions;
    }

    run(iniSols = this.initialSolutions(this.numSolutions), itr = this.iteration)
    {
        const startTime = performance.now();
        const bestConv = [];
        const medianConv = [];
        const worstConv = [];
        let solutions = iniSols;
        for (let i = 0; i < itr; i++)
        {
            let mVector = this.mutantVector(solutions)
            let trVector = this.trialVector(solutions, mVector)
            solutions = this.selection(solutions, trVector)
            const r = this.solutionsQualitySort(solutions, this.quality(solutions));
            bestConv.push(r['bestQuality']);
            medianConv.push(r['medianQuality']);
            worstConv.push(r['worstQuality']);
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        const bestSol = this.solutionsQualitySort(solutions, this.quality(solutions));
        return {
            servicePlacementResults: this.solutionAnalyser(bestSol['bestSolution']),
            runtime: exeTime,
            fitness: bestSol['bestQuality'],
            bestSolution: bestSol['bestSolution'],
            solutions: solutions,
            solution: bestSol['bestSolution'],
            perServiceAnalysis: this.perServiceAnalysis(bestSol['bestSolution'], "DE-per-service")
        }
    }
}

class firefly extends solutionOperation {
    constructor(sysAlgoConfig)
    {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];
        this.ans = config.ans
        this.numSolutions = config.ans['configsFA']['populationSize'],
        this.beta = config.ans['configsFA']['beta'],
        this.landa = config.ans['configsFA']['landa'],
        this.alpha = config.ans['configsFA']['alpha'],
        this.iteration = config.ans['configsFA']['iteration']
    }

    updatePosition(fireflies)
    {
        let brightness = this.quality(fireflies);
        for (let i = 0; i < fireflies.length; i++)
        {
            for (let j = 0;  j < fireflies.length; j++)
            {
                if (brightness[j] < brightness[i])
                {
                    for (let x = 0; x < fireflies[i].length; x++)
                    {
                        const r1 = Math.abs(fireflies[i][x][2] - fireflies[j][x][2]);
                        const r2 = Math.abs(fireflies[i][x][3] - fireflies[j][x][3]);
                        fireflies[i][x][2] = fireflies[i][x][2] + (this.beta*Math.exp(-this.landa*(r1^2)))*(fireflies[j][x][2] - fireflies[i][x][2]) + this.alpha*(Math.random()-0.5);
                        fireflies[i][x][3] = fireflies[i][x][3] + (this.beta*Math.exp(-this.landa*(r2^2)))*(fireflies[j][x][3] - fireflies[i][x][3]) + this.alpha*(Math.random()-0.5);
                    }
                }
                brightness = this.quality(this.mapIntoInteger(fireflies));
            }
        }
        return {fireflies: this.mapIntoInteger(fireflies),
                qualities: brightness};
    }

    run(iniSols = this.initialSolutions(this.numSolutions), itr = this.iteration)
    {
        const startTime = performance.now();
        let qualities;
        let fireflies = iniSols;
        let bestFireflyQuality = this.quality([fireflies[0]])[0]
        let bestFirefly = fireflies[0]
        for (let i = 0; i < itr; i++)
        {
            const re = this.updatePosition(fireflies);
            fireflies = re['fireflies'];
            qualities = re['qualities'];
            
            const re2 = this.solutionsQualitySort(fireflies, qualities);
            if (bestFireflyQuality > re2['bestQuality'])
            {
                bestFireflyQuality = re2['bestQuality'];
                bestFirefly = re2['bestSolution'];
            }
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(bestFirefly),
            runtime: exeTime,
            fitness: this.quality([bestFirefly])[0],
            bestFirefly: bestFirefly,
            fireflies: fireflies
        }
    }
}

class hybrid {
    constructor(sysAlgoConfig) 
    {
        this.config = sysAlgoConfig;
        this.opr = new solutionOperation(this.config.ans);
    }

    GASA() 
    {
        const GA = new geneticAlgorithm(this.config)
        const SA = new simulatedAnnealing(this.config)
        const startTime = performance.now();
        const gaSolution = GA.run();
        const saSolution = SA.run(gaSolution['bestSolution']);
        const exeTime = performance.now(); - startTime;
        return {servicePlacementResults: {GA: this.opr.solutionAnalyser(gaSolution['bestSolution']), GASA: this.opr.solutionAnalyser(saSolution['bestSolution'])},
            runtime: exeTime,
            fitness: saSolution['fitness']}
    }

    PSOGA() 
    {
        const PSO = new particleSwarmOptimization(this.config)
        this.config['ans']['configsGA']['iteration'] = this.config['ans']['configsGA']['iteration']
        const GA = new geneticAlgorithm(this.config)
        const startTime = performance.now();
        const pso = PSO.run();
        const gapso = GA.run(pso['particles']);
        const exeTime = performance.now() - startTime;
        return {servicePlacementResults: this.opr.solutionAnalyser(gapso['bestSolution']),
        runtime: exeTime,
        fitness: gapso['fitness'],
        perServiceAnalysis: this.opr.perServiceAnalysis(gapso['bestSolution'], "PSOGA-per-service"),
        solution: gapso['bestSolution']
    }
    }

    PSODE()
    {
        const PSO = new particleSwarmOptimization(this.config)
        const DE = new differentialEvolution(this.config)
        const startTime = performance.now();
        const pso = PSO.run();
        const psoga = DE.run(pso['particles']); 
        const exeTime = performance.now() - startTime;
        return {servicePlacementResults: {PSODE: this.opr.solutionAnalyser(psoga['bestSolution'])},
        runtime: exeTime,
        fitness: psoga['fitness'],
        perServiceAnalysis: this.opr.perServiceAnalysis(psoga['bestSolution'], "PSODE-per-service")}
    }

    GAPSO()
    {
        const GA = new geneticAlgorithm(this.config)
        const PSO = new particleSwarmOptimization(this.config)
        const startTime = performance.now();
        const ga = GA.run();
        const gapso = PSO.run(ga['population']);
        const exeTime = performance.now() - startTime;
        return {servicePlacementResults: this.opr.solutionAnalyser(gapso['bestParticle']),
        runtime: exeTime,
        fitness: gapso['fitness'],
        perServiceAnalysis: this.opr.perServiceAnalysis(gapso['bestParticle'], "GAPSO-per-service"),
        solution: gapso['bestParticle']
    }
    }

    PSOGApopSA()
    {
        const GA = new geneticAlgorithm(this.config)
        const PSO = new particleSwarmOptimization(this.config)
        const popSA = new popSimulatedAnnealing(this.config)
        const startTime = performance.now();
        const pso = PSO.run();
        const ga = GA.run(pso['particles']);
        const popsa = popSA.run(ga['population']);
        const exeTime = performance.now(); - startTime;
        return {servicePlacementResults: {PSO: this.opr.solutionAnalyser(pso['bestParticle']), PSOGA: this.opr.solutionAnalyser(ga['bestSolution']), PSOGApopSA: this.opr.solutionAnalyser(popsa['bestSolution'])},
            runtime: exeTime,
            fitness: popsa['fitness']}
    }

    popSAPSOGA()
    {
        const GA = new geneticAlgorithm(this.config)
        const PSO = new particleSwarmOptimization(this.config)
        const popSA = new popSimulatedAnnealing(this.config)
        const startTime = performance.now();
        const popsa = popSA.run();
        const pso = PSO.run(popsa['population']); 
        const ga = GA.run(pso['particles']);
        const exeTime = performance.now(); - startTime;
        return {
            servicePlacementResults: {popSA: this.opr.solutionAnalyser(popsa['bestSolution']), popSAPSO: this.opr.solutionAnalyser(pso['bestParticle']), popSAPSOGA: this.opr.solutionAnalyser(ga['bestSolution'])},
            runtime: exeTime,
            fitness: popsa['fitness']}
    }

    pHybrid()
    {
        const numSubIterations = this.config.ans['configspHybrid']['subIteration'];
        const numIterations = this.config.ans['configspHybrid']['iteration'];
        const algo = this.config.ans['configspHybrid']['algorithms'];
        const x = [];

        for (let i = 0; i < algo.length; i++)
        {
            if (algo[i] == 'GA')
            {
                x.push(new geneticAlgorithm(this.config))
            }
            else if (algo[i] == 'DE')
            {
                x.push(new differentialEvolution(this.config))
            }
            else if (algo[i] == 'PSO')
            {
                x.push(new particleSwarmOptimization(this.config))
            }
            else if (algo[i] == 'GWO')
            {
                x.push(new greyWolfOptimizer(this.config))
            }
            else if (algo[i] == 'WOA')
            {
                x.push(new whaleOptimizationAlgorithm(this.config))
            }
            else if (algo[i] == 'FA')
            {
                x.push(new firefly(this.config))
            }
            else if (algo[i] == 'SCA')
            {
                x.push(new sineCosineAlgorithm(this.config))
            }
        }

        const startTime = performance.now();
        const GA = new geneticAlgorithm(this.config)
        let population = GA.run()['population'];
        for (let i = 0; i < numIterations; i++)
        {
            const rndAlgo = Math.floor(Math.random() * algo.length)
            console.log(algo[rndAlgo]);
            if (algo[rndAlgo] == 'GA')
            {
                population = x[rndAlgo].run(population, numSubIterations)['population']
            }
            else if (algo[rndAlgo] == 'DE')
            {
                population = x[rndAlgo].run(population, numSubIterations)['solutions']
            }
            else if (algo[rndAlgo] == 'PSO')
            {
                population = x[rndAlgo].run(population, numSubIterations)['particles']
            }
            else if (algo[rndAlgo] == 'GWO')
            {
                population = x[rndAlgo].run(population, numSubIterations)['wolfs']
            }
            else if (algo[rndAlgo] == 'WOA')
            {
                population = x[rndAlgo].run(population, numSubIterations)['whales']
            }
            else if (algo[rndAlgo] == 'FA')
            {
                population = x[rndAlgo].run(population, numSubIterations)['fireflies']
            }
            else if (algo[rndAlgo] == 'SCA')
            {
                population = x[rndAlgo].run(population, numSubIterations)['solutions']
            }
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;

        const qualities = this.opr.quality(population);
        const sq = this.opr.solutionsQualitySort(population, qualities);

        return {
            servicePlacementResults: this.opr.solutionAnalyser(sq['bestSolution']),
            runtime: exeTime,
            fitness: this.opr.quality([sq['bestSolution']])[0],
            bestSolution: sq['bestSolution'],
            solutions: population,
            solution: sq['bestSolution'],
            perServiceAnalysis: this.opr.perServiceAnalysis(sq['bestSolution'], "pHybrid-per-service")
        }
    }
}

class parallelGeneticAlgorithm
{
    constructor() {
    }

    saveJSON(jsonResult, str, type) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync('useCase')) {
                fs.mkdirSync('useCase');
            }
            fs.writeFile(str, JSON.stringify(jsonResult, null, type === "node" ? 2 : 0), 'utf8', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    
    async run(req) {
        const { execSync } = require('child_process');
    
        try {
            await Promise.all([
                this.saveJSON(req.body['services'], './useCase/services.json', "node"),
                this.saveJSON(req.body['computingNodes'], './useCase/nodes.json', "node"),
                this.saveJSON(req.body['helperNodes'], './useCase/helpers.json', "node"),
                this.saveJSON(req.body['usersNodes'], './useCase/users.json', "node"),
                this.saveJSON(req.body['componentConnections'], './useCase/componentsConnections.json', "link"),
                this.saveJSON(req.body['infraConnections'], './useCase/infraConnections.json', "link")
            ]);

            if (req.body['algo'] == "PGA")
            {
                const config = {
                    iteration: req.body['configsPGA']['iteration'],
                    cProbability: req.body['configsPGA']['crossoverRate'],
                    mProbability: req.body['configsPGA']['mutationRate'],
                    numPopulation: req.body['configsPGA']['populationSize'],
                    tournamentSize: req.body['configsPGA']['selectionSize'],
                }
        
                const jsonString = JSON.stringify(config);
                process.env.DATA_TO_SEND = jsonString;
                const start = performance.now()
                const stdout = execSync('node masterGA.js');
                const runtime = performance.now() - start;
                const data = fs.readFileSync('data.json', 'utf8');
                const jsonObject = JSON.parse(data);
                return {servicePlacementResults: jsonObject['servicePlacementResults'], runtime: runtime};
            }
            else if (req.body['algo'] == "PSBGA")
            {
                const config = {
                    iteration: req.body['configsPGA']['iteration'],
                    cProbability: req.body['configsPGA']['crossoverRate'],
                    mProbability: req.body['configsPGA']['mutationRate'],
                    numPopulation: req.body['configsPGA']['populationSize'],
                    tournamentSize: req.body['configsPGA']['selectionSize'],
                }
        
                const jsonString = JSON.stringify(config);
                process.env.DATA_TO_SEND = jsonString;
                const start = performance.now()
                const stdout = execSync('node master_ga.js');
                const runtime = performance.now() - start;
                const data = fs.readFileSync('data.json', 'utf8');
                const jsonObject = JSON.parse(data);
                return {servicePlacementResults: jsonObject['servicePlacementResults'], runtime: runtime};
            }
        } catch (err) {
            console.error('An error occurred:', err);
        }
    }
}

module.exports = {
    solutionOperation,
    taskContinuationAffinity,
    leastRequiredCPU,
    mostDataSize,
    mostReliablity,
    mostPowerful,
    leastPowerful,
    NCO,
    randomly,
    faultTolerance,
    geneticAlgorithm,
    simulatedAnnealing,
    popSimulatedAnnealing,
    particleSwarmOptimization,
    sineCosineAlgorithm,
    differentialEvolution,
    greyWolfOptimizer,
    whaleOptimizationAlgorithm,
    firefly,
    hybrid,
    parallelGeneticAlgorithm,
    fineTuning,
}