/*
 * Fault-tolerance module for ECSP-Sim.
 *
 * Simulates node (hardware) and component (software) failures over a number
 * of time slots after an initial NCO-based placement, and recovers the
 * affected components with one of the supported recovery strategies:
 *
 *   Metaheuristics: FLGA, FLPSO, FLDE, FLWOA, FLSA
 *   Hybrids:        FLPSOGA, FLGAPSO, FLRAS
 *   Learning-based: FLUDL (pretrained models with online updating)
 *   Heuristics:     FLTCA, FLRecTime, FLRelScore, FLExeTime, FLResTime
 *
 * This module is self-contained: it carries the placement model
 * (legacySolutionOperation / legacyNCO) that the fault-tolerance experiments
 * were developed with, so results are reproducible independently of the
 * placement solvers in solvers.js.
 */
const fs = require('fs');
const path = require('path');
const seedrandom = require('seedrandom');
const { performance } = require('perf_hooks');

const FAULT_TOLERANCE_ALGORITHMS = [
    'FLGA', 'FLPSO', 'FLDE', 'FLWOA', 'FLSA',
    'FLPSOGA', 'FLGAPSO', 'FLRAS',
    'FLUDL',
    'FLTCA', 'FLRecTime', 'FLRelScore', 'FLExeTime', 'FLResTime'
];

const MODELS_DIR = path.join(__dirname, 'fault-tolerance-models');
// NCO weights used to compute the initial placement before failures start
const INITIAL_PLACEMENT_WEIGHTS = path.join(MODELS_DIR, 'initial-placement-weights.txt');
// Pretrained recovery models used by FLUDL (weights_0.txt ... weights_5.txt)
const UDL_MODELS_DIR = path.join(MODELS_DIR, 'udl');
// Per-time-slot results, per-service results and updated UDL models
const RESULTS_DIR = path.join(__dirname, 'results', 'fault-tolerance');
fs.mkdirSync(path.join(RESULTS_DIR, 'per-service'), { recursive: true });
fs.mkdirSync(path.join(RESULTS_DIR, 'udl-models'), { recursive: true });

function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
}
function fixedRND(min, max, rng = seedrandom("my-fixed-seed")) 
{
    return min + rng() * (max - min);
}
function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}

// The NCO-based placement and recovery only place a component on a computing
// node with enough free memory. Fail with a clear message instead of a
// TypeError when no such node exists.
function assertFeasibleNode(nodeIndex, nodeValue, stage) {
    if (nodeIndex === -1 || nodeValue[nodeIndex][0] === -1) {
        throw new Error(
            `Fault tolerance: no computing node has enough free memory to host a component during ${stage}. ` +
            'The fault-tolerance model needs more spare capacity than the placement solvers; ' +
            'generate the use case with a lower useCase.serviceConfig.capacityPercentage (e.g. 0.2).'
        );
    }
}

class legacySolutionOperation {
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

    validation(solution) //Main one - Checking that each component are running on a user or helper belongs to them
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

    infraReliability(solution) //for fault tolerance
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

            //const reliability = []

            for (let i = s*numComponents; i < (s+1)*numComponents; i++) 
            {   const node = solution[i][3];
                
                if (node < this.helpers[0]["nodeID"])
                {
                    reliabilityTier1 *= (this.computingNodes[node-1]['characteristics']['reliabilityScore'])
                    
                    ///reliability.push(this.computingNodes[node-1]['characteristics']['reliabilityScore'])

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
                    //reliabilityHelpers += this.helpers[node-this.helpers[0]["nodeID"]]['characteristics']['reliability']
                    reliabilityHelpers *= this.helpers[node-this.helpers[0]["nodeID"]]['characteristics']['reliability']

                }
                else if (node >= this.users[0]["nodeID"])
                {
                    counterUser++;
                    //reliabilityUsers += this.users[node-this.users[0]["nodeID"]]['characteristics']['reliability']
                    reliabilityUsers *= this.users[node-this.users[0]["nodeID"]]['characteristics']['reliability']

                }
            }

            //reliabilityTier1 = 1 - reliabilityTier1;
            if (reliabilityTier1 == 0) {reliabilityTier1 = 1}

            //reliabilityTier2 = 1 - reliabilityTier2;
            if (reliabilityTier2 == 0) {reliabilityTier2 = 1}

            //reliabilityTier3 = 1 - reliabilityTier3;
            if (reliabilityTier3 == 0) {reliabilityTier3 = 1}

            if (reliabilityUsers == 0) {reliabilityUsers = 0.99; counterUser = 1;}
            //reliabilityUsers = reliabilityUsers/counterUser;

            if (reliabilityHelpers == 0) {reliabilityHelpers = 0.99; counterHelper = 1;}
            //reliabilityHelpers = reliabilityHelpers/counterHelper;

            //totalRC += (reliabilityTier1+reliabilityTier2+reliabilityTier3+reliabilityUsers+reliabilityHelpers)/5;


            // function getMedian(arr) {
            //     if (arr.length === 0) return null;
              
            //     // Sort the array
            //     const sorted = [...arr].sort((a, b) => a - b);
            //     const mid = Math.floor(sorted.length / 2);
              
            //     // If odd length, return middle element
            //     if (sorted.length % 2 !== 0) {
            //       return sorted[mid];
            //     }
              
            //     // If even length, return average of two middle elements
            //     return (sorted[mid - 1] + sorted[mid]) / 2;
            //   }
              //reliabilityTier1 =  getMedian(reliability)






           totalRC += reliabilityTier1 /*reliabilityTier2*reliabilityTier3*/*reliabilityUsers*reliabilityHelpers;
            
        }
        //console.log(totalRC/1)
        return totalRC/(solution.length/numComponents)
        //return totalRC/this.users.length//(solution.length/10)//this.users.length;
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
                for (let s = 0; s < (solution.length - (solution.length%numComponents)) / numComponents; s++) //for (let s = 0; s < this.users.length; s++)
                {
                    let RS = 1;
                    for (let i = s*numComponents; i < (s+1)*numComponents; i++)
                    {
                        RS *= this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['reliabilityScore'];
                    }
                    aveRS = aveRS + RS
                }
                aveRS = aveRS/((solution.length - (solution.length%numComponents)) / numComponents)  //this.users.length;
            }



            if (solution.length%numComponents != 0 && solution.length > numComponents)
            {
                let RS_rest = 1;
                for (let s = solution.length - (solution.length%numComponents); s < solution.length;s++)
                {
                    RS_rest *= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['reliabilityScore'];
                }
    
                
                aveRS = aveRS + RS_rest
                aveRS = aveRS/2  //this.users.length;
            }
        return aveRS;
    }

    executionTime(solution)
    {
        //exe time with waiting time
        let eT = 0 //wT
        for (let k = 0; k < solution.length; k++) //this.users.length*this.services[0].component.length
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

    //Calculate the ave available bandwidth of each compuitng node

    currentBW(solution)
    {

        function bwd(solution, dv = Array( this.copy_bw[0].length).fill(1).map(() => Array( this.copy_bw[0].length).fill(1)))
        {
            //This function calculates the dependices of a component and then calculate bandwidth devision
            const current_component = solution[solution.length - 1][1] - 1;
    
            if (current_component > 0)
            {
                let node_id = solution[solution.length - 1][3]-1
                
                for (let i = solution.length - 1 - 1, j = current_component-1; j>=0; i--, j--)
                {
                    if (this.componentConnections[j][current_component] == 1)
                    {
                        //console.log(solution[i])
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
    
        function aveBW()
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

        this.bwd(solution,this.dv)
        const bandwidth = this.aveBW()

        return bandwidth;
    }

    bwDivision(solution)
    {
        const numComponents = this.services[0]['components'].length;
        //this function counts the number of connections is done by the links
        let conn = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1));

        for (let s = 0; s < (solution.length - (solution.length%numComponents)) / numComponents; s++) //for (let s = 0; s < this.users.length; s++)
        {
            for (let i = s * this.componentConnections[0].length; i < (s + 1) * this.componentConnections[0].length; i++)
            {
                const sc_id = solution[i][1] - 1; //The SC that we want to check its dependencies.
                const cn_id = solution[i][3] - 1; //The node that SC running on it.
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
        //console.log(conn);
        return conn;
    }

    transmissionDelay(solution)
    {
        const numComponents = this.services[0]['components'].length;
        const conn = this.bwDivision(solution)
        

        let cT = 0;
        for (let s = 0; s < (solution.length - (solution.length%numComponents)) / numComponents; s++) //for (let s = 0; s < this.users.length; s++)
        {
            for (let i = s * this.componentConnections[0].length; i < (s + 1) * this.componentConnections[0].length; i++)
            {
                const ds = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['dataSize'];
                const sc_id = solution[i][1] - 1; //The SC that we want to check its dependencies.
                const cn_id = solution[i][3] - 1; //The node that SC running on it.
                for (let j = i; j < (s + 1) * this.componentConnections[0].length; j++)
                {
                    const scd_id = solution[j][1] - 1; //Dependent SC
                    if (this.componentConnections[sc_id][scd_id] != 0)
                    {
                        const cnd_id = solution[j][3] - 1; //The computin node that is running the dependent SC.
                        if (this.infraConnections[cn_id][cnd_id][0] != 0)
                        {
                            const bw = this.infraConnections[cn_id][cnd_id][0]/conn[cn_id][cnd_id];
                            cT = cT + (ds/bw + this.infraConnections[cn_id][cnd_id][1]) // datasize/bandwidth + RTT/2
                        }     
                    }
                }
            }
        }
        return cT;
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
        //const loadDifference = this.loadCalculatorOnNode(solution);

        return {
            ResponseTime,
            PlatformReliability,
            ServiceReliability,
            OverallReliabilty: PlatformReliability * ServiceReliability
            //loadDifference
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
            cpu_entropy_infrastructure: H_cpu,
            memory_entropy_tier1: tier1_memory_entropy,
            memory_entropy_tier2: tier2_memory_entropy,
            memory_entropy_tier3: tier3_memory_entropy,
            memory_entropy_infrastructure: H_memory,
            //max_cpu_entropy_tier1: max_cpu_tier1,
            //max_cpu_entropy_tier2: max_cpu_tier2,
            //max_cpu_entropy_tier3: max_cpu_tier3,
            //max_cpu_entropy_infrastructure: max_cpu_infrastructure,
            //max_memory_entropy_tier1: max_memory_tier1,
            //max_memory_entropy_tier2: max_memory_tier2,
            //max_memory_entropy_tier3: max_memory_tier3,
            //max_memory_entropy_infrastructure: max_memory_infrastructure
        };
        

        // //Classic version

        // let usedMemory = new Array(this.computingNodes.length).fill(0);
        // let usedCPU = new Array(this.computingNodes.length).fill(0);

        // for (let i = 0; i < solution.length; i++)
        // {
        //     if (solution[i][3] >= this.computingNodes.length)
        //     {
        //         solution[i][3] = this.computingNodes.length
        //     }
        //     usedMemory[solution[i][3] - 1] = usedMemory[solution[i][3] - 1] + this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['memory']
        //     usedCPU[solution[i][3] - 1] = usedCPU[solution[i][3] - 1] + this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['cpu']
        // }

        // //console.log(usedCPU)

        // //Calculate the load distribution as a fraction of node capacity
        // let capacityFractionMemory = new Array(this.computingNodes.length).fill(0);
        // let capacityFractionCPU = new Array(this.computingNodes.length).fill(0);

        // let tier1_memory_entropy = 0;
        // let tier1_cpu_entropy = 0;
        // let tier2_memory_entropy = 0;
        // let tier2_cpu_entropy = 0;
        // let tier3_memory_entropy = 0;
        // let tier3_cpu_entropy = 0;


        // for (let i = 0; i < usedCPU.length; i++)
        // {
        //     usedCPU[i] = usedCPU[i] / this.computingNodes[i]['characteristics']['cpu']
        //     usedMemory[i] = usedMemory[i] / this.computingNodes[i]['characteristics']['memory']
        // }

        // let totalCPU = 0, totalMemory = 0;
        // let totalCPUTier1 = 0, totalCPUTier2 = 0, totalCPUTier3 = 0;
        // let totalMemoryTier1 = 0, totalMemoryTier2 = 0, totalMemoryTier3 = 0;
        // for (let i = 0; i < this.computingNodes.length; i++)
        // {
        //     totalMemory = totalMemory + usedMemory[i]
        //     totalCPU = totalCPU + usedCPU[i]

        //     if (this.computingNodes[i]['nodeTier'] == 1)
        //     {
        //         totalMemoryTier1 = totalMemoryTier1 + usedMemory[i]
        //         totalCPUTier1 = totalCPUTier1 + usedCPU[i]
        //     }
        //     else if (this.computingNodes[i]['nodeTier'] == 2)
        //     {
        //         totalMemoryTier2 = totalMemoryTier2 + usedMemory[i]
        //         totalCPUTier2 = totalCPUTier2 + usedCPU[i]
        //     }
        //     else if (this.computingNodes[i]['nodeTier'] == 3)
        //     {
        //         totalMemoryTier3 = totalMemoryTier3 + usedMemory[i]
        //         totalCPUTier3 = totalCPUTier3 + usedCPU[i]
        //     }
        // }

        // //console.log(totalCPUTier1)
        // //console.log(totalCPUTier2)
        // //console.log(totalCPUTier3)


        // for (let i = 0; i < this.computingNodes.length; i++)
        // {
        //     //capacityFractionMemory[i] = usedMemory[i] / totalMemory//this.computingNodes[i]['characteristics']['memory']
        //     //capacityFractionCPU[i] = usedCPU[i] / totalCPU//this.computingNodes[i]['characteristics']['cpu']

        //     //Calculater the entropy tier by tier
            
        //         if (this.computingNodes[i]['nodeTier'] == 1)
        //         {
        //             capacityFractionMemory[i] = usedMemory[i] / totalMemoryTier1
        //             if (capacityFractionMemory[i] > 0)
        //             {
        //                 tier1_memory_entropy = tier1_memory_entropy + capacityFractionMemory[i] * Math.log2(capacityFractionMemory[i])
        //             }

        //             capacityFractionCPU[i] = usedCPU[i] / totalCPUTier1
        //             if (capacityFractionCPU[i] > 0)
        //             {
        //                 tier1_cpu_entropy = tier1_cpu_entropy + capacityFractionCPU[i] * Math.log2(capacityFractionCPU[i])
                        
        //             }
        //         }
        //         else if (this.computingNodes[i]['nodeTier'] == 2)
        //         {
        //             capacityFractionMemory[i] = usedMemory[i] / totalMemoryTier2
        //             if (capacityFractionMemory[i] > 0)
        //             {
        //                 tier2_memory_entropy = tier2_memory_entropy + capacityFractionMemory[i] * Math.log2(capacityFractionMemory[i])
        //             }

        //             capacityFractionCPU[i] = usedCPU[i] / totalCPUTier2
        //             if (capacityFractionCPU[i] > 0)
        //             {
        //                 tier2_cpu_entropy = tier2_cpu_entropy + capacityFractionCPU[i] * Math.log2(capacityFractionCPU[i])
                        
        //             }
        //         }
        //         else if (this.computingNodes[i]['nodeTier'] == 3)
        //         {
        //             capacityFractionMemory[i] = usedMemory[i] / totalMemoryTier3
        //             if (capacityFractionMemory[i] > 0)
        //             {
        //                 tier3_memory_entropy = tier3_memory_entropy + capacityFractionMemory[i] * Math.log2(capacityFractionMemory[i])
        //             }

        //             capacityFractionCPU[i] = usedCPU[i] / totalCPUTier3
        //             if (capacityFractionCPU[i] > 0)
        //             {
        //                 tier3_cpu_entropy = tier3_cpu_entropy + capacityFractionCPU[i] * Math.log2(capacityFractionCPU[i])

        //             }
        //         }
        // }


        


        // //Calculate entropy for the infrastructure
        // let H_memory = 0
        // let H_cpu = 0

        // for (let i = 0; i < capacityFractionMemory.length; i++)
        // {
        //     capacityFractionMemory[i] = usedMemory[i] / totalMemory;
        //     capacityFractionCPU[i] = usedCPU[i] / totalCPU;
        //     {
        //         if (capacityFractionMemory[i] > 0)
        //         {
        //             H_memory = H_memory + capacityFractionMemory[i] * Math.log2(capacityFractionMemory[i])
        //         }
        //         if (capacityFractionCPU[i] > 0)
        //         {

        //             H_cpu = H_cpu + (capacityFractionCPU[i]) * Math.log2(capacityFractionCPU[i])
        //         }
        //     }
        // }


        // tier1_memory_entropy = -(tier1_memory_entropy)
        // tier1_cpu_entropy = -(tier1_cpu_entropy)

        // tier2_memory_entropy = -(tier2_memory_entropy)
        // tier2_cpu_entropy = -(tier2_cpu_entropy)

        // tier3_memory_entropy = -(tier3_memory_entropy)
        // tier3_cpu_entropy = -(tier3_cpu_entropy)

        // H_memory = -(H_memory)
        // H_cpu = -(H_cpu)









        // //Maximum entropy
        // let max_cpu_infrastructure = Math.log2(this.computingNodes.length)
        // let max_memory_infrastructure = Math.log2(this.computingNodes.length)

        // let num_tier1 = 0, num_tier2 = 0, num_tier3 = 0;
        // for (let i = 0; i < this.computingNodes.length;i++)
        // {
        //     if (this.computingNodes[i]['nodeTier'] == "1")
        //     {
        //         num_tier1++;
        //     }
        //     else if (this.computingNodes[i]['nodeTier'] == "2")
        //     {
        //         num_tier2++;
        //     }
        //     else if (this.computingNodes[i]['nodeTier'] == "3")
        //     {
        //         num_tier3++;
        //     }
        // }

        // let max_cpu_tier1 = Math.log2(num_tier1)
        // let max_memory_tier1 = Math.log2(num_tier1)

        // let max_cpu_tier2 = Math.log2(num_tier2)
        // let max_memory_tier2 = Math.log2(num_tier2)

        // let max_cpu_tier3 = Math.log2(num_tier3)
        // let max_memory_tier3 = Math.log2(num_tier3)



        // return {
        //     cpu_entropy_tier1: tier1_cpu_entropy,
        //     memory_entropy_tier1: tier1_memory_entropy,
        //     cpu_entropy_tier2: tier2_cpu_entropy,
        //     memory_entropy_tier2: tier2_memory_entropy,
        //     cpu_entropy_tier3: tier3_cpu_entropy,
        //     memory_entropy_tier3: tier3_memory_entropy,
        //     cpu_entropy_infrastructure: H_cpu,
        //     memory_entropy_infrastructure: H_memory,

        //     max_cpu_entropy_tier1: max_cpu_tier1,
        //     max_memory_entropy_tier1: max_memory_tier1,

        //     max_cpu_entropy_tier2: max_cpu_tier2,
        //     max_memory_entropy_tier2: max_memory_tier2,

        //     max_cpu_entropy_tier3: max_cpu_tier3,
        //     max_memory_entropy_tier3: max_memory_tier3,

        //     max_cpu_entropy_infrastructure: max_cpu_infrastructure,
        //     max_memory_entropy_infrastructure: max_memory_infrastructure

        // };
    }

    solutionAnalyser(solution)
    {
        const cost = this.calculateAll(solution)
        const loadOnTiers = this.loadCalculator(solution)
        const entropy = this.entropyCalculator(solution)
        const configCost = this.configurationTime(solution)
        //const loadOnNodes = this.loadCalculatorOnNode(solution)['loadNodes']
        //const balancingResults = this.calculateLBR(loadOnNodes)
        //const failureCostAnalysis = this.worstFailureScenario(loadOnNodes) //Homogenous reconfiguration cost

        
        return {
            //fitness: this.quality([solution]),
            totalResponseTime: cost['ResponseTime'],//this.users.length,
            aveResponseTime: cost['ResponseTime']/this.users.length,
            platformReliability: cost['PlatformReliability'],
            serviceReliability: cost['ServiceReliability'],
            loadTier1: loadOnTiers['tier1'],
            loadTier2: loadOnTiers['tier2'],
            loadTier3: loadOnTiers['tier3'],
            loadTierHelper: loadOnTiers['helperTier'],
            loadTierUser: loadOnTiers['userTier'],
            //loadDifference: cost['loadDifference']['loadDifference'],
            entropyAnalysis: entropy,
            //loadBalancingAnalysis: balancingResults,
            //failureCostAnalysis: failureCostAnalysis
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
        //console.log(listLosts)

        return listLosts;
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

    perServiceAnalysis(solution, file_path = "file_name")
    {
        const numComponents = (this.services[0]['components']).length
        const numServices = this.users.length

        const result = [];
        const chunkSize = Math.ceil(solution.length / numServices);

        for (let i = 0; i < solution.length; i += chunkSize) 
        {
            result.push(solution.slice(i, i + chunkSize));
        }

        //Response time per service
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
        let filePath = path.join(RESULTS_DIR, 'per-service', `rt_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_resTime, 'utf8');

        //Reliability per service
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
        filePath = path.join(RESULTS_DIR, 'per-service', `platRel_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_platRel, 'utf8');
        filePath = path.join(RESULTS_DIR, 'per-service', `serRel_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_serRel, 'utf8');
        filePath = path.join(RESULTS_DIR, 'per-service', `overallRel_${file_path}.csv`);
        fs.writeFileSync(filePath, csvData_overallRel, 'utf8');
        return {
            resTimePerService: csvData_resTime,
            platReliability: csvData_platRel,
            servReliability: csvData_serRel,
            //overallReliability: csvData_overallRel
        }
    }

    initialMaxRT() 
    {
        const sys = JSON.parse(JSON.stringify(this.ans));
        const lP = new legacyTaskContinuationAffinity(sys);
        const soLP = lP.run();
        return soLP['servicePlacementResults']['totalResponseTime'];
    }
}

class legacyTaskContinuationAffinity extends legacySolutionOperation {
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
        }

        //Add for new evaluations
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

class legacyNCO extends legacySolutionOperation {
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


        this.min = 0//-2;
        this.max = 1//2;
        this.CHlenght = 16; // = 8 if the function is linear, = 18 if it is for fault tolerance //With balancer = 18 //Witout balancer = 16  **********************
        this.model = "nonlinear-power"; // nonlinear-power, nonlinear-sigmoid, nonlinear-leakyRelu, nonlinear-tanh, linear, ft models (M1(55), M2(165), M3(116), M4(127), M5(296), M6(68)) (ft_model_two_layers (116), ft_model_one_layer1,2 (60,165), ft_model_three_layer1,2 (127,180))
        this.dv = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1))
        this.copy_bw = JSON.parse(JSON.stringify(this.infraConnections))
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
        //This function calculates the dependices of a component and then calculate bandwidth devision
        const current_component = solution[solution.length - 1][1] - 1;

        if (current_component > 0)
        {
            let node_id = solution[solution.length - 1][3]-1
            
            for (let i = solution.length - 1 - 1, j = current_component-1; j>=0; i--, j--)
            {
                if (this.componentConnections[j][current_component] == 1)
                {
                    //console.log(solution[i])
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
            // ft_model_one_layer (3 neurons)
            const f9 = 0//version.imageSize/10
            const f10 = 0//version.installingTime/5
            // Inputs packed in an array
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
            // ft_model_one_layer (10 neurons)
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            // Inputs packed in an array
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
            // Inputs packed in an array
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
            // ft_model_three_layers
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
            // Inputs packed in an array
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
            // ft_model_three_layers
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
        // Precompute normalized factors based on weights and characteristics    
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
                //this.sig = 0.5; // For mutation
                // Calculate the weighted score

                let ver_value = (w[0] * f1 ** w[8] + w[1] * f2 ** w[9] + w[2] * f3 ** w[10] +
                    w[3] * f4 ** w[11] + w[4] * f5 ** w[12] + w[5] * f6 ** w[13] +
                    w[6] * f7 ** w[14] + w[7] * f8 * w[15]);
                    return ver_value;
        }
        // else if (model_type == 0)
        // {
        //     this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        // }
        else if (model_type == 0) //M1
        {
            return this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // // ft_model_one_layer (3 neurons)
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H = 5;     // hidden neurons
            // let t = 0;       // index into weight vector w

            // // ----- First layer: 10 -> H -----
            // const hidden = new Array(H);
            // for (let j = 0; j < H; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];   // W1[j,i]
            // }
            // hidden[j] = s//Math.max(0, s);  // ReLU
            // }

            // // ----- Second layer: H -> 1 -----
            // let ver_value = 0;
            // for (let j = 0; j < H; j++) {
            // ver_value += w[t++] * hidden[j];   // W2[0,j]
            // }

            // return ver_value
        }
        else if (model_type == 1) //M2
        {
            return this.model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // // ft_model_one_layer (10 neurons)
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H = 15;     // hidden neurons
            // let t = 0;       // index into weight vector w

            // // ----- First layer: 10 -> H -----
            // const hidden = new Array(H);
            // for (let j = 0; j < H; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];   // W1[j,i]
            // }
            // hidden[j] = s//Math.max(0, s);  // ReLU
            // }

            // // ----- Second layer: H -> 1 -----
            // let ver_value = 0;
            // for (let j = 0; j < H; j++) {
            // ver_value += w[t++] * hidden[j];   // W2[0,j]
            // }

            // return ver_value
        } 
        else if (model_type == 2) //M3
        {
            return this.model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        //     const f9 = version.imageSize/10
        //     const f10 = version.installingTime/5
        //     // Inputs packed in an array
        //     const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

        //     const H1 = 8;   // hidden layer 1 size
        //     const H2 = 4;   // hidden layer 2 size
        //     let t = 0;      // index into flat weight vector w

        //     // ----- Layer 1: 10 -> H1 -----
        //     const h1 = new Array(H1);
        //     for (let j = 0; j < H1; j++) {
        //     let s = 0;
        //     for (let i = 0; i < 10; i++) {
        //         s += w[t++] * f[i];            // W1[j,i]
        //     }
        //     h1[j] = s; // Math.max(0, s) for ReLU
        //     }

        //     // ----- Layer 2: H1 -> H2 -----
        //     const h2 = new Array(H2);
        //     for (let k = 0; k < H2; k++) {
        //     let s = 0;
        //     for (let j = 0; j < H1; j++) {
        //         s += w[t++] * h1[j];           // W2[k,j]
        //     }
        //     h2[k] = s; // Math.max(0, s) for ReLU
        //     }

        //     // ----- Output: H2 -> 1 -----
        //     let ver_value = 0;
        //     for (let k = 0; k < H2; k++) {
        //     ver_value += w[t++] * h2[k];     // W3[0,k]
        //     }

        //     return ver_value;
        }
        else if (model_type == 3) //M4
        {
            return this.model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // // ft_model_three_layers
            // const f9  = version.imageSize / 10;
            // const f10 = version.installingTime / 5;
            // const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H1 = 8;   // hidden layer 1 size
            // const H2 = 4;   // hidden layer 2 size
            // const H3 = 3;   // hidden layer 3 size (new)

            // let t = 0;      // index into flat weight vector w

            // // ----- Layer 1: 10 -> H1 -----
            // const h1 = new Array(H1);
            // for (let j = 0; j < H1; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];           // W1[j,i]
            // }
            // h1[j] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 2: H1 -> H2 -----
            // const h2 = new Array(H2);
            // for (let k = 0; k < H2; k++) {
            // let s = 0;
            // for (let j = 0; j < H1; j++) {
            //     s += w[t++] * h1[j];          // W2[k,j]
            // }
            // h2[k] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 3: H2 -> H3 (NEW) -----
            // const h3 = new Array(H3);
            // for (let m = 0; m < H3; m++) {
            // let s = 0;
            // for (let k = 0; k < H2; k++) {
            //     s += w[t++] * h2[k];          // W3[m,k]
            // }
            // h3[m] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Output: H3 -> 1 -----
            // let ver_value = 0;
            // for (let m = 0; m < H3; m++) {
            // ver_value += w[t++] * h3[m];    // W4[0,m]
            // }

            // return ver_value

        } 
        else if (model_type == 4) //M5
        {
            return this.model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H1 = 16;   // hidden layer 1 size
            // const H2 = 8;   // hidden layer 2 size
            // let t = 0;      // index into flat weight vector w

            // // ----- Layer 1: 10 -> H1 -----
            // const h1 = new Array(H1);
            // for (let j = 0; j < H1; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];            // W1[j,i]
            // }
            // h1[j] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 2: H1 -> H2 -----
            // const h2 = new Array(H2);
            // for (let k = 0; k < H2; k++) {
            // let s = 0;
            // for (let j = 0; j < H1; j++) {
            //     s += w[t++] * h1[j];           // W2[k,j]
            // }
            // h2[k] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Output: H2 -> 1 -----
            // let ver_value = 0;
            // for (let k = 0; k < H2; k++) {
            // ver_value += w[t++] * h2[k];     // W3[0,k]
            // }

            // return ver_value;
        }
        else if (model_type == 5) //M5
        {
            return this.model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }      
    }

    formula(bandwidth, node, version, w, maxMemory, maxCPU) //Without load balancer********************
    {
        // Precompute normalized factors based on weights and characteristics    
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
                //this.sig = 0.5; // For mutation
                // Calculate the weighted score

                let ver_value = (w[0] * f1 ** w[8] + w[1] * f2 ** w[9] + w[2] * f3 ** w[10] +
                    w[3] * f4 ** w[11] + w[4] * f5 ** w[12] + w[5] * f6 ** w[13] +
                    w[6] * f7 ** w[14] + w[7] * f8 * w[15]);
                    return ver_value;
        }

        // if (this.model === "nonlinear-power")
        // {
        //     //this.sig = 0.5; // For mutation
        //     // Calculate the weighted score
        //     let ver_value = (w[0] * f1 ** w[7] + w[1] * f2 ** w[8] + w[2] * f3 ** w[9] +
        //         w[3] * f4 ** w[10] + w[4] * f5 ** w[11] + w[5] * f6 ** w[12] +
        //         w[6] * f7 ** w[13]);
        //         return ver_value;
        // }
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
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H1 = 8;   // hidden layer 1 size
            // const H2 = 4;   // hidden layer 2 size
            // let t = 0;      // index into flat weight vector w

            // // ----- Layer 1: 10 -> H1 -----
            // const h1 = new Array(H1);
            // for (let j = 0; j < H1; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];            // W1[j,i]
            // }
            // h1[j] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 2: H1 -> H2 -----
            // const h2 = new Array(H2);
            // for (let k = 0; k < H2; k++) {
            // let s = 0;
            // for (let j = 0; j < H1; j++) {
            //     s += w[t++] * h1[j];           // W2[k,j]
            // }
            // h2[k] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Output: H2 -> 1 -----
            // let ver_value = 0;
            // for (let k = 0; k < H2; k++) {
            // ver_value += w[t++] * h2[k];     // W3[0,k]
            // }

            // return ver_value;
        }
        else if (this.model == "M1") //M1
        {

            return this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H = 5;     // hidden neurons
            // let t = 0;       // index into weight vector w

            // // ----- First layer: 10 -> H -----
            // const hidden = new Array(H);
            // for (let j = 0; j < H; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];   // W1[j,i]
            // }
            // hidden[j] = s//Math.max(0, s);  // ReLU
            // }

            // // ----- Second layer: H -> 1 -----
            // let ver_value = 0;
            // for (let j = 0; j < H; j++) {
            // ver_value += w[t++] * hidden[j];   // W2[0,j]
            // }

            // return ver_value
        }
        else if (this.model == "M2") //M2 
        {
            return this.model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H = 15;     // hidden neurons
            // let t = 0;       // index into weight vector w

            // // ----- First layer: 10 -> H -----
            // const hidden = new Array(H);
            // for (let j = 0; j < H; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];   // W1[j,i]
            // }
            // hidden[j] = s//Math.max(0, s);  // ReLU
            // }

            // // ----- Second layer: H -> 1 -----
            // let ver_value = 0;
            // for (let j = 0; j < H; j++) {
            // ver_value += w[t++] * hidden[j];   // W2[0,j]
            // }

            // return ver_value
        }
        else if (this.model == "ft_model_three_layer2")
        {
            // Inputs (f1..f8 already defined above)
            const f9  = version.imageSize / 10;
            const f10 = version.installingTime / 5;
            const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // --- Sizes ---
            const H1 = 4;  // hidden layer 1
            const H2 = 8;  // hidden layer 2
            const H3 = 12;  // NEW: hidden layer 3 (pick what you like)

            let t = 0;     // index into flat weight vector w

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

            // ----- Layer 3: H2 -> H3 -----
            const h3 = new Array(H3);
            for (let m = 0; m < H3; m++) {
            let s = 0;
            for (let k = 0; k < H2; k++) {
                s += w[t++] * h2[k];           // W3[m,k]
            }
            h3[m] = s; // Math.max(0, s) for ReLU
            }

            // ----- Output: H3 -> 1 -----
            let ver_value = 0;
            for (let m = 0; m < H3; m++) {
            ver_value += w[t++] * h3[m];     // W4[0,m]
            }

            return ver_value;


        }
        else if (this.model == "M4") //M4
        {
            return this.model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // // Inputs (f1..f8 already defined above)
            // const f9  = version.imageSize / 10;
            // const f10 = version.installingTime / 5;
            // const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // // --- Sizes ---
            // const H1 = 8;  // hidden layer 1
            // const H2 = 4;  // hidden layer 2
            // const H3 = 3;  // NEW: hidden layer 3 (pick what you like)

            // let t = 0;     // index into flat weight vector w

            // // ----- Layer 1: 10 -> H1 -----
            // const h1 = new Array(H1);
            // for (let j = 0; j < H1; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];            // W1[j,i]
            // }
            // h1[j] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 2: H1 -> H2 -----
            // const h2 = new Array(H2);
            // for (let k = 0; k < H2; k++) {
            // let s = 0;
            // for (let j = 0; j < H1; j++) {
            //     s += w[t++] * h1[j];           // W2[k,j]
            // }
            // h2[k] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 3: H2 -> H3 -----
            // const h3 = new Array(H3);
            // for (let m = 0; m < H3; m++) {
            // let s = 0;
            // for (let k = 0; k < H2; k++) {
            //     s += w[t++] * h2[k];           // W3[m,k]
            // }
            // h3[m] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Output: H3 -> 1 -----
            // let ver_value = 0;
            // for (let m = 0; m < H3; m++) {
            // ver_value += w[t++] * h3[m];     // W4[0,m]
            // }

            // return ver_value;


        }
        else if (this.model == "M5") //M5
        {
            return this.model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
            // const f9 = version.imageSize/10
            // const f10 = version.installingTime/5
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H1 = 16;   // hidden layer 1 size
            // const H2 = 8;   // hidden layer 2 size
            // let t = 0;      // index into flat weight vector w

            // // ----- Layer 1: 10 -> H1 -----
            // const h1 = new Array(H1);
            // for (let j = 0; j < H1; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];            // W1[j,i]
            // }
            // h1[j] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 2: H1 -> H2 -----
            // const h2 = new Array(H2);
            // for (let k = 0; k < H2; k++) {
            // let s = 0;
            // for (let j = 0; j < H1; j++) {
            //     s += w[t++] * h1[j];           // W2[k,j]
            // }
            // h2[k] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Output: H2 -> 1 -----
            // let ver_value = 0;
            // for (let k = 0; k < H2; k++) {
            // ver_value += w[t++] * h2[k];     // W3[0,k]
            // }

            // return ver_value;


        }
        else if (this.model == "M6") //M6
        {
            return this.model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        
        else if (this.model == "ft_model")
        {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5

            //let ver_value = (w[0] * f1 + w[1] * f2 + w[2] * f3 + w[3] * f4 + w[4] * f5 + w[5] * f6 + w[6] * f7 + w[7] * f8 + w[8] * f9 + w[9] * f10);
            //return ver_value
            //console.log(f10)

            // let ver_value = (w[0] * f1 ** w[8] + w[1] * f2 ** w[9] + w[2] * f3 ** w[10] +
            //         w[3] * f4 ** w[11] + w[4] * f5 ** w[12] + w[5] * f6 ** w[13] +
            //         w[6] * f7 ** w[14] + w[7] * f8 * w[15]+ w[8] * f9 * w[16] + w[9] * f10 * w[17]);   //+ w[8] * f9 * w[16] + w[9] * f10 * w[17]
            //         return ver_value;   
                    
            // let ver_value = (w[0] * f1 ** w[1] + w[2] * f2 ** w[3] + w[4] * f3 ** w[5] +
            //         w[6] * f4 ** w[7] + w[8] * f5 ** w[9] + w[10] * f6 ** w[11] +
            //         w[12] * f7 ** w[13] + w[14] * f8 * w[15]+ w[16] * f9 * w[17] + w[18] * f10 * w[19]);   //+ w[8] * f9 * w[16] + w[9] * f10 * w[17]
            //         return ver_value;    

//-----------------------Two layers-----------------------------------            
            // // Inputs packed in an array
            // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            // const H1 = 8;   // hidden layer 1 size
            // const H2 = 4;   // hidden layer 2 size
            // let t = 0;      // index into flat weight vector w

            // // ----- Layer 1: 10 -> H1 (ReLU optional) -----
            // const h1 = new Array(H1);
            // for (let j = 0; j < H1; j++) {
            // let s = 0;
            // for (let i = 0; i < 10; i++) {
            //     s += w[t++] * f[i];            // W1[j,i]
            // }
            // h1[j] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Layer 2: H1 -> H2 (ReLU optional) -----
            // const h2 = new Array(H2);
            // for (let k = 0; k < H2; k++) {
            // let s = 0;
            // for (let j = 0; j < H1; j++) {
            //     s += w[t++] * h1[j];           // W2[k,j]
            // }
            // h2[k] = s; // Math.max(0, s) for ReLU
            // }

            // // ----- Output: H2 -> 1 (linear) -----
            // let ver_value = 0;
            // for (let k = 0; k < H2; k++) {
            // ver_value += w[t++] * h2[k];     // W3[0,k]
            // }

            // return ver_value;  // final output

                    

//--------------------------------------One hidden layer-------------------------------------
                    // Inputs packed in an array
                    const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

                    const H = 3;     // hidden neurons
                    let t = 0;       // index into weight vector w

                    // ----- First layer: 10 -> H (ReLU activation, no bias) -----
                    const hidden = new Array(H);
                    for (let j = 0; j < H; j++) {
                    let s = 0;
                    for (let i = 0; i < 10; i++) {
                        s += w[t++] * f[i];   // W1[j,i]
                    }
                    hidden[j] = s//Math.max(0, s);  // ReLU
                    }

                    // ----- Second layer: H -> 1 (linear output, no bias) -----
                    let ver_value = 0;
                    for (let j = 0; j < H; j++) {
                    ver_value += w[t++] * hidden[j];   // W2[0,j]
                    }

                    return ver_value

                    // ver_value is the final output






//--------------------------One hidden layer with powers-------------------------------

                    // // Inputs packed in an array
                    // const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

                    // const H = 3;     // hidden neurons
                    // let t = 0;       // index into weight vector w

                    // // ----- First layer: 10 -> H (ReLU activation, no bias) -----
                    // const hidden = new Array(H);
                    // for (let j = 0; j < H; j++) {
                    //     let s = 0;
                    //     for (let i = 0; i < 10; i++) {
                    //         const w_ij = w[t++];   // weight for input i -> hidden j
                    //         const p_ij = w[t++];   // corresponding power for input i
                    //         s += w_ij * Math.pow(f[i], p_ij);  // f[i]^p * weight
                    //     }
                    //     hidden[j] = s; // optionally: Math.max(0, s) for ReLU
                    // }

                    // // ----- Second layer: H -> 1 (linear output, no bias) -----
                    // let ver_value = 0;
                    // for (let j = 0; j < H; j++) {
                    //     ver_value += w[t++] * hidden[j];   // weight for hidden j -> output
                    // }

                    // return ver_value;



        }       
    }

    test(w) {
        // const services = readJSON(`./test/services.json`);
        // const computingNodes = readJSON(`./test/nodes.json`);
        // const helpers = readJSON(`./test/helpers.json`);
        // const users = readJSON(`./test/users.json`);
        // const componentConnections = readJSON(`./test/componentsConnections.json`);
        // const infraConnections = readJSON(`./test/infraConnections.json`);
    
        // const sysConfig = {
        //     services: services,
        //     computingNodes: computingNodes,
        //     componentConnections: componentConnections,
        //     helperNodes: helpers,
        //     usersNodes: users,
        //     infraConnections: infraConnections
        // };
    
        // const opt = new solutionOperation(sysConfig);
    
        // Precompute max values for memory and CPU once
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));
  
        // Avoid deep copy if only memory and CPU will change
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
    
                        // Check if the node has enough resources for the version
                        if (node.characteristics.memory > version.memory //&& node.characteristics.cpu > version.cpu
                           ) 
                        {
                            versionValue.push(this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU));
                            //versionValue.push(this.formula(load[cN], bandwidth[cN], node, version, w, maxMemory, maxCPU)); //With load balancer**************************
                        } 
                        else 
                        {
                            versionValue.push(-Infinity);
                        }
                    }
    
                    // Find max value and index for versionValue using reduce
                    const { max: versionMax, index: versionIndex } = versionValue.reduce(
                        (acc, val, idx) => (val > acc.max ? { max: val, index: idx } : acc),
                        { max: -Infinity, index: -1 }
                    );
    
                    node_value.push([versionIndex, versionMax]);
                }
    
                // Find the best node-value pair in node_value using reduce
                const { max: nodeMax, index: nodeIndex } = node_value.reduce(
                    (acc, val, idx) => (val[1] > acc.max ? { max: val[1], index: idx } : acc),
                    { max: -Infinity, index: -1 }
                );
                assertFeasibleNode(nodeIndex, node_value, 'the initial placement');
    
                // Add chosen solution component
                solution.push([
                    this.services[u].serviceID,
                    this.services[u].components[c].componentID,
                    this.services[u].components[c].versions[node_value[nodeIndex][0]].versionNumber,
                    computingNodesFreeCapacity[nodeIndex].nodeID
                ]);

                // //For load balancer******************************** */
                // if (this.services[u].components[c].componentID != 1 && this.services[u].components[c].componentID != 10)
                // {
                //     load[computingNodesFreeCapacity[nodeIndex].nodeID-1]++ //************ */
                // }
                

                if (solution.length > 0)
                {
                        //this.bwd_marix(this.bwd(solution, this.dv))
                        this.bwd(solution,this.dv)
                        bandwidth = this.aveBW()
                }
    
                // Update resource usage on chosen node
                const chosenVersion = this.services[u].components[c].versions[node_value[nodeIndex][0]].characteristics;
                computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
            }            
            solution = this.validation(solution);
        }

        // let computingNodesInitialCapacity = this.computingNodes.map(node => ({
        //     nodeID: node.nodeID,
        //     characteristics: { ...node.characteristics }
        // }));

        // for (let i = 0; i < 27; i++)
        // {
        //     //console.log("cpu",i,computingNodesFreeCapacity[i].characteristics.cpu, computingNodesInitialCapacity[i].characteristics.cpu,  1 - computingNodesFreeCapacity[i].characteristics.cpu/computingNodesInitialCapacity[i].characteristics.cpu)
        //     console.log("memory",i,computingNodesFreeCapacity[i].characteristics.memory, computingNodesInitialCapacity[i].characteristics.memory,  1 - computingNodesFreeCapacity[i].characteristics.memory/computingNodesInitialCapacity[i].characteristics.memory)
        // }
        
        solution = this.validation(solution);
        // solution.forEach(element => {
        //     console.log(element);
        //   });
       
        //this.costPerService(solution, "NCO")
        //console.log(this.loadCalculatorOnNode(solution))

        //this.currentBW(solution)
        //console.log(this.nodeFailureSimulator())
        //console.log(this.lostComponents(solution))

        //this.faultToleranceNCOTest()

        return {
            solution: solution, 
            servicePlacementResults: this.solutionAnalyser(solution),
            nodesFreeCapacity: computingNodesFreeCapacity,
            perServiceAnalysis: this.perServiceAnalysis(solution, "NCO-per-service")
        }
    }

    // fitness1(w)
    // {
    //     let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))

    //     let solution = [];
    //     const value = [];
    //     const numVersions = (this.services[0]['components'][0]['versions']).length;
    //     const numComponents = (this.services[0]['components']).length


    //     for (let u = 0; u < this.users.length; u++) //this.users.length
    //     {
            
    //         for (let c = 0; c < numComponents; c++) 
    //         {
    //             const node_value = [];
    //             for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++)
    //             {
    //                 const versionValue = []
    //                 const maxMemory = findMax(computingNodesFreeCapacity, "memory")
    //                 const maxCPU = findMax(computingNodesFreeCapacity, "cpu")
    //                 for (let v = 0; v < numVersions; v++)
    //                 {
    //                     if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] &&
    //                         computingNodesFreeCapacity[cN]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']) 
    //                     {                            
    //                         // const f1 = computingNodesFreeCapacity[cN]['characteristics']['memory']/maxMemory
    //                         // const f2 = computingNodesFreeCapacity[cN]['characteristics']['cpu']/maxCPU
    //                         // const f3 = computingNodesFreeCapacity[cN]['characteristics']['reliabilityScore']/1
    //                         // const f4 = this.services[u]['components'][c]['versions'][v]['characteristics']['memory']/2500
    //                         // const f5 = this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']/1100
    //                         // const f6 = this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize']/500
    //                         // const f7 = this.services[u]['components'][c]['versions'][v]['characteristics']['reliabilityScore']/1
                            
    //                         // let ver_value = (w[0]*f1**w[7] + w[1]*f2**w[8] + w[2]*f3**w[9] + w[3]*f4**w[10] + w[4]*f5**w[11] + w[5]*f6**w[12] + w[6]*f7**w[13])**2
    //                         // //ver_value = this.relu(ver_value)
    //                         // //const ver_value = w[0]*f1 + w[1]*f2 + w[2]*f3 + w[3]*f4 + w[4]*f5 + w[5]*f6 + w[6]*f7
    //                         versionValue.push(ver_value)       
    //                     }
    //                     else
    //                     {
    //                         versionValue.push(-Infinity)
    //                     }
    //                 }
    //                 let max = versionValue[0];
    //                 let index = 0;
    //                 for (let i = 0; i < versionValue.length; i++)
    //                 {
    //                     if (versionValue[i] > max)
    //                     {
    //                         max = versionValue[i];
    //                         index = i;
    //                     }
    //                 }
    //                 node_value.push([index, max]) //index is the index of version
    //             }

    //             let max = node_value[0][1];
    //             let index = 0;
    //             for (let i = 0; i < node_value.length; i++)
    //             {
    //                 if (node_value[i][1] > max)
    //                 {
    //                     max = node_value[i][1];
    //                     index = i;
    //                 }
    //             }

    //             solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][node_value[index][0]]['versionNumber'], computingNodesFreeCapacity[index]['nodeID']]);
    //             computingNodesFreeCapacity[index]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][node_value[index][0]]['characteristics']['memory'];
    //             computingNodesFreeCapacity[index]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][node_value[index][0]]['characteristics']['cpu'];
    //         }
    //     }
    //     //console.log(solution)
    //     //solution = this.healing(solution)
    //     //console.log(solution)
    //     //console.log(this.quality([solution])[0])
    //     //console.log(this.solutionAnalyser(solution))
    //     return this.quality([solution])[0]
    // }



    // resultTrain(w)
    // {
    //     let computingNodesFreeCapacity = JSON.parse(JSON.stringify(this.computingNodes))

    //     let solution = [];
    //     const value = [];
    //     const numVersions = (this.services[0]['components'][0]['versions']).length;
    //     const numComponents = (this.services[0]['components']).length


    //     for (let u = 0; u < this.users.length; u++) //this.users.length
    //     {
            
    //         for (let c = 0; c < numComponents; c++) 
    //         {
    //             const node_value = [];
    //             for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++)
    //             {
    //                 const versionValue = []
    //                 const maxMemory = findMax(computingNodesFreeCapacity, "memory")
    //                 const maxCPU = findMax(computingNodesFreeCapacity, "cpu")
    //                 for (let v = 0; v < numVersions; v++)
    //                 {
    //                     if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] &&
    //                         computingNodesFreeCapacity[cN]['characteristics']['cpu'] > this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']) 
    //                     {
    //                         const f1 = computingNodesFreeCapacity[cN]['characteristics']['memory']/maxMemory
    //                         const f2 = computingNodesFreeCapacity[cN]['characteristics']['cpu']/maxCPU
    //                         const f3 = computingNodesFreeCapacity[cN]['characteristics']['reliabilityScore']/1
    //                         const f4 = this.services[u]['components'][c]['versions'][v]['characteristics']['memory']/2500
    //                         const f5 = this.services[u]['components'][c]['versions'][v]['characteristics']['cpu']/1100
    //                         const f6 = this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize']/500
    //                         const f7 = this.services[u]['components'][c]['versions'][v]['characteristics']['reliabilityScore']/1
                            
    //                         let ver_value = (w[0]*f1**w[7] + w[1]*f2**w[8] + w[2]*f3**w[9] + w[3]*f4**w[10] + w[4]*f5**w[11] + w[5]*f6**w[12] + w[6]*f7**w[13])**2
    //                         //const ver_value = w[0]*f1 + w[1]*f2 + w[2]*f3 + w[3]*f4 + w[4]*f5 + w[5]*f6 + w[6]*f7
    //                         //ver_value = this.relu(ver_value)
    //                         versionValue.push(ver_value)       
    //                     }
    //                     else
    //                     {
    //                         versionValue.push(-Infinity)
    //                     }
    //                 }
    //                 let max = versionValue[0];
    //                 let index = 0;
    //                 for (let i = 0; i < versionValue.length; i++)
    //                 {
    //                     if (versionValue[i] > max)
    //                     {
    //                         max = versionValue[i];
    //                         index = i;
    //                     }
    //                 }
    //                 node_value.push([index, max]) //index is the index of version
    //             }

    //             let max = node_value[0][1];
    //             let index = 0;
    //             for (let i = 0; i < node_value.length; i++)
    //             {
    //                 if (node_value[i][1] > max)
    //                 {
    //                     max = node_value[i][1];
    //                     index = i;
    //                 }
    //             }

    //             solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][node_value[index][0]]['versionNumber'], computingNodesFreeCapacity[index]['nodeID']]);
    //             computingNodesFreeCapacity[index]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][node_value[index][0]]['characteristics']['memory'];
    //             computingNodesFreeCapacity[index]['characteristics']['cpu'] -= this.services[u]['components'][c]['versions'][node_value[index][0]]['characteristics']['cpu'];

                


    //         }

            
    //     }

    //     solution = this.healing(solution)
    //     console.log(this.solutionAnalyser(solution))

    // }
}

class faultTolerance extends legacyNCO {
    constructor(ans) {
        super(ans);
        this.algo = ans['algo'];
        this.flAlgo = ans['algo']; // FLGA, FLPSO, FLDE, FLWOA, FLSA, FLPSOGA, FLGAPSO, FLRAS, FLUDL, FLTCA, FLRecTime, FLRelScore, FLExeTime, FLResTime
        this.ans = ans;
        this.models = false;
        this.sigmaVec_backprob = [];

        const ft = ans['configsFT'] ?? {};
        const ga = ft['GA'] ?? {};
        const pso = ft['PSO'] ?? {};
        const de = ft['DE'] ?? {};
        const woa = ft['WOA'] ?? {};
        const sa = ft['SA'] ?? {};
        const udl = ft['UDL'] ?? {};

        // Number of failure time slots simulated after the initial placement
        this.timeSlots = Number(ft['timeSlots'] ?? 500);

        // GA settings (also used by the hybrid and heuristic recovery routines)
        this.population = ga['populationSize'];
        this.iterations = ga['iteration'];
        this.tSize = ga['selectionSize'];
        this.crossP = ga['crossoverRate'];
        this.mutationP = ga['mutationRate'];

        if (this.flAlgo == "FLPSO") {
            this.population = pso['populationSize'];
            this.iterations = pso['iteration'];
            this.w = pso['w'];
            this.c1 = pso['c1'];
            this.c2 = pso['c2'];
        }
        else if (this.flAlgo == "FLDE") {
            this.population = de['populationSize'];
            this.iterations = de['iteration'];
            this.crossoverRate = de['crossoverRate'];
            this.F = de['F'];
        }
        else if (this.flAlgo == "FLWOA") {
            this.population = woa['populationSize'];
            this.iterations = woa['iteration'];
            this.coefficient_A = woa['coefficient_A'];
            this.coefficient_C = woa['coefficient_C'];
            this.a = woa['a'];
            this.b = woa['b'];
            this.l = woa['l'];
        }
        else if (this.flAlgo == "FLSA") {
            this.terminationValue = sa['terminationValue'];
            this.population = sa['populationSize'];
            this.temperature = sa['temperature'];
            this.alpha = sa['alpha'];
            this.updatingRate = sa['updatingRate'];
            this.selectionPressure = sa['selectionPressure'];
        }
        else if (this.flAlgo == "FLPSOGA" || this.flAlgo == "FLGAPSO" || this.flAlgo == "FLRAS") {
            this.populationGA = ga['populationSize'];
            this.iterationsGA = ga['iteration'];
            this.populationPSO = pso['populationSize'];
            this.iterationsPSO = pso['iteration'];
            this.w = pso['w'];
            this.c1 = pso['c1'];
            this.c2 = pso['c2'];
            if (this.flAlgo == "FLRAS") {
                this.populationWOA = woa['populationSize'];
                this.iterationsWOA = woa['iteration'];
                this.coefficient_A = woa['coefficient_A'];
                this.coefficient_C = woa['coefficient_C'];
                this.a = woa['a'];
                this.b = woa['b'];
                this.l = woa['l'];
                this.populationDE = de['populationSize'];
                this.iterationsDE = de['iteration'];
                this.crossoverRate = de['crossoverRate'];
                this.F = de['F'];
            }
        }
        else if (this.flAlgo == "FLUDL") {
            this.num_models = Number(udl['numModels'] ?? 6);
            this.drift = String(udl['drift'] ?? true);
            this.updating_method = udl['updatingMethod'] ?? 'bp';
        }
    }

    writeToCSV(fileName, data) {
        const csvLine = data.join(',') + '\n'; // Create a CSV line (comma-separated values)
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

        // To calculate recovery time per service (affected service)
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

        // Prepare CSV content
        const sortedKeys = Object.keys(maxValues).map(Number).sort((a, b) => a - b);
        let csvContent = 'Service_ID, Recovery_time\n';

        for (const key of sortedKeys) {
        csvContent += `${key},${maxValues[key]}\n`;
        }

        // Write to CSV file
        fs.writeFile(path.join(RESULTS_DIR, 'per-service', `recTimePerService_${this.flAlgo}_${t}.csv`), csvContent, (err) => {
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
                this.writeToCSV(path.join(RESULTS_DIR, 'per-service', `${this.flAlgo}.csv`), [aveRT_alg[time]/aveRange_alg, aveOvlRel_alg[time]/aveRange_alg, aveRecTime_alg[time]/aveRange_alg]);
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
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }

    ras_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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

            for (let i = 0; i < this.populationGA; i++) //Num of population
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
                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                        //Fitness
                        let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                        //console.log(Math.min(...fitness))
        
                        //Selection
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
        
                        
        
                        //Crossover
                        let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                        let cProbability = this.crossP
                        
                        for (let i = 0; i + 1 < crossover.length; i += 2) 
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
        
                        //Mutation
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
        
                        //Healing
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
                                //Healing
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
                    
                                        //The component has already be downloaded?
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                    
                                        //Calculate reconfiguration cost
                                        const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
                    
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        
                                        //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                            //recoveryTime.push(Math.random())
                            initial_chromosomes.push(copy_solution)
                        }
                    }
                    complete_solutions = initial_chromosomes
                    failedList_solutions = initial_solutions_failedList
                }
                else if (algorithms[rnd] == 'PSO')
                {
                    //Initial velocity, pBest and gBest
                    let velocities = failedList_solutions.map(row =>
                        row.map(p => [p[0], p[1], 1, 1])
                    );

                    let pBest = JSON.parse(JSON.stringify(failedList_solutions))
                    let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
                    minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                        currVal < arr[minIdx] ? idx : minIdx, 0);

                    gBest = failedList_solutions[minIndex]
                    let gBestFitness = pBestFitness[minIndex]


                    //Main loop
                    for (let i = 0; i < this.iterationsPSO; i++) //Number of iterations
                    {

                        //Update velocity and position
                        const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                        for (let i = 0; i < velocities.length; i++)
                        {
                            for (let j = 0; j < velocities[0].length; j++)
                            {
                                velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                                velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
                
                                //Update position
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

                        //Healing
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
                                //Healing
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
                    
                                        //The component has already be downloaded?
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                    
                                        //Calculate reconfiguration cost
                                        const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                    
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        
                                        //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                    //console.log(gBestFitness)    
                }
                else if (algorithms[rnd] == 'DE')
                {
                    for(let iteration = 0; iteration < this.iterationsDE; iteration++)
                    {
                        //Fitness
                        let fitness = this.quality_fl(complete_solutions, recoveryTime)
                        //console.log(Math.min(...fitness))
        
                        //Selection
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
        
                        //mutantVector
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
                                //mutantVector[i][j][2] = mV1;
                                //mutantVector[i][j][3] = mV2;
                            }
                        }          
        
                        //Crossover
                        const trialVector = mutantVector.map((sol, i) => 
                            sol.map((component, j) => {
                                const r = Math.random();
                                if (r < this.crossoverRate) {
                                    // Crossover
                                    return [component[0], component[1], mutantVector[i][j][2], mutantVector[i][j][3]];
                                } else {
                                    // No crossover
                                    return [...component];
                                }
                            })
                        );
        
                        //Healing
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
                                //Healing
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
                    
                                        //The component has already be downloaded?
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                    
                                        //Calculate reconfiguration cost
                                        const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1
                    
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        
                                        //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                            //recoveryTime.push(Math.random())
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
        
        
                    //Main loop
                    let _a = this.a
                    let b = this.b
                    let L = this.l
                    let coefficient_C = this.coefficient_C
                    let coefficient_A = this.coefficient_A
                    for (let i = 0; i < this.iterationsWOA; i++) //Number of iterations
                    {
        
                        //Update velocity and position
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
           
        
                            //console.log(failedList_solutions)
        
                            newPosition.push(failedList_solutions[x]);
                        }
        
                        //Healing
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
                                //Healing
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
                    
                                        //The component has already be downloaded?
                                        let ReconfCalculationMode = 0
                                        for (let x = 0; x < copy_solution.length; x++)
                                        {
                                            if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                            {
                                                ReconfCalculationMode = 1;
                                                break
                                            }
                                        }
                    
                                        //Calculate reconfiguration cost
                                        const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                        const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                        const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                        const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                    
                                        const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                        const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                        
                                        //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                        const bwNode = bandwidth[nodeID]
                    
                                        if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
        
                        //console.log(gBestFitness)
                    }
                    complete_solutions = new_whales
                    failedList_solutions = copy_solutions_failedList
            
                }
            }

            let fitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = fitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            recTimeComponents += recoveryTime[minIndex]
            //failedList = this.componentFailureSimulator(complete_solutions[minIndex], t)
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)

        }

        return {
            solution: complete_solutions[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: complete_solutions[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }

    }

    gapso_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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
            //GA part
            //Initial solutions
            initial_chromosomes = []
            recoveryTime = []
            initial_solutions_failedList = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.populationGA; i++) //Num of population
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

                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                //recoveryTime.push(Math.random())
                initial_chromosomes.push(copy_solution)

            }

            //GA main loop
            for(let iteration = 0; iteration < this.iterations; iteration++)
            {
                //Fitness
                let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                //console.log(Math.min(...fitness))

                //Selection
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

                //Crossover
                let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                let cProbability = this.crossP
                
                for (let i = 0; i + 1 < crossover.length; i += 2) 
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

                //Mutation
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

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                    //recoveryTime.push(Math.random())
                    initial_chromosomes.push(copy_solution)
                }

            }

            
                let failedList_solutions = initial_solutions_failedList
                let complete_solutions = initial_chromosomes

                //Initial velocity, pBest and gBest
                let velocities = failedList_solutions.map(row =>
                    row.map(p => [p[0], p[1], 1, 1])
                );
    
                let pBest = JSON.parse(JSON.stringify(failedList_solutions))
                let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
                minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                    currVal < arr[minIdx] ? idx : minIdx, 0);
    
                let gBest = failedList_solutions[minIndex]
                let gBestFitness = pBestFitness[minIndex]
    
    
                //PSO Main loop
                for (let i = 0; i < this.iterationsPSO; i++) //Number of iterations
                {
                    //Update velocity and position
                    const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                    for (let i = 0; i < velocities.length; i++)
                    {
                        for (let j = 0; j < velocities[0].length; j++)
                        {
                            velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                            velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
            
                            //Update position
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
    
                    //Healing
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
                            //Healing
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
                
                                    //The component has already be downloaded?
                                    let ReconfCalculationMode = 0
                                    for (let x = 0; x < copy_solution.length; x++)
                                    {
                                        if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                        {
                                            ReconfCalculationMode = 1;
                                            break
                                        }
                                    }
                
                                    //Calculate reconfiguration cost
                                    const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                    const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                    const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                    const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
                
                                    const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                    const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                    
                                    //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                    const bwNode = bandwidth[nodeID]
                
                                    if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                    //console.log(gBestFitness)
                }
            
                recTimeComponents += recoveryTime[minIndex]
                //failedList = this.componentFailureSimulator(complete_solutions[minIndex], t)
                solution = complete_solutions[minIndex]
                console.log(`Component Failure Time Step... ${com}`)
        }

        return {
            solution: initial_chromosomes[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: initial_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    psoga_fl(initialState, failes, m, t, failedDuration)
    {        
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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


        for (let com = 0; com < 1; com++) //component-related time step
        {
            //PSO part
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)
            

            for (let i = 0; i < this.populationPSO; i++) //Num of population
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
                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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

            //Initial velocity, pBest and gBest
            let velocities = failedList_solutions.map(row =>
                row.map(p => [p[0], p[1], 1, 1])
            );

            let pBest = JSON.parse(JSON.stringify(failedList_solutions))
            let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            gBest = failedList_solutions[minIndex]
            let gBestFitness = pBestFitness[minIndex]


            //PSO Main loop
            for (let i = 0; i < this.iterationsPSO; i++) //Number of iterations
            {

                //Update velocity and position
                const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                for (let i = 0; i < velocities.length; i++)
                {
                    for (let j = 0; j < velocities[0].length; j++)
                    {
                        velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                        velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
        
                        //Update position
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

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                //console.log(gBestFitness)
            }

            //GA part and its main loop
            let initial_chromosomes = new_particles;
            let initial_solutions_failedList = copy_solutions_failedList


            for(let iteration = 0; iteration < this.iterationsGA; iteration++)
            {
                //console.log("GA part", initial_chromosomes)
                //Fitness
                let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                //console.log(Math.min(...fitness))

                //Selection
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


                //Crossover
                let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                let cProbability = this.crossP
                
                for (let i = 0; i + 1 < crossover.length; i += 2) 
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

                //Mutation
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

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                    //recoveryTime.push(Math.random())
                    initial_chromosomes.push(copy_solution)
                }

            }

            let fitness = this.quality_fl(initial_chromosomes, recoveryTime)

            minIndex = fitness.reduce((minIdx, val, idx, arr) =>
                val < arr[minIdx] ? idx : minIdx, 0
            );

            //console.log(fitness[minIndex])

            recTimeComponents += recoveryTime[minIndex]
            //failedList = this.componentFailureSimulator(initial_chromosomes[minIndex], t)
            solution = initial_chromosomes[minIndex]
            //console.log(`Component Failure Time Step... ${com}`)
            console.log(`Failure Time Step...`)
        }
        
        return {
            solution: solution,
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }

    }

    sa_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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


        for (let com = 0; com < 1; com++) //component-related time step
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.population; i++) //Num of population
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
                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
            while(temp > this.terminationValue)//for (let it = 0; it < 100; it++) //Number of iterations
            {
                //Neighbour solutions
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

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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

                //selection
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

                //console.log(fitness[minIndex])
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
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }

    }

    woa_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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


        for (let com = 0; com < 1; com++) //component-related time step
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.population; i++) //Num of population
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
                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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


            //Main loop
            let _a = this.a
            let b = this.b
            let L = this.l
            let coefficient_C = this.coefficient_C
            let coefficient_A = this.coefficient_A
            for (let i = 0; i < this.iterations; i++) //Number of iterations
            {

                //Update velocity and position
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
   

                    //console.log(failedList_solutions)

                    newPosition.push(failedList_solutions[x]);
                }

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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

                //console.log(gBestFitness)
            }

            recTimeComponents += recoveryTime[minIndex]
            //failedList = this.componentFailureSimulator(complete_solutions[minIndex], t)
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }
        
        return {
            solution: new_whales[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    de_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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
            //Initial solutions
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)

            for (let i = 0; i < this.population; i++) //Num of population
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                failedList_solutions.push(copy);
                //copy_computingNodesFreeCapacity = JSON.parse(JSON.stringify(computingNodesFreeCapacity))
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                for (let j = 0; j < failedList_solutions[i].length; j++)
                {
                    failedList_solutions[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    failedList_solutions[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))

                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                //recoveryTime.push(Math.random())
                complete_solutions.push(copy_solution)

            }

            for(let iteration = 0; iteration < this.iterations; iteration++)
            {

                let fitnessPrev = this.quality_fl(complete_solutions, recoveryTime)

                //Selection
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

                //mutantVector
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
                        //mutantVector[i][j][2] = mV1;
                        //mutantVector[i][j][3] = mV2;
                    }
                }          

                //Crossover
                const trialVector = mutantVector.map((sol, i) => 
                    sol.map((component, j) => {
                        const r = Math.random();
                        if (r < this.crossoverRate) {
                            // Crossover
                            return [component[0], component[1], mutantVector[i][j][2], mutantVector[i][j][3]];
                        } else {
                            // No crossover
                            return [...component];
                        }
                    })
                );

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_failedList_solutions[i][j][3] && solution[x][2] == copy_failedList_solutions[i][j][2] && solution[x][1] == copy_failedList_solutions[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_failedList_solutions[i][j][0]-1)*numComponents + (copy_failedList_solutions[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                    //recoveryTime.push(Math.random())
                    new_solutions.push(copy_solution)

                    //complete_solutions = new_solutions
                    //failedList_solutions = copy_failedList_solutions
                }

                // let fitnessNew = this.quality_fl(new_solutions, recoveryTime)

                // for(let z = 0; z < fitnessNew.length; z++)
                // {
                //     if (fitnessNew[z] < fitnessPrev[z])
                //     {
                //         complete_solutions[z] = new_solutions[z]
                //         failedList_solutions[z] = copy_failedList_solutions[z]
                //     }
                // }
            }

            
            let fitness = this.quality_fl(new_solutions, recoveryTime)
            

            minIndex = fitness.reduce((minIdx, val, idx, arr) =>
                val < arr[minIdx] ? idx : minIdx, 0
            );

            //console.log(fitness[minIndex])

            recTimeComponents += recoveryTime[minIndex]
            //failedList = this.componentFailureSimulator(new_solutions[minIndex], t)
            solution = new_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }




        // //return initial_chromosomes[minIndex]
        // console.log(this.solutionAnalyser(initial_chromosomes[minIndex])); 
        // console.log(copy_computingNodesFreeCapacity[minIndex])


        return {
            solution: new_solutions[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: failedList_solutions[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    pso_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
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

        for (let com = 0; com < 1; com++) //component-related time step
        {
            complete_solutions = []
            recoveryTime = []
            failedList_solutions = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            for (let i = 0; i < this.population; i++) //Num of population
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
                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == failedList_solutions[i][j][3] && solution[x][2] == failedList_solutions[i][j][2] && solution[x][1] == failedList_solutions[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(failedList_solutions[i][j][0]-1)*numComponents + (failedList_solutions[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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

            //Initial velocity, pBest and gBest
            let velocities = failedList_solutions.map(row =>
                row.map(p => [p[0], p[1], 1, 1])
            );

            let pBest = JSON.parse(JSON.stringify(failedList_solutions))
            let pBestFitness = this.quality_fl(complete_solutions, recoveryTime)
            minIndex = pBestFitness.reduce((minIdx, currVal, idx, arr) =>
                currVal < arr[minIdx] ? idx : minIdx, 0);

            gBest = failedList_solutions[minIndex]
            let gBestFitness = pBestFitness[minIndex]


            //Main loop
            for (let i = 0; i < this.iterations; i++) //Number of iterations
            {

                //Update velocity and position
                const w = this.w, c1 = this.c1, c2 = this.c2, r1 = Math.random(), r2 = Math.random();
                for (let i = 0; i < velocities.length; i++)
                {
                    for (let j = 0; j < velocities[0].length; j++)
                    {
                        velocities[i][j][2] = w * velocities[i][j][2] + r1 * c1 * (pBest[i][j][2] - failedList_solutions[i][j][2]) + r2 * c2 * (gBest[j][2] - failedList_solutions[i][j][2])
                        velocities[i][j][3] = w * velocities[i][j][3] + r1 * c1 * (pBest[i][j][3] - failedList_solutions[i][j][3]) + r2 * c2 * (gBest[j][3] - failedList_solutions[i][j][3])
        
                        //Update position
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

                //Healing
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
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == copy_solutions_failedList[i][j][3] && solution[x][2] == copy_solutions_failedList[i][j][2] && solution[x][1] == copy_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(copy_solutions_failedList[i][j][0]-1)*numComponents + (copy_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                //console.log(gBestFitness)
            }

            recTimeComponents += recoveryTime[minIndex]
            //failedList = this.componentFailureSimulator(complete_solutions[minIndex], t)
            solution = complete_solutions[minIndex]
            console.log(`Component Failure Time Step... ${com}`)
        }
        
        return {
            solution: new_particles[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recTimeComponents,//recoveryTime[minIndex],
            fList: copy_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    ga_fl(initialState, failes, m, t, failedDuration)
    {
        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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
    
        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //Initial solutions
        let initial_chromosomes
        let recoveryTime
        let initial_solutions_failedList
        let copy_solution
        let copy_computingNodesFreeCapacity
        let recTime
        let recTimeComponents = 0
        let minIndex

        for (let com = 0; com < 1; com++) //Number of failure intervals related to components
        {
            //Initial solutions
            initial_chromosomes = []
            recoveryTime = []
            initial_solutions_failedList = []
            copy_solution;
            copy_computingNodesFreeCapacity = []
            recTime

            const bandwidth = this.currentBW(solution)
            for (let i = 0; i < this.population; i++) //Num of population
            {
                recTime = []
                copy_solution = JSON.parse(JSON.stringify(solution))
                const copy = JSON.parse(JSON.stringify(failedList)); 
                initial_solutions_failedList.push(copy);
                //copy_computingNodesFreeCapacity = JSON.parse(JSON.stringify(computingNodesFreeCapacity))
                copy_computingNodesFreeCapacity.push(JSON.parse(JSON.stringify(computingNodesFreeCapacity))) 
                for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                {
                    initial_solutions_failedList[i][j][2] = Math.floor(getRandomValue(1, numVersions))
                    initial_solutions_failedList[i][j][3] = Math.floor(getRandomValue(1, this.computingNodes.length))

                    //Healing
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

                            //The component has already be downloaded?
                            let ReconfCalculationMode = 0
                            for (let x = 0; x < copy_solution.length; x++)
                            {
                                if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                {
                                    ReconfCalculationMode = 1;
                                    break
                                }
                            }

                            //Calculate reconfiguration cost
                            const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                            const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                            const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                            const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1

                            const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                            const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                            
                            //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                            const bwNode = bandwidth[nodeID]

                            if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                //recoveryTime.push(Math.random())
                initial_chromosomes.push(copy_solution)
            }

            for(let iteration = 0; iteration < this.iterations; iteration++)
            {
                //Fitness
                let fitness = this.quality_fl(initial_chromosomes, recoveryTime)
                //console.log(Math.min(...fitness))

                //Selection
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

                

                //Crossover
                let crossover = JSON.parse(JSON.stringify(selectedFailedList));
                let cProbability = this.crossP
                
                for (let i = 0; i + 1 < crossover.length; i += 2) 
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

                //Mutation
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

                //Healing
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
                    //const bandwidth = this.currentBW(solution)
                    for (let j = 0; j < initial_solutions_failedList[i].length; j++)
                    {
                        
                        //Healing
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
            
                                //The component has already be downloaded?
                                let ReconfCalculationMode = 0
                                for (let x = 0; x < copy_solution.length; x++)
                                {
                                    if (copy_solution[x][3] == initial_solutions_failedList[i][j][3] && solution[x][2] == initial_solutions_failedList[i][j][2] && solution[x][1] == initial_solutions_failedList[i][j][1])
                                    {
                                        ReconfCalculationMode = 1;
                                        break
                                    }
                                }
            
                                //Calculate reconfiguration cost
                                const serviceID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][0] - 1
                                const componentID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][1] - 1
                                const versionID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][2] - 1
                                const nodeID = copy_solution[(initial_solutions_failedList[i][j][0]-1)*numComponents + (initial_solutions_failedList[i][j][1]-1)][3] - 1
            
                                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                                
                                //const bandwidth = this.currentBW(solution)//This should be moved to another place to reduce the runtime
                                const bwNode = bandwidth[nodeID]
            
                                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
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
                    //recoveryTime.push(recTime.reduce((sum, val) => sum + val, 0) / recTime.length)
                    initial_chromosomes.push(copy_solution)

                }

            }

            let fitness = this.quality_fl(initial_chromosomes, recoveryTime)

            minIndex = fitness.reduce((minIdx, val, idx, arr) =>
                val < arr[minIdx] ? idx : minIdx, 0
            );

            //console.log(fitness[minIndex])

            recTimeComponents += recoveryTime[minIndex]
            //failedList = this.componentFailureSimulator(initial_chromosomes[minIndex], t)
            solution = initial_chromosomes[minIndex]
            //console.log(`Component Failure Time Step... ${com}`)
            console.log(`Failure Time Step...`)
        }




        // //return initial_chromosomes[minIndex]
        // console.log(this.solutionAnalyser(initial_chromosomes[minIndex])); 
        // console.log(copy_computingNodesFreeCapacity[minIndex])


        return {
            solution: initial_chromosomes[minIndex],
            nodesFreeCapacity: copy_computingNodesFreeCapacity[minIndex],
            failedDuration: failedDuration,
            recoveryTime: recoveryTime[minIndex],//recTimeComponents
            fList: initial_solutions_failedList[minIndex],
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    heuristics_fl(initialState, failes, m, t, failedDuration) //Also for component failures
    {
        let w;
        w = readJSON(INITIAL_PLACEMENT_WEIGHTS) //Here is for train model that will be used for fault tolerance
        const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
        const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

        const mode = m; //if 1, it make replacment of affected services
        const numVersions = this.services[0].components[0].versions.length;
        const numComponents = this.services[0].components.length;
        let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
        let solution = JSON.parse(JSON.stringify(initialState['solution']));

        const failedNodes = failes['failedNodes'] //list of nodes failed
        let failedList = failes['listLosts'] //list of components lost because of node failure (hardware)

        const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure

        // console.log("failedList",failedList)
        // console.log("failedComponents", failedComponents)
        

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
        
        //failedList.push(failedComponents)
        //console.log("failedList",failedList)
        //console.log(failedComponents[0])
        //console.log("failedComponents", failedComponents)


        // failedList.sort((a, b) => {
        //     for (let i = 0; i < a.length; i++) {
        //       if (a[i] !== b[i]) return a[i] - b[i];
        //     }
        //     return 0;
        //   });



        for(let l = 0; l < failedNodes.length; l++)
        {
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
            computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
            failedDuration[failes['failedNodes'][l]-1] = t //Keep the time step that the node is failed (we need to when we recover the node)
        }

        //Failure duration
        for (let i = 0; i < failedDuration.length;i++)
        {
            if (failedDuration[i] != 0)
            {
                const duration = t - failedDuration[i];
                const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
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
            //Replacement of affected service
            //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
            const affectedServiceList = []
            for (let i = 0; i < failes['affectedServices'].length;i++)
            {
                for (let j = 1; j < numComponents-1; j++)
                {
                    affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                }
            }

            //free the resource of affected services
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
                solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
            }
            failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
        }

        //let reconfCost = 0
        const recTime = [] //We need to consider the max of recovery time in each step so an array is considered to store the recovery times and then select the maximum value.
        let recTimeComponents = 0
        for (let com = 0; com < 1; com++) //com == 2 means that there are 2 steps (intervals) for component failures between node failure steps
        {
            
            //const cost = []

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
                                versionValue.push(v/numVersions + cN/computingNodesFreeCapacity.length) //TCA
                            }
                            else if (this.flAlgo == "FLRecTime")
                            {
                                // let ss = JSON.parse(JSON.stringify(solution));
                                // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
                                // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
                                // let rt = this.transmissionDelay(ss) + this.executionTime(ss)
                                versionValue.push(version.imageSize/bandwidth[cN] + version.installingTime) //Recovery time-aware
                            }
                            else if (this.flAlgo == "FLResTime")
                            {
                                let ss = JSON.parse(JSON.stringify(solution));
                                ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
                                ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
                                versionValue.push(this.transmissionDelay(ss) + this.executionTime(ss))  //Response time aware
                            }
                            else if (this.flAlgo == "FLRelScore")
                            {                                
                                // let ss = JSON.parse(JSON.stringify(solution));
                                // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
                                // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
                                // let rt = this.transmissionDelay(ss) + this.executionTime(ss)
                                versionValue.push(-version.reliabilityScore * node.characteristics.reliabilityScore) //Overall Reliability
                            }
                            else if (this.flAlgo == "FLExeTime")
                            {
                                //                                 let ss = JSON.parse(JSON.stringify(solution));
                                // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
                                // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
                                // let rt = this.transmissionDelay(ss) + this.executionTime(ss)
                                // versionValue.push(version.cpu/node.characteristics.cpu) //Minimum execution time
                                
                                //versionValue.push(version.cpu/node.characteristics.cpu*100 / Math.random()) //Random

                                function randomArray(n, min, max) 
                                {
                                    const arr = new Array(n);
                                    for (let i = 0; i < n; i++) {
                                        arr[i] = min + Math.random() * (max - min);
                                    }
                                    return arr;
                                }

                                //versionValue.push(-this.formula(bandwidth[cN], node, version, randomArray(w.length,0,1), maxMemory, maxCPU));

                                versionValue.push(-this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU)); //NCO-based
                            }
                            //versionValue.push(version.cpu/node.characteristics.cpu) //1. Minimum execution time
                            //versionValue.push(-version.reliabilityScore * node.characteristics.reliabilityScore) //2. Overall Reliability
                            //versionValue.push(version.dataSize/bandwidth[cN]) //3. Bandwidth-aware
                            //versionValue.push(v/numVersions + cN/computingNodesFreeCapacity.length) //4. TCA
                            //versionValue.push(version.imageSize/bandwidth[cN] + version.installingTime) //5. Recovery time-aware
                            //versionValue.push(version.cpu/node.characteristics.cpu*100 / Math.random()) //Random


                            // let ss = JSON.parse(JSON.stringify(solution));
                            // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
                            // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
                            // versionValue.push(this.transmissionDelay(ss) + this.executionTime(ss))
                            //versionValue.push(this.transmissionDelay(ss)+ version.cpu/node.characteristics.cpu) //+ version.cpu/node.characteristics.cpu


                            //versionValue.push(-this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU)); //NCO-based
                        }
                        else 
                        {
                            versionValue.push(Infinity);
                        }
                    }

                    // Find min value and index for versionValue using reduce
                    const { min: versionMin, index: versionIndex } = versionValue.reduce(
                        (acc, val, idx) => (val < acc.min ? { min: val, index: idx } : acc),
                        { min: Infinity, index: -1 }
                    );
        
                    node_value.push([versionIndex, versionMin]);
                }
                
                // Find the best node-value pair in node_value using reduce
                const { min: nodeMin, index: nodeIndex } = node_value.reduce(
                    (acc, val, idx) => (val[1] < acc.min ? { min: val[1], index: idx } : acc),
                    { min: Infinity, index: -1 }
                );
                assertFeasibleNode(nodeIndex, node_value, 'failure recovery');

                

                //The component has already be downloaded?
                let ReconfCalculationMode = 0
                for (let x = 0; x < solution.length; x++)
                {
                    if (solution[x][3] == computingNodesFreeCapacity[nodeIndex].nodeID && solution[x][2] == node_value[nodeIndex][0]+1 && solution[x][1] == failedList[i][1])
                    {
                        ReconfCalculationMode = 1;
                        //break
                    }
                }

                solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = computingNodesFreeCapacity[nodeIndex].nodeID
                solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = node_value[nodeIndex][0]+1

                //Calculate reconfiguration cost
                const serviceID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][0] - 1
                const componentID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][1] - 1
                const versionID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] - 1
                const nodeID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] - 1

                const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                const bwNode = bandwidth[nodeID]

                if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
                {
                    recTime.push(imgSize/bwNode + imgInstalling)
                    //reconfCost += imgSize/bwNode + imgInstalling
                    //cost.push([serviceID + 1, componentID + 1, imgSize/bwNode + imgInstalling]) //Store recovery time of each service component
                }
                else if (ReconfCalculationMode == 1)
                {
                    recTime.push(imgInstalling)
                    //reconfCost += imgInstalling
                    //cost.push([serviceID + 1, componentID + 1, imgInstalling]) //Store recovery time of each service component
                }

                // Update resource usage on chosen node
                const chosenVersion = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[node_value[nodeIndex][0]].characteristics;
                computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
            }

            //failedList = this.componentFailureSimulator(solution, t)
            
            recTimeComponents += Math.max(...recTime)
            //recTimeComponents += recTime.reduce((sum, val) => sum + val, 0) / recTime.length//Math.max(...recTime)
            console.log(`Component Failure Time Step... ${com}`)



        }

        return {solution: solution,
            nodesFreeCapacity: computingNodesFreeCapacity,
            failedDuration: failedDuration,
            //numberOfFailures: numberOfFailures,
            recoveryTime: recTimeComponents,//Math.max(...recTime),//reconfCost
            fList: failedList,
            recTime: recTime,
            aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }
    }

    oneStepBackprop(F, wOld, realCost, predictedCost, arch, lr) 
    {
        
        if (!Array.isArray(F) || !Array.isArray(wOld) || !Array.isArray(arch)) {
            throw new Error("F, wOld, and arch must be arrays.");
        }
        if (arch.length < 2) throw new Error("arch must have at least 2 layers, e.g. [9,1].");
        if (F.length !== arch[0]) throw new Error(`F length (${F.length}) must equal arch[0] (${arch[0]}).`);

        let needed = 0;
        for (let l = 0; l < arch.length - 1; l++) needed += arch[l + 1] * arch[l];
        if (wOld.length !== needed) {
            throw new Error(`wOld length (${wOld.length}) does not match needed weights (${needed}) for arch=${JSON.stringify(arch)}.`);
        }

        const wNew = wOld.slice();

        // offsets
        const offsets = new Array(arch.length - 1);
        {
            let off = 0;
            for (let l = 0; l < arch.length - 1; l++) {
            offsets[l] = off;
            off += arch[l + 1] * arch[l];
            }
        }

        // forward (using wOld)
        const a = new Array(arch.length);
        a[0] = F.slice();

        for (let l = 0; l < arch.length - 1; l++) {
            const inDim = arch[l];
            const outDim = arch[l + 1];
            const Woff = offsets[l];

            const out = new Array(outDim).fill(0);
            for (let j = 0; j < outDim; j++) {
            let s = 0;
            const rowBase = Woff + j * inDim;
            for (let i = 0; i < inDim; i++) {
                s += wOld[rowBase + i] * a[l][i];
            }
            out[j] = s; // linear
            }
            a[l + 1] = out;
        }

        const yHat = a[arch.length - 1][0];

        // optional debug check
        // if (typeof predictedCost === "number" && Math.abs(predictedCost - yHat) > 1e-6) {
        //   console.warn("predictedCost differs from forward(yHat). Using forward(yHat) for backprop.");
        // }

        const err = yHat - realCost;
        // backward (deltas)
        const delta = new Array(arch.length);
        delta[arch.length - 1] = [err];

        for (let l = arch.length - 2; l >= 1; l--) {
            const curDim = arch[l];
            const nextDim = arch[l + 1];
            const Woff = offsets[l];

            const d = new Array(curDim).fill(0);
            for (let j = 0; j < curDim; j++) {
            let s = 0;
            for (let k = 0; k < nextDim; k++) {
                const wIdx = Woff + k * curDim + j; // W[k,j]
                s += wOld[wIdx] * delta[l + 1][k];
            }
            d[j] = s; // linear derivative
            }
            delta[l] = d;
        }

        // update into wNew
        for (let l = 0; l < arch.length - 1; l++) {
            const inDim = arch[l];
            const outDim = arch[l + 1];
            const Woff = offsets[l];

            for (let j = 0; j < outDim; j++) {
            const rowBase = Woff + j * inDim;
            const dj = delta[l + 1][j];
            for (let i = 0; i < inDim; i++) {
                const grad = dj * a[l][i];
                wNew[rowBase + i] -= lr * grad;   // ✅ wNew (not wNew/wNew typo)
            }
            }
        }

        return wNew;
    }

    udl_fl(freeCN, sol, failes, m, t, duration, model_id, w)
    {

            //let w = [];
            //w = readJSON(`${model_type}Models/weights_${model_id}.txt`) //Here is for train model that will be used for fault tolerance

            const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
            const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

            const mode = m; //if 1, it make replacment of affected services
            const numVersions = this.services[0].components[0].versions.length;
            const numComponents = this.services[0].components.length;

            let computingNodesFreeCapacity
            let solution
            let failedDuration


            computingNodesFreeCapacity = JSON.parse(JSON.stringify(freeCN));
            solution = JSON.parse(JSON.stringify(sol));
            failedDuration = JSON.parse(JSON.stringify(duration)) 


            const failedNodes = failes['failedNodes'] //list of nodes failed
            let failedList = failes['listLosts'] //list of components lost

            const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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

            //Failure duration
            //console.log("model_id", model_id)
            //console.log(failedDuration)
            for (let i = 0; i < failedDuration.length;i++)
            {
                if (failedDuration[i] != 0)
                {
                    const duration = t - failedDuration[i];
                    const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
                    
                    if (duration >= reCovTime) 
                    {
                        failedDuration[i] = 0;
                        computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                        //console.log("model_id", model_id)
                        //initialState['nodesFreeCapacity'][i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                    }
                }
            }
            
            //console.log(failedDuration)
            //console.log(computingNodesFreeCapacity)

            //Mode 1
            if (mode == 1)
            {
                //Replacement of affected service
                //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
                const affectedServiceList = []
                for (let i = 0; i < failes['affectedServices'].length;i++)
                {
                    for (let j = 1; j < numComponents-1; j++)
                    {
                        affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                    }
                }

                //free the resource of affected services
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
                    solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
                }
                failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
            }


            //let reconfCost = 0
            const recTime = [] //We need to consider the max of recovery time in each step so an array is considered to store the recovery times and then select the maximum value.
            let recTimeComponents = 0
            for (let com = 0; com < 1; com++) //com == 2 means that there are 2 steps (intervals) for component failures between node failure steps
            {
                //const cost = []

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

                            if (node.characteristics.memory > version.memory && node.characteristics.cpu > version.cpu
                            ) 
                            {
                                if (this.flAlgo == "FLUDL")
                                {                          
                                    versionValue.push(-this.ft_formula(bandwidth[cN], node, version, w, maxMemory, maxCPU, model_id)); //NCO-based
                                }
                            }
                            else 
                            {
                                versionValue.push(Infinity);
                            }
                        }

                        // Find min value and index for versionValue using reduce
                        const { min: versionMin, index: versionIndex } = versionValue.reduce(
                            (acc, val, idx) => (val < acc.min ? { min: val, index: idx } : acc),
                            { min: Infinity, index: -1 }
                        );
            
                        node_value.push([versionIndex, versionMin]);
                    }
                    
                    // Find the best node-value pair in node_value using reduce
                    const { min: nodeMin, index: nodeIndex } = node_value.reduce(
                        (acc, val, idx) => (val[1] < acc.min ? { min: val[1], index: idx } : acc),
                        { min: Infinity, index: -1 }
                    );
                    assertFeasibleNode(nodeIndex, node_value, 'failure recovery');

                    //The component has already be downloaded?
                    let ReconfCalculationMode = 0
                    for (let x = 0; x < solution.length; x++)
                    {
                        
                        if (solution[x][3] == computingNodesFreeCapacity[nodeIndex].nodeID && solution[x][2] == node_value[nodeIndex][0]+1 && solution[x][1] == failedList[i][1])
                        {
                            ReconfCalculationMode = 1;
                            //break
                        }
                    }

                    solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = computingNodesFreeCapacity[nodeIndex].nodeID
                    solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = node_value[nodeIndex][0]+1

                    //Calculate reconfiguration cost
                    const serviceID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][0] - 1
                    const componentID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][1] - 1
                    const versionID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] - 1
                    const nodeID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] - 1

                    const imgSize = 0//this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                    const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                    const bwNode = bandwidth[nodeID]

                    if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
                    {
                        recTime.push(imgSize/bwNode + imgInstalling)
                        //reconfCost += imgSize/bwNode + imgInstalling
                        //cost.push([serviceID + 1, componentID + 1, imgSize/bwNode + imgInstalling]) //Store recovery time of each service component
                    }
                    else if (ReconfCalculationMode == 1)
                    {
                        recTime.push(imgInstalling)
                        //reconfCost += imgInstalling
                        //cost.push([serviceID + 1, componentID + 1, imgInstalling]) //Store recovery time of each service component
                    }

                    // Update resource usage on chosen node
                    const chosenVersion = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[node_value[nodeIndex][0]].characteristics;
                    computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                    //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;

                }
                //failedList = this.componentFailureSimulator(solution, t)
                //recTimeComponents += recTime.reduce((sum, val) => sum + val, 0) / recTime.length;//Math.max(...recTime)
                recTimeComponents += Math.max(...recTime)
                //console.log(`Component Failure Time Step... ${com}`)
                
            }
        
            return {solution: solution,
                //initialSolution: initialState['solution'],
                nodesFreeCapacity: computingNodesFreeCapacity,
                //initialNodeFreeCapacity: initialState['nodesFreeCapacity'],
                failedDuration: failedDuration,
                //numberOfFailures: numberOfFailures,
                recoveryTime: recTimeComponents,//Math.max(...recTime),//reconfCost
                fList: failedList,
                recTime: recTime,
                aveRecPerSer: this.recoveryTimeStats(failedList, recTime)
        }        
    }

    udl_fl_backprob(freeCN, sol, failes, m, t, duration, model_id, w)
    {

            //let w = [];
            //w = readJSON(`${model_type}Models/weights_${model_id}.txt`) //Here is for train model that will be used for fault tolerance

            const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
            const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

            const mode = m; //if 1, it make replacment of affected services
            const numVersions = this.services[0].components[0].versions.length;
            const numComponents = this.services[0].components.length;

            let computingNodesFreeCapacity
            let solution
            let failedDuration

            let wOld = JSON.parse(JSON.stringify(w))


            computingNodesFreeCapacity = JSON.parse(JSON.stringify(freeCN));
            solution = JSON.parse(JSON.stringify(sol));
            failedDuration = JSON.parse(JSON.stringify(duration)) 


            const failedNodes = failes['failedNodes'] //list of nodes failed
            let failedList = failes['listLosts'] //list of components lost

            const failedComponents = this.componentFailureSimulator(solution, t) //list of components lost because of software failure       

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

            //Failure duration
            //console.log("model_id", model_id)
            //console.log(failedDuration)
            for (let i = 0; i < failedDuration.length;i++)
            {
                if (failedDuration[i] != 0)
                {
                    const duration = t - failedDuration[i];
                    const reCovTime = 1//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
                    
                    if (duration >= reCovTime) 
                    {
                        failedDuration[i] = 0;
                        computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                        //console.log("model_id", model_id)
                        //initialState['nodesFreeCapacity'][i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
                    }
                }
            }
            
            //console.log(failedDuration)
            //console.log(computingNodesFreeCapacity)

            //Mode 1
            if (mode == 1)
            {
                //Replacement of affected service
                //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
                const affectedServiceList = []
                for (let i = 0; i < failes['affectedServices'].length;i++)
                {
                    for (let j = 1; j < numComponents-1; j++)
                    {
                        affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
                    }
                }

                //free the resource of affected services
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
                    solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
                }
                failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
            }


            //let reconfCost = 0
            const recTime = [] //We need to consider the max of recovery time in each step so an array is considered to store the recovery times and then select the maximum value.
            let recTimeComponents = 0
            for (let com = 0; com < 1; com++) //com == 2 means that there are 2 steps (intervals) for component failures between node failure steps
            {
                //const cost = []

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

                            if (node.characteristics.memory > version.memory && node.characteristics.cpu > version.cpu
                            ) 
                            {
                                if (this.flAlgo == "FLUDL")
                                {                          
                                    versionValue.push(-this.ft_formula(bandwidth[cN], node, version, w, maxMemory, maxCPU, model_id)); //NCO-based
                                }
                            }
                            else 
                            {
                                versionValue.push(Infinity);
                            }
                        }

                        // Find min value and index for versionValue using reduce
                        const { min: versionMin, index: versionIndex } = versionValue.reduce(
                            (acc, val, idx) => (val < acc.min ? { min: val, index: idx } : acc),
                            { min: Infinity, index: -1 }
                        );
            
                        node_value.push([versionIndex, versionMin]);
                    }
                    
                    // Find the best node-value pair in node_value using reduce
                    const { min: nodeMin, index: nodeIndex } = node_value.reduce(
                        (acc, val, idx) => (val[1] < acc.min ? { min: val[1], index: idx } : acc),
                        { min: Infinity, index: -1 }
                    );
                    assertFeasibleNode(nodeIndex, node_value, 'failure recovery');

                    //For backpropagation
                    const verID = node_value[nodeIndex][0]
                    const versionInfo = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[verID].characteristics
                    const nodeInfo = computingNodesFreeCapacity[nodeIndex]

                    const f1 = nodeInfo.characteristics.memory / maxMemory;
                    const f2 = nodeInfo.characteristics.cpu / maxCPU;
                    const f3 = nodeInfo.characteristics.reliabilityScore;
                    const f4 = versionInfo.memory / 2500
                    const f5 = versionInfo.cpu / 1100
                    const f6 = versionInfo.dataSize / 10
                    const f7 = versionInfo.reliabilityScore;
                    let f8;
                    if (bandwidth == undefined)
                    {
                        f8 = 1
                    }
                    else
                    {
                        f8 = bandwidth[nodeIndex]/10000
                    }
                    const f9 = versionInfo.imageSize/10
                    const f10 = versionInfo.installingTime/5
                    const F = [f1,f2,f3,f4,f5,f6,f7,f8,f9,f10]

                    const realCost = node_value[nodeIndex][1]
                    let arch

                    if (model_id == 0) //M1
                    {
                        arch = [10,5,1]
                    }
                    else if (model_id == 1) //M2
                    {
                        arch = [10,15,1]
                    }
                    else if (model_id == 2) //M3
                    {
                        arch = [10,8,4,1]
                    }
                    else if (model_id == 3) //M4
                    {
                        arch = [10,8,4,3,1]
                    }
                    else if (model_id == 4) //M5
                    {
                        arch = [10,16,8,1]
                    }
                    else if (model_id == 5) //M6
                    {
                        arch = [10,2,4,8,1]
                    }

                    const predictedCost = 1
                    const lr = 0.0003

                    function perturbFeatures(F, noiseScale = 0.01) 
                    {
                        return F.map(v => v + noiseScale * (Math.random() * 2 - 1));
                    }

                    // let wNew
                    // for (let e = 0; e < 5; e++) 
                    // {
                    //     const Fp = perturbFeatures(F, 0.02);  // 2% noise
                    //     wNew = this.oneStepBackprop(F, wNew, realCost, predictedCost, arch, lr);
                    // }


                    let wNew
                    wNew = this.oneStepBackprop(F, wOld, realCost, predictedCost, arch, lr)
                    for (let e = 0; e < 5; e++)
                    {
                        const Fp = perturbFeatures(F, 0.2);  // % noise
                        wNew = JSON.parse(JSON.stringify(this.oneStepBackprop(Fp, wNew, realCost, predictedCost, arch, lr)))
                    }


                    wOld = JSON.parse(JSON.stringify(wNew))


                    // // //The component has already be downloaded?
                    // // let ReconfCalculationMode = 0
                    // // for (let x = 0; x < solution.length; x++)
                    // // {
                        
                    // //     if (solution[x][3] == computingNodesFreeCapacity[nodeIndex].nodeID && solution[x][2] == node_value[nodeIndex][0]+1 && solution[x][1] == failedList[i][1])
                    // //     {
                    // //         ReconfCalculationMode = 1;
                    // //         //break
                    // //     }
                    // // }

                    // // solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = computingNodesFreeCapacity[nodeIndex].nodeID
                    // // solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = node_value[nodeIndex][0]+1

                    // // //Calculate reconfiguration cost
                    // // const serviceID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][0] - 1
                    // // const componentID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][1] - 1
                    // // const versionID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] - 1
                    // // const nodeID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] - 1

                    // // const imgSize = 0//this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
                    // // const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
                    // // const bwNode = bandwidth[nodeID]

                    // // if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
                    // // {
                    // //     recTime.push(imgSize/bwNode + imgInstalling)
                    // //     //reconfCost += imgSize/bwNode + imgInstalling
                    // //     //cost.push([serviceID + 1, componentID + 1, imgSize/bwNode + imgInstalling]) //Store recovery time of each service component
                    // // }
                    // // else if (ReconfCalculationMode == 1)
                    // // {
                    // //     recTime.push(imgInstalling)
                    // //     //reconfCost += imgInstalling
                    // //     //cost.push([serviceID + 1, componentID + 1, imgInstalling]) //Store recovery time of each service component
                    // // }

                    // // // Update resource usage on chosen node
                    // // const chosenVersion = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[node_value[nodeIndex][0]].characteristics;
                    // // computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
                    // // //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;

                }
                //failedList = this.componentFailureSimulator(solution, t)
                //recTimeComponents += recTime.reduce((sum, val) => sum + val, 0) / recTime.length;//Math.max(...recTime)
                // // // recTimeComponents += Math.max(...recTime)
                //console.log(`Component Failure Time Step... ${com}`)
                
            }

            return wOld
        
            // return {// //solution: solution,
            //     //initialSolution: initialState['solution'],
            //     // // nodesFreeCapacity: computingNodesFreeCapacity,
            //     //initialNodeFreeCapacity: initialState['nodesFreeCapacity'],
            //     // // failedDuration: failedDuration,
            //     //numberOfFailures: numberOfFailures,
            //     // // recoveryTime: recTimeComponents,//Math.max(...recTime),//reconfCost
            //     // // fList: failedList,
            //     // // recTime: recTime,
            //     // // aveRecPerSer: this.recoveryTimeStats(failedList, recTime),
            //     updatedModel: wOld //This is weights for the updated model
            //    }        
    }

    generateCandidates(weights, K, sigma, rand = Math.random) 
    {
        const D = weights.length;

        const epsList = [];      // store eps vectors (length ~ K/2)
        const candidates = [];   // store candidate weight arrays

        const pairs = Math.ceil(K / 2);

        for (let p = 0; p < pairs; p++) {
            const eps = this.randnVector(D, rand);
            epsList.push(eps);

            const wPlus  = this.addScaled(weights, eps, +sigma);
            const wMinus = this.addScaled(weights, eps, -sigma);

            candidates.push(wPlus, wMinus);
        }

        // if K odd, we generated 2*pairs candidates; trim to exactly K
        candidates.length = Math.min(candidates.length, K);

        return { epsList, candidates };
    }

    utilitiesFromCosts(costs) 
    {
        const n = costs.length;
        const order = this.rankIndicesByCost(costs);

        // rank[i] = 0..n-1
        const rank = new Array(n);
        for (let r = 0; r < n; r++) rank[order[r]] = r;

        // simple centered linear utilities
        // best (rank 0) -> +0.5, worst (rank n-1) -> -0.5
        const u = new Array(n);
        for (let i = 0; i < n; i++) {
            u[i] = 0.5 - rank[i] / Math.max(1, n - 1);
        }

        // center to mean 0
        const mean = u.reduce((a, b) => a + b, 0) / n;
        for (let i = 0; i < n; i++) u[i] -= mean;

        return { utilities: u, rank };
    }

    estimateGradAntithetic(weights, epsList, utilities, sigma) 
    {
        const D = weights.length;
        const grad = new Array(D).fill(0);

        const pairs = Math.min(epsList.length, Math.floor(utilities.length / 2));

        for (let p = 0; p < pairs; p++) {
            const eps = epsList[p];
            const uPlus  = utilities[2 * p];
            const uMinus = utilities[2 * p + 1];
            const coeff = (uPlus - uMinus); // key

            for (let j = 0; j < D; j++) {
            grad[j] += coeff * eps[j];
            }
        }

        // normalize (important)
        const denom = Math.max(1e-12, pairs * sigma);
        for (let j = 0; j < D; j++) grad[j] /= denom;

        return grad;
    }

    applyUpdate(weights, grad, alpha) 
    {
        const out = new Array(weights.length);
        for (let i = 0; i < weights.length; i++) {
            out[i] = weights[i] + alpha * grad[i];
        }
        return out;
    }

    rankIndicesByCost(costs) 
    {
    // returns array of indices sorted by increasing cost
    return costs
        .map((c, i) => ({ c, i }))
        .sort((a, b) => a.c - b.c)
        .map(o => o.i);
    }

    randn(rand = Math.random) 
    {
        // Standard normal N(0,1)
        let u = 0, v = 0;
        while (u === 0) u = rand(); // avoid log(0)
        while (v === 0) v = rand();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    randnVector(n, rand = Math.random) 
    {
        const eps = new Array(n);
        for (let i = 0; i < n; i++) eps[i] = this.randn(rand);
        return eps;
    }

    addScaled(base, vec, scale) 
    {
        const out = new Array(base.length);
        for (let i = 0; i < base.length; i++) out[i] = base[i] + scale * vec[i];
        return out;
    }

    ///////////////////////

    addScaledVec(base, vec, sigmaVec, sign = +1) 
    {
        const out = new Array(base.length);
        for (let i = 0; i < base.length; i++) {
            out[i] = base[i] + sign * sigmaVec[i] * vec[i];
        }
        return out;
    }

    generateCandidatesDL(weights, K, sigmaVec, rand = Math.random) 
    {
        const D = weights.length;

        const epsList = [];     
        const candidates = [];

        const pairs = Math.ceil(K / 2);

        for (let p = 0; p < pairs; p++) {
            const eps = this.randnVector(D, rand);
            epsList.push(eps);

            const wPlus  = this.addScaledVec(weights, eps, sigmaVec, +1);
            const wMinus = this.addScaledVec(weights, eps, sigmaVec, -1);

            candidates.push(wPlus, wMinus);
        }

        candidates.length = Math.min(candidates.length, K);
        return { epsList, candidates };
    }

    estimateGradAntitheticDL(weights, epsList, utilities, sigmaVec) 
    {
        const D = weights.length;
        const grad = new Array(D).fill(0);

        const pairs = Math.min(epsList.length, Math.floor(utilities.length / 2));

        for (let p = 0; p < pairs; p++) {
            const eps = epsList[p];
            const uPlus  = utilities[2 * p];
            const uMinus = utilities[2 * p + 1];
            const coeff = (uPlus - uMinus); // antithetic

            for (let j = 0; j < D; j++) {
                grad[j] += coeff * eps[j];
            }
        }

        // normalize: average over pairs AND divide per-dimension by sigmaVec
        const denomPairs = Math.max(1e-12, pairs);
        for (let j = 0; j < D; j++) {
            const s = Math.max(1e-12, sigmaVec[j]);
            grad[j] = (grad[j] / denomPairs) / s;
        }

        return grad;
    }

    updateSigmaVecDL(sigmaVec, grad, etaSigma, sigmaMin, sigmaMax) 
    {
        const D = sigmaVec.length;

        // importance per weight = |grad|
        let meanImp = 0;
        const imp = new Array(D);

        for (let j = 0; j < D; j++) {
            imp[j] = Math.abs(grad[j]);
            meanImp += imp[j];
        }
        meanImp /= Math.max(1, D);
        meanImp = Math.max(1e-12, meanImp);

        const out = new Array(D);
        for (let j = 0; j < D; j++) {
            // normalized importance around 1.0
            const impNorm = imp[j] / meanImp;

            // multiplicative update keeps sigma positive and stable
            const newSigma = sigmaVec[j] * Math.exp(etaSigma * (impNorm - 1));

            // clip to avoid explosion/collapse
            out[j] = Math.min(sigmaMax, Math.max(sigmaMin, newSigma));
        }

        return out;
    }











    // heuristics_fl0(initialState, failes, m, t, failedDuration) //Main
    // {
    //     let w;
    //     w = readJSON(INITIAL_PLACEMENT_WEIGHTS) //Here is for train model that will be used for fault tolerance
    //     // const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
    //     // const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

    //     const mode = m; //if 1, it make replacment of affected services
    //     const numVersions = this.services[0].components[0].versions.length;
    //     const numComponents = this.services[0].components.length;
    //     let computingNodesFreeCapacity = JSON.parse(JSON.stringify(initialState['nodesFreeCapacity']));
    //     let solution = JSON.parse(JSON.stringify(initialState['solution']));

    //     const failedNodes = failes['failedNodes'] //list of nodes failed
    //     let failedList = failes['listLosts'] //list of components lost

    //     console.log(failes)


    //     // failedList.sort((a, b) => {
    //     //     for (let i = 0; i < a.length; i++) {
    //     //       if (a[i] !== b[i]) return a[i] - b[i];
    //     //     }
    //     //     return 0;
    //     //   });



    //     for(let l = 0; l < failedNodes.length; l++)
    //     {
    //         computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['cpu'] = 0
    //         computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['memory'] = 0
    //         computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['disk'] = 0
    //         computingNodesFreeCapacity[failedNodes[l] - 1]['characteristics']['reliabilityScore'] = 0
    //         failedDuration[failes['failedNodes'][l]-1] = t //Keep the time step that the node is failed (we need to when we recover the node)
    //     }

    //     //Failure duration
    //     for (let i = 0; i < failedDuration.length;i++)
    //     {
    //         if (failedDuration[i] != 0)
    //         {
    //             const duration = t - failedDuration[i];
    //             const reCovTime = 2//getRandomValue(0, 2)//0 //If a node failed two time step ago, it will recover
    //             if (duration >= reCovTime) 
    //             {
    //                 failedDuration[i] = 0;
    //                 computingNodesFreeCapacity[i] = JSON.parse(JSON.stringify(this.computingNodes[i]));
    //             }
    //         }
    //     }

    //     //Mode 1
    //     if (mode == 1)
    //     {
    //         //Replacement of affected service
    //         //Extract the services and their components (except the first and last component because they always are runing on user and helper nodes)
    //         const affectedServiceList = []
    //         for (let i = 0; i < failes['affectedServices'].length;i++)
    //         {
    //             for (let j = 1; j < numComponents-1; j++)
    //             {
    //                 affectedServiceList.push(solution[(failes['affectedServices'][i]-1)*numComponents + j])
    //             }
    //         }

    //         //free the resource of affected services
    //         for (let i = 0; i < affectedServiceList.length; i++)
    //         {
    //             const node_id = affectedServiceList[i][3] - 1
    //             const service_id = affectedServiceList[i][0] - 1
    //             const component_id = affectedServiceList[i][1] - 1
    //             const version_id = affectedServiceList[i][2] - 1
    //             if (failedNodes.includes(node_id + 1) == false)
    //             {
    //                 const value = this.services[service_id].components[component_id].versions[version_id].characteristics;
    //                 computingNodesFreeCapacity[node_id].characteristics.memory += value.memory;
    //                 //computingNodesFreeCapacity[node_id].characteristics.cpu += value.cpu;
    //             }
    //             solution[service_id*numComponents+component_id][3] = failedNodes[0] //We change the nodes because we will update the BW
    //         }
    //         failedList = affectedServiceList //All components of the affected services are considered as failed components to replace.
    //     }

    //     //let reconfCost = 0
    //     const recTime = [] //We need to consider the max of recovery time in each step so an array is considered to store the recovery times and then select the maximum value.
    //     //const cost = []

    //     for (let i = 0; i < failedList.length; i++)
    //     {
    //         const node_value = []
    //         const bandwidth = this.currentBW(solution)

    //         for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) 
    //         {
    //             const versionValue = [];
    //             const node = computingNodesFreeCapacity[cN];
                
    //             for (let v = 0; v < numVersions; v++) 
    //             {
    //                 const version = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[v].characteristics;

    //                 if (node.characteristics.memory > version.memory //&& node.characteristics.cpu > version.cpu
    //                    ) 
    //                 {
    //                     if (this.flAlgo == "FLTCA")
    //                     {
    //                         versionValue.push(v/numVersions + cN/computingNodesFreeCapacity.length) //TCA
    //                     }
    //                     else if (this.flAlgo == "FLRecTime")
    //                     {
    //                         versionValue.push(version.imageSize/bandwidth[cN] + version.installingTime) //Recovery time-aware
    //                     }
    //                     else if (this.flAlgo == "FLResTime")
    //                     {
    //                         let ss = JSON.parse(JSON.stringify(solution));
    //                         ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
    //                         ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
    //                         versionValue.push(this.transmissionDelay(ss) + this.executionTime(ss))  //Response time aware
    //                     }
    //                     else if (this.flAlgo == "FLRelScore")
    //                     {
    //                         versionValue.push(-version.reliabilityScore * node.characteristics.reliabilityScore) //Overall Reliability
    //                     }
    //                     else if (this.flAlgo == "FLExeTime")
    //                     {
    //                         versionValue.push(version.cpu/node.characteristics.cpu) //Minimum execution time
    //                     }
    //                     //versionValue.push(version.cpu/node.characteristics.cpu) //1. Minimum execution time
    //                     //versionValue.push(-version.reliabilityScore * node.characteristics.reliabilityScore) //2. Overall Reliability
    //                     //versionValue.push(version.dataSize/bandwidth[cN]) //3. Bandwidth-aware
    //                     //versionValue.push(v/numVersions + cN/computingNodesFreeCapacity.length) //4. TCA
    //                     //versionValue.push(version.imageSize/bandwidth[cN] + version.installingTime) //5. Recovery time-aware
    //                     //versionValue.push(version.cpu/node.characteristics.cpu*100 / Math.random()) //Random


    //                     // let ss = JSON.parse(JSON.stringify(solution));
    //                     // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = cN + 1
    //                     // ss[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = v + 1
    //                     // versionValue.push(this.transmissionDelay(ss) + this.executionTime(ss))
    //                     //versionValue.push(this.transmissionDelay(ss)+ version.cpu/node.characteristics.cpu) //+ version.cpu/node.characteristics.cpu


    //                     //versionValue.push(-this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU)); //NCO-based
    //                 }
    //                 else 
    //                 {
    //                     versionValue.push(Infinity);
    //                 }
    //             }

    //             // Find min value and index for versionValue using reduce
    //             const { min: versionMin, index: versionIndex } = versionValue.reduce(
    //                 (acc, val, idx) => (val < acc.min ? { min: val, index: idx } : acc),
    //                 { min: Infinity, index: -1 }
    //             );
    
    //             node_value.push([versionIndex, versionMin]);
    //         }
            
    //         // Find the best node-value pair in node_value using reduce
    //         const { min: nodeMin, index: nodeIndex } = node_value.reduce(
    //             (acc, val, idx) => (val[1] < acc.min ? { min: val[1], index: idx } : acc),
    //             { min: Infinity, index: -1 }
    //         );

    //         //The component has already be downloaded?
    //         let ReconfCalculationMode = 0
    //         for (let x = 0; x < solution.length; x++)
    //         {
    //             if (solution[x][3] == computingNodesFreeCapacity[nodeIndex].nodeID && solution[x][2] == node_value[nodeIndex][0]+1 && solution[x][1] == failedList[i][1])
    //             {
    //                 ReconfCalculationMode = 1;
    //                 //break
    //             }
    //         }

    //         solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] = computingNodesFreeCapacity[nodeIndex].nodeID
    //         solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] = node_value[nodeIndex][0]+1

    //         //Calculate reconfiguration cost
    //         const serviceID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][0] - 1
    //         const componentID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][1] - 1
    //         const versionID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][2] - 1
    //         const nodeID = solution[(failedList[i][0]-1)*numComponents + (failedList[i][1]-1)][3] - 1

    //         const imgSize = this.services[serviceID].components[componentID].versions[versionID].characteristics.imageSize
    //         const imgInstalling = this.services[serviceID].components[componentID].versions[versionID].characteristics.installingTime
    //         const bwNode = bandwidth[nodeID]

    //         if (ReconfCalculationMode == 0) //So the image of version of the component are not already exsisted
    //         {
    //             recTime.push(imgSize/bwNode + imgInstalling)
    //             //reconfCost += imgSize/bwNode + imgInstalling
    //             //cost.push([serviceID + 1, componentID + 1, imgSize/bwNode + imgInstalling]) //Store recovery time of each service component
    //         }
    //         else if (ReconfCalculationMode == 1)
    //         {
    //             recTime.push(imgInstalling)
    //             //reconfCost += imgInstalling
    //             //cost.push([serviceID + 1, componentID + 1, imgInstalling]) //Store recovery time of each service component
    //         }

    //         // Update resource usage on chosen node
    //         const chosenVersion = this.services[failedList[i][0]-1].components[failedList[i][1]-1].versions[node_value[nodeIndex][0]].characteristics;
    //         computingNodesFreeCapacity[nodeIndex].characteristics.memory -= chosenVersion.memory;
    //         //computingNodesFreeCapacity[nodeIndex].characteristics.cpu -= chosenVersion.cpu;
    //     }

    //     return {solution: solution,
    //         nodesFreeCapacity: computingNodesFreeCapacity,
    //         failedDuration: failedDuration,
    //         //numberOfFailures: numberOfFailures,
    //         recoveryTime: Math.max(...recTime),//reconfCost
    //         fList: failedList,
    //         recTime: recTime
    //     }
    // }

    run(model_index = 0) //Test for fault tolerance
    {
        let w//, recTime_aware = 0;
        w = readJSON(INITIAL_PLACEMENT_WEIGHTS)
        let initialState = this.test(w);
        let failedDuration = Array(initialState['nodesFreeCapacity'].length).fill(0);
        let failes = this.nodeFailureSimulator(initialState['solution'], 0)

        console.log(this.solutionAnalyser(initialState['solution'])['serviceReliability'])

        const initial_solution = {
            aveResponseTime: this.solutionAnalyser(initialState['solution'])['aveResponseTime'],
            overallReliability:  this.solutionAnalyser(initialState['solution'])['platformReliability']*this.solutionAnalyser(initialState['solution'])['serviceReliability'],
            recoveryTime: 0 
        }

        const slots = this.timeSlots; //The number of time slots
        const aveRT = Array(slots).fill(0);
        const aveOvlRel = Array(slots).fill(0);
        const aveRecTime = Array(slots).fill(0);
        let results 
        const aveRange = 1 //The number of runs
        
        if (this.flAlgo == "FLGA")
        {
            //GA
            let ga
            const filePath = path.join(RESULTS_DIR, 'FLGA-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}

            for(let a = 0; a < aveRange; a++)
            {
                ga = this.ga_fl(initialState, failes, 2, 1, failedDuration)
                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    //console.log("Failure Time step... ")
                    failes = this.nodeFailureSimulator(ga['solution'], time+1)
                    ga = this.ga_fl(ga, failes, 2, time, ga['failedDuration'])
                    results = this.solutionAnalyser(ga['solution'])
                    //aveRT[time] += results['aveResponseTime']
                    //aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    //aveRecTime[time] += (ga['recoveryTime'])
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${ga['recoveryTime']},${ga['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);

                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(ga, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                }
                results = this.solutionAnalyser(ga['solution'])
                //this.save_results(ga, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(ga, aveRT, aveRange, aveOvlRel, aveRecTime, time)
            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: ga['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLPSO")
        {
            //PSO
            let pso

            const filePath = path.join(RESULTS_DIR, 'FLPSO-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}

            for(let a = 0; a < aveRange; a++)
            {
                pso = this.pso_fl(initialState, failes, 2, 1, failedDuration)

                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(pso['solution'], time+1)
                    pso = this.pso_fl(pso, failes, 2, time, pso['failedDuration'])
                    results = this.solutionAnalyser(pso['solution'])
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (pso['recoveryTime'])

                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(pso, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${pso['recoveryTime']},${pso['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                //this.save_results(pso, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(pso, aveRT, aveRange, aveOvlRel, aveRecTime)
            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: pso['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLDE")
        {
            //DE
            let de
            const filePath = path.join(RESULTS_DIR, 'FLDE-overtime.csv');
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
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (de['recoveryTime'])

                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(de, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${de['recoveryTime']},${de['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                //this.save_results(de, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(de, aveRT, aveRange, aveOvlRel, aveRecTime)
            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: de['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLWOA")
        {
            //WOA
            let woa
            const filePath = path.join(RESULTS_DIR, 'FLWOA-overtime.csv');
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
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (woa['recoveryTime'])

                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(woa, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }

                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${woa['recoveryTime']},${woa['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                //this.save_results(woa, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(woa, aveRT, aveRange, aveOvlRel, aveRecTime)
            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: woa['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLSA")
        {
            let sa
            const filePath = path.join(RESULTS_DIR, 'FLSA-overtime.csv');
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
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (sa['recoveryTime'])
                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(sa, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${sa['recoveryTime']},${sa['aveRecPerSer'].average}\n`;                   
                    fs.appendFileSync(filePath, row);
                }
                //this.save_results(sa, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(sa, aveRT, aveRange, aveOvlRel, aveRecTime)

            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: sa['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLPSOGA")
        {
            let psoga
            const filePath = path.join(RESULTS_DIR, 'FLPSOGA-overtime.csv');
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
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (psoga['recoveryTime'])
                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(psoga, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${psoga['recoveryTime']},${psoga['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                this.save_results(psoga, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(psoga, aveRT, aveRange, aveOvlRel, aveRecTime)

            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: psoga['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLGAPSO")
        {
            let gapso
            const filePath = path.join(RESULTS_DIR, 'FLGAPSO-overtime.csv');
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
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (gapso['recoveryTime'])
                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(gapso, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${gapso['recoveryTime']},${gapso['aveRecPerSer'].average}\n`;
                    fs.appendFileSync(filePath, row);
                }
                //this.save_results(gapso, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(gapso, aveRT, aveRange, aveOvlRel, aveRecTime)

            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: gapso['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLRAS")
        {
            let ras
            const filePath = path.join(RESULTS_DIR, 'FLRAS-overtime.csv');
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
                    // aveRT[time] += results['aveResponseTime']
                    // aveOvlRel[time] += (results['platformReliability'] * results['serviceReliability'])
                    // aveRecTime[time] += (ras['recoveryTime'])
                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(ras, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }
                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${ras['recoveryTime']},${ras['aveRecPerSer'].average}\n`;                    
                    fs.appendFileSync(filePath, row);
                }
                //this.save_results(ras, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }

            //this.save_results(ras, aveRT, aveRange, aveOvlRel, aveRecTime)

            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: ras['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLUDL") //With drfit
        {
            function findMinMaxAndNormalize(preResults, backpropResults, mutResults, savedResults, pre_udl, backprop_udl, mut_udl, saved_udl) 
            {
                // --- Response Time ---
                const preRTs = preResults.map(r => r.aveResponseTime);
                const backpropRTs = backpropResults.map(r => r.aveResponseTime);
                const mutRTs = mutResults.map(r => r.aveResponseTime);
                const savedRTs = savedResults.map(r => r.aveResponseTime);

                const overallMinRT = Math.min(...preRTs, ...backpropRTs, ...mutRTs, ...savedRTs);
                const overallMaxRT = Math.max(...preRTs, ...backpropRTs, ...mutRTs, ...savedRTs);

                // --- Platform Reliability ---
                const preRel = preResults.map(r => r.platformReliability * r.serviceReliability);
                const backpropRel = backpropResults.map(r => r.platformReliability * r.serviceReliability);
                const mutRel = mutResults.map(r => r.platformReliability * r.serviceReliability);
                const savedRel = mutResults.map(r => r.platformReliability * r.serviceReliability);

                const overallMinRel = Math.min(...preRel, ...backpropRel, ...mutRel, ...savedRel);
                const overallMaxRel = Math.max(...preRel, ...backpropRel, ...mutRel, ...savedRel);

                // // --- Recovery Time ---
                // const preRec = pre_udl.map(r => r.aveRecPerSer.average);
                // const rndRec = rnd_udl.map(r => r.aveRecPerSer.average);
                // const mutRec = mut_udl.map(r => r.aveRecPerSer.average);
                // const savedRec = saved_udl.map(r => r.aveRecPerSer.average);

                // // --- Max Recovery Time ---
                const preRec = pre_udl.map(r => r.aveRecPerSer.max);
                const backpropRec = backprop_udl.map(r => r.aveRecPerSer.max);
                const mutRec = mut_udl.map(r => r.aveRecPerSer.max);
                const savedRec = saved_udl.map(r => r.aveRecPerSer.max);

                const overallMinRec = Math.min(...preRec, ...backpropRec, ...mutRec, ...savedRec);
                const overallMaxRec = Math.max(...preRec, ...backpropRec, ...mutRec, ...savedRec);

                // --- Normalization helper ---
                function normalize(value, min, max) {
                    if (max === min) return 1; // avoid divide by zero, all values are same
                    return (value - min) / (max - min);
                }

                // --- Normalize arrays ---
                const normalized = {
                    responseTime: {
                        pre: preRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        backprop: backpropRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        mut: mutRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        saved: savedRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        //min: overallMinRT,
                        //max: overallMaxRT
                    },
                    overallReliability: {
                        pre: preRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        backprop: backpropRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        mut: mutRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        saved: savedRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        //min: overallMinRel,
                        //max: overallMaxRel
                    },
                    recoveryTime: {
                        pre: preRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        backprop: backpropRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        mut: mutRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        saved: savedRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        //min: overallMinRec,
                        //max: overallMaxRec
                    }
                };

                return normalized;
            }

            function compromiseScoresWeighted(normalizedValues, weights = { rt: 1, rel: 1, rec: 1 }) 
            {
                const score = { pre: [], backprop: [], mut: [], saved: [] };

                function dist(rt, rel, rec) {
                    // Weighted Euclidean distance to ideal point (0, 1, 0)
                    const wRT = weights.rt;
                    const wREL = weights.rel;
                    const wREC = weights.rec;

                    return Math.sqrt(
                    (wRT * rt) ** 2 +
                    (wREL * (1-rel)) ** 2 +
                    (wREC * rec) ** 2
                    );
                }

                const nPre = normalizedValues.responseTime.pre.length;
                const nBackprop = normalizedValues.responseTime.backprop.length;
                const nMut = normalizedValues.responseTime.mut.length;
                const nSaved = normalizedValues.responseTime.saved.length;

                for (let i = 0; i < nPre; i++) {
                    score.pre.push(dist(
                    normalizedValues.responseTime.pre[i],
                    normalizedValues.overallReliability.pre[i],
                    normalizedValues.recoveryTime.pre[i]
                    ));
                }
                for (let i = 0; i < nBackprop; i++) {
                    score.backprop.push(dist(
                    normalizedValues.responseTime.backprop[i],
                    normalizedValues.overallReliability.backprop[i],
                    normalizedValues.recoveryTime.backprop[i]
                    ));
                }
                for (let i = 0; i < nMut; i++) {
                    score.mut.push(dist(
                    normalizedValues.responseTime.mut[i],
                    normalizedValues.overallReliability.mut[i],
                    normalizedValues.recoveryTime.mut[i]
                    ));
                }
                for (let i = 0; i < nSaved; i++) {
                    score.saved.push(dist(
                    normalizedValues.responseTime.saved[i],
                    normalizedValues.overallReliability.saved[i],
                    normalizedValues.recoveryTime.saved[i]
                    ));
                }

                // pick global best (smallest distance)
                let best = { group: null, index: -1, value: Infinity };
                for (const group of ["pre", "backprop", "mut", "saved"]) {
                    for (let i = 0; i < score[group].length; i++) {
                    const v = score[group][i];
                    if (v < best.value) best = { group, index: i, value: v };
                    }
                }
                return { score, best };
            }

            const filePath = path.join(RESULTS_DIR, 'FLUDL-overtime.csv');
            if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}
            let udl
            let ga
            //const modelID = 0 //This id for evaluating the models separately. (&&&)
            let number_of_pretrained_models = this.num_models //6
            let number_of_random_models = 0;
            let number_of_mutated_models = 0;
            let number_of_saved_models = 0;
            let number_of_updated_models = this.num_models; //Using backpropagation or es
            let ws = { rt: 0.33, rel: 0.33, rec: 0.33 }; //Weights for calculating scores
            let pre_weights = [];
            let rnd_weights = [];
            let mut_weights = [];
            let saved_weights = [];
            let backprob_weights = []

            let other_used_timestep = [0,0,0,0,0,0]
            let pre_used_timestep = [0,0,0,0,0,0]

            let pre_used = [0,0,0,0,0,0]
            let other_used = [0,0,0,0,0,0]
            
            for (let mdl = 0; mdl < number_of_pretrained_models; mdl++) 
            {
                pre_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`))); // e.g., arrays of numbers
                rnd_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                mut_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                saved_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                backprob_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));

                // pre_weights.push(readJSON(`PretrainedModels/output${mdl}.txt`)); // e.g., arrays of numbers
                // rnd_weights.push(readJSON(`PretrainedModels/output${mdl}.txt`));
                // mut_weights.push(readJSON(`PretrainedModels/output${mdl}.txt`));
                // saved_weights.push(readJSON(`PretrainedModels/output${mdl}.txt`));
            }

            //console.log(backprob_weights)

            //let T = 100
            //const alpha = 0.99
            //UDL

            udl = this.udl_fl(initialState['nodesFreeCapacity'], initialState['solution'], failes, 2, 0, failedDuration, 0, pre_weights[0])
            //ga = this.ga_fl(initialState, failes, 2, 1, failedDuration)
            //console.log(ga)
            

            let aveResTime = 0, aveRel = 0, aveRecTime = 0, aveRecTimePerService = 0;
            for(let time = 1; time < slots; time++)
            {
                let pre_results = [];
                let pre_udl = [];
                let pre_score = [];

                let rnd_results = [];
                let rnd_udl = [];
                let rnd_score = [];

                let mut_results = [];
                let mut_udl = [];
                let mut_score = [];

                let saved_results = [];
                let saved_udl = [];
                let saved_score = [];

                let backpro_results = [];
                let backpro_udl = [];


                



                console.log("Node Failure Time step: ", time)
                failes = this.nodeFailureSimulator(udl['solution'], time+1)

                const freeCN = udl['nodesFreeCapacity']

                if (this.drift == "true")
                {
                    // //DRIFT
                    // //Node-level reliability/capacity drift
                    if (time == 1000 || time == 3000)
                    {
                        for (let ii = 0; ii < freeCN.length; ii++)
                        {
                            if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 1)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 6//* getRandomValue(0.5, 2)
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 6//* getRandomValue(0.5, 2)
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 2)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 1//* getRandomValue(0.5, 2)
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 1//* getRandomValue(0.5, 2)
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 3)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 0.2//* getRandomValue(0.5, 2)
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 0.2//* getRandomValue(0.5, 2)
                            }
                            
                            udl['nodesFreeCapacity'][ii]['characteristics']['cpu'] = udl['nodesFreeCapacity'][ii]['characteristics']['cpu'] //* fixedRND(0.5, 1.5)//getRandomValue(0.5, 1.5)
                            this.computingNodes[ii]['characteristics']['cpu'] =  this.computingNodes[ii]['characteristics']['cpu'] //* fixedRND(0.5, 1.5)//getRandomValue(0.5, 1.5)

                            //udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] //* getRandomValue(0.5, 2)
                            //this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] //* getRandomValue(0.5, 2)
                        }
                    }

                    if (time > 200 && time < 400)
                    {
                        for (let ii = 0; ii < freeCN.length; ii++)
                        {
                            if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 1)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 1.00899//* getRandomValue(0.5, 2)
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 1.00899//* getRandomValue(0.5, 2)
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 2)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] / 1//* getRandomValue(0.5, 2)
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] / 1//* getRandomValue(0.5, 2)
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 3)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 0.99198//* getRandomValue(0.5, 2)
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 0.99198//* getRandomValue(0.5, 2)
                            }
                            
                            udl['nodesFreeCapacity'][ii]['characteristics']['cpu'] = udl['nodesFreeCapacity'][ii]['characteristics']['cpu'] //* fixedRND(0.5, 1.5)//getRandomValue(0.5, 1.5)
                            this.computingNodes[ii]['characteristics']['cpu'] =  this.computingNodes[ii]['characteristics']['cpu'] //* fixedRND(0.5, 1.5)//getRandomValue(0.5, 1.5)

                            //udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] //* getRandomValue(0.5, 2)
                            //this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] //* getRandomValue(0.5, 2)
                        }
                    }

                    // if (time == 10)
                    // {
                    //     for (let ii = 0; ii < freeCN.length; ii++)
                    //     {
                    //         udl['nodesFreeCapacity'][ii]['characteristics']['reliabilityScore'] = 1
                    //         this.computingNodes[ii]['characteristics']['reliabilityScore'] = 1
                    //     }
                    // }
                    
                    // // //Service-level reliability/demand drift

                    if (time == 1000 || time == 3000)
                    {
                        for (let ii = 0; ii < this.services.length; ii++)
                        {
                            for (let jj = 0; jj < this.services[0]['components'].length; jj++) //Because each service has several components
                            {
                                for (let vv = 0; vv < this.services[ii]['components'][jj]['versions'].length; vv++)//Because each service has several versions
                                {

                                    //this.services[ii]['components'][jj]['versions'][vv]['characteristics']['reliabilityScore'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['reliabilityScore'] * 1.01

                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] * 3//fixedRND(0.2,2.5)//getRandomValue(0.2, 2.5)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] //* fixedRND(0.2,2.5)//getRandomValue(0.2, 2.5)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] * 0.5//fixedRND(0.2,2.5)//getRandomValue(0.2, 2.5)
                                    //this.services[ii]['components'][jj]['versions'][vv]['characteristics']['installingTime'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['installingTime'] * 0.5

                                }
                            }
                        }
                    }

                    if (time > 200 && time < 400)
                    {
                        for (let ii = 0; ii < this.services.length; ii++)
                        {
                            for (let jj = 0; jj < this.services[0]['components'].length; jj++) //Because each service has several components
                            {
                                for (let vv = 0; vv < this.services[ii]['components'][jj]['versions'].length; vv++)//Because each service has several versions
                                {
                                    //this.services[ii]['components'][jj]['versions'][vv]['characteristics']['reliabilityScore'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['reliabilityScore'] * 1.01

                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] * 1.00552// 3//fixedRND(0.2,2.5)//getRandomValue(0.2, 2.5)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] //* fixedRND(0.2,2.5)//getRandomValue(0.2, 2.5)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] * 0.99654// /0.5//fixedRND(0.2,2.5)//getRandomValue(0.2, 2.5)
                                    //this.services[ii]['components'][jj]['versions'][vv]['characteristics']['installingTime'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['installingTime'] * 0.5

                                }
                            }
                        }
                    }

                    if (time == 3000)
                    {
                        for (let ii = 0; ii < this.services.length; ii++)
                        {
                            for (let jj = 0; jj < this.services[0]['components'].length; jj++) //Because each service has several components
                            {
                                for (let vv = 0; vv < this.services[ii]['components'][jj]['versions'].length; vv++)//Because each service has several versions
                                {
                                    //this.services[ii]['components'][jj]['versions'][vv]['characteristics']['reliabilityScore'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['reliabilityScore'] * 1.01

                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] * fixedRND(0.2,1)//getRandomValue(0.2, 2.5)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] * fixedRND(0.2,1)//getRandomValue(0.2, 2.5)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] * fixedRND(0.2,1)//getRandomValue(0.2, 2.5)
                                    //this.services[ii]['components'][jj]['versions'][vv]['characteristics']['installingTime'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['installingTime'] * 0.5

                                }
                            }
                        }
                    }

                    // //Netwrok-level drift
                    // //Step drift (Sudden drift)
                    if (time == 1000 || time == 3000)
                    {
                        for (let ii = 0; ii < this.infraConnections.length; ii++)
                        {
                            for (let jj = 0; jj < this.infraConnections.length; jj++)
                            {
                                if (this.infraConnections[ii][jj][0] != 0)
                                {
                                    this.infraConnections[ii][jj][0] = this.infraConnections[ii][jj][0] * 0.5//getRandomValue(0.5, 1.5)
                                    this.infraConnections[ii][jj][1] = this.infraConnections[ii][jj][1] * 1 //getRandomValue(0.5, 1.5)
                                    this.infraConnections[ii][jj][2] = this.infraConnections[ii][jj][0]
                                }
                            }
                        }
                    }

                    if (time > 200 && time < 250)
                    {
                        for (let ii = 0; ii < this.infraConnections.length; ii++)
                        {
                            for (let jj = 0; jj < this.infraConnections.length; jj++)
                            {
                                if (this.infraConnections[ii][jj][0] != 0)
                                {
                                    this.infraConnections[ii][jj][0] = this.infraConnections[ii][jj][0] //* 0.99654// / 0.5//getRandomValue(0.5, 1.5)
                                    this.infraConnections[ii][jj][1] = this.infraConnections[ii][jj][1] * 1.0065 //*  0.99654// / 1 //getRandomValue(0.5, 1.5)
                                    this.infraConnections[ii][jj][2] = this.infraConnections[ii][jj][0]
                                }
                            }
                        }
                    }
                    // else if (time > 320 && time < 390)
                    // {
                    //     for (let ii = 0; ii < this.infraConnections.length; ii++)
                    //     {
                    //         for (let jj = 0; jj < this.infraConnections.length; jj++)
                    //         {
                    //             if (this.infraConnections[ii][jj][0] != 0)
                    //             {
                    //                 this.infraConnections[ii][jj][0] = this.infraConnections[ii][jj][0] * 1.00356//* 0.99654// / 0.5//getRandomValue(0.5, 1.5)
                    //                 this.infraConnections[ii][jj][1] = this.infraConnections[ii][jj][1] //*  0.99654// / 1 //getRandomValue(0.5, 1.5)
                    //                 this.infraConnections[ii][jj][2] = this.infraConnections[ii][jj][0]
                    //             }
                    //         }
                    //     }
                    // }

                    // //Policy and objective drift
                    if (time > 200 && time < 400)
                    {
                        ws = { rt: 0.25, rel: 0.35, rec: 0.4} //0.5 0.1 0.4 //0.25 0.35 0.4
                    }
                }



                //console.log(this.infraConnections[0].length)
                //console.log(this.services[5]['components'][0]['versions'][0]['characteristics']['reliabilityScore'])
                //console.log(this.services.length)
                //console.log(udl['nodesFreeCapacity'][2]['characteristics'])
                //console.log(this.infraConnections)
                //console.log(this.services[0]['components'])

                //kkkk = 10
                ////////////////////////////////////////////
            
                const sol = udl['solution']
                const duration = udl['failedDuration']

                //Based on pre-trained models
                for (let i = 0; i < number_of_pretrained_models; i++)
                {
                    udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, pre_weights[i])
                    pre_results.push (this.solutionAnalyser(udl['solution']))
                    pre_udl.push(udl)
                    //pre_score.push(scoreCalculator(pre_results[i], pre_udl[i]))
                    //console.log(`--------Pre-Model ${i}----------`)
                }

                //Update based on backpropagation
                if (this.updating_method == "bp")
                {
                    for (let i = 0; i < number_of_updated_models; i++)
                    {
                        backprob_weights[i] = this.udl_fl_backprob(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i]) //The model is updated using backpropagation and the weights are stored.    
                        udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i])
                        backpro_results.push(this.solutionAnalyser(udl['solution']))
                        backpro_udl.push(udl)
                        if (time > 250) {
                            ws = { rt: 0.7, rel: 0.15, rec: 0.15}
                        }
                    }
                }

                //Update based on evolution strategy
                if (this.updating_method == "es")
                {
                    for (let i = 0; i < number_of_updated_models; i++)
                    {
                        const    K = 5
                        const    sigma = 0.05
                        const    alpha_2 = 0.2
                        const    rand = Math.random // optionally pass seeded RNG

                        const { epsList, candidates } = this.generateCandidates(backprob_weights[i], K, sigma, rand);
                        const costs = new Array(candidates.length);
                        for (let can = 0; can < candidates.length; can++) 
                        {
                            udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, candidates[can])
                            let candidateCost = this.solutionAnalyser(udl['solution'])

                            const c = (0.455 * candidateCost['aveResponseTime']/0.7) - 0.45 * (candidateCost['platformReliability'] * candidateCost['serviceReliability'])/1 + 0.05 * udl['recoveryTime']/7;

                            // if (!Number.isFinite(c)) {
                            // throw new Error(`Non-finite cost at candidate ${can}: ${c}`);
                            // }
                            costs[can] = c;
                        }

                        const { utilities, rank } = this.utilitiesFromCosts(costs);
                        const grad = this.estimateGradAntithetic(backprob_weights[i], epsList, utilities, sigma);
                        const newWeights = this.applyUpdate(backprob_weights[i], grad, alpha_2);

                        // udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, pre_weights[i])
                        // const bCost = this.solutionAnalyser(udl['solution'])
                        // const baseCost = (0.33 * bCost['aveResponseTime']/0.9) + 0.33 * (bCost['platformReliability'] * bCost['serviceReliability'])/0.92 + 0.33 * udl['recoveryTime']/5;
                        
                        // let bestIdx = 0;
                        // for (let m = 1; m < costs.length; m++) if (costs[m] < costs[bestIdx]) bestIdx = m;
                        
                        backprob_weights[i] = newWeights

                        udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i])
                        backpro_results.push(this.solutionAnalyser(udl['solution']))
                        backpro_udl.push(udl)

                    }
                }

                //Update based on enhanced evolution strategy
                if (this.updating_method == "ees")
                {
                    for (let i = 0; i < number_of_updated_models; i++)
                    {
                        const K = 50;
                        const alpha_2 = 0.2;
                        const rand = Math.random;

                        // --- DL-ES hyperparameters ---
                        const sigmaInit = 0.25;  // your old scalar sigma becomes initial value
                        const etaSigma  = 0.05;  // sigma adaptation speed (start small)
                        const sigmaMin  = 1e-4;
                        const sigmaMax  = 1.0;   // adjust depending on weight scale

                        // 0) ensure sigmaVec exists for this model
                        if (!this.sigmaVec_backprob[i] || this.sigmaVec_backprob[i].length !== backprob_weights[i].length) {
                            this.sigmaVec_backprob[i] = new Array(backprob_weights[i].length).fill(sigmaInit);
                        }
                        let sigmaVec = this.sigmaVec_backprob[i];

                        // 1) generate candidates with sigmaVec (elementwise perturbation)
                        const { epsList, candidates } = this.generateCandidatesDL(backprob_weights[i], K, sigmaVec, rand);

                        // 2) evaluate candidates (same as your vanilla ES)
                        const costs = new Array(candidates.length);
                        for (let can = 0; can < candidates.length; can++)
                        {
                            udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, candidates[can]);
                            let candidateCost = this.solutionAnalyser(udl['solution']);

                            const c =
                                (0.455 * candidateCost['aveResponseTime'] / 0.7) -
                                0.45 * (candidateCost['platformReliability'] * candidateCost['serviceReliability']) / 1 +
                                0.05 * udl['recoveryTime'] / 7;

                            costs[can] = c;
                        }

                        // 3) utilities from ranking (unchanged)
                        const { utilities } = this.utilitiesFromCosts(costs);

                        // 4) gradient estimate uses sigmaVec (distributed learning)
                        const grad = this.estimateGradAntitheticDL(backprob_weights[i], epsList, utilities, sigmaVec);

                        // 5) update weights (unchanged)
                        const newWeights = this.applyUpdate(backprob_weights[i], grad, alpha_2);
                        backprob_weights[i] = newWeights;

                        // 6) update sigmaVec using |grad| as importance (new)
                        sigmaVec = this.updateSigmaVecDL(sigmaVec, grad, etaSigma, sigmaMin, sigmaMax);
                        this.sigmaVec_backprob[i] = sigmaVec;

                        // 7) evaluate updated weights (unchanged)
                        udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i]);
                        backpro_results.push(this.solutionAnalyser(udl['solution']));
                        backpro_udl.push(udl);

                        if (time % 20 === 0) {
                            const avgSigma = sigmaVec.reduce((a,b)=>a+b,0) / sigmaVec.length;
                            const minSigma = Math.min(...sigmaVec);
                            const maxSigma = Math.max(...sigmaVec);
                            //console.log(`Model ${i} sigmas: avg=${avgSigma.toFixed(4)} min=${minSigma.toFixed(4)} max=${maxSigma.toFixed(4)}`);
                        }

                    }
                }


                // //Based on random models
                // for (let i = 0; i < number_of_random_models; i++)
                // {
                //     for (let j = 0; j < rnd_weights[i].length; j++)
                //     {
                //         rnd_weights[i][j] = getRandomValue(-1,1);
                //     }

                //     udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, rnd_weights[i])
                //     rnd_results.push (this.solutionAnalyser(udl['solution']))
                //     rnd_udl.push(udl)
                //     //rnd_score.push(scoreCalculator(rnd_results[i], rnd_udl[i]))
                //     //console.log(`--------Rnd-Model ${i}----------`)
                // }

                //Based on mutated models
                for (let i = 0; i < number_of_mutated_models; i++)
                {
                    for (let j = 0; j < mut_weights[i].length; j++)
                    {
                        const r = Math.random()
                        if (r < 0.002) //Mutation rate
                        {
                            mut_weights[i][j] = getRandomValue(-1,1);
                        }
                    }

                    udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, mut_weights[i])
                    mut_results.push (this.solutionAnalyser(udl['solution']))
                    mut_udl.push(udl)
                    //mut_score.push(scoreCalculator(mut_results[i], mut_udl[i]))
                    //console.log(`--------Mut-Model ${i}----------`)
                }

                //Based on the best saved models
                for (let i = 0; i < number_of_saved_models; i++)
                {
                    udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, saved_weights[i])
                    saved_results.push (this.solutionAnalyser(udl['solution']))
                    saved_udl.push(udl)
                    //pre_score.push(scoreCalculator(pre_results[i], pre_udl[i]))
                    //console.log(`--------Pre-Model ${i}----------`)
                }

                //Select the best model (Closest to Ideal Point)
                const normalizedValues = findMinMaxAndNormalize(pre_results, backpro_results, mut_results, saved_results, pre_udl, backpro_udl, mut_udl, saved_udl)

                const theBestModel = compromiseScoresWeighted(normalizedValues, ws)

                //console.log(theBestModel)

                //console.log(theBestModel.best.group)
                if (theBestModel.best.group == 'pre')
                {
                    //console.log(`PreModel ${theBestModel.best.index} was the best...`)
                    udl = pre_udl[theBestModel.best.index]
                    pre_used[theBestModel.best.index]++;
                    pre_used_timestep[theBestModel.best.index] = time

                    // //Here is for evaluating the models separately///////////////
                    // pre_used[modelID]++; //(&&&)
                    // udl = pre_udl[modelID] //(&&&)
                    // pre_used_timestep[modelID] = time //(&&&)
                }
                else if (theBestModel.best.group == 'backprop')
                {
                    //if (theBestModel.best.index == modelID)// This is for evaluating the models separately (&&&)
                    {
                    //console.log(`RndModel ${theBestModel.best.index} was the best...`)
                    udl = backpro_udl[theBestModel.best.index]
                    //saved_weights[theBestModel.best.index] = JSON.parse(JSON.stringify(rnd_weights[theBestModel.best.index]))
                    other_used[theBestModel.best.index]++;  
                    other_used_timestep[theBestModel.best.index] = time;
                    } 
                    //else
                    //{
                    //    pre_used[modelID]++; //(&&&)
                    //    udl = pre_udl[modelID] //(&&&)
                    //    pre_used_timestep[modelID] = time //(&&&)
                    //}

                }
                else if (theBestModel.best.group == 'rnd')
                {
                    //console.log(`RndModel ${theBestModel.best.index} was the best...`)
                    udl = rnd_udl[theBestModel.best.index]
                    //saved_weights[theBestModel.best.index] = JSON.parse(JSON.stringify(rnd_weights[theBestModel.best.index]))
                    other_used[theBestModel.best.index]++;  
                    other_used_timestep[theBestModel.best.index] = time

                }
                else if (theBestModel.best.group == 'mut')
                {
                    //if (theBestModel.best.index == modelID)// This is for evaluating the models separately (&&&)
                    {
                    //console.log(`MutModel ${theBestModel.best.index} was the best...`)
                    udl = mut_udl[theBestModel.best.index]
                    
                    //if (Math.random() < T)
                    //{
                        saved_weights[theBestModel.best.index] = JSON.parse(JSON.stringify(mut_weights[theBestModel.best.index]))
                    //}
                    
                    other_used[theBestModel.best.index]++;
                    other_used_timestep[theBestModel.best.index] = time
                    }

                    //Here is also for evaluating the models separately
                    //else{ //(&&&)
                    //    pre_used[modelID]++; //(&&&)
                    //    udl = pre_udl[modelID] //(&&&)
                    //}

                }
                else if (theBestModel.best.group == 'saved')
                {
                    //console.log(`SavedModel ${theBestModel.best.index} was the best...`)
                    udl = saved_udl[theBestModel.best.index]
                    //saved_weights[theBestModel.best.index] = JSON.parse(JSON.stringify(saved_weights[theBestModel.best.index]))
                    other_used[theBestModel.best.index]++;
                    other_used_timestep[theBestModel.best.index] = time
                }


                //winner-inactivity criteria
                const alpha = 0.05
                const p_adaptive = 0.05
                const p_basic = 0.1
                const t_adaptive = Math.ceil(Math.log(alpha) / Math.log(1 - p_adaptive))
                const t_basic = Math.ceil(Math.log(alpha) / Math.log(1 - p_basic))


                for (let i = 0; i < number_of_updated_models; i++)
                {
                    if (time - other_used_timestep[i] > t_adaptive) 
                    {
                        backprob_weights[i] = JSON.parse(JSON.stringify(pre_weights[i])) 
                        other_used_timestep[i] = time
                    }
                    if (time - pre_used_timestep[i] > t_basic && time - other_used_timestep[i] < t_adaptive) 
                    {
                        pre_weights[i] = JSON.parse(JSON.stringify(backprob_weights[i])) //We should think about this
                        pre_used_timestep[i] = time
                    }

                }


                // //GA........... for comparison
                // //console.log(ga)
                // if (time > 0)
                // {
                //     ga = this.ga_fl(ga, failes, 2, time, ga['failedDuration'])
                //     udl['solution'] = ga['solution']
                // }

                // //..................

                results = this.solutionAnalyser(udl['solution'])

                //console.log("Platform", results['platformReliability'])
                //console.log("Service", results['serviceReliability'])

                //const totalFLCost = results['aveResponseTime']/0.6 + (1 - (results['platformReliability'] * results['serviceReliability'])) + udl['recoveryTime']/10
                //console.log(totalFLCost)
                const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${udl['recoveryTime']},${udl['aveRecPerSer'].average}\n`;

                fs.appendFileSync(filePath, row);

                aveResTime += results['aveResponseTime']
                aveRel += results['platformReliability'] * results['serviceReliability']
                aveRecTime += udl['recoveryTime']
                aveRecTimePerService += udl['aveRecPerSer'].average

                //console.log(-aveRel/(time) + (aveResTime/0.6)/time + (aveRecTime/5)/time)
            }

            //console.log(backprob_weights)
            //console.log(udl['aveRecPerSer'])

            //console.log(udl['nodesFreeCapacity'])

            console.log("aveResTime",aveResTime/(this.timeSlots-1))
            console.log("aveRel",aveRel/(this.timeSlots-1))
            console.log("aveRecTime",aveRecTime/(this.timeSlots-1))
            console.log("aveRecTimePerService",aveRecTimePerService/(this.timeSlots-1))
            console.log("pre_used", pre_used)
            console.log("other_used", other_used)
            console.log("pre_used_timestep", pre_used_timestep)
            console.log("other_used_timestep", other_used_timestep)
            
            //console.log(saved_weights)
            // Convert array to string (e.g., comma-separated)
            for (let i = 0; i < saved_weights.length; i++) {
                // Convert array to a string with brackets
                const content = JSON.stringify(saved_weights[i]);

                fs.writeFile(path.join(RESULTS_DIR, 'udl-models', `updated_weights_${i}.txt`), content, (err) => {
                    if (err) {
                        console.error('Error writing file:', err);
                        return;
                    }
                    //console.log(`Array saved to PretrainedModels/output${i}.txt`);
                });
            }


            return { initial_placement: initial_solution,
                     fl_results: {aveResponseTime: results['aveResponseTime'],
                     overallReliability: results['platformReliability'] * results['serviceReliability'],
                     recoveryTime: udl['recoveryTime'],
                     aveRecTimePerService: udl['aveRecPerSer'].average}
            }
        }
        else
        {
            //console.log("-----heuristics_fl-----")
            const slots_heu = this.timeSlots; //The number of time slots
            const aveRT_heu = Array(slots_heu).fill(0);
            const aveOvlRel_heu = Array(slots_heu).fill(0);
            const aveRecTime_heu = Array(slots_heu).fill(0);
            let results_heu_fl
            let heu_fl
    
            const aveRange_heu = 1 //The number of run
            for(let a = 0; a < aveRange_heu; a++) //This FOR is for averaging results in multiple times
            {
                
                const filePath = path.join(RESULTS_DIR, `${this.flAlgo}-overtime.csv`);
                if (!fs.existsSync(filePath)) {fs.writeFileSync(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer\n');}

                heu_fl = this.heuristics_fl(initialState, failes, 2, 1, failedDuration)
    
                for(let time = 0; time < slots_heu; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(heu_fl['solution'], time+1)
                    heu_fl = this.heuristics_fl(heu_fl, failes, 2, time, heu_fl['failedDuration'])
                    results_heu_fl = this.solutionAnalyser(heu_fl['solution'])
                    //this.writeToCSV("heu_fl.csv", [results_heu_fl['aveResponseTime'], results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability'], heu_fl['recoveryTime']]);
                    // aveRT_heu[time] += results_heu_fl['aveResponseTime']
                    // aveOvlRel_heu[time] += (results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability'])
                    // aveRecTime_heu[time] += (heu_fl['recoveryTime'])
                    // if (time % 25 == 0)
                    // {
                    //     this.save_results(heu_fl, aveRT, aveRange, aveOvlRel, aveRecTime, time)
                    // }

                    const row = `${results_heu_fl['aveResponseTime']},${results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability']},${heu_fl['recoveryTime']},${heu_fl['aveRecPerSer'].average}\n`;
                    fs.appendFileSync(filePath, row);

                }
                //this.save_results(heu_fl, aveRT, aveRange, aveOvlRel, aveRecTime, this.timeSlots)
            }
    
            this.perServiceAnalysis(heu_fl['solution'], `${this.flAlgo}`)
    
                        // To calculate recovery time per service (affected service)
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
                
                        // Prepare CSV content
                        const sortedKeys = Object.keys(maxValues).map(Number).sort((a, b) => a - b);
                        let csvContent = 'Service_ID, Recovery_time\n';
                
                        for (const key of sortedKeys) {
                        csvContent += `${key},${maxValues[key]}\n`;
                        }
                
                        // Write to CSV file
                        fs.writeFile(path.join(RESULTS_DIR, 'per-service', `recTimePerService_${this.flAlgo}.csv`), csvContent, (err) => {
                        if (err) {
                            console.error('Error writing CSV file:', err);
                        } else {
                            //console.log('CSV file saved as max_values.csv');
                        }
                        });
                        ///////////////////
                
                
                        for(let time = 0; time < aveRT_heu.length; time++)
                        {
                            this.writeToCSV(path.join(RESULTS_DIR, 'per-service', `${this.flAlgo}.csv`), [aveRT_heu[time]/aveRange_heu, aveOvlRel_heu[time]/aveRange_heu, aveRecTime_heu[time]/aveRange_heu]);
                        }
                
                        // console.log("Ave Response time: ",results_heu_fl['aveResponseTime'])
                        // console.log("Overall reliabiltiy: ",results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability'])
                        // console.log("Recovery time: ",heu_fl['recoveryTime'])
                        // console.log("Platform Reliability: ", results_heu_fl['platformReliability'])
                        // console.log("Service Reliability: ", results_heu_fl['serviceReliability'])
                        // //////

                        


            return { initial_placement: initial_solution,
                fl_results: {aveResponseTime: results_heu_fl['aveResponseTime'],
                             overallReliability: results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability'],
                             recoveryTime: heu_fl['recoveryTime']} 
            }
        }
    }
}

module.exports = {
    faultTolerance,
    FAULT_TOLERANCE_ALGORITHMS
};
