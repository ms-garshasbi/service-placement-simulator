const fs = require('fs');
//const { config } = require('process');
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
        const numHelpers = (this.helpers).length;
        let userFreeCapacity = this.users;
        let helperFreeCapacity = this.helpers;
        let computingNodesFreeCapacity = this.computingNodes;
        const numComputingNodes = this.computingNodes.length;

        for (let s = 0; s < solution.length; s++) {
            let placed = false;
            if (solution[s][3] > numComputingNodes + numHelpers) //So the node is a user node
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                const placedComponentNetwrok = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['dataSize'];
                if (placedComponentMem < userFreeCapacity[(solution[s][3] - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] &&
                    placedComponentDisk < userFreeCapacity[(solution[s][3] - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk']) {
                    userFreeCapacity[(solution[s][3] - 1) - (numComputingNodes + numHelpers)]['characteristics']['memory'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                    userFreeCapacity[(solution[s][3] - 1) - (numComputingNodes + numHelpers)]['characteristics']['disk'] -= this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                    placed = true;

                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk /*&&
                            computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > placedComponentNetwrok*/) {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['networkBW'] -= placedComponentNetwrok;
                            placed = true;
                            break;
                        }
                    }
                }
            }
            if (solution[s][3] > numComputingNodes && solution[s][3] <= numComputingNodes + numHelpers) //So the node is a helper node
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                const placedComponentNetwrok = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['dataSize'];
                if (placedComponentMem < helperFreeCapacity[(solution[s][3] - 1) - (numComputingNodes)]['characteristics']['memory'] &&
                    placedComponentDisk < helperFreeCapacity[(solution[s][3] - 1) - (numComputingNodes)]['characteristics']['disk']) {
                    helperFreeCapacity[(solution[s][3] - 1) - numComputingNodes]['characteristics']['memory'] -= placedComponentMem;
                    helperFreeCapacity[(solution[s][3] - 1) - numComputingNodes]['characteristics']['disk'] -= placedComponentDisk;
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk /*&&
                            computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > placedComponentNetwrok*/) {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['networkBW'] -= placedComponentNetwrok;
                            placed = true;
                            break;
                        }
                    }
                }
            }
            if (solution[s][3] <= numComputingNodes) //So node is a computing node
            {
                const placedComponentMem = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['memory'];
                const placedComponentDisk = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['disk'];
                const placedComponentNetwrok = this.services[solution[s][0] - 1]['components'][solution[s][1] - 1]['versions'][solution[s][2] - 1]['characteristics']['dataSize'];
                if (placedComponentMem < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] &&
                    placedComponentDisk < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] /*&&
                    placedComponentNetwrok < computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['networkBW']*/) {
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['memory'] -= placedComponentMem;
                    computingNodesFreeCapacity[(solution[s][3] - 1)]['characteristics']['disk'] -= placedComponentDisk;
                    placed = true;
                }
                if (placed == false) {
                    for (let cN = 0; cN < computingNodesFreeCapacity.length; cN++) {
                        if (computingNodesFreeCapacity[cN]['characteristics']['memory'] > placedComponentMem &&
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] > placedComponentDisk /*&&
                            computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > placedComponentNetwrok*/) {
                            solution[s][3] = computingNodesFreeCapacity[cN]['nodeID'];
                            computingNodesFreeCapacity[cN]['characteristics']['memory'] -= placedComponentMem;
                            computingNodesFreeCapacity[cN]['characteristics']['disk'] -= placedComponentDisk;
                            //computingNodesFreeCapacity[cN]['characteristics']['networkBW'] -= placedComponentNetwrok;
                            placed = true;
                            break;
                        }
                    }
                }
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
    }

    _jobNodePairs(solution) {
        let resultJob = [], resultNode = [];
        for (let i = 0; i < solution.length; i++) {
            const ServiceId = solution[i][0];
            const ComponentId = solution[i][1];
            const VersionId = solution[i][2];
            const NodeId = solution[i][3];

            for (let s = 0; s < this.services.length; s++) {
                if (this.services[s]['serviceID'] == ServiceId) {
                    for (let c = 0; c < this.services[0].components.length; c++) {
                        if (this.services[s].components[c].componentID == ComponentId) {
                            for (let v = 0; v < this.services[0].components[0].versions.length; v++) {
                                if (this.services[s].components[c].versions[v].versionNumber == VersionId) {
                                    resultJob.push(this.services[s].components[c].versions[v].characteristics);
                                    break;
                                }
                            }
                            break;
                        }
                    }
                }
            }

            if (NodeId <= this.computingNodes.length) {
                for (let n = 0; n < this.computingNodes.length; n++) {
                    if (this.computingNodes[n].nodeID == NodeId) {
                        resultNode.push(this.computingNodes[n]);
                        break;
                    }
                }
            }
            else if (NodeId > this.computingNodes.length && NodeId <= this.computingNodes.length + this.helpers.length) {
                for (let n = 0; n < this.helpers.length; n++) {
                    if (this.helpers[n].nodeID == NodeId) {
                        resultNode.push(this.helpers[n]);
                        break;
                    }
                }
            }
            else if (NodeId > this.computingNodes.length + this.helpers.length && NodeId <= this.computingNodes.length + this.helpers.length + this.users.length) {
                for (let n = 0; n < this.users.length; n++) {
                    if (this.users[n].nodeID == NodeId) {
                        resultNode.push(this.users[n]);
                        break;
                    }
                }
            }

        }
        return [resultJob, resultNode];
    }

    calculate(solution) {
        
        let [jobs, nodes] = this._jobNodePairs(solution, this.services, this.computingNodes);
        const {
            componentCommunicationTime = [],
            componentExecutionTime = [],
            componentReliabilityScore = [],
            tier1ReliabilityScore = [],
            tier2ReliabilityScore = [],
            tier3ReliabilityScore = [],
            usersReliabilityScore = [],
            helpersReliabilityScore = [],
            componentWaitingTime = [],
            componentDependenciesDelay = [],
            componentProviderDelay = [],
            componentCodecDelay = [],
            expectedTime = [],
            totalComponentMakespan = [],
        } = {};


        const nodesCopy = JSON.parse(JSON.stringify(nodes))
        let numSConEachNode = Array(this.computingNodes.length + this.helpers.length + this.users.length).fill(0);
        for (let n = 0; n < nodesCopy.length; n++)
        {
            const x = nodesCopy[n]['nodeID'];
            if (x != 0)
            {
                let counter = 0;
                for (let i = 0; i < nodesCopy.length; i++)
                {
                    if (x == nodesCopy[i]['nodeID'])
                    {
                        counter++;
                        nodesCopy[i]['nodeID'] = 0;
                    }
                }
                numSConEachNode[x] = counter;
            }
        }


        // Calculating communication, execution, waiting times, and reliability of each entities
        {
            let defaultDelay = 0;
            for (let i = 0; i < jobs.length; i++) {
                let communicationTime, executionTime, softwareReliabilityScore;
                let reliabilityTier1, reliabilityTier2, reliabilityTier3, reliabilityUsers, reliabilityHelpers;

                //Calculate communication time of each component
                communicationTime = (jobs[i]['dataSize'] / ((nodes[i]['characteristics']['networkBW'])/numSConEachNode[nodes[i]['nodeID']]) + ((nodes[i]['characteristics']['rtt'])/1000) + defaultDelay) //+ (nodes[i]['characteristics']['rtt'] * (jobs[i]['dataSize'] / nodes[i]['characteristics']['networkBW'] + defaultDelay));
                componentCommunicationTime.push(communicationTime);

                //Calculate execution time of each component
                executionTime = jobs[i]['cpu'] / (nodes[i]['characteristics']['cpu']);
                componentExecutionTime.push(executionTime);

                //Get reliability of each component (software)
                softwareReliabilityScore = (jobs[i]['reliabilityScore']);
                componentReliabilityScore.push(softwareReliabilityScore);

                //Get reliability of each node (hardware)
                if (nodes[i]['nodeTier'] == 1) {
                    reliabilityTier1 = nodes[i]['characteristics']['reliabilityScore'];
                    tier1ReliabilityScore.push(reliabilityTier1);
                }
                else if (nodes[i]['nodeTier'] == 2) {
                    reliabilityTier2 = nodes[i]['characteristics']['reliabilityScore'];
                    tier2ReliabilityScore.push(reliabilityTier2);
                }
                else if (nodes[i]['nodeTier'] == 3) {
                    reliabilityTier3 = nodes[i]['characteristics']['reliabilityScore'];
                    tier3ReliabilityScore.push(reliabilityTier3);
                }
                else if (nodes[i]['nodeTier'] == 4) {
                    reliabilityHelpers = nodes[i]['characteristics']['reliability'];
                    helpersReliabilityScore.push(reliabilityHelpers);
                }
                else if (nodes[i]['nodeTier'] == 0) {
                    reliabilityUsers = nodes[i]['characteristics']['reliability'];
                    usersReliabilityScore.push(reliabilityUsers);
                }

                //Calculate waiting time of each component
                let waitingTime = 0;
                for (let j = 0; j < i; j++) {
                    if (solution[j][3] == nodes[i]['nodeID']) {
                        let cTime = jobs[j]['cpu'] / (nodes[j]['characteristics']['cpu']);
                        waitingTime += cTime;
                    }
                }

                //const waitingTime = 0
                componentWaitingTime.push(waitingTime);
            }
        }

        //Calculate delay of components dependencies
        {
            for (let s = 0; s < this.services.length; s++) {
                for (let index = 0; index < this.componentConnections[0].length; index++) {
                    let componentDelay = 0;
                    for (let j = 0; j < this.componentConnections[0].length; j++) {
                        if (this.componentConnections[s][index][j] != 0 && (index) != j) {
                            let dataSize = this.componentConnections[s][index][j][1];
                            let nodeA = nodes[index]['characteristics']['networkBW'];
                            let nodeB = nodes[j]['characteristics']['networkBW'];

                            if (nodeA < nodeB) {
                                componentDelay += dataSize / nodeA;
                            }
                            else {
                                componentDelay += dataSize / nodeA;
                            }
                        }
                    }
                    componentDependenciesDelay.push(componentDelay);
                }
            }
        }

        //Calculate provider delay of each component
        {
            for (let i = 0; i < jobs.length; i++) {
                let conndition = jobs[i]['provider'];
                let pDelay;
                switch (conndition) {
                    case 'AWS':
                        pDelay = 0;
                        break;
                    case 'Azure':
                        pDelay = 0;
                        break;
                    case 'Ericsson':
                        pDelay = 0;
                        break;
                    case 'K8w':
                        pDelay = 0;
                        break;
                    default:
                        pDelay = 0;
                        break;
                }
                componentProviderDelay.push(pDelay);
            }
        }

        //Calculate encoding/decoding of each component
        {
            for (let i = 0; i < jobs.length; i++) {
                let conndition = jobs[i]['codecType'];
                let pDelay;
                switch (conndition) {
                    case 'H256':
                        pDelay = 0;
                        break;
                    case 'H264':
                        pDelay = 0;
                        break;
                    default:
                        pDelay = 0;
                        break;
                }
                componentCodecDelay.push(pDelay);
            }
        }
        
        //Calculate reliability of the infrastructure (hardware)
        let PlatformReliability;
        {

            const reliabilityTier1 = tier1ReliabilityScore; 
            const reliabilityTier2 = tier2ReliabilityScore; 
            const reliabilityTier3 = tier3ReliabilityScore; 
            const reliabilityHelpers = helpersReliabilityScore; 
            const reliabilityUsers = usersReliabilityScore; 

            // const reliabilityTier1 = [...new Set(tier1ReliabilityScore)]
            // const reliabilityTier2 = [...new Set(tier2ReliabilityScore)]
            // const reliabilityTier3 = [...new Set(tier3ReliabilityScore)]
            // const reliabilityHelpers = [...new Set(helpersReliabilityScore)]
            // const reliabilityUsers = [...new Set(usersReliabilityScore)]


            let rT1 = 1;
            for (let i = 0; i < reliabilityTier1.length; i++)
            {
                rT1 *= (1 - reliabilityTier1[i]);
            }
            rT1 = 1 - rT1;
            if (rT1 == 0) {rT1 = 1};

            let rT2 = 1;
            for (let i = 0; i < reliabilityTier2.length; i++)
            {
                rT2 *= (1 - reliabilityTier2[i]);
            }
            rT2 = 1 - rT2;
            if (rT2 == 0) {rT2 = 1};

            let rT3 = 1;
            for (let i = 0; i < reliabilityTier3.length; i++)
            {
                rT3 *= (1 - reliabilityTier3[i]);
            }
            rT3 = 1 - rT3;
            if (rT3 == 0) {rT3 = 1};

            // let rH = 1;
            // for (let i = 0; i < reliabilityHelpers.length; i++)
            // {
            //     rH *= (1 - reliabilityHelpers[i]);
            // }
            // rH = 1 - rH;
            let rH = reliabilityHelpers.length > 0 ? reliabilityHelpers.reduce((sum, num) => sum + num, 0) / reliabilityHelpers.length : 0;
            if (rH == 0) {rH = 1};

            // let rU = 1;
            // for (let i = 0; i < reliabilityUsers.length; i++)
            // {
            //     rU *= (1 - reliabilityUsers[i]);
                
            // }
            // rU = 1 - rU;
            let rU = reliabilityUsers.length > 0 ? reliabilityUsers.reduce((sum, num) => sum + num, 0) / reliabilityUsers.length : 0;
            if (rU == 0) {rU = 1};

            const initialR = 0.98;
            PlatformReliability = initialR * rT1 * rT2 * rT3 * rH * rU;
            
        }

        //Calculate reliability of the services (software)
        let ServiceReliability;
        {
            let sR = 1;
            let serviceReliability = [];
            for (let i = 0; i < componentReliabilityScore.length; i += this.services[0]['components'].length) {
                for (let j = i; j < i + this.services[0]['components'].length; j++) {
                    sR *= componentReliabilityScore[i];
                }
                serviceReliability.push(sR);
                sR = 1;
            }
            const sumR = serviceReliability.reduce((acc, currentValue) => acc + currentValue, 0);
            ServiceReliability = sumR / this.services.length;
        }

        //Calculate total response time
        const totalCommunicationTime = componentCommunicationTime.reduce((acc, currentValue) => acc + currentValue, 0);
        const totalExecutionTime = componentExecutionTime.reduce((acc, currentValue) => acc + currentValue, 0);
        const totalWaitingTime = componentWaitingTime.reduce((acc, currentValue) => acc + currentValue, 0);
        const totalDependenciesDelay = componentDependenciesDelay.reduce((acc, currentValue) => acc + currentValue, 0);
        const totalProviderDelay = componentProviderDelay.reduce((acc, currentValue) => acc + currentValue, 0);
        const totalCodecDelay = componentCodecDelay.reduce((acc, currentValue) => acc + currentValue, 0);
        const ResponseTime = totalCommunicationTime + totalExecutionTime + totalWaitingTime + totalDependenciesDelay + totalProviderDelay + totalCodecDelay;

        return {
            //totalCommunicationTime,
            //totalExecutionTime,
            //totalWaitingTime,
            //totalDependenciesDelay,
            //totalProviderDelay,
            //totalCodecDelay,
            ResponseTime,
            PlatformReliability,
            ServiceReliability
        };
    }

    loadAnalyser(solution)
    {
        const len = this.users[this.users.length - 1]['nodeID'];
        const arrayOfZeros = new Array(len).fill(0);
        const tierLoad = new Array(5).fill(0);

        const nodeIDmax = this.computingNodes[this.computingNodes.length - 1]['nodeID'];
        const helperIDmax = this.helpers[this.helpers.length - 1]['nodeID'];
        const userIDmax = this.users[this.users.length - 1]['nodeID'];
        for (let i = 0; i < solution.length; i++)
        {
            const K = solution[i][3];
            let counter = 0;
            for (let j = 0; j < solution.length; j++)
            {
                if (K == 0)
                {
                    break;
                }
                else if (K == solution[j][3] && solution[j][3] != 0)
                {
                    counter++;
                    solution[j][3] = 0;
                }
            }

            arrayOfZeros[K] = counter;
            if (K != 0 && K <= nodeIDmax) //So it is a computing node
            {
                tierLoad[this.computingNodes[K-1]['nodeTier']-1] += counter;
            }
            else if (K > nodeIDmax && K <= helperIDmax) //So it is a helper node
            {
                tierLoad[3] += counter;
            }
            else if (K > helperIDmax && K <= userIDmax) //So it is a user node
            {
                tierLoad[4] += counter;
            }
        }
        const sum = tierLoad.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
        const tierAPs = tierLoad[0]/sum;
        const tierEdgeNodes = tierLoad[1]/sum;
        const tierCloudNodes = tierLoad[2]/sum;
        const tierHelperNodes = tierLoad[3]/sum;
        const tierUserNodes = tierLoad[4]/sum;
        const percentage = {tier1: parseFloat(tierAPs.toFixed(4)),
            tier2: parseFloat(tierEdgeNodes.toFixed(4)),
            tier3: parseFloat( tierCloudNodes.toFixed(4)), 
            helperTier: parseFloat(tierHelperNodes.toFixed(4)), 
            userTier: parseFloat(tierUserNodes.toFixed(4))}
        //console.log('Number of SCs in each Tier: ', tierLoad);
        //console.log('Percentage of SCs in each Tier: ', percentage);
        //console.log(sum);

        return percentage;

        //fs.writeFile('percentages.txt', `${percentage}\n`, { flag: 'a' }, (err) => {});
        //fs.writeFile('tierLoad.txt', `${tierLoad}\n`, { flag: 'a' }, (err) => {});
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
                                    computingNodesFreeCapacity[cN]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][v]['characteristics']['disk'] /*&&
                                    computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][v]['characteristics']['dataSize']*/) {
                                    solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][v]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                    computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['memory'];
                                    computingNodesFreeCapacity[cN]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][v]['characteristics']['disk'];
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
                                computingNodesFreeCapacity[cN]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'] /*&&
                                computingNodesFreeCapacity[cN]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                                solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[cN]['nodeID']]);
                                computingNodesFreeCapacity[cN]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                                computingNodesFreeCapacity[cN]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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

class mostReliablity extends objFuncCalculator{ //Most reliable version on the most reliable node
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
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk']/* &&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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

class mostPowerful extends objFuncCalculator{ //Least computational version on most powerful node
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
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
                        computingNodesFreeCapacity[n]['characteristics']['disk'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'] /*&&
                        computingNodesFreeCapacity[n]['characteristics']['networkBW'] > this.services[u]['components'][c]['versions'][inx]['characteristics']['dataSize']*/) {
                        solution.push([this.services[u]['serviceID'], this.services[u]['components'][c]['componentID'], this.services[u]['components'][c]['versions'][inx]['versionNumber'], computingNodesFreeCapacity[n]['nodeID']]);
                        computingNodesFreeCapacity[n]['characteristics']['memory'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['memory'];
                        computingNodesFreeCapacity[n]['characteristics']['disk'] -= this.services[u]['components'][c]['versions'][inx]['characteristics']['disk'];
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
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.ans = config.ans

        this.iteration = config.iteration;
        this.cProbability = config.cProbability;
        this.mProbability = config.mProbability;
        this.numPopulation = config.numPopulation;
        this.tournamentSize = config.tournamentSize;
    }

    initialPopulation() {
        let population = [];
        for (let i = 0; i < this.numPopulation; i++) {
            population.push(this.healing(this.validation(this.randomSolution())))
        }
        return population;
    }

    calculateTimes(population) {
        const times = new objFuncCalculator(this.ans);
        const populationTimes = [];
        for (let i = 0; i < population.length; i++) {
            populationTimes.push(times.calculate(population[i]));
        }
        //console.log(populationTimes);
        return populationTimes;
    }

    normalizedFitness(populationTimes, maxValue) {
        let fitness = [];
        const w1 = 1;
        const w2 = 1;
        const w3 = 1;
        for (let i = 0; i < populationTimes.length; i++) {
            populationTimes[i]['ResponseTime'] = populationTimes[i]['ResponseTime'] / maxValue;
            populationTimes[i]['PlatformReliability'] = 1 - populationTimes[i]['PlatformReliability'];
            populationTimes[i]['ServiceReliability'] = 1 - populationTimes[i]['ServiceReliability'];

            fitness.push(w1 * populationTimes[i]['ResponseTime'] + w2 * populationTimes[i]['PlatformReliability'] + w3 * populationTimes[i]['ServiceReliability']);
        }
        return fitness;
        //return populationTimes;
    }

    fitness(population, maxValue) {
        const populationTimes = this.calculateTimes(population);

        const popFitness = this.normalizedFitness(populationTimes, maxValue);
        return popFitness;
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

    tournamentSelection2(population, fitness) {
        let selectedPopulation = [];
        let K, minCost, bestIndividual;
        let costs = fitness;
        for (let n = 0; n < population.length; n++) {
            K = Math.floor(getRandomValue(0, population.length));
            minCost = costs[K];
            bestIndividual = K;
            for (let i = 0; i < this.tournamentSize; i++) {
                K = Math.floor(getRandomValue(0, population.length));
                if (costs[K] < minCost) {
                    bestIndividual = K;
                    minCost = costs[K];
                }
            }
            selectedPopulation.push(population[bestIndividual]);
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

        const startTime = performance.now();

        let population = this.initialPopulation();
        let calTimes = this.calculateTimes(population);
        let maxValue = 0;
        for (let i = 0; i < calTimes.length; i++) {
            if (maxValue < calTimes[i]['ResponseTime']) {
                maxValue = calTimes[i]['ResponseTime'];
            }
        }
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
                fitnessInfoPrev['fitnessBest'] = fitnessInfoCurrent['fitnessBest'];
                fitnessInfoPrev['bestCosts'] = fitnessInfoCurrent['bestCosts'];
                fitnessInfoPrev['bestSolution'] = fitnessInfoCurrent['bestSolution'];
            }

            // fitnessInfoPrev['fitnessMedian'] = fitnessInfoCurrent['fitnessMedian'];
            // fitnessInfoPrev['fitnessWorst'] = fitnessInfoCurrent['fitnessWorst'];
            // bestConvergenceProcess.push(fitnessInfoPrev['fitnessBest']);
            // medianConvergenceProcess.push(fitnessInfoPrev['fitnessMedian']);
            // worstConvergenceProcess.push(fitnessInfoPrev['fitnessWorst']);
        }

        const endTime = performance.now();
        const exeTime = endTime - startTime;

        //const dataBest = bestConvergenceProcess.join('\n');
        //const dataMedian = medianConvergenceProcess.join('\n');
        //const dataWorst = worstConvergenceProcess.join('\n');
        //fs.writeFileSync('./dataBest.txt', dataBest);
        //fs.writeFileSync('./dataMedian.txt', dataMedian);
        //fs.writeFileSync('./dataWorst.txt', dataWorst);

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

class fineTuningGA{ //Grid search cross validation tuning
    constructor(algoConfig) {
        const config = algoConfig;
        this.ans = config.ans;
        this.folds = config.folds;
        this.populationSizes = config.populationSizes;
        this.mutationRates = config.mutationRates;
        this.crossoverRates = config.crossoverRates;
        this.tournamentSelectionSize = config.tournamentSelectionSize;
        this.iteration = config.iteration;
    }

    tuning() {
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

    optConfiguration()
    {
       
            function getRandomValue(min, max) {
                return Math.floor(Math.random() * (max - min) + min);
            }
        
            function median(winners)
            {
                let optConf = [];
                for (let n = 0; n < 4; n++)// there are 4 columns (0 = popsize, 1 = mutation, crossover = 2, popsize = 3)
                {
                    for (let i = 0; i < winners.length - 1; i++)
                    {
                        for (let j = 0; j < winners.length - 1; j++)
                        {
                            if (winners[j][n] > winners[j + 1][n])
                            {
                                const temp = winners[j][n];
                                winners[j][n] = winners[j + 1][n];
                                winners[j + 1][n] = temp;
                            }
                        }
                    }
                    optConf.push(winners[Math.floor(winners.length/2)][n]); // Selec the median parameter
                }
                const conf = {
                    popSize: optConf[0],
                    mutation: optConf[1],
                    crossover: optConf[2],
                    selectionSize: optConf[3]
                };
                return conf;
            }

            let scale;
            if (this.ans['scale'] == 'all')
            {
                scale = ['small.csv', 'medium.csv', 'large.csv', 'xLarge.csv'];
            }
            else if (this.ans['scale'] == 'small')
            {
                scale = ['small.csv'];
            }
            else if (this.ans['scale'] == 'medium')
            {
                scale = ['medium.csv'];
            }
            else if (this.ans['scale'] == 'large')
            {
                scale = ['large.csv'];
            }
            else if (this.ans['scale'] == 'xlarge')
            {
                scale = ['xLarge.csv'];
            }
            else if (this.ans['scale'] == 'ave')
            {
                scale = ['ave.csv'];
            }

            let optScale = [];
            let success = false;
            while(success == false)
            {
                
                try
                {
                for (let s = 0; s < scale.length; s++)
                {
                    
                    const csvFileContent = fs.readFileSync(`./tuningGA/${scale[s]}`, 'utf8');
                    const rows = csvFileContent.split('\n');
                    const dataArray = [];
                    for (const row of rows) {
                        const cells = row.split(',');
                        dataArray.push(cells);
                    }
                    const ConfigsInt = dataArray.map(row => row.map(Number));
                    ConfigsInt.splice(0, 1);
                    const numberOfConfigs = ConfigsInt.length - 1;
                    let paretoFront = [];
                    let unchangeCounter = 0;
                    for (let i = 0; i < numberOfConfigs; i++)
                    {
                        paretoFront.push(ConfigsInt[i]);
                    }
                
                    while(unchangeCounter < numberOfConfigs / 10)
                    {
                        const x1 = paretoFront.length;
                        const xx = getRandomValue(0, paretoFront.length - 1);
                
                        for (let i = 0; i < paretoFront.length; i++)
                        {
                            if (paretoFront[xx][4] < paretoFront[i][4] && paretoFront[xx][5] < paretoFront[i][5])
                            {
                                paretoFront.splice(i, 1);
                            }
                        }
                
                        const x2 = paretoFront.length;
                
                        if (x1 == x2)
                        {
                            unchangeCounter++;
                        }
                        else
                        {
                            unchangeCounter = 0;
                        }
                    }
                    
                    if (paretoFront.length % 2 == 0)
                    {
                        paretoFront.splice(0, 1);
                    }
    
                    //console.log(paretoFront);
                    
                    optScale.push(median(paretoFront));
                }
                success = true;
                return optScale;
            }
            catch{}
            }
    }
}

class simulatedAnnealing extends solutionGenerator {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.ans = config.ans

        this.termination = config.termination;
        this.temperature = config.temperature;
        this.alpha = config.alpha;
        this.rate = config.rate;
    }

    initialSolution() 
    {
        return this.healing(this.validation(this.randomSolution()));
    }

    neighborSolution(solution) {
        const numVersions = (this.services[0]['components'][0]['versions']).length;
        const numNodes = this.computingNodes.length + this.users.length + this.helpers.length;
        let neighboringSolution = JSON.parse(JSON.stringify(solution));
        for (let i = 0; i < neighboringSolution.length; i++) {
            if (Math.random() < this.rate) {
                neighboringSolution[i][2] = Math.floor(getRandomValue(1, numVersions));
            }
            if (Math.random() < this.rate){
                neighboringSolution[i][3] = Math.floor(getRandomValue(1, numNodes));
            }
        }
        return this.healing(this.validation(neighboringSolution));
    }

    calculateCost(solution) {
        const cost = new objFuncCalculator(this.ans);
        return cost.calculate(solution);
    }

    fitness(solution, maxValue) {
        const cost = this.calculateCost(solution);
        cost['ResponseTime'] = cost['ResponseTime'] / maxValue;
        cost['PlatformReliability'] = 1 - cost['PlatformReliability'];
        cost['ServiceReliability'] = 1 - cost['ServiceReliability'];
        return cost['ResponseTime'] + cost['PlatformReliability'] +  cost['ServiceReliability'];
    }

    run() {

        const startTime = performance.now();

        let solution = this.initialSolution();
        const maxValue = (this.calculateCost(solution))['ResponseTime'];
        let bestPrevCost = this.fitness(solution, maxValue);
        let bestPrevSolution = JSON.parse(JSON.stringify(solution));

        while (this.temperature > this.termination) {
            const currentFitness = this.fitness(solution, maxValue);
            if (bestPrevCost > currentFitness) {
                bestPrevCost = currentFitness;//JSON.parse(JSON.stringify(currentFitness));
                bestPrevSolution = solution; //JSON.parse(JSON.stringify(solution));
                //console.log(bestPrevCost);
                //console.log(f.calculate(solution));
            }

            let neighbor = this.neighborSolution(solution);
            const neighborFitness = this.fitness(neighbor, maxValue);
            if (currentFitness > neighborFitness) {
                solution = neighbor;
            }
            else {
                const diff = neighborFitness - currentFitness;
                const P = Math.exp(- diff / this.temperature);
                this.temperature = this.temperature * this.alpha
                if (Math.random() < P) {
                    solution = neighbor;
                }
            }
        }
        const endTime = performance.now();
        const exeTime = endTime - startTime;

        const costCal = new objFuncCalculator(this.ans);
        const cost = costCal.calculate(bestPrevSolution);
        const loadDist = costCal.loadAnalyser(bestPrevSolution);
        return {
            totalResponseTime: cost['ResponseTime'],
            platformReliability: cost['PlatformReliability'],
            serviceReliability: cost['ServiceReliability'],
            loadTier1: loadDist['tier1'],
            loadTier2: loadDist['tier2'],
            loadTier3: loadDist['tier3'],
            loadTierHelper: loadDist['helperTier'],
            loadTierUser: loadDist['userTier'],
            runtime: exeTime,
            fitness: bestPrevCost
        }
    }
}

class fineTuningSA { //Grid search cross validation tuning
    constructor(algoConfig) {
        const config = algoConfig;
        this.ans = config.ans;
        this.folds = config.folds;
        this.termination = config.termination;
        this.temperature = config.temperature;
        this.alpha = config.alpha;
        this.rate = config.rate;
    }

    tuning() {
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
                                ans: folds[f],
                                termination: varTerm,
                                temperature: varTemp,
                                alpha: varAlph,
                                rate: varRate,
                            };
                            const sA = new simulatedAnnealing(config);
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
                            fitness: aveFitness,
                            runtime: aveRuntime
                        }

                        results.push(prm);
                    }
                }
            }
        }
        // Create a CSV writer
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

    optConfiguration()
    {
       
            function getRandomValue(min, max) {
                return Math.floor(Math.random() * (max - min) + min);
            }
        
            function median(winners)
            {
                let optConf = [];
                for (let n = 0; n < 4; n++)// there are 4 columns (0 = popsize, 1 = mutation, crossover = 2, popsize = 3)
                {
                    for (let i = 0; i < winners.length - 1; i++)
                    {
                        for (let j = 0; j < winners.length - 1; j++)
                        {
                            if (winners[j][n] > winners[j + 1][n])
                            {
                                const temp = winners[j][n];
                                winners[j][n] = winners[j + 1][n];
                                winners[j + 1][n] = temp;
                            }
                        }
                    }
                    optConf.push(winners[Math.floor(winners.length/2)][n]); // Selec the median parameter
                }
                const conf = {
                    termination: optConf[0],
                    temperature: optConf[1],
                    alpha: optConf[2],
                    rate: optConf[3]
                };
                return conf;
            }

            let scale;
            if (this.ans['scale'] == 'all')
            {
                scale = ['small.csv', 'medium.csv', 'large.csv', 'xLarge.csv'];
            }
            else if (this.ans['scale'] == 'small')
            {
                scale = ['small.csv'];
            }
            else if (this.ans['scale'] == 'medium')
            {
                scale = ['medium.csv'];
            }
            else if (this.ans['scale'] == 'large')
            {
                scale = ['large.csv'];
            }
            else if (this.ans['scale'] == 'xlarge')
            {
                scale = ['xLarge.csv'];
            }
            else if (this.ans['scale'] == 'ave')
            {
                scale = ['ave.csv'];
            }

            const optScale = [];
            let success = false;
            while(success == false)
            {
                try
                {
                for (let s = 0; s < scale.length; s++)
                {
                    const csvFileContent = fs.readFileSync(`./tuningSA/${scale[s]}`, 'utf8');
                    const rows = csvFileContent.split('\n');
                    const dataArray = [];
                    for (const row of rows) {
                        const cells = row.split(',');
                        dataArray.push(cells);
                    }
                    const ConfigsInt = dataArray.map(row => row.map(Number));
                    ConfigsInt.splice(0, 1);
                    const numberOfConfigs = ConfigsInt.length - 1;
                    let paretoFront = [];
                    let unchangeCounter = 0;
                    for (let i = 0; i < numberOfConfigs; i++)
                    {
                        paretoFront.push(ConfigsInt[i]);
                    }
                
                    while(unchangeCounter < numberOfConfigs / 10)
                    {
                        const x1 = paretoFront.length;
                        const xx = getRandomValue(0, paretoFront.length - 1);
                
                        for (let i = 0; i < paretoFront.length; i++)
                        {
                            if (paretoFront[xx][4] < paretoFront[i][4] && paretoFront[xx][5] < paretoFront[i][5])
                            {
                                paretoFront.splice(i, 1);
                            }
                        }
                
                        const x2 = paretoFront.length;
                
                        if (x1 == x2)
                        {
                            unchangeCounter++;
                        }
                        else
                        {
                            unchangeCounter = 0;
                        }
                    }
                    
                    if (paretoFront.length % 2 == 0)
                    {
                        paretoFront.splice(0, 1);
                    }
    
                    //console.log(paretoFront);
                    
                    optScale.push(median(paretoFront));
                }
                success = true;
                return optScale;
            }
            catch{}
            }
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
    fineTuningGA,
    simulatedAnnealing,
    fineTuningSA
}