const fs = require('fs');
const { performance } = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');

function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
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

    validation(solution) //Checking that each component are running on a user or helper belongs to them
    {
        for (let i = 0; i < solution.length; i++) {
            let nodeID = solution[i][3];
            let serviceID = solution[i][0];
            let compatible = false;
            for (let j = 0; j < this.services.length; j++) {
                if (nodeID > this.computingNodes.length) {
                    if (this.services[j]['serviceID'] == serviceID && (this.services[j]['userID'] == nodeID || this.services[j]['helperID'] == nodeID)) {
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

    healing(solution) {//This healing operator does not allow cpu overload
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
                const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] &&
                    placedComponentDisk < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] &&
                    placedComponentCPU < userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['cpu']
                ) 
                {
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                    userFreeCapacity[(cn - 1) - (numComputingNodes + numHelpers)]['characteristics']['cpu'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk &&
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
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
                const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['memory'] &&
                    placedComponentDisk < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['disk'] &&
                    placedComponentCPU < helperFreeCapacity[(cn - 1) - (numComputingNodes)]['characteristics']['cpu']) 
                {
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['memory'] -= placedComponentMem;
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['disk'] -= placedComponentDisk;
                    helperFreeCapacity[(cn - 1) - numComputingNodes]['characteristics']['cpu'] -= placedComponentCPU;
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = computingNodesFreeCapacity.length - 1; cN > 0; cN--) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk &&
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU
                        ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
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
                const placedComponentCPU = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['cpu'];
                if (placedComponentMem < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] &&
                    placedComponentDisk < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] &&
                    placedComponentCPU < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['cpu']) 
                {
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] -= placedComponentMem;
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] -= placedComponentDisk;
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['cpu'] -= placedComponentCPU;
                    placed = true;
                   
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk &&
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] > placedComponentCPU
                        ) 
                        {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= placedComponentCPU;
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
        {
            //Calculate infrastructure reliability
            let reliabilityTier1 = 1;
            let reliabilityTier2 = 1;
            let reliabilityTier3 = 1;
            let reliabilityUsers = 0;
            let reliabilityHelpers = 0;
            let counterUser = 0, counterHelper = 0;

            for (let i = s*numComponents; i < (s+1)*numComponents; i++) 
            {   const node = solution[i][3];
                
                if (node < this.helpers[0]["nodeID"])
                {
                    if (this.computingNodes[node-1]['nodeTier'] == 1)
                    {
                        reliabilityTier1 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    }
                    else if (this.computingNodes[node-1]['nodeTier'] == 2)
                    {
                        reliabilityTier2 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    }
                    else if (this.computingNodes[node-1]['nodeTier'] == 3)
                    {
                        reliabilityTier3 *= (1 - this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    }
                }
                else if (node >= this.helpers[0]["nodeID"] && node < this.users[0]["nodeID"])
                {
                    counterHelper++;
                    reliabilityHelpers += this.helpers[node-this.helpers[0]["nodeID"]]['characteristics']['reliability']
                }
                else if (node >= this.users[0]["nodeID"])
                {
                    counterUser++;
                    reliabilityUsers += this.users[node-this.users[0]["nodeID"]]['characteristics']['reliability']
                }
            }

            reliabilityTier1 = 1 - reliabilityTier1;
            if (reliabilityTier1 == 0) {reliabilityTier1 = 1}

            reliabilityTier2 = 1 - reliabilityTier2;
            if (reliabilityTier2 == 0) {reliabilityTier2 = 1}

            reliabilityTier3 = 1 - reliabilityTier3;
            if (reliabilityTier3 == 0) {reliabilityTier3 = 1}

            if (reliabilityUsers == 0) {reliabilityUsers = 1; counterUser = 1;}
            reliabilityUsers = reliabilityUsers/counterUser;

            if (reliabilityHelpers == 0) {reliabilityHelpers = 1; counterHelper = 1;}
            reliabilityHelpers = reliabilityHelpers/counterHelper;

            totalRC += reliabilityTier1*reliabilityTier2*reliabilityTier3*reliabilityUsers*reliabilityHelpers;
        }
        return totalRC/(solution.length/6)// 6 is the number of service components;
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
        let eT = 0;
        for (let k = 0; k < solution.length; k++)
        {        
            let node_id = solution[k][3];
            if (node_id < this.helpers[0]["nodeID"])
            {
                const CR = this.services[solution[k][0] - 1]['components'][solution[k][1] - 1]['versions'][solution[k][2] - 1]['characteristics']['cpu'];
                const CC = this.computingNodes[solution[k][3] - 1]['characteristics']['cpu'];
                eT = eT + CR/CC;
            }
            else if (node_id >= this.helpers[0]["nodeID"] && node_id < this.users[0]["nodeID"])
            {
                const CR = this.services[solution[k][0] - 1]['components'][solution[k][1] - 1]['versions'][solution[k][2] - 1]['characteristics']['cpu'];
                const CC = this.helpers[solution[k][3] - this.helpers[0]["nodeID"]]['characteristics']['cpu'];
                eT = eT + CR/CC;
            }
            else if (node_id >= this.users[0]["nodeID"])
            {
                const CR = this.services[solution[k][0] - 1]['components'][solution[k][1] - 1]['versions'][solution[k][2] - 1]['characteristics']['cpu'];
                const CC = this.users[solution[k][3] - this.users[0]["nodeID"]]['characteristics']['cpu'];
                eT = eT + CR/CC;
            }
        }
        return eT;
    }

    bwDivision(solution)
    {
        const numComponents = this.services[0]['components'].length;
        //this function counts the number of connections is done by the links
        let conn = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1));

        for (let s = 0; s < solution.length/numComponents; s++)
        {
            for (let i = s * this.componentConnections[0].length; i < (s + 1) * this.componentConnections[0].length; i++)
            {
                const sc_id = solution[i][1] - 1; //The SC that we want to check its dependencies.
                const cn_id = solution[i][3] - 1; //The node that SC is running on it.
                for (let j = i; j < (s + 1) * this.componentConnections[0].length; j++)
                {
                    const scd_id = solution[j][1] - 1; //Dependent SC
                    if (this.componentConnections[sc_id][scd_id] != 0)
                    {
                        const cnd_id = solution[j][3] - 1; //The computin node that is running the dependent SC.
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
        for (let s = 0; s < solution.length / numComponents; s++)
        {
            for (let i = s * this.componentConnections[0].length; i < (s + 1) * this.componentConnections[0].length; i++)
            {
                const ds = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['dataSize'];
                const sc_id = solution[i][1] - 1; //The SC that we want to check its dependencies.
                const cn_id = solution[i][3] - 1; //The node that SC is running on it.
                for (let j = i; j < (s + 1) * this.componentConnections[0].length; j++)
                {
                    const scd_id = solution[j][1] - 1; //Dependent SC
                    if (this.componentConnections[sc_id][scd_id] != 0)
                    {
                        const cnd_id = solution[j][3] - 1; //The computin node that is running the dependent SC.
                        if (this.infraConnections[cn_id][cnd_id][0] != 0)
                        {
                            const bw = this.infraConnections[cn_id][cnd_id][0]/conn[cn_id][cnd_id];
                            cT = cT + (ds/bw + this.infraConnections[cn_id][cnd_id][1]/20) // datasize/bandwidth + RTT/2
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
                        pDelay += 1;
                        break;
                    case 'Azure':
                        pDelay += 1;
                        break;
                    case 'Ericsson':
                        pDelay += 1;
                        break;
                    case 'K8w':
                        pDelay += 1;
                        break;
                    default:
                        pDelay += 1;
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
                        cDelay = 1;
                        break;
                    case 'H264':
                        cDelay = 2;
                        break;
                    default:
                        cDelay = 1;
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

    calculateFourObjectives(solution) //Including Entropy
    {
        const ResponseTime = this.executionTime(solution) + 
                             this.transmissionDelay(solution) + 
                             this.providerDelay(solution) + 
                             this.codecDelay(solution);
        const PlatformReliability = this.infraReliability(solution);
        const ServiceReliability = this.serviceReliability(solution);
        const Entropy = this.entropyCalculator(solution);

        return {
            ResponseTime,
            PlatformReliability,
            ServiceReliability,
            Entropy,
        }
    }

    loadCalculator(solution) //Calculates the number of components on each tier
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
        
        // Calculate entropy for each tier and the entire infrastructure
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
        
        // Calculate maximum entropy values
        let max_cpu_infrastructure = Math.log2(this.computingNodes.length);
        let max_memory_infrastructure = max_cpu_infrastructure;
        let max_cpu_tier1 = num_tier1 > 0 ? Math.log2(num_tier1) : 0;
        let max_memory_tier1 = max_cpu_tier1;
        let max_cpu_tier2 = num_tier2 > 0 ? Math.log2(num_tier2) : 0;
        let max_memory_tier2 = max_cpu_tier2;
        let max_cpu_tier3 = num_tier3 > 0 ? Math.log2(num_tier3) : 0;
        let max_memory_tier3 = max_cpu_tier3;
        
        return {
            cpu_entropy_tier1: tier1_cpu_entropy,
            cpu_entropy_tier2: tier2_cpu_entropy,
            cpu_entropy_tier3: tier3_cpu_entropy,
            //cpu_entropy_infrastructure: H_cpu,
            memory_entropy_tier1: tier1_memory_entropy,
            memory_entropy_tier2: tier2_memory_entropy,
            memory_entropy_tier3: tier3_memory_entropy,
            //memory_entropy_infrastructure: H_memory,
            //max_cpu_entropy_tier1: max_cpu_tier1,
            //max_cpu_entropy_tier2: max_cpu_tier2,
            //max_cpu_entropy_tier3: max_cpu_tier3,
            //max_cpu_entropy_infrastructure: max_cpu_infrastructure,
            //max_memory_entropy_tier1: max_memory_tier1,
            //max_memory_entropy_tier2: max_memory_tier2,
            //max_memory_entropy_tier3: max_memory_tier3,
            //max_memory_entropy_infrastructure: max_memory_infrastructure
        };
    }

    solutionAnalyser(solution)
    {
        const cost = this.calculateAll(solution)
        const load = this.loadCalculator(solution)
        const entropy = this.entropyCalculator(solution)
        return {
            //fitness: this.quality([solution]),
            totalResponseTime: cost['ResponseTime'],
            platformReliability: cost['PlatformReliability'],
            serviceReliability: cost['ServiceReliability'],
            loadTier1: load['tier1'],
            loadTier2: load['tier2'],
            loadTier3: load['tier3'],
            loadTierHelper: load['helperTier'],
            loadTierUser: load['userTier'],
            entropyAnalysis: entropy,
        }
    }

    quality(solutions) //This fitness function considers three objectives (i.e., response time, platform reliability and service reliability)
    {
        const solutionQualities = [];
        const maxValue = this.initialMaxRT();
        let quality = [];
        for (let i = 0; i < solutions.length; i++) 
        {
            solutionQualities.push(this.calculateAll(solutions[i]));
            solutionQualities[i]['ResponseTime'] = 0.7*solutionQualities[i]['ResponseTime'] / maxValue;
            solutionQualities[i]['PlatformReliability'] =  -0.0*solutionQualities[i]['PlatformReliability'];
            solutionQualities[i]['ServiceReliability'] =  -0.3*solutionQualities[i]['ServiceReliability'];
            quality.push(solutionQualities[i]['ResponseTime'] + solutionQualities[i]['PlatformReliability'] + solutionQualities[i]['ServiceReliability']);
        }
        return quality;
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

class taskContinuationAffinity extends solutionOperation { //The first executable version on first accessible node
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
                        if (userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] &&
                            userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']) {

                            solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], userFreeCapacity[u]['nodeID']]);

                            userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                            userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];

                            cuPlaced = true;
                            break;
                        }
                    }
                    if (cuPlaced == false) {
                        for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                            for (let v = 0; v < numVersions; v++) {
                                if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] &&
                                    computingNodesFreeCapacity[cN]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']) {
                                    solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                    computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                    computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
                                    

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
                                    if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] &&
                                        helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['cpu'];
            
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
        }
        
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            runtime: exeTime
        };
    }
}

class leastRequiredCPU extends solutionOperation { //Versions required least CPU
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
                    if (userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {

                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);

                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];

                        cuPlaced = true;
                    }
                    if (cuPlaced == false) {
                        for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                            if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                computingNodesFreeCapacity[cN]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'] ) {
                                solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                computingNodesFreeCapacity[cN]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                                

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
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
                                        cuPlaced = true;
                                        break;
                                }
                            }
                        }
                    }
                }
            }
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime,
            solution: solution
        };
    }
}

class mostDataSize extends solutionOperation { //Versions required most DataSize run as much as on the user nodes
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
                //Sort versions based on data size
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
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
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
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
            
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
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime
        };
    }

}

class mostReliablity extends solutionOperation { //Most reliable version on the most reliable node
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

        //Sort computing nodes based on their reliability
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
                //Sort versions based on reliabilityScore
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
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        
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
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
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
        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
            runtime: exeTime
        };
    }
}

class mostPowerful extends solutionOperation { //Least computational version on most powerful node
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

        //Sort computing nodes based on their cpu
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
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
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
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
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

        const endTime = performance.now();
        const exeTime = endTime - startTime;
        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution: solution,
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

        //Sort computing nodes based on their cpu
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
                //Sort versions based on cpu
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
                        userFreeCapacity[u]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        userFreeCapacity[u]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
                        
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
                                if (helperFreeCapacity[h]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                    helperFreeCapacity[h]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu']) {
            
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
            
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['cpu'];
            
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
            let fitness = this.quality(population);
            let selectedPopulation = this.tournamentSelection(population, fitness);
            let crossoverPopulation = this.crossover(selectedPopulation);
            let mutationPopulation = this.mutation(crossoverPopulation);
            population = this.healingSolution(mutationPopulation);
            //population = this.elitism(selectedPopulation, newPopulation);
            fitnessInfoCurrent = this.solutionsQualitySort(population,fitness);
           if (fitnessInfoCurrent['bestQuality'] < fitnessInfoPrev['bestQuality']) 
           {
                condition = 0;
                fitnessInfoPrev['bestQuality'] = fitnessInfoCurrent['bestQuality'];
                fitnessInfoPrev['bestSolution'] = fitnessInfoCurrent['bestSolution'];
            }
            else //This is when there is not improvment in fitness in the last iterations
            {
                // condition++;
                // if (condition > itr*0.1)
                // {
                //     //console.log(i);
                //     break;
                // }
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

class fineTuning { //Grid search cross validation tuning
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
        else if (config.ans['type'] == "tuning" && config.ans['algo'] == "PSO")
        {
            this.populationSize = config.ans['gridSearch']['populationSize'];
            this.w = config.ans['gridSearch']['w'];
            this.c1 = config.ans['gridSearch']['c1'];
            this.c2 = config.ans['gridSearch']['c2'];
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

    optConfiguration(res) //Pareto-front-based
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

        //This part was added for GAPSO
        if (iniSols.length > this.numParticles)
        {
            const solForPSO = []
            for (let i = 0; i < this.numParticles; i++)
            {
                solForPSO.push(iniSols[0])
            }
            particles = solForPSO
        }
        ///////


        let qualities = this.quality(particles);

        let pBest = particles;
        let gBest = particles[qualities.indexOf(Math.min(...qualities))];
        let velocities = this.initialVelocity();

        // let bestQ = 0;
        // let counter = 0;

        for (let i = 0; i < itr; i++)
        {
            const updatedVP = this.updateVelocityPosition(particles, velocities, pBest, gBest)
            const updatedBests = this.updatepBestgBest(pBest, gBest, particles);
            pBest = updatedBests['pBest']; 
            gBest = updatedBests['gBest'];
            velocities = updatedVP['velocities'];
            particles = updatedVP['positions'];

            // const r = this.solutionsQualitySort(particles,this.quality(this.mapIntoInteger(particles)))
            // if (bestQ > r['bestQuality'])
            // {
            //     bestQ = r['bestQuality']
            //     counter = 0;
            // }
            // else
            // {
            //     counter++;
            //     if (counter > itr*0.1)
            //     {
            //         break;
            //     }
            // }
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

    PSOGA() //The last population obtained by PSO is considered as the initial population for GA.
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

    GAPSO() //The last population obtained by GA is considered as the initial population for PSO.
    {
        const GA = new geneticAlgorithm(this.config)
        const PSO = new particleSwarmOptimization(this.config)
        const startTime = performance.now();
        const ga = GA.run();
        const gapso = PSO.run(ga['population']); //Attention: The population numbers should be equal in both algorithms.
        const exeTime = performance.now() - startTime;

        return {servicePlacementResults: {GAPSO: this.opr.solutionAnalyser(gapso['bestParticle'])},
        runtime: exeTime,
        fitness: gapso['fitness']}

        // return {servicePlacementResults: {GA: this.opr.solutionAnalyser(ga['bestSolution']), GAPSO: this.opr.solutionAnalyser(gapso['bestParticle'])},
        //     runtime: exeTime,
        //     fitness: gapso['fitness']}
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

    //Metaheuristics
    geneticAlgorithm,
    particleSwarmOptimization,

    //Hybrid
    hybrid,
    
    //Tuning
    fineTuning,
}
