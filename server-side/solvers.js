const fs = require('fs');
const { performance } = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;


function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
}

class solutionGenerator {
    constructor(systemConfig) {
        const config = systemConfig;
        this.computingNodes = config.computingNodes;
        this.services = config.services;
        this.users = config.users;
        this.helpers = config.helpers;
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
}

class objFuncCalculator {
    constructor(ans) {
        const config = ans;
        this.services = config['services'];
        this.computingNodes = config['computingNodes'];
        this.componentConnections = config['componentConnections'];
        this.helpers = config['helperNodes'];
        this.users = config['usersNodes'];
        this.infraConnections = config['infraConnections'];
    }

    infraReliability(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let totalRC = 0;
        for (let s = 0; s < this.users.length; s++)
        {
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
        return totalRC/this.users.length;
    }

    serviceReliability(solution)
    {
        const numComponents = this.services[0]['components'].length;
        let aveRS = 0;
        for (let s = 0; s < this.users.length; s++)
        {
            let RS = 1;
            for (let i = s*numComponents; i < (s+1)*numComponents; i++)
            {
                RS *= this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['reliabilityScore'];
            }
            aveRS = aveRS + RS
        }
        aveRS = aveRS/this.users.length;
        return aveRS;
    }

    executionTime(solution)
    {
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

    bwDivision(solution)
    {
        //this function counts the number of connections is done by the links
        let conn = Array(this.infraConnections[0].length).fill(1).map(() => Array(this.infraConnections[0].length).fill(1));

        for (let s = 0; s < this.users.length; s++)
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
        return conn;
    }

    transmissionDelay(solution)
    {
        const conn = this.bwDivision(solution)

        let cT = 0;
        for (let s = 0; s < this.users.length; s++)
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
        for(let s = 0; s < this.users.length; s++)
        {
            let pDelay = 0;
            for (let i = s*numComponents; i < (s+1)*numComponents;i++)
            {
                const pr = this.services[solution[i][0] - 1]['components'][solution[i][1] - 1]['versions'][solution[i][2] - 1]['characteristics']['provider'];
                switch (pr) {
                    case 'AWS':
                        pDelay += 1.5;
                        break;
                    case 'Azure':
                        pDelay += 1.5;
                        break;
                    case 'Ericsson':
                        pDelay += 1.2;
                        break;
                    case 'K8w':
                        pDelay += 0.9;
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
        for(let s = 0; s < this.users.length; s++)
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
                        cDelay = 0;
                        break;
                }
            }
            totalCodecDelay += cDelay;
        }
        return totalCodecDelay;
    }

    calculate(solution)
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

    loadAnalyser(solution)
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
}

class taskContinuationAffinity extends objFuncCalculator { //The first executable version on first accessible node
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.componentConnections = ans['componentConnections'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
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
                            userFreeCapacity[u]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][v]['characteristics']['disk']) {

                            solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], userFreeCapacity[u]['nodeID']]);

                            userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                            userFreeCapacity[u]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['disk'];

                            cuPlaced = true;
                            break;
                        }
                    }
                    if (cuPlaced == false) {
                        for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                            for (let v = 0; v < numVersions; v++) {
                                if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][v]['characteristics']['memory'] &&
                                    computingNodesFreeCapacity[cN]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][v]['characteristics']['disk']) {
                                    solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                    computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                    computingNodesFreeCapacity[cN]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['disk'];
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
                                        helperFreeCapacity[h]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][v]['characteristics']['disk']) {           
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['disk'];
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
        const value = this.calculate(solution);
        const percent = this.loadAnalyser(solution);
        
        return {
            totalResponseTime: value['ResponseTime'],
            platformReliability: value['PlatformReliability'],
            serviceReliability: value['ServiceReliability'],
            loadTier1: percent['tier1'],
            loadTier2: percent['tier2'],
            loadTier3: percent['tier3'],
            loadTierHelper: percent['helperTier'],
            loadTierUser: percent['userTier'],
            runtime: exeTime
        };
    }
}

class leastRequiredCPU extends objFuncCalculator { //Versions required least CPU
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.componentConnections = ans['componentConnections'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
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
                        userFreeCapacity[u]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
                        cuPlaced = true;
                    }
                    if (cuPlaced == false) {
                        for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                            if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                                computingNodesFreeCapacity[cN]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                                solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                computingNodesFreeCapacity[cN]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                                    helperFreeCapacity[h]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], helperFreeCapacity[h]['nodeID']]);
                                        helperFreeCapacity[h]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                        helperFreeCapacity[h]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
        const value = this.calculate(solution);
        const percent = this.loadAnalyser(solution);
        return {
            totalResponseTime: value['ResponseTime'],
            platformReliability: value['PlatformReliability'],
            serviceReliability: value['ServiceReliability'],
            loadTier1: percent['tier1'],
            loadTier2: percent['tier2'],
            loadTier3: percent['tier3'],
            loadTierHelper: percent['helperTier'],
            loadTierUser: percent['userTier'],
            runtime: exeTime
        };
    }
}

class mostDataSize extends objFuncCalculator { //Versions required most DataSize run as much as on the user nodes
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.componentConnections = ans['componentConnections'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
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
                        userFreeCapacity[u]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                                    helperFreeCapacity[h]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
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
        const value = this.calculate(solution);
        const percent = this.loadAnalyser(solution);
        return {
            totalResponseTime: value['ResponseTime'],
            platformReliability: value['PlatformReliability'],
            serviceReliability: value['ServiceReliability'],
            loadTier1: percent['tier1'],
            loadTier2: percent['tier2'],
            loadTier3: percent['tier3'],
            loadTierHelper: percent['helperTier'],
            loadTierUser: percent['userTier'],
            runtime: exeTime
        };
    }
}

class mostReliablity extends objFuncCalculator { //Most reliable version on the most reliable node
    constructor(ans) {
        super(ans)
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.componentConnections = ans['componentConnections'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
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
                        userFreeCapacity[u]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                                    helperFreeCapacity[h]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
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
        const value = this.calculate(solution);
        const percent = this.loadAnalyser(solution);
        return {
            totalResponseTime: value['ResponseTime'],
            platformReliability: value['PlatformReliability'],
            serviceReliability: value['ServiceReliability'],
            loadTier1: percent['tier1'],
            loadTier2: percent['tier2'],
            loadTier3: percent['tier3'],
            loadTierHelper: percent['helperTier'],
            loadTierUser: percent['userTier'],
            runtime: exeTime
        };
    }
}

class mostPowerful extends objFuncCalculator { //Least computational version on most powerful node
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.componentConnections = ans['componentConnections'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
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
                        userFreeCapacity[u]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                                    helperFreeCapacity[h]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
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
        const value = this.calculate(solution);
        const percent = this.loadAnalyser(solution);
        return {
            totalResponseTime: value['ResponseTime'],
            platformReliability: value['PlatformReliability'],
            serviceReliability: value['ServiceReliability'],
            loadTier1: percent['tier1'],
            loadTier2: percent['tier2'],
            loadTier3: percent['tier3'],
            loadTierHelper: percent['helperTier'],
            loadTierUser: percent['userTier'],
            runtime: exeTime
        };
    }

}

class leastPowerful extends objFuncCalculator { //Most computational version on least powerful node
    constructor(ans) {
        super(ans);
        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.componentConnections = ans['componentConnections'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
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
                        userFreeCapacity[u]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], userFreeCapacity[u]['nodeID']]);
                        userFreeCapacity[u]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        userFreeCapacity[u]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
                        break;
                    }
                    else if (computingNodesFreeCapacity[n]['characteristics']['memory'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'] &&
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                                    helperFreeCapacity[h]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']) {
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
        const value = this.calculate(solution);
        const percent = this.loadAnalyser(solution);
        return {
            totalResponseTime: value['ResponseTime'],
            platformReliability: value['PlatformReliability'],
            serviceReliability: value['ServiceReliability'],
            loadTier1: percent['tier1'],
            loadTier2: percent['tier2'],
            loadTier3: percent['tier3'],
            loadTierHelper: percent['helperTier'],
            loadTierUser: percent['userTier'],
            runtime: exeTime
        };
    }

}

