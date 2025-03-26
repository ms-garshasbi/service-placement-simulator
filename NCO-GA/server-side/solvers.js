const fs = require('fs');
const { performance } = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const { cos, concat, max } = require('mathjs');
const { deprecate } = require('util');

function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
}

function saveJSON(jsonResult, str, type) 
{
    if (!fs.existsSync('useCase')) 
    {
        fs.mkdir('useCase', () => {
            //console.log(`Folder '${'useCase'}' created successfully.`);
        });
    }

    if (type == "node")
    {
        fs.writeFile(str, JSON.stringify(jsonResult, null, 2), 'utf8', () => {
            //console.log('JSON file has been saved!');
        });
    }
    else if (type == "link")
    {
        fs.writeFile(str, JSON.stringify(jsonResult), (err) => {
            if (err) {
              //console.error('Error writing file:', err);
            }
          });
    }
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
  // Check if file exists to add header if needed
  if (!fs.existsSync(csvFilePath)) {
    const header = new Parser().parse([flattenedData]);
    fs.writeFileSync(csvFilePath, header + '\n');
  }
  // Append CSV data to the file
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
    }

    randomSolution() {
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

    healing(solution) {
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
                if (placedComponentMem < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] &&
                    placedComponentDisk < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk']) 
                {
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
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
                if (placedComponentMem < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['memory'] &&
                    placedComponentDisk < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['disk']) 
                {
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['memory'] -= placedComponentMem;
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['disk'] -= placedComponentDisk;
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = computingNodesFreeCapacity.length - 1; cN > 0; cN--) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
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
                if (placedComponentMem < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] &&
                    placedComponentDisk < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk']) 
                {
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] -= placedComponentMem;
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] -= placedComponentDisk;
                    placed = true;
                   
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
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

    infraReliability(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let totalRC = 0;

        for (let s = 0; s < solution.length / numComponents; s++) 
        //for (let s = 0; s < this.users.length; s++)
        {
            //Calculate infrastructure reliability
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
                    reliabilityTier1 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    // if (this.computingNodes[node-1]['nodeTier'] == 1)
                    // {
                    //     reliabilityTier1 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    // }
                    // else if (this.computingNodes[node-1]['nodeTier'] == 2)
                    // {
                    //     reliabilityTier2 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    // }
                    // else if (this.computingNodes[node-1]['nodeTier'] == 3)
                    // {
                    //     reliabilityTier3 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    // }
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

            reliabilityTier1 = 1 - reliabilityTier1;
            if (reliabilityTier1 == 0) {reliabilityTier1 = 1}

            reliabilityTier2 = 1 - reliabilityTier2;
            if (reliabilityTier2 == 0) {reliabilityTier2 = 1}

            reliabilityTier3 = 1 - reliabilityTier3;
            if (reliabilityTier3 == 0) {reliabilityTier3 = 1}

            if (reliabilityUsers == 0) {reliabilityUsers = 0.99; counterUser = 1;}

            if (reliabilityHelpers == 0) {reliabilityHelpers = 0.99; counterHelper = 1;}

            totalRC += reliabilityTier1*reliabilityTier2*reliabilityTier3*reliabilityUsers*reliabilityHelpers;
        }
        return totalRC/(solution.length/numComponents)
    } 

    serviceReliability(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let aveRS = 0;
        for (let s = 0; s < solution.length / numComponents; s++)
        {
            let RS = 1;
            for (let i = s*numComponents; i < (s+1)*numComponents; i++)
            {
                RS *= this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['reliabilityScore'];
            }
            aveRS = aveRS + RS
        }
        aveRS = aveRS/(solution.length / numComponents)
        return aveRS;
    }

    executionTime(solution)
    {
        let eT = 0
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
                    const scd_id = solution[j][1] - 1;
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
                            cT = cT + (ds/bw + this.infraConnections[cn_id][cnd_id][1]/20)
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

    calculateAll(solution)
    {
        const ResponseTime = this.executionTime(solution) + 
                             this.transmissionDelay(solution) + 
                             this.providerDelay(solution) + 
                             this.codecDelay(solution);
        const PlatformReliability = this.infraReliability(solution);
        const ServiceReliability = this.serviceReliability(solution);

        return {
            ResponseTime,
            PlatformReliability,
            ServiceReliability
        }
    }

    loadCalculator(solution) //Calculates the number of components (it is not the load)
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
        
        // Calculate usedMemory and usedCPU
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
        
        // Calculate entropies for each tier and the entire infrastructure
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
        
        // Calculate overall entropy
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

    solutionAnalyser(solution)
    {
        const cost = this.calculateAll(solution)
        const entropy = this.entropyCalculator(solution)
        
        return {
            totalResponseTime: cost['ResponseTime'],
            aveResponseTime: cost['ResponseTime']/this.users.length,
            platformReliability: cost['PlatformReliability'],
            serviceReliability: cost['ServiceReliability'],
            entropyAnalysis: entropy,
        }
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

    costPerService(solution)
    {
        const numComponents = (this.services[0]['components']).length
        const numServices = this.users.length
        const result = [];
        const chunkSize = Math.ceil(solution.length / numServices);

        for (let i = 0; i < solution.length; i += chunkSize) 
        {
            result.push(solution.slice(i, i + chunkSize));
        }

        for (let i = 0; i < result.length;i++)
        {
            //console.log(this.solutionAnalyser(result[i])['totalResponseTime'])
        }
        //return result
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
                    solutionsINT[i][j][2] = 1
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


        if (ans['algo'] == "NCOtrainGA")
        {
            this.pp = ans['configsGA']['populationSize'];
            this.mr = ans['configsGA']['mutationRate'];
            this.cr = ans['configsGA']['crossoverRate']; 
            this.ss = ans['configsGA']['selectionSize']; 
            this.it = ans['configsGA']['iteration']; 
            this.termination = ans['configsGA']['termination']; 
            this.sig = 0.5; //1.5//Mutation-related parameter
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

        this.min = -2;
        this.max = 2;
        this.CHlenght = 16; // = 8 if the function is linear
        this.model = "nonlinear-power"; // nonlinear-power, nonlinear-sigmoid, nonlinear-leakyRelu, nonlinear-tanh, linear
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
    
    formula(bandwidth, node, version, w, maxMemory, maxCPU)
    { 
        const f1 = node.characteristics.memory / maxMemory;
        const f2 = node.characteristics.cpu / maxCPU;
        const f3 = node.characteristics.reliabilityScore;
        const f4 = version.memory / 2500 //Maximum memory
        const f5 = version.cpu / 1100 //Maximum cpu
        const f6 = version.dataSize / 500 //Maximum datasize
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
    }

    fitness(w) {
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));
        
        let computingNodesFreeCapacity = this.computingNodes.map(node => ({
            nodeID: node.nodeID,
            characteristics: { ...node.characteristics }
        }));

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
    
                        if (node.characteristics.memory > version.memory &&
                            node.characteristics.cpu > version.cpu) 
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
            characteristics: { ...node.characteristics }
        }));
    
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
                        if (node.characteristics.memory > version.memory && node.characteristics.cpu > version.cpu) 
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
            //appendJsonToCsv(this.solutionAnalyser(solution),this.algo);
        }
        solution = this.validation(solution);
        //console.log(this.costPerService(solution))
        return {solution: solution, solution_analysis: this.solutionAnalyser(solution)}
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
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
        }

        return previous_best_sol
    }

    singlePointCrossover(population, crossoverRate = this.cr) 
    {
        if (population.length % 2 !== 0) {
            throw new Error("Population size must be even.");
        }
    
        const offspringPopulation = [];
    
        for (let i = 0; i < population.length; i += 2) {
            const parent1 = population[i];
            const parent2 = population[i + 1];
    
            if (Math.random() < crossoverRate) 
            {
                const crossoverPoint = Math.floor(Math.random() * (parent1.length - 1)) + 1;
                const offspring1 = [...parent1.slice(0, crossoverPoint), ...parent2.slice(crossoverPoint)];
                const offspring2 = [...parent2.slice(0, crossoverPoint), ...parent1.slice(crossoverPoint)];
                offspringPopulation.push(offspring1, offspring2);
            } 
            else 
            {
                offspringPopulation.push([...parent1], [...parent2]);
            }
        }
        return offspringPopulation;
    }

    blendCrossover(population, crossoverRate = this.cr, alpha = 0.5) 
    {
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

    mutatePopulation(population, mutationRate = this.mr) 
    {
        const mutatedPopulation = population.map(solution => [...solution]);
        for (let i = 0; i < mutatedPopulation.length; i++) {
            for (let j = 0; j < mutatedPopulation[i].length; j++) 
            {
                if (Math.random() < mutationRate) 
                {
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

    selection(population, selectionSize = this.ss) 
    {
        const fitness = this.cost(population);
        const selectedPopulation = [];
        const numSelections = Math.floor(population.length / 2);
    
        for (let x = 0; x < numSelections; x++) 
        {
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

    run_test(model_index = 0)
    {
        let w;
        w = readJSON(`weights_${model_index}.txt`)
        return this.test(w)['solution_analysis']
        
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
            //appendJsonToCsv(this.solutionAnalyser(solution),"TCA");           
        }
        solution = this.validation(solution)
        //this.costPerService(solution, "TCA-per-service")
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            nodesFreeCapacity: computingNodesFreeCapacity,
            runtime: exeTime
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
            //appendJsonToCsv(this.solutionAnalyser(solution),"LRC"); 
        }
        solution = this.validation(solution)
        //this.costPerService(solution, "LRC-per-service")
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime,
            nodesFreeCapacity: computingNodesFreeCapacity,
            solution: solution
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
            for (let c = 0; c < (this.services[0]['components']).length; c++) 
            {
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
            //appendJsonToCsv(this.solutionAnalyser(solution),"MDS"); 
        }

        solution = this.validation(solution)
        //this.costPerService(solution, "MDS-per-service")
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime
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
            //appendJsonToCsv(this.solutionAnalyser(solution),"MR"); 
        }
        solution = this.validation(solution)
        this.costPerService(solution, "MR-per-service")
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            runtime: exeTime
        };
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
                //Sort versions based on cpu
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
            //appendJsonToCsv(this.solutionAnalyser(solution),"MP");
        }
        solution = this.validation(solution)
        this.costPerService(solution, "MP-per-service")
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            nodesFreeCapacity: computingNodesFreeCapacity,
            runtime: exeTime
        };
    }
}

class leastPowerful extends solutionOperation { //Most computational version on least powerful node
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
            //appendJsonToCsv(this.solutionAnalyser(solution),"LP");
        }

        //Add for new evaluations
        solution = this.validation(solution)
        this.costPerService(solution, "LP-per-service")
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            runtime: exeTime
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
                let parentIndex1 = i//Math.floor(getRandomValue(0, population.length));
                let parentIndex2 = i+1//Math.floor(getRandomValue(0, population.length));
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
            let fitness = this.quality(population);
            let selectedPopulation = this.tournamentSelection(population, fitness);
            let crossoverPopulation = this.crossover(selectedPopulation);
            let mutationPopulation = this.mutation(crossoverPopulation);
            population = this.healingSolution(mutationPopulation);
            //population = this.elitism(selectedPopulation, newPopulation);
            fitnessInfoCurrent = this.solutionsQualitySort(population,fitness);
           if (fitnessInfoCurrent['bestQuality'] < fitnessInfoPrev['bestQuality']) 
           {
                
                fitnessInfoPrev['bestQuality'] = fitnessInfoCurrent['bestQuality'];
                fitnessInfoPrev['bestSolution'] = fitnessInfoCurrent['bestSolution'];
            }
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(fitnessInfoPrev['bestSolution']),
            runtime: exeTime,
            fitness: fitnessInfoPrev['bestQuality'],
            bestSolution: fitnessInfoPrev['bestSolution'],
            population: population
        }
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
        let qualities = this.quality(particles);

        let pBest = particles;
        let gBest = particles[qualities.indexOf(Math.min(...qualities))];
        let velocities = this.initialVelocity();

        for (let i = 0; i < itr; i++)
        {
            const updatedVP = this.updateVelocityPosition(particles, velocities, pBest, gBest)
            const updatedBests = this.updatepBestgBest(pBest, gBest, particles);
            pBest = updatedBests['pBest']; 
            gBest = updatedBests['gBest'];
            velocities = updatedVP['velocities'];
            particles = updatedVP['positions'];
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
            pBest: this.mapIntoInteger(pBest)
        }
    }
}

class hybrid {
    constructor(sysAlgoConfig) 
    {
        this.config = sysAlgoConfig;
        this.opr = new solutionOperation(this.config.ans);
    }

    PSOGA()
    {
        const PSO = new particleSwarmOptimization(this.config)
        const GA = new geneticAlgorithm(this.config)
        const startTime = performance.now();
        const pso = PSO.run();
        const gapso = GA.run(pso['particles']);
        const exeTime = performance.now() - startTime;
        return {servicePlacementResults: {PSOGA: this.opr.solutionAnalyser(gapso['bestSolution'])},
        runtime: exeTime,
        fitness: gapso['fitness']}
    }
}

module.exports = {
    solutionOperation,
    //Heuristics
    taskContinuationAffinity,
    leastRequiredCPU,
    mostDataSize,
    mostReliablity,
    mostPowerful,
    leastPowerful,
    NCO,

    //Metaheuristics
    geneticAlgorithm,
    particleSwarmOptimization,

    //Hybrid
    hybrid,
}