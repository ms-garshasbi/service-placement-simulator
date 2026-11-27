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
const INITIAL_PLACEMENT_WEIGHTS = path.join(MODELS_DIR, 'initial-placement-weights.txt');
const UDL_MODELS_DIR = path.join(MODELS_DIR, 'udl');
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

function assertFeasibleNode(nodeIndex, nodeValue, stage) {
    if (nodeIndex === -1 || nodeValue[nodeIndex][0] === -1) {
        throw new Error(
            `Fault tolerance: no computing node has enough free memory to host a component during ${stage}. ` +
            'The fault-tolerance model needs more spare capacity than the placement solvers; ' +
            'generate the use case with a lower useCase.serviceConfig.capacityPercentage (e.g. 0.2).'
        );
    }
}

function maxOrZero(values) {
    return values.length ? Math.max(...values) : 0;
}

function recoveryValue(perComponentTimes) {
    const value = new Number(maxOrZero(perComponentTimes));
    value.perComponent = perComponentTimes.slice();
    return value;
}

function perComponentTimes(value, fallback) {
    return value && Array.isArray(value.perComponent) ? value.perComponent : fallback;
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

    infraReliability(solution)
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


           totalRC += reliabilityTier1 *reliabilityUsers*reliabilityHelpers;
            
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


    currentBW(solution)
    {

        function bwd(solution, dv = Array( this.copy_bw[0].length).fill(1).map(() => Array( this.copy_bw[0].length).fill(1)))
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
                            cT = cT + (ds/bw + this.infraConnections[cn_id][cnd_id][1])
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
                const nodeBandwidth = 500
                cost = imageSize/nodeBandwidth + installingTime
            }
            totalCost = totalCost + cost;
        }
        return totalCost;
    }

    calculateAll(solution)
    {
        const ResponseTime = this.executionTime(solution) + 
                             this.transmissionDelay(solution);
        const PlatformReliability = this.infraReliability(solution);
        const ServiceReliability = this.serviceReliability(solution);

        return {
            ResponseTime,
            PlatformReliability,
            ServiceReliability,
            OverallReliabilty: PlatformReliability * ServiceReliability
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
        };
        

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
            if ( 0.9 < rnd)
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
            if (0.9 < rnd && componentID != 1 && componentID != this.services[0].components.length)
            {
                listLosts.push(prevSolution[i])
            }
        }

        return listLosts;
    }

    quality_fl(solutions, recoveryTime)
    {

        const solutionQualities = [];
        let quality = [];
        for (let i = 0; i < solutions.length; i++) 
        {
            solutionQualities.push(this.calculateAll(solutions[i]));
            const q =  (0.33*solutionQualities[i]['ResponseTime'] / this.users.length / 1 ) + (-0.33*solutionQualities[i]['OverallReliabilty']) + (0.33*recoveryTime[i]/5)
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
        }
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


        this.min = 0
        this.max = 1
        this.CHlenght = 16;
        this.model = "nonlinear-power";
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
            const f9 = 0
            const f10 = 0
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H = 5;
            let t = 0;

            const hidden = new Array(H);
            for (let j = 0; j < H; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            hidden[j] = s
            }

            let ver_value = 0;
            for (let j = 0; j < H; j++) {
            ver_value += w[t++] * hidden[j];
            }

            return ver_value
    }

    model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H = 15;
            let t = 0;

            const hidden = new Array(H);
            for (let j = 0; j < H; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            hidden[j] = s
            }

            let ver_value = 0;
            for (let j = 0; j < H; j++) {
            ver_value += w[t++] * hidden[j];
            }

            return ver_value
    }

    model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 8;
            const H2 = 4;
            let t = 0;

            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            h1[j] = s;
            }

            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];
            }
            h2[k] = s;
            }

            let ver_value = 0;
            for (let k = 0; k < H2; k++) {
            ver_value += w[t++] * h2[k];
            }

            return ver_value;
    }

    model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9  = version.imageSize / 10;
            const f10 = version.installingTime / 5;
            const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 8;
            const H2 = 4;
            const H3 = 3;

            let t = 0;

            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            h1[j] = s;
            }

            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];
            }
            h2[k] = s;
            }

            const h3 = new Array(H3);
            for (let m = 0; m < H3; m++) {
            let s = 0;
            for (let k = 0; k < H2; k++) {
                s += w[t++] * h2[k];
            }
            h3[m] = s;
            }

            let ver_value = 0;
            for (let m = 0; m < H3; m++) {
            ver_value += w[t++] * h3[m];
            }

            return ver_value
    }

    model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
                    const f9 = version.imageSize/10
            const f10 = version.installingTime/5
            const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 16;
            const H2 = 8;
            let t = 0;

            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            h1[j] = s;
            }

            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];
            }
            h2[k] = s;
            }

            let ver_value = 0;
            for (let k = 0; k < H2; k++) {
            ver_value += w[t++] * h2[k];
            }

            return ver_value;
    }

    model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
    {
            const f9  = version.imageSize / 10;
            const f10 = version.installingTime / 5;
            const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 2;
            const H2 = 4;
            const H3 = 8;

            let t = 0;

            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            h1[j] = s;
            }

            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];
            }
            h2[k] = s;
            }

            const h3 = new Array(H3);
            for (let m = 0; m < H3; m++) {
            let s = 0;
            for (let k = 0; k < H2; k++) {
                s += w[t++] * h2[k];
            }
            h3[m] = s;
            }

            let ver_value = 0;
            for (let m = 0; m < H3; m++) {
            ver_value += w[t++] * h3[m];
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
        const f6 = version.dataSize / 5
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
        else if (model_type == 0)
        {
            return this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (model_type == 1)
        {
            return this.model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        } 
        else if (model_type == 2)
        {
            return this.model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (model_type == 3)
        {
            return this.model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        } 
        else if (model_type == 4)
        {
            return this.model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (model_type == 5)
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
        else if (this.model == "M3")
        {
            return this.model_3(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (this.model == "M1")
        {

            return this.model_1(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (this.model == "M2")
        {
            return this.model_2(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (this.model == "ft_model_three_layer2")
        {
            const f9  = version.imageSize / 10;
            const f10 = version.installingTime / 5;
            const f   = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

            const H1 = 4;
            const H2 = 8;
            const H3 = 12;

            let t = 0;

            const h1 = new Array(H1);
            for (let j = 0; j < H1; j++) {
            let s = 0;
            for (let i = 0; i < 10; i++) {
                s += w[t++] * f[i];
            }
            h1[j] = s;
            }

            const h2 = new Array(H2);
            for (let k = 0; k < H2; k++) {
            let s = 0;
            for (let j = 0; j < H1; j++) {
                s += w[t++] * h1[j];
            }
            h2[k] = s;
            }

            const h3 = new Array(H3);
            for (let m = 0; m < H3; m++) {
            let s = 0;
            for (let k = 0; k < H2; k++) {
                s += w[t++] * h2[k];
            }
            h3[m] = s;
            }

            let ver_value = 0;
            for (let m = 0; m < H3; m++) {
            ver_value += w[t++] * h3[m];
            }

            return ver_value;


        }
        else if (this.model == "M4")
        {
            return this.model_4(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (this.model == "M5")
        {
            return this.model_5(w, version, f1, f2, f3, f4, f5, f6, f7, f8)


        }
        else if (this.model == "M6")
        {
            return this.model_6(w, version, f1, f2, f3, f4, f5, f6, f7, f8)
        }
        
        else if (this.model == "ft_model")
        {
            const f9 = version.imageSize/10
            const f10 = version.installingTime/5


                    const f = [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10];

                    const H = 3;
                    let t = 0;

                    const hidden = new Array(H);
                    for (let j = 0; j < H; j++) {
                    let s = 0;
                    for (let i = 0; i < 10; i++) {
                        s += w[t++] * f[i];
                    }
                    hidden[j] = s
                    }

                    let ver_value = 0;
                    for (let j = 0; j < H; j++) {
                    ver_value += w[t++] * hidden[j];
                    }

                    return ver_value


        }       
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
    
                        if (node.characteristics.memory > version.memory
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
                assertFeasibleNode(nodeIndex, node_value, 'the initial placement');
    
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
            }            
            solution = this.validation(solution);
        }


        solution = this.validation(solution);
       

        return {
            solution: solution, 
            servicePlacementResults: this.solutionAnalyser(solution),
            nodesFreeCapacity: computingNodesFreeCapacity,
            perServiceAnalysis: this.perServiceAnalysis(solution, "NCO-per-service")
        }
    }


}

class faultTolerance extends legacyNCO {
    constructor(ans) {
        super(ans);
        this.algo = ans['algo'];
        this.flAlgo = ans['algo'];
        this.runId = new Date().toISOString();
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

        this.timeSlots = Number(ft['timeSlots'] ?? 500);

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
        const csvLine = data.join(',') + '\n';
        fs.appendFile(fileName, csvLine, (err) => {
            if (err) {
                console.log('Error writing to CSV file:', err);
            } else {
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

        fs.writeFile(path.join(RESULTS_DIR, 'per-service', `recTimePerService_${this.flAlgo}_${t}.csv`), csvContent, (err) => {
        if (err) {
            console.error('Error writing CSV file:', err);
        } else {
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

                recoveryTime.push(recoveryValue(recTime))
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
                        
                        for (let i = 0; i + 1 < crossover.length; i += 2) 
                        {
                            if (Math.random() < cProbability) 
                            {
                                let parentIndex1 = i
                                let parentIndex2 = i+1
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
                    
                            recoveryTime.push(recoveryValue(recTime))
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
                    
                            recoveryTime.push(recoveryValue(recTime))
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
                    
                            recoveryTime.push(recoveryValue(recTime))
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
                    
                            recoveryTime.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
                
                for (let i = 0; i + 1 < crossover.length; i += 2) 
                {
                    if (Math.random() < cProbability) 
                    {
                        let parentIndex1 = i
                        let parentIndex2 = i+1
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
                
                        recoveryTime.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
                
                for (let i = 0; i + 1 < crossover.length; i += 2) 
                {
                    if (Math.random() < cProbability) 
                    {
                        let parentIndex1 = i
                        let parentIndex2 = i+1
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
            
                    recoveryTimeN.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
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

                recoveryTime.push(recoveryValue(recTime))
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
                
                for (let i = 0; i + 1 < crossover.length; i += 2) 
                {
                    if (Math.random() < cProbability) 
                    {
                        let parentIndex1 = i
                        let parentIndex2 = i+1
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
            
                    recoveryTime.push(recoveryValue(recTime))
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
            recoveryTime: Number(recoveryTime[minIndex]),
            fList: initial_solutions_failedList[minIndex],
            recTime: perComponentTimes(recoveryTime[minIndex], recTime),
            aveRecPerSer: this.recoveryTimeStats(failedList, perComponentTimes(recoveryTime[minIndex], recTime))
        }
    }

    heuristics_fl(initialState, failes, m, t, failedDuration)
    {
        let w;
        w = readJSON(INITIAL_PLACEMENT_WEIGHTS)
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

                        if (node.characteristics.memory > version.memory
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
                                

                                function randomArray(n, min, max) 
                                {
                                    const arr = new Array(n);
                                    for (let i = 0; i < n; i++) {
                                        arr[i] = min + Math.random() * (max - min);
                                    }
                                    return arr;
                                }


                                versionValue.push(-this.formula(bandwidth[cN], node, version, w, maxMemory, maxCPU));
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
                assertFeasibleNode(nodeIndex, node_value, 'failure recovery');

                
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
            }

            
            recTimeComponents += maxOrZero(recTime)
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

        const offsets = new Array(arch.length - 1);
        {
            let off = 0;
            for (let l = 0; l < arch.length - 1; l++) {
            offsets[l] = off;
            off += arch[l + 1] * arch[l];
            }
        }

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
            out[j] = s;
            }
            a[l + 1] = out;
        }

        const yHat = a[arch.length - 1][0];


        const err = yHat - realCost;
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
                const wIdx = Woff + k * curDim + j;
                s += wOld[wIdx] * delta[l + 1][k];
            }
            d[j] = s;
            }
            delta[l] = d;
        }

        for (let l = 0; l < arch.length - 1; l++) {
            const inDim = arch[l];
            const outDim = arch[l + 1];
            const Woff = offsets[l];

            for (let j = 0; j < outDim; j++) {
            const rowBase = Woff + j * inDim;
            const dj = delta[l + 1][j];
            for (let i = 0; i < inDim; i++) {
                const grad = dj * a[l][i];
                wNew[rowBase + i] -= lr * grad;
            }
            }
        }

        return wNew;
    }

    udl_fl(freeCN, sol, failes, m, t, duration, model_id, w)
    {


            const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
            const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

            const mode = m;
            const numVersions = this.services[0].components[0].versions.length;
            const numComponents = this.services[0].components.length;

            let computingNodesFreeCapacity
            let solution
            let failedDuration


            computingNodesFreeCapacity = JSON.parse(JSON.stringify(freeCN));
            solution = JSON.parse(JSON.stringify(sol));
            failedDuration = JSON.parse(JSON.stringify(duration)) 


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

                            if (node.characteristics.memory > version.memory && node.characteristics.cpu > version.cpu
                            ) 
                            {
                                if (this.flAlgo == "FLUDL")
                                {                          
                                    versionValue.push(-this.ft_formula(bandwidth[cN], node, version, w, maxMemory, maxCPU, model_id));
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
                    assertFeasibleNode(nodeIndex, node_value, 'failure recovery');

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

                    const imgSize = 0
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

                }
                recTimeComponents += maxOrZero(recTime)
                
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

    udl_fl_backprob(freeCN, sol, failes, m, t, duration, model_id, w)
    {


            const maxMemory = Math.max(...this.computingNodes.map(node => node.characteristics.memory));
            const maxCPU = Math.max(...this.computingNodes.map(node => node.characteristics.cpu));

            const mode = m;
            const numVersions = this.services[0].components[0].versions.length;
            const numComponents = this.services[0].components.length;

            let computingNodesFreeCapacity
            let solution
            let failedDuration

            let wOld = JSON.parse(JSON.stringify(w))


            computingNodesFreeCapacity = JSON.parse(JSON.stringify(freeCN));
            solution = JSON.parse(JSON.stringify(sol));
            failedDuration = JSON.parse(JSON.stringify(duration)) 


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

                            if (node.characteristics.memory > version.memory && node.characteristics.cpu > version.cpu
                            ) 
                            {
                                if (this.flAlgo == "FLUDL")
                                {                          
                                    versionValue.push(-this.ft_formula(bandwidth[cN], node, version, w, maxMemory, maxCPU, model_id));
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
                    assertFeasibleNode(nodeIndex, node_value, 'failure recovery');

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

                    if (model_id == 0)
                    {
                        arch = [10,5,1]
                    }
                    else if (model_id == 1)
                    {
                        arch = [10,15,1]
                    }
                    else if (model_id == 2)
                    {
                        arch = [10,8,4,1]
                    }
                    else if (model_id == 3)
                    {
                        arch = [10,8,4,3,1]
                    }
                    else if (model_id == 4)
                    {
                        arch = [10,16,8,1]
                    }
                    else if (model_id == 5)
                    {
                        arch = [10,2,4,8,1]
                    }

                    const predictedCost = 1
                    const lr = 0.0003

                    function perturbFeatures(F, noiseScale = 0.01) 
                    {
                        return F.map(v => v + noiseScale * (Math.random() * 2 - 1));
                    }


                    let wNew
                    wNew = this.oneStepBackprop(F, wOld, realCost, predictedCost, arch, lr)
                    for (let e = 0; e < 5; e++)
                    {
                        const Fp = perturbFeatures(F, 0.2);
                        wNew = JSON.parse(JSON.stringify(this.oneStepBackprop(Fp, wNew, realCost, predictedCost, arch, lr)))
                    }


                    wOld = JSON.parse(JSON.stringify(wNew))


                }
                
            }

            return wOld
        
    }

    generateCandidates(weights, K, sigma, rand = Math.random) 
    {
        const D = weights.length;

        const epsList = [];
        const candidates = [];

        const pairs = Math.ceil(K / 2);

        for (let p = 0; p < pairs; p++) {
            const eps = this.randnVector(D, rand);
            epsList.push(eps);

            const wPlus  = this.addScaled(weights, eps, +sigma);
            const wMinus = this.addScaled(weights, eps, -sigma);

            candidates.push(wPlus, wMinus);
        }

        candidates.length = Math.min(candidates.length, K);

        return { epsList, candidates };
    }

    utilitiesFromCosts(costs) 
    {
        const n = costs.length;
        const order = this.rankIndicesByCost(costs);

        const rank = new Array(n);
        for (let r = 0; r < n; r++) rank[order[r]] = r;

        const u = new Array(n);
        for (let i = 0; i < n; i++) {
            u[i] = 0.5 - rank[i] / Math.max(1, n - 1);
        }

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
            const coeff = (uPlus - uMinus);

            for (let j = 0; j < D; j++) {
            grad[j] += coeff * eps[j];
            }
        }

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
    return costs
        .map((c, i) => ({ c, i }))
        .sort((a, b) => a.c - b.c)
        .map(o => o.i);
    }

    randn(rand = Math.random) 
    {
        let u = 0, v = 0;
        while (u === 0) u = rand();
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
            const coeff = (uPlus - uMinus);

            for (let j = 0; j < D; j++) {
                grad[j] += coeff * eps[j];
            }
        }

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
            const impNorm = imp[j] / meanImp;

            const newSigma = sigmaVec[j] * Math.exp(etaSigma * (impNorm - 1));

            out[j] = Math.min(sigmaMax, Math.max(sigmaMin, newSigma));
        }

        return out;
    }


    _openOvertimeCsv(filePath, header) {
        const fullHeader = 'Run,Scale,TimeSlot,' + header + '\n';
        if (fs.existsSync(filePath)) {
            const firstLine = fs.readFileSync(filePath, 'utf8').split('\n', 1)[0];
            if (firstLine + '\n' !== fullHeader) {
                fs.renameSync(filePath, filePath.replace(/\.csv$/, `.old-${Date.now()}.csv`));
            }
        }
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, fullHeader);
        }
        this._overtimeSlots = this._overtimeSlots ?? {};
        this._overtimeSlots[filePath] = 0;
    }

    _appendOvertimeRow(filePath, row) {
        this._overtimeSlots = this._overtimeSlots ?? {};
        const slot = this._overtimeSlots[filePath] ?? 0;
        this._overtimeSlots[filePath] = slot + 1;
        const scale = String(this.ans?.['scale'] ?? '').replace(/,/g, ';');
        fs.appendFileSync(filePath, `${this.runId},${scale},${slot},` + row);
    }

    run(model_index = 0)
    {
        let w
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

        const slots = this.timeSlots;
        const aveRT = Array(slots).fill(0);
        const aveOvlRel = Array(slots).fill(0);
        const aveRecTime = Array(slots).fill(0);
        let results 
        const aveRange = 1
        
        if (this.flAlgo == "FLGA")
        {
            let ga
            const filePath = path.join(RESULTS_DIR, 'FLGA-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');

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
                    this._appendOvertimeRow(filePath, row);

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

            const filePath = path.join(RESULTS_DIR, 'FLPSO-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');

            for(let a = 0; a < aveRange; a++)
            {
                pso = this.pso_fl(initialState, failes, 2, 1, failedDuration)

                for(let time = 0; time < slots; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(pso['solution'], time+1)
                    pso = this.pso_fl(pso, failes, 2, time, pso['failedDuration'])
                    results = this.solutionAnalyser(pso['solution'])

                    const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${pso['recoveryTime']},${pso['aveRecPerSer'].average}\n`;                    
                    this._appendOvertimeRow(filePath, row);
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
            const filePath = path.join(RESULTS_DIR, 'FLDE-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');

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
                    this._appendOvertimeRow(filePath, row);
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
            const filePath = path.join(RESULTS_DIR, 'FLWOA-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');

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
                    this._appendOvertimeRow(filePath, row);
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
            const filePath = path.join(RESULTS_DIR, 'FLSA-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');
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
                    this._appendOvertimeRow(filePath, row);
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
            const filePath = path.join(RESULTS_DIR, 'FLPSOGA-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');
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
                    this._appendOvertimeRow(filePath, row);
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
            const filePath = path.join(RESULTS_DIR, 'FLGAPSO-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');
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
                    this._appendOvertimeRow(filePath, row);
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
            const filePath = path.join(RESULTS_DIR, 'FLRAS-overtime.csv');
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');
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
                    this._appendOvertimeRow(filePath, row);
                }
            }


            return { initial_placement: initial_solution,
                        fl_results: {aveResponseTime: results['aveResponseTime'],
                        overallReliability: results['platformReliability'] * results['serviceReliability'],
                        recoveryTime: ras['recoveryTime']}
            }
        }
        else if (this.flAlgo == "FLUDL")
        {
            function findMinMaxAndNormalize(preResults, backpropResults, mutResults, savedResults, pre_udl, backprop_udl, mut_udl, saved_udl) 
            {
                const preRTs = preResults.map(r => r.aveResponseTime);
                const backpropRTs = backpropResults.map(r => r.aveResponseTime);
                const mutRTs = mutResults.map(r => r.aveResponseTime);
                const savedRTs = savedResults.map(r => r.aveResponseTime);

                const overallMinRT = Math.min(...preRTs, ...backpropRTs, ...mutRTs, ...savedRTs);
                const overallMaxRT = Math.max(...preRTs, ...backpropRTs, ...mutRTs, ...savedRTs);

                const preRel = preResults.map(r => r.platformReliability * r.serviceReliability);
                const backpropRel = backpropResults.map(r => r.platformReliability * r.serviceReliability);
                const mutRel = mutResults.map(r => r.platformReliability * r.serviceReliability);
                const savedRel = mutResults.map(r => r.platformReliability * r.serviceReliability);

                const overallMinRel = Math.min(...preRel, ...backpropRel, ...mutRel, ...savedRel);
                const overallMaxRel = Math.max(...preRel, ...backpropRel, ...mutRel, ...savedRel);


                const preRec = pre_udl.map(r => r.aveRecPerSer.max);
                const backpropRec = backprop_udl.map(r => r.aveRecPerSer.max);
                const mutRec = mut_udl.map(r => r.aveRecPerSer.max);
                const savedRec = saved_udl.map(r => r.aveRecPerSer.max);

                const overallMinRec = Math.min(...preRec, ...backpropRec, ...mutRec, ...savedRec);
                const overallMaxRec = Math.max(...preRec, ...backpropRec, ...mutRec, ...savedRec);

                function normalize(value, min, max) {
                    if (max === min) return 1;
                    return (value - min) / (max - min);
                }

                const normalized = {
                    responseTime: {
                        pre: preRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        backprop: backpropRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        mut: mutRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                        saved: savedRTs.map(v => normalize(v, overallMinRT, overallMaxRT)),
                    },
                    overallReliability: {
                        pre: preRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        backprop: backpropRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        mut: mutRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                        saved: savedRel.map(v => normalize(v, overallMinRel, overallMaxRel)),
                    },
                    recoveryTime: {
                        pre: preRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        backprop: backpropRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        mut: mutRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                        saved: savedRec.map(v => normalize(v, overallMinRec, overallMaxRec)),
                    }
                };

                return normalized;
            }

            function compromiseScoresWeighted(normalizedValues, weights = { rt: 1, rel: 1, rec: 1 }) 
            {
                const score = { pre: [], backprop: [], mut: [], saved: [] };

                function dist(rt, rel, rec) {
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
            this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');
            let udl
            let ga
            let number_of_pretrained_models = this.num_models
            let number_of_random_models = 0;
            let number_of_mutated_models = 0;
            let number_of_saved_models = 0;
            let number_of_updated_models = this.num_models;
            let ws = { rt: 0.33, rel: 0.33, rec: 0.33 };
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
                pre_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                rnd_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                mut_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                saved_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));
                backprob_weights.push(readJSON(path.join(UDL_MODELS_DIR, `weights_${mdl}.txt`)));

            }


            udl = this.udl_fl(initialState['nodesFreeCapacity'], initialState['solution'], failes, 2, 0, failedDuration, 0, pre_weights[0])
            

            let aveResTime = 0, aveRel = 0, aveRecTime = 0, aveRecTimePerService = 0;
            for(let time = 0; time < slots; time++)
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
                    if (time == 1000 || time == 3000)
                    {
                        for (let ii = 0; ii < freeCN.length; ii++)
                        {
                            if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 1)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 6
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 6
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 2)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 1
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 1
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 3)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 0.2
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 0.2
                            }
                            
                            udl['nodesFreeCapacity'][ii]['characteristics']['cpu'] = udl['nodesFreeCapacity'][ii]['characteristics']['cpu']
                            this.computingNodes[ii]['characteristics']['cpu'] =  this.computingNodes[ii]['characteristics']['cpu']

                        }
                    }

                    if (time > 200 && time < 400)
                    {
                        for (let ii = 0; ii < freeCN.length; ii++)
                        {
                            if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 1)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 1.00899
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 1.00899
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 2)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] / 1
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] / 1
                            }
                            else if (udl['nodesFreeCapacity'][ii]['nodeTier'] == 3)
                            {
                                udl['nodesFreeCapacity'][ii]['characteristics']['memory'] = udl['nodesFreeCapacity'][ii]['characteristics']['memory'] * 0.99198
                                this.computingNodes[ii]['characteristics']['memory'] =  this.computingNodes[ii]['characteristics']['memory'] * 0.99198
                            }
                            
                            udl['nodesFreeCapacity'][ii]['characteristics']['cpu'] = udl['nodesFreeCapacity'][ii]['characteristics']['cpu']
                            this.computingNodes[ii]['characteristics']['cpu'] =  this.computingNodes[ii]['characteristics']['cpu']

                        }
                    }

                    
                    if (time == 1000 || time == 3000)
                    {
                        for (let ii = 0; ii < this.services.length; ii++)
                        {
                            for (let jj = 0; jj < this.services[0]['components'].length; jj++)
                            {
                                for (let vv = 0; vv < this.services[ii]['components'][jj]['versions'].length; vv++)
                                {


                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] * 3
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory']
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] * 0.5

                                }
                            }
                        }
                    }

                    if (time > 200 && time < 400)
                    {
                        for (let ii = 0; ii < this.services.length; ii++)
                        {
                            for (let jj = 0; jj < this.services[0]['components'].length; jj++)
                            {
                                for (let vv = 0; vv < this.services[ii]['components'][jj]['versions'].length; vv++)
                                {

                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] * 1.00552
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory']
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] * 0.99654

                                }
                            }
                        }
                    }

                    if (time == 3000)
                    {
                        for (let ii = 0; ii < this.services.length; ii++)
                        {
                            for (let jj = 0; jj < this.services[0]['components'].length; jj++)
                            {
                                for (let vv = 0; vv < this.services[ii]['components'][jj]['versions'].length; vv++)
                                {

                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['dataSize'] * fixedRND(0.2,1)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['memory'] * fixedRND(0.2,1)
                                    this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] = this.services[ii]['components'][jj]['versions'][vv]['characteristics']['cpu'] * fixedRND(0.2,1)

                                }
                            }
                        }
                    }

                    if (time == 1000 || time == 3000)
                    {
                        for (let ii = 0; ii < this.infraConnections.length; ii++)
                        {
                            for (let jj = 0; jj < this.infraConnections.length; jj++)
                            {
                                if (this.infraConnections[ii][jj][0] != 0)
                                {
                                    this.infraConnections[ii][jj][0] = this.infraConnections[ii][jj][0] * 0.5
                                    this.infraConnections[ii][jj][1] = this.infraConnections[ii][jj][1] * 1
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
                                    this.infraConnections[ii][jj][0] = this.infraConnections[ii][jj][0]
                                    this.infraConnections[ii][jj][1] = this.infraConnections[ii][jj][1] * 1.0065
                                    this.infraConnections[ii][jj][2] = this.infraConnections[ii][jj][0]
                                }
                            }
                        }
                    }

                    if (time > 200 && time < 400)
                    {
                        ws = { rt: 0.25, rel: 0.35, rec: 0.4}
                    }
                }


                const sol = udl['solution']
                const duration = udl['failedDuration']

                for (let i = 0; i < number_of_pretrained_models; i++)
                {
                    udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, pre_weights[i])
                    pre_results.push (this.solutionAnalyser(udl['solution']))
                    pre_udl.push(udl)
                }

                if (this.updating_method == "bp")
                {
                    for (let i = 0; i < number_of_updated_models; i++)
                    {
                        backprob_weights[i] = this.udl_fl_backprob(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i])
                        udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i])
                        backpro_results.push(this.solutionAnalyser(udl['solution']))
                        backpro_udl.push(udl)
                        if (time > 250) {
                            ws = { rt: 0.7, rel: 0.15, rec: 0.15}
                        }
                    }
                }

                if (this.updating_method == "es")
                {
                    for (let i = 0; i < number_of_updated_models; i++)
                    {
                        const    K = 5
                        const    sigma = 0.05
                        const    alpha_2 = 0.2
                        const    rand = Math.random

                        const { epsList, candidates } = this.generateCandidates(backprob_weights[i], K, sigma, rand);
                        const costs = new Array(candidates.length);
                        for (let can = 0; can < candidates.length; can++) 
                        {
                            udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, candidates[can])
                            let candidateCost = this.solutionAnalyser(udl['solution'])

                            const c = (0.455 * candidateCost['aveResponseTime']/0.7) - 0.45 * (candidateCost['platformReliability'] * candidateCost['serviceReliability'])/1 + 0.05 * udl['recoveryTime']/7;

                            costs[can] = c;
                        }

                        const { utilities, rank } = this.utilitiesFromCosts(costs);
                        const grad = this.estimateGradAntithetic(backprob_weights[i], epsList, utilities, sigma);
                        const newWeights = this.applyUpdate(backprob_weights[i], grad, alpha_2);

                        
                        backprob_weights[i] = newWeights

                        udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i])
                        backpro_results.push(this.solutionAnalyser(udl['solution']))
                        backpro_udl.push(udl)

                    }
                }

                if (this.updating_method == "ees")
                {
                    for (let i = 0; i < number_of_updated_models; i++)
                    {
                        const K = 50;
                        const alpha_2 = 0.2;
                        const rand = Math.random;

                        const sigmaInit = 0.25;
                        const etaSigma  = 0.05;
                        const sigmaMin  = 1e-4;
                        const sigmaMax  = 1.0;

                        if (!this.sigmaVec_backprob[i] || this.sigmaVec_backprob[i].length !== backprob_weights[i].length) {
                            this.sigmaVec_backprob[i] = new Array(backprob_weights[i].length).fill(sigmaInit);
                        }
                        let sigmaVec = this.sigmaVec_backprob[i];

                        const { epsList, candidates } = this.generateCandidatesDL(backprob_weights[i], K, sigmaVec, rand);

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

                        const { utilities } = this.utilitiesFromCosts(costs);

                        const grad = this.estimateGradAntitheticDL(backprob_weights[i], epsList, utilities, sigmaVec);

                        const newWeights = this.applyUpdate(backprob_weights[i], grad, alpha_2);
                        backprob_weights[i] = newWeights;

                        sigmaVec = this.updateSigmaVecDL(sigmaVec, grad, etaSigma, sigmaMin, sigmaMax);
                        this.sigmaVec_backprob[i] = sigmaVec;

                        udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, backprob_weights[i]);
                        backpro_results.push(this.solutionAnalyser(udl['solution']));
                        backpro_udl.push(udl);

                        if (time > 0 && time % 20 === 0) {
                            const avgSigma = sigmaVec.reduce((a,b)=>a+b,0) / sigmaVec.length;
                            const minSigma = Math.min(...sigmaVec);
                            const maxSigma = Math.max(...sigmaVec);
                        }

                    }
                }


                for (let i = 0; i < number_of_mutated_models; i++)
                {
                    for (let j = 0; j < mut_weights[i].length; j++)
                    {
                        const r = Math.random()
                        if (r < 0.002)
                        {
                            mut_weights[i][j] = getRandomValue(-1,1);
                        }
                    }

                    udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, mut_weights[i])
                    mut_results.push (this.solutionAnalyser(udl['solution']))
                    mut_udl.push(udl)
                }

                for (let i = 0; i < number_of_saved_models; i++)
                {
                    udl = this.udl_fl(freeCN, sol, failes, 2, time, duration, i, saved_weights[i])
                    saved_results.push (this.solutionAnalyser(udl['solution']))
                    saved_udl.push(udl)
                }

                const normalizedValues = findMinMaxAndNormalize(pre_results, backpro_results, mut_results, saved_results, pre_udl, backpro_udl, mut_udl, saved_udl)

                const theBestModel = compromiseScoresWeighted(normalizedValues, ws)


                if (theBestModel.best.group == 'pre')
                {
                    udl = pre_udl[theBestModel.best.index]
                    pre_used[theBestModel.best.index]++;
                    pre_used_timestep[theBestModel.best.index] = time

                }
                else if (theBestModel.best.group == 'backprop')
                {
                    {
                    udl = backpro_udl[theBestModel.best.index]
                    other_used[theBestModel.best.index]++;  
                    other_used_timestep[theBestModel.best.index] = time;
                    } 

                }
                else if (theBestModel.best.group == 'rnd')
                {
                    udl = rnd_udl[theBestModel.best.index]
                    other_used[theBestModel.best.index]++;  
                    other_used_timestep[theBestModel.best.index] = time

                }
                else if (theBestModel.best.group == 'mut')
                {
                    {
                    udl = mut_udl[theBestModel.best.index]
                    
                        saved_weights[theBestModel.best.index] = JSON.parse(JSON.stringify(mut_weights[theBestModel.best.index]))
                    
                    other_used[theBestModel.best.index]++;
                    other_used_timestep[theBestModel.best.index] = time
                    }


                }
                else if (theBestModel.best.group == 'saved')
                {
                    udl = saved_udl[theBestModel.best.index]
                    other_used[theBestModel.best.index]++;
                    other_used_timestep[theBestModel.best.index] = time
                }


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
                        pre_weights[i] = JSON.parse(JSON.stringify(backprob_weights[i]))
                        pre_used_timestep[i] = time
                    }

                }


                results = this.solutionAnalyser(udl['solution'])


                const row = `${results['aveResponseTime']},${results['platformReliability'] * results['serviceReliability']},${udl['recoveryTime']},${udl['aveRecPerSer'].average}\n`;

                this._appendOvertimeRow(filePath, row);

                aveResTime += results['aveResponseTime']
                aveRel += results['platformReliability'] * results['serviceReliability']
                aveRecTime += udl['recoveryTime']
                aveRecTimePerService += udl['aveRecPerSer'].average

            }


            console.log("aveResTime",aveResTime/(this.timeSlots-1))
            console.log("aveRel",aveRel/(this.timeSlots-1))
            console.log("aveRecTime",aveRecTime/(this.timeSlots-1))
            console.log("aveRecTimePerService",aveRecTimePerService/(this.timeSlots-1))
            console.log("pre_used", pre_used)
            console.log("other_used", other_used)
            console.log("pre_used_timestep", pre_used_timestep)
            console.log("other_used_timestep", other_used_timestep)
            
            for (let i = 0; i < saved_weights.length; i++) {
                const content = JSON.stringify(saved_weights[i]);

                fs.writeFile(path.join(RESULTS_DIR, 'udl-models', `updated_weights_${i}.txt`), content, (err) => {
                    if (err) {
                        console.error('Error writing file:', err);
                        return;
                    }
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
            const slots_heu = this.timeSlots;
            const aveRT_heu = Array(slots_heu).fill(0);
            const aveOvlRel_heu = Array(slots_heu).fill(0);
            const aveRecTime_heu = Array(slots_heu).fill(0);
            let results_heu_fl
            let heu_fl
    
            const aveRange_heu = 1
            for(let a = 0; a < aveRange_heu; a++)
            {
                
                const filePath = path.join(RESULTS_DIR, `${this.flAlgo}-overtime.csv`);
                this._openOvertimeCsv(filePath, 'AveResponseTime,Reliability,RecoveryTime,aveRecPerSer');

                heu_fl = this.heuristics_fl(initialState, failes, 2, 1, failedDuration)
    
                for(let time = 0; time < slots_heu; time++)
                {
                    console.log("Node Failure Time step: ", time)
                    failes = this.nodeFailureSimulator(heu_fl['solution'], time+1)
                    heu_fl = this.heuristics_fl(heu_fl, failes, 2, time, heu_fl['failedDuration'])
                    results_heu_fl = this.solutionAnalyser(heu_fl['solution'])

                    const row = `${results_heu_fl['aveResponseTime']},${results_heu_fl['platformReliability'] * results_heu_fl['serviceReliability']},${heu_fl['recoveryTime']},${heu_fl['aveRecPerSer'].average}\n`;
                    this._appendOvertimeRow(filePath, row);

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
                
                        fs.writeFile(path.join(RESULTS_DIR, 'per-service', `recTimePerService_${this.flAlgo}.csv`), csvContent, (err) => {
                        if (err) {
                            console.error('Error writing CSV file:', err);
                        } else {
                        }
                        });
                
                
                        for(let time = 0; time < aveRT_heu.length; time++)
                        {
                            this.writeToCSV(path.join(RESULTS_DIR, 'per-service', `${this.flAlgo}.csv`), [aveRT_heu[time]/aveRange_heu, aveOvlRel_heu[time]/aveRange_heu, aveRecTime_heu[time]/aveRange_heu]);
                        }
                

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