class geneticAlgorithm extends solutionGenerator {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.ans = config.ans
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.cProbability = config.ans['configsGA']['crossoverRate'];
        this.mProbability = config.ans['configsGA']['mutationRate'];
        this.numPopulation = config.ans['configsGA']['populationSize'];
        this.tournamentSize = config.ans['configsGA']['selectionSize'];
        this.iteration = config.ans['configsGA']['iteration'];
    }

    initialPopulation() {
        let population = [];
        for (let i = 0; i < this.numPopulation; i++) {
            population.push(this.healing(this.validation(this.randomSolution())))
        }
        return population;
    }

    initialMaxRT(population) 
    {
        const times = new objFuncCalculator(this.ans);
        const calTimes = [];
        let maxValue = 0;
        for (let i = 0; i < population.length; i++) {
            calTimes.push(times.calculate(population[i]))

            if (maxValue < calTimes[i]['ResponseTime']) {
                maxValue = calTimes[i]['ResponseTime'];
            }
        }
        return maxValue;
    }

    fitness(population, maxValue) {
        const times = new objFuncCalculator(this.ans);
        const populationTimes = [];
        let fitness = [];
        for (let i = 0; i < population.length; i++) {
            populationTimes.push(times.calculate(population[i]));
            populationTimes[i]['ResponseTime'] = populationTimes[i]['ResponseTime'] / maxValue;
            populationTimes[i]['PlatformReliability'] =  1 - populationTimes[i]['PlatformReliability'];
            populationTimes[i]['ServiceReliability'] =  1 - populationTimes[i]['ServiceReliability'];
            fitness.push(populationTimes[i]['ResponseTime'] + populationTimes[i]['PlatformReliability'] + populationTimes[i]['ServiceReliability']);
        }
        return fitness;
    }

    tournamentSelection(population, fitness) {
        let selectedPopulation = [];
        for (let n = 0; n < population.length; n++) {
            let rndIndividual = Math.floor(getRandomValue(0, population.length));
            let minCost = fitness[rndIndividual];
            for (let i = 1; i < this.tournamentSize; i++) { 
                let K = Math.floor(getRandomValue(0, population.length));
                if (fitness[K] < minCost) {
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
        for (let i = 0; i < population.length; i++) {
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

    bestIndividual(population, maxValue) {
        const times = new objFuncCalculator(this.ans);
        let costs = this.fitness(population, maxValue);

        let smallest = costs[0];
        let smallestIndex = 0;

        for (let i = 1; i < costs.length; i++) {
            if (costs[i] < smallest) {
                smallest = costs[i];
                smallestIndex = i;
            }
        }
        for (let i = 0; i < costs.length - 1; i++)
        {
            for (let j = 0; j < costs.length - 1; j++)
            {
                if (costs[j] > costs[j + 1])
                {
                    let temp = costs[j];
                    costs[j] = costs[j + 1];
                    costs[j + 1] = temp;
                }
            }
        }
        return {
            bestCosts: times.calculate(population[smallestIndex]),
            bestSolution: population[smallestIndex],
            fitnessBest: costs[0],
            fitnessMedian: costs[Math.ceil((costs.length)/2)],
            fitnessWorst: costs[(costs.length) - 2]
        }
    }

    run() {
        // let bestConvergenceProcess = [];
        // let medianConvergenceProcess = [];
        // let worstConvergenceProcess = [];

        let condition = 0;

        const startTime = performance.now();
        let population = this.initialPopulation();
        let maxValue = this.initialMaxRT(population);
        let fitnessInfoPrev = this.bestIndividual(population, maxValue);

        // bestConvergenceProcess.push(fitnessInfoPrev['fitnessBest']);
        // medianConvergenceProcess.push(fitnessInfoPrev['fitnessMedian']);
        // worstConvergenceProcess.push(fitnessInfoPrev['fitnessWorst']);

        let fitnessInfoCurrent;
        for (let i = 0; i < this.iteration; i++) {
            let fitness = this.fitness(population, maxValue);
            let selectedPopulation = this.tournamentSelection(population, fitness);
            let crossoverPopulation = this.crossover(selectedPopulation);
            let mutationPopulation = this.mutation(crossoverPopulation);
            population = this.healingSolution(mutationPopulation);
            fitnessInfoCurrent = this.bestIndividual(population, maxValue);

           if (fitnessInfoCurrent['fitnessBest'] < fitnessInfoPrev['fitnessBest']) 
           {
                condition = 0;
                fitnessInfoPrev['fitnessBest'] = fitnessInfoCurrent['fitnessBest'];
                fitnessInfoPrev['bestCosts'] = fitnessInfoCurrent['bestCosts'];
                fitnessInfoPrev['bestSolution'] = fitnessInfoCurrent['bestSolution'];
            }
            else{
                // condition++;
                // if (condition == 50)
                // {
                //     break;
                // }
            }

            // fitnessInfoPrev['fitnessMedian'] = fitnessInfoCurrent['fitnessMedian'];
            // fitnessInfoPrev['fitnessWorst'] = fitnessInfoCurrent['fitnessWorst'];
            // bestConvergenceProcess.push(fitnessInfoPrev['fitnessBest']);
            // medianConvergenceProcess.push(fitnessInfoPrev['fitnessMedian']);
            // worstConvergenceProcess.push(fitnessInfoPrev['fitnessWorst']);
        }
        //console.log(fitnessInfoPrev['bestSolution']);
        const endTime = performance.now();
        const exeTime = endTime - startTime;

        // const dataBest = bestConvergenceProcess.join('\n');
        // const dataMedian = medianConvergenceProcess.join('\n');
        // const dataWorst = worstConvergenceProcess.join('\n');
        // fs.writeFileSync('./dataBest.txt', dataBest);
        // fs.writeFileSync('./dataMedian.txt', dataMedian);
        // fs.writeFileSync('./dataWorst.txt', dataWorst);

        //const bestSolution = fitnessInfoPrev['bestSolution'].join('\n');
        //fs.writeFileSync('./bestSolution.csv', bestSolution);
        
        const cost = new objFuncCalculator(this.ans);
        const loadDist = cost.loadAnalyser(fitnessInfoPrev['bestSolution']);
        return {
            totalResponseTime: fitnessInfoPrev['bestCosts']['ResponseTime'],
            platformReliability: fitnessInfoPrev['bestCosts']['PlatformReliability'],
            serviceReliability: fitnessInfoPrev['bestCosts']['ServiceReliability'],
            loadTier1: loadDist['tier1'],
            loadTier2: loadDist['tier2'],
            loadTier3: loadDist['tier3'],
            loadTierHelper: loadDist['helperTier'],
            loadTierUser: loadDist['userTier'],
            runtime: exeTime,
            fitness: fitnessInfoPrev['fitnessBest']
        }
    }
}

class fineTuning { //Grid search cross validation tuning
    constructor(algoConfig) {
        const config = algoConfig;
        this.ans = config.ans;
        this.folds = config.folds;
        if (config.ans['cmd'] == "tGA")
        {
            this.populationSizes = config.ans['gridSearch']['populationSizes'];
            this.mutationRates = config.ans['gridSearch']['mutationRates'];
            this.crossoverRates = config.ans['gridSearch']['crossoverRates'];
            this.tournamentSelectionSize = config.ans['gridSearch']['tournamentSelectionSize'];
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
                                ans: folds[f],
                                iteration: this.iteration,
                                cProbability: crossRate,
                                mProbability: mutRate,
                                numPopulation: popSize,
                                tournamentSize: Math.ceil(tourSize * popSize),
                            };
                            const gA = new geneticAlgorithm(config);
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

        // Create a CSV writer
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
}

module.exports = {
    objFuncCalculator,
    taskContinuationAffinity,
    leastRequiredCPU,
    mostDataSize,
    mostReliablity,
    mostPowerful,
    leastPowerful,
    geneticAlgorithm,
    fineTuning
}