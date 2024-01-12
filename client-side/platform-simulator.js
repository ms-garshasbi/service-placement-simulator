const axios = require('axios');
const fs = require('fs');
const configurations = readJSON("configurations.json");

const args = process.argv.slice(2);
const ip = configurations['address']['ip'];
const port = configurations['address']['port'];
let url = `http://${ip}:${port}/json`;


function sendAxiosPost(url, dataObj) {
    axios.post(url, dataObj)
        .then((res) => {
            console.log(res.data);
        })
        .catch((err) => {
            console.log(err);
        })
}

function getRandomValue(min, max) {
    return Math.random() * (max - min) + min;
}

function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}

class computingNodesGenerator {
    constructor(systemConfig) {
        const config = systemConfig;
        
        //Access point nodes
        this.minAPCPUKMIPS = config.minAPCPUKMIPS;
        this.maxAPCPUKMIPS = config.maxAPCPUKMIPS;
        this.minAPMemoryMB = config.minAPMemoryMB;
        this.maxAPMemoryMB = config.maxAPMemoryMB;
        this.minAPNetworkMbps = config.minAPNetworkMbps;
        this.maxAPNetworkMbps = config.maxAPNetworkMbps;
        this.minAPDiskGB = config.minAPDiskGB;
        this.maxAPDiskGB = config.maxAPDiskGB;
        this.minAPrtt = config.minAPrtt;
        this.maxAPrtt = config.maxAPrtt;
        this.APNumNode = config.APNumNode;
        this.APplatform = config.APplatform;

        //Edge nodes
        this.minENCPUKMIPS = config.minENCPUKMIPS;
        this.maxENCPUKMIPS = config.maxENCPUKMIPS;
        this.minENMemoryMB = config.minENMemoryMB;
        this.maxENMemoryMB = config.maxENMemoryMB;
        this.minENNetworkMbps = config.minENNetworkMbps;
        this.maxENNetworkMbps = config.maxENNetworkMbps;
        this.minENDiskGB = config.minENDiskGB;
        this.maxENDiskGB = config.maxENDiskGB;
        this.minENrtt = config.minENrtt;
        this.maxENrtt = config.maxENrtt;
        this.ENNumNode = config.ENNumNode;
        this.ENplatform = config.ENplatform;

        //Cloud nodes
        this.minCNCPUKMIPS = config.minCNCPUKMIPS;
        this.maxCNCPUKMIPS = config.maxCNCPUKMIPS;
        this.minCNMemoryMB = config.minCNMemoryMB;
        this.maxCNMemoryMB = config.maxCNMemoryMB;
        this.minCNNetworkMbps = config.minCNNetworkMbps;
        this.maxCNNetworkMbps = config.maxCNNetworkMbps;
        this.minCNDiskGB = config.minCNDiskGB;
        this.maxCNDiskGB = config.maxCNDiskGB;
        this.minCNrtt = config.minCNrtt;
        this.maxCNrtt = config.maxCNrtt;
        this.CNNumNode = config.CNNumNode;
        this.CNplatform = config.CNplatform;

        //this.score = config.score;
        this.minBandwidthInTier = config.minBandwidthInTier;
        this.maxBandwidthInTier = config.maxBandwidthInTier;
        this.minLatencyInTier = config.minLatencyInTier;
        this.maxLatencyInTier = config.maxLatencyInTier;
        this.minrttInTier = config.minrttInTier;
        this.maxrttInTier = config.maxrttInTier;
        this.minBandwidthOutTier = config.minBandwidthOutTier;
        this.maxBandwidthOutTier = config.maxBandwidthOutTier;
        this.minLatencyOutTier = config.minLatencyOutTier;
        this.maxLatencyOutTier = config.maxLatencyOutTier;
        this.minrttOutTier = config.minrttOutTier;
        this.maxrttOutTier = config.maxrttOutTier;
        this.numTier = config.numTier;

        this.jsonResult = [];
    }

    getReliabilityScore(min, max) {
        return getRandomValue(min, max);
    }

    generate() {
        let id = 0;
        let s = 1;
        for (let r = 1; r <= this.numTier; r++) 
        {
                if (r == 1)
                {
                    for (let i = 0; i < this.APNumNode; i++) {
                        let computingNode = {
                            nodeID: ++id,
                            nodeTier: r,
                            characteristics: {
                                cpu: getRandomValue(this.minAPCPUKMIPS, this.maxAPCPUKMIPS),
                                memory: getRandomValue(this.minAPMemoryMB, this.maxAPMemoryMB),
                                networkBW: getRandomValue(this.minAPNetworkMbps, this.maxAPNetworkMbps),
                                disk: getRandomValue(this.minAPDiskGB, this.maxAPDiskGB),
                                platform: this.APplatform[Math.floor(Math.random() * this.APplatform.length)],
                                rtt: getRandomValue(this.minAPrtt, this.maxAPrtt),
                                reliabilityScore: this.getReliabilityScore(0.85, 0.98)
                            }
                        }
                        this.jsonResult.push(computingNode);
                    }
                }
                else if (r == 2)
                {
                    for (let i = 0; i < this.ENNumNode; i++)
                    {
                        let computingNode = {
                            nodeID: ++id,
                            nodeTier: r,
                            characteristics: {
                                cpu: getRandomValue(this.minENCPUKMIPS, this.maxENCPUKMIPS),
                                memory: getRandomValue(this.minENMemoryMB, this.maxENMemoryMB),
                                networkBW: getRandomValue(this.minENNetworkMbps, this.maxENNetworkMbps),
                                disk: getRandomValue(this.minENDiskGB, this.maxENDiskGB),
                                platform: this.ENplatform[Math.floor(Math.random() * this.ENplatform.length)],
                                rtt: getRandomValue(this.minENrtt, this.maxENrtt),
                                reliabilityScore: this.getReliabilityScore(0.85, 0.98)
                            }
                        }
                        this.jsonResult.push(computingNode);
                    }
                }
                else if (r == 3)
                {
                    for (let i = 0; i < this.CNNumNode; i++)
                    {
                        let computingNode = {
                            nodeID: ++id,
                            nodeTier: r,
                            characteristics: {
                                cpu: getRandomValue(this.minCNCPUKMIPS, this.maxCNCPUKMIPS),
                                memory: getRandomValue(this.minCNMemoryMB, this.maxCNMemoryMB),
                                networkBW: getRandomValue(this.minCNNetworkMbps, this.maxCNNetworkMbps),
                                disk: getRandomValue(this.minCNDiskGB, this.maxCNDiskGB),
                                platform: this.CNplatform[Math.floor(Math.random() * this.CNplatform.length)],
                                rtt: getRandomValue(this.minCNrtt, this.maxCNrtt),
                                reliabilityScore: this.getReliabilityScore(0.85, 0.98)
                            }
                        }
                        this.jsonResult.push(computingNode);
                    }
                }
        }
        return this.jsonResult;
    }

    connections() {
        const connectionMatrix = [];
        for (let n = 0; n < this.jsonResult.length; n++) {
            connectionMatrix[n] = [];
            for (let m = 0; m < this.jsonResult.length; m++) {
                if (this.jsonResult[n].nodeTier == this.jsonResult[m].nodeTier) {
                    connectionMatrix[n][m] = [
                        Math.floor(Math.random() * (this.maxBandwidthInTier - this.minBandwidthInTier + 1) + this.minBandwidthInTier),
                        Math.floor(Math.random() * (this.maxLatencyInTier - this.minLatencyInTier + 1) + this.minLatencyInTier),
                        Math.floor(Math.random() * (this.maxrttInTier - this.minrttInTier + 1) + this.minrttInTier)
                    ];
                }
                else if (this.jsonResult[n].nodeTier != this.jsonResult[m].nodeTier) {
                    connectionMatrix[n][m] = [
                        Math.floor(Math.random() * (this.maxBandwidthOutTier - this.minBandwidthOutTier + 1) + this.minBandwidthOutTier),
                        Math.floor(Math.random() * (this.maxLatencyOutTier - this.minLatencyOutTier + 1) + this.minLatencyOutTier),
                        Math.floor(Math.random() * (this.maxrttOutTier - this.minrttOutTier + 1) + this.minrttOutTier)
                    ];
                }
            }
        }

        const matrixJSON = JSON.stringify(connectionMatrix);
        return connectionMatrix;
    }

    capacity(computingNodes)
    {
        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;
        let totalNetworkCapacity = 0;
        for (let i = 0; i < computingNodes.length; i++)
        {
            totalComputationalCapacity += computingNodes[i]['characteristics']['cpu'];
            totalMemoryCapacity += computingNodes[i]['characteristics']['memory'];
            totalDiskCapacity += computingNodes[i]['characteristics']['disk'];
            totalNetworkCapacity += computingNodes[i]['characteristics']['networkBW'];
        }

        return {
            totalComputationalCapacity: totalComputationalCapacity,
            totalMemoryCapacity: totalMemoryCapacity,
            totalDiskCapacity: totalDiskCapacity,
            totalNetworkCapacity: totalNetworkCapacity
        }
    }
}

class helpersGenerator {
    constructor(helperConfig) {
        const config = helperConfig;
        this.minCPUKMIPS = config.minCPUKMIPS;
        this.maxCPUKMIPS = config.maxCPUKMIPS;
        this.minMemoryMB = config.minMemoryMB;
        this.maxMemoryMB = config.maxMemoryMB;
        this.minNetworkMbps = config.minNetworkMbps;
        this.maxNetworkMbps = config.maxNetworkMbps;
        this.minDiskGB = config.minDiskGB;
        this.maxDiskGB = config.maxDiskGB;
        this.minrtt = config.minrtt;
        this.maxrtt = config.maxrtt;
        this.os = config.os;
        this.numHelpers = config.numHelpers;
        this.numComputingNodes = config.numComputingNodes;
        this.jsonResult = [];
    }

    generate() {
        for (let i = 0; i < this.numHelpers; i++) {
            let helper = {
                nodeID: i + 1 + this.numComputingNodes,
                nodeTier: 4, //helper tier ID
                characteristics: {
                    cpu: getRandomValue(this.minCPUKMIPS, this.maxCPUKMIPS),
                    memory: getRandomValue(this.minMemoryMB, this.maxMemoryMB),
                    networkBW: getRandomValue(this.minNetworkMbps, this.maxNetworkMbps),
                    disk: getRandomValue(this.minDiskGB, this.maxDiskGB),
                    os: this.os[Math.floor(Math.random() * this.os.length)],
                    rtt: getRandomValue(this.minrtt, this.maxrtt),
                    reliability: getRandomValue(0.8, 0.95)
                }
            };

            this.jsonResult.push(helper);
        }

        return this.jsonResult;
    }

    capacity(helpers)
    {
        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;
        let totalNetworkCapacity = 0;
        for (let i = 0; i < helpers.length; i++)
        {
            totalComputationalCapacity += helpers[i]['characteristics']['cpu'];
            totalMemoryCapacity += helpers[i]['characteristics']['memory'];
            totalDiskCapacity += helpers[i]['characteristics']['disk'];
            totalNetworkCapacity += helpers[i]['characteristics']['networkBW'];
        }
        return {
            totalComputationalCapacity: totalComputationalCapacity,
            totalMemoryCapacity: totalMemoryCapacity,
            totalDiskCapacity: totalDiskCapacity,
            totalNetworkCapacity: totalNetworkCapacity
        }
    }

}

class usersGenerator {
    constructor(userConfig) {
        const config = userConfig;
        this.minCPUKMIPS = config.minCPUKMIPS;
        this.maxCPUKMIPS = config.maxCPUKMIPS;
        this.minMemoryMB = config.minMemoryMB;
        this.maxMemoryMB = config.maxMemoryMB;
        this.minNetworkMbps = config.minNetworkMbps;
        this.maxNetworkMbps = config.maxNetworkMbps;
        this.minDiskGB = config.minDiskGB;
        this.maxDiskGB = config.maxDiskGB;
        this.minrtt = config.minrtt;
        this.maxrtt = config.maxrtt;
        this.os = config.os;
        this.numUsers = config.numUsers;
        this.numComputingNodes = config.numComputingNodes;
        this.numHelpers = config.numHelpers;
        this.jsonResult = [];
    }
    generate() {
        for (let i = 0; i < this.numUsers; i++) {
            let user = {
                nodeID: i + 1 + this.numComputingNodes + this.numHelpers,
                nodeTier: 0, //user tier ID
                characteristics: {
                    cpu: getRandomValue(this.minCPUKMIPS, this.maxCPUKMIPS),
                    memory: getRandomValue(this.minMemoryMB, this.maxMemoryMB),
                    networkBW: getRandomValue(this.minNetworkMbps, this.maxNetworkMbps),
                    disk: getRandomValue(this.minDiskGB, this.maxDiskGB),
                    os: this.os[Math.floor(Math.random() * this.os.length)],
                    rtt: getRandomValue(this.minrtt, this.maxrtt),
                    reliability: getRandomValue(0.85, 0.98)
                }
            };

            this.jsonResult.push(user);
        }

        return this.jsonResult;
    }

    capacity(users)
    {
        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;
        let totalNetworkCapacity = 0;
        for (let i = 0; i < users.length; i++)
        {
            totalComputationalCapacity += users[i]['characteristics']['cpu'];
            totalMemoryCapacity += users[i]['characteristics']['memory'];
            totalDiskCapacity += users[i]['characteristics']['disk'];
            totalNetworkCapacity += users[i]['characteristics']['networkBW'];
        }
        return {
            totalComputationalCapacity: totalComputationalCapacity,
            totalMemoryCapacity: totalMemoryCapacity,
            totalDiskCapacity: totalDiskCapacity,
            totalNetworkCapacity: totalNetworkCapacity
        }
    }
}

class serviceGenerator {
    constructor(serviceConfig) {
        const config = serviceConfig;
        this.minCapacity = config.minCapacity;
        this.maxCapacity = config.maxCapacity;
        this.platformComputationalCapacity = config.platformComputationalCapacity;
        this.platformDiskCapacity = config.platformDiskCapacity;
        this.platformMemoryCapacity = config.platformMemoryCapacity;
        this.platformNetworkCapacity = config.platformNetworkCapacity;
        this.minNetworkBandwidth = config.minNetworkBandwidth;
        this.maxNetworkBandwidth = config.maxNetworkBandwidth;
        this.internalProvider = config.internalProvider;
        this.externalProvider = config.externalProvider;
        this.codecType = config.codecType;
        this.transcoderVersion = config.transcoderVersion;
        this.minCPUKMIPS = config.minCPUKMIPS;
        this.maxCPUKMIPS = config.maxCPUKMIPS;

        this.numVersions = config.numVersions;
        this.numComputingNodes = config.numComputingNodes;
        this.numHelpers = config.numHelpers;
        this.numUsers = config.numUsers;
        //Minimum and maximum latency of two dependent components
        this.minRequiredLatency = config.minRequiredLatency;
        this.maxRequiredLatency = config.maxRequiredLatency;
        //Minimum and maximum required bandwidth (Mbps) of two dependent components considered to generate randomly.
        this.minDataSizeCommunicationPercent = config.minDataSizeCommunicationPercent;
        this.maxDataSizeCommunicationPercent = config.maxDataSizeCommunicationPercent;
        this.jsonResult = [];

    }

    getReliabilityScore(min, max) {
        let rl = Math.random();
        if (rl <= 0.5)
        {
            return getRandomValue(0.98, 0.999);
        }
        else
        {
            return getRandomValue(min, max);
        }
        
    }

    getProvider() {
        let p = Math.round(getRandomValue(0, 1));
        if (p == 0) {
            let randomIndex = Math.floor(Math.random() * this.internalProvider.length);
            return this.internalProvider[randomIndex];
        }
        else if (p == 1) {
            let randomIndex = Math.floor(Math.random() * this.externalProvider.length);
            return this.externalProvider[randomIndex];
        }
    }

    getCodecType() {
        let randomIndex = Math.floor(Math.random() * this.codecType.length);
        return this.codecType[randomIndex];
    }

    getTranscoderVersion() {
        let randomIndex = Math.floor(Math.random() * this.transcoderVersion.length);
        return this.transcoderVersion[randomIndex];
    }

    shuffleArray(arr) 
    {
        for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]; // Swap elements at indices i and j
        }
        return arr;
    }

    generate()
    {
        //Computational
        const platformComputational = this.platformComputationalCapacity * getRandomValue(this.minCapacity, this.maxCapacity);
        const requieredCPU = [this.minCPUKMIPS , this.maxCPUKMIPS];
        const numServiceComponents = Math.floor(((platformComputational / requieredCPU[0]) + (platformComputational / requieredCPU[1])) / 2);

        //Disk
        const platformDisk = this.platformDiskCapacity * getRandomValue(0.2, 0.3);
        const requiredDiskMean = platformDisk / numServiceComponents //Mean
        const requiredDisk = [Math.floor(requiredDiskMean * 0.7), Math.floor(requiredDiskMean * 1.3)]; //30 percentage (above/below) of the mean

        //Memory
        const platformMemory = this.platformMemoryCapacity * getRandomValue(this.minCapacity, this.maxCapacity);
        const requiredMemoryMean = platformMemory / numServiceComponents //Mean
        const requiredMemory = [Math.floor(requiredMemoryMean * 0.7), Math.floor(requiredMemoryMean * 1.3)]; //30 percentage (above/below) of the mean

        //Network
        const platformNetwork = this.platformNetworkCapacity * getRandomValue(this.minCapacity, this.maxCapacity);
        const requiredNetworkMean = platformNetwork / numServiceComponents //Mean
        const requiredNetwork = [Math.floor(requiredNetworkMean * 0.7), Math.floor(requiredNetworkMean * 1.3)]; //30 percentage (above/below) of the mean

        let CPUversions = [];
        let memoryVersions = [];
        let diskVersions = [];
        let dataSizeVersions = [];

        for (let i = 0; i < this.numVersions; i++)
        {
            //Computational
            let newArrayCPU = Array.from({ length: numServiceComponents }, () => requieredCPU[0]);
            let totalSumCPU = newArrayCPU.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
            while (platformComputational > totalSumCPU)
            {
                totalSumCPU = newArrayCPU.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                const min = Math.min(...newArrayCPU);
                const minIndex = newArrayCPU.indexOf(min);
                newArrayCPU[minIndex] = getRandomValue(requieredCPU[0], requieredCPU[1]);
                newArrayCPU = this.shuffleArray([...newArrayCPU]);
            }
            CPUversions.push(newArrayCPU);
            
            //Disk
            let newArrayDisk = Array.from({ length: numServiceComponents }, () => requiredDisk[0]);
            let totalSumDisk = newArrayDisk.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
            while (platformDisk > totalSumDisk)
            {
                totalSumDisk = newArrayDisk.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                const min = Math.min(...newArrayDisk);
                const minIndex = newArrayDisk.indexOf(min);
                newArrayDisk[minIndex] = getRandomValue(requiredDisk[0], requiredDisk[1]);
                newArrayDisk = this.shuffleArray([...newArrayDisk]);
            }
            diskVersions.push(newArrayDisk);

            //Memory
            let newArrayMemory = Array.from({ length: numServiceComponents }, () => requiredMemory[0]);
            let totalSumMemory = newArrayMemory.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
            while (platformMemory > totalSumMemory)
            {
                totalSumMemory = newArrayMemory.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                const min = Math.min(...newArrayMemory);
                const minIndex = newArrayMemory.indexOf(min);
                newArrayMemory[minIndex] = getRandomValue(requiredMemory[0], requiredMemory[1]);
                newArrayMemory = this.shuffleArray([...newArrayMemory]);
            }
            memoryVersions.push(newArrayMemory);

            //Data size
            let newArrayNetwork = Array.from({ length: numServiceComponents }, () => requiredNetwork[0]);
            let totalSumNetwork = newArrayNetwork.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
            while (platformNetwork > totalSumNetwork)
            {
                totalSumNetwork = newArrayNetwork.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
                const min = Math.min(...newArrayNetwork);
                const minIndex = newArrayNetwork.indexOf(min);
                newArrayNetwork[minIndex] = getRandomValue(requiredNetwork[0], requiredNetwork[1]);
                newArrayNetwork = this.shuffleArray([...newArrayNetwork]);
            }
            dataSizeVersions.push(newArrayNetwork);
        }

        const numServicesCompnentEach = Math.floor(numServiceComponents / this.numUsers);
        let jsonResult = [];
        let comID = 1;
        let cT = 0;
        let hID = this.numComputingNodes + 1
        let uID = this.numComputingNodes + this.numHelpers + 1;
        const sT = this.numUsers;
        for(let s = 0; s < sT; s++)
        {
            const service = {
                serviceID: s + 1,
                components: [],
                userID: uID,
                helperID: hID
            }
            uID++;
            hID++;
            if (hID >= this.numComputingNodes + 1 + this.numHelpers)
            {
                hID = this.numComputingNodes + 1;
            }
            for (let c = 0; c < numServicesCompnentEach; c++)
            {
                const component = {
                    componentID: comID,
                    versions: []
                };
                for (let v = 0; v < this.numVersions; v++)
                {
                    const version = {
                        versionNumber: v + 1,
                        characteristics: {
                            cpu: CPUversions[v][cT],
                            memory: memoryVersions[v][cT],
                            dataSize: dataSizeVersions[v][cT],
                            disk: diskVersions[v][cT],
                            provider: this.getProvider(),
                            codecType: this.getCodecType(),
                            transcoderVersion: this.getTranscoderVersion(),
                            reliabilityScore: this.getReliabilityScore(0.9, 0.99)
                        }
                    };
                    component.versions.push(version);
                }
                comID++;
                cT++;
                service.components.push(component);
            }
            comID = 1;
            jsonResult.push(service);
        }

        return {
            services: jsonResult,
            min_max_CPUrequired: requieredCPU,
            min_max_MAMORYrequired: requiredMemory,
            min_max_DISKrequired: requiredDisk,
            min_max_DATASIZE: requiredNetwork,
            num_serviceComponentEach: numServicesCompnentEach,
            num_services: jsonResult.length
        }
    }

    requiredCapacity(services)
    {
        let totalComputationalRequirement = 0;
        let totalMemoryRequirement = 0;
        let totalDiskRequirement = 0;
        let totalNetworkRequirement = 0;
        for (let i = 0; i < services.length; i++)
        {
            for (let c = 0; c < services[i]['components'].length; c++)
            {
                for (let v = 0; v < services[i]['components'][c]['versions'].length; v++)
                {
                    totalComputationalRequirement += services[i]['components'][c]['versions'][v]['characteristics']['cpu'];
                    totalMemoryRequirement += services[i]['components'][c]['versions'][v]['characteristics']['memory'];
                    totalDiskRequirement += services[i]['components'][c]['versions'][v]['characteristics']['disk'];
                    totalNetworkRequirement += services[i]['components'][c]['versions'][v]['characteristics']['dataSize'];
                }
            }
        }
        return {
            totalComputationalRequirement: totalComputationalRequirement / this.numVersions,
            totalMemoryRequirement: totalMemoryRequirement / this.numVersions,
            totalDiskRequirement: totalDiskRequirement / this.numVersions,
            totalNetworkRequirement: totalNetworkRequirement / this.numVersions
        }
    }

    connections(minDataSize, maxDataSize, services) {

        function createMatrix(n, m) {
            const matrix = [];
            for (let i = 0; i < n; i++) {
              const row = [];
              for (let j = 0; j < m; j++) {
                row.push(0);
              }
              matrix.push(row);
            }
            return matrix;
        }


        let sMatrix = [];
        const MaxL = this.maxRequiredLatency;
        const MinL = this.minRequiredLatency;
        const MaxB = maxDataSize * this.maxDataSizeCommunicationPercent;
        const MinB = minDataSize * this.minDataSizeCommunicationPercent;
        const numComponents = services['services'][0]['components'].length;
        const numServices = services['services'][0].length;
        //let connMatrix = createMatrix(numServices, numComponents);
       
        for (let s = 0; s < this.numUsers; s++) {
            let matrix = new Array(numComponents).fill(0).map(() => new Array(numComponents).fill(0));
            for (let i = 0; i < numComponents; i++) {
                for (let j = 0; j < numComponents; j++) {
                    if (j >= i && Math.round(Math.random()) == 1) 
                    {
                        matrix[i][j] = [Math.floor(Math.random() * (MaxL - MinL + 1) + MinL), Math.floor(Math.random() * (MaxB - MinB + 1) + MinB)];
                    }
                    else 
                    {
                        matrix[i][j] = 0;  // Set value to 0 for lower triangular elements to keep priorities
                    }
                }
            }
            sMatrix.push(matrix.slice());
        }

        return sMatrix;
    }

}

class commands {
    constructor ()
    {
    }

    newUseCase ()
    {
        const newUseCase = {
            number_users: configurations['useCase']['new']['numberOfUsers'],
            number_helpers: configurations['useCase']['new']['numberOfHelpers'],
            number_tier1: configurations['useCase']['new']['numberOfAccessPoints'],
            number_tier2: configurations['useCase']['new']['numberOfEdgeNodes'],
            number_tier3: configurations['useCase']['new']['numberOfCloudNodes'],
            number_versions: configurations['useCase']['new']['numbeOfServiceComponentsVersions'],
        }
        const numUsers = parseInt(newUseCase['number_users']);
        const numHelpers = parseInt(newUseCase['number_helpers']);
        const numAPs = parseInt(newUseCase['number_tier1']);
        const numEdgeNodes = parseInt(newUseCase['number_tier2']);
        const numCloudNodes = parseInt(newUseCase['number_tier3']);
        const numVersions = parseInt(newUseCase['number_versions']);
        const numSlaves = parseInt(newUseCase['PGA_slaves']);
        const totalComputingNodes = numAPs + numEdgeNodes + numCloudNodes;

        //Platform
        const computingNodesConfig = {
            //Tier one configuration (APs)
            minAPCPUKMIPS: 1.5, //1000*MIPS
            maxAPCPUKMIPS: 2.5,

            minAPMemoryMB: 4096,
            maxAPMemoryMB: 8192,

            minAPNetworkMbps: 1000,
            maxAPNetworkMbps: 1000,

            minAPDiskGB: 8,
            maxAPDiskGB: 32,

            minAPGPU: 0,
            maxAPGPU: 0,
            minAPGPUcores: 0,
            maxAPGPUcores: 0,

            minAPrtt: 0.05,
            maxAPrtt: 500,

            APplatform: ['A', 'B', 'C', 'D'],

            APNumNode: numAPs,

            //Tier two configuration (Edge nodes)
            minENCPUKMIPS: 5.0,
            maxENCPUKMIPS: 15.0,

            minENMemoryMB: 8192,
            maxENMemoryMB: 16336,

            minENNetworkMbps: 400,
            maxENNetworkMbps: 500,

            minENDiskGB: 32,
            maxENDiskGB: 128,

            minENGPU: 0,
            maxENGPU: 0,
            minENGPUcores: 0,
            maxENGPUcores: 0,

            minENrtt: 250,
            maxENrtt: 1000,

            ENplatform: ['A', 'B', 'C', 'D'],

            ENNumNode: numEdgeNodes,


            //Tier three configuration (Cloud nodes)
            minCNCPUKMIPS: 15.0,
            maxCNCPUKMIPS: 30.0,

            minCNMemoryMB: 65536,
            maxCNMemoryMB: 131072,

            minCNNetworkMbps: 200,
            maxCNNetworkMbps: 400,

            minCNDiskGB: 256,
            maxCNDiskGB: 512,

            minCNGPU: 0,
            maxCNGPU: 0,
            minCNGPUcores: 0,
            maxCNGPUcores: 0,

            minCNrtt: 750,
            maxCNrtt: 2000,

            CNplatform: ['A', 'B', 'C', 'D'],

            CNNumNode: numCloudNodes,

            //For connections
            minBandwidthInTier: 100,
            maxBandwidthInTier: 150,
            minLatencyInTier: 0,
            maxLatencyInTier: 0,
            minrttInTier: 0,
            maxrttInTier: 0,
            minBandwidthOutTier: 80,
            maxBandwidthOutTier: 100,
            minLatencyOutTier: 0,
            maxLatencyOutTier: 0,
            minrttOutTier: 0,
            maxrttOutTier: 0,

            numTier: 3,
        };

        const helpersConfig = {
            minCPUKMIPS: 1.5,
            maxCPUKMIPS: 2.2,

            minMemoryMB: 2048,
            maxMemoryMB: 4096,

            minNetworkMbps: 20,
            maxNetworkMbps: 50,

            minDiskGB: 4,
            maxDiskGB: 8,

            minrtt: 750,
            maxrtt: 2000,

            numComputingNodes: totalComputingNodes,
            numHelpers: numHelpers,

            os: ['A', 'B', 'C', 'D']
        };

        const userConfig = {
            minCPUKMIPS: 0.5,
            maxCPUKMIPS: 2.2,

            minMemoryMB: 2048,
            maxMemoryMB: 4096,

            minNetworkMbps: 100, // Should not be considered
            maxNetworkMbps: 150, // Should not be considered

            minDiskGB: 4,
            maxDiskGB: 8,

            minrtt: 0,
            maxrtt: 0,

            numUsers: numUsers,
            numComputingNodes: totalComputingNodes,
            numHelpers: numHelpers,

            os: ['A', 'B', 'C', 'D']
        };

        const nodes = new computingNodesGenerator(computingNodesConfig);
        const computingNodes = nodes.generate();
        //const computingNodesConnections = nodes.connections();
        const computingNodesCapacity = nodes.capacity(computingNodes);

        const helpers = new helpersGenerator(helpersConfig);
        const helperNodes = helpers.generate();
        const helperNodesCapacity = helpers.capacity(helperNodes);

        const users = new usersGenerator(userConfig);
        const usersNodes = users.generate();
        const usersNodesCapacity = users.capacity(usersNodes);

        const platformComputingCapacity = computingNodesCapacity['totalComputationalCapacity'] + helperNodesCapacity['totalComputationalCapacity'] + usersNodesCapacity['totalComputationalCapacity'];
        const platformMemoryCapacity = computingNodesCapacity['totalMemoryCapacity'] + helperNodesCapacity['totalMemoryCapacity'] + usersNodesCapacity['totalMemoryCapacity'];
        const platformDiskCapacity = computingNodesCapacity['totalDiskCapacity'] + helperNodesCapacity['totalDiskCapacity'] + usersNodesCapacity['totalDiskCapacity'];
        const platformNetworkCapacity = computingNodesCapacity['totalNetworkCapacity'] + helperNodesCapacity['totalNetworkCapacity'] + usersNodesCapacity['totalNetworkCapacity'];

        //Services
        const serviceConfig = {
            minCapacity: 0.7, //Min percentage of total platform capacity
            maxCapacity: 0.8, //Max percentage of total platform capacity
            platformComputationalCapacity: platformComputingCapacity,
            platformDiskCapacity: platformDiskCapacity,
            platformMemoryCapacity: platformMemoryCapacity,
            platformNetworkCapacity: platformNetworkCapacity,
            minNetworkBandwidth: 80,
            maxNetworkBandwidth: 100,
            minCPUKMIPS: 1.0,
            maxCPUKMIPS: 3.0,
            internalProvider: ['K8w'],
            externalProvider: ['AWS', 'Azure', 'Ericsson'],
            codecType: ['H256', 'H264'],
            transcoderVersion: ['tA', 'tB', 'tC', 'tD'],

            numServices: numUsers,
            numVersions: numVersions,
            numComputingNodes: totalComputingNodes,
            numHelpers: numHelpers,
            numUsers: numUsers,

            minRequiredLatency: 0,
            maxRequiredLatency: 0,
            minDataSizeCommunicationPercent: 0.15,
            maxDataSizeCommunicationPercent: 0.20
        };

        const service = new serviceGenerator(serviceConfig);
        const services = service.generate();
        const servicesRequirement =  service.requiredCapacity(services['services']);

        const minDataSize = services['min_max_DATASIZE'][0];
        const maxDataSize = services['min_max_DATASIZE'][1];
        const componentConnections = service.connections(minDataSize, maxDataSize, services); //DAG

        //setting
        const dataSetting = 'Total CPU Capacity:' + ` ${platformComputingCapacity}` +
                            '\nTotal Memory Capacity:' + ` ${platformMemoryCapacity}` +
                            '\nTotal Disk Capacity:' + ` ${platformDiskCapacity}` +
                            '\nTotal Network Capacity:' + ` ${platformNetworkCapacity}` +
                            '\n\nTotal CPU requirement:' + ` ${servicesRequirement['totalComputationalRequirement']}` + (` (${(servicesRequirement['totalComputationalRequirement'] /  platformComputingCapacity).toFixed(2)})`) +
                            '\nTotal Memory requirement:' + ` ${servicesRequirement['totalMemoryRequirement']}` + (` (${(servicesRequirement['totalMemoryRequirement'] /  platformMemoryCapacity).toFixed(2)})`) +
                            '\nTotal Disk requirement:' + ` ${servicesRequirement['totalDiskRequirement']}` + (` (${(servicesRequirement['totalDiskRequirement'] /  platformDiskCapacity).toFixed(2)})`) +
                            '\nTotal Netwrok requirement:' + ` ${servicesRequirement['totalNetworkRequirement']}` + (` (${(servicesRequirement['totalNetworkRequirement'] /  platformNetworkCapacity).toFixed(2)})`) +
                            '\n\nCPU requirement range:' + ` ${services['min_max_CPUrequired']}` +
                            '\nMemory requrement range:' + ` ${services['min_max_MAMORYrequired']}` +
                            '\nDisk requirment range:' + ` ${services['min_max_DISKrequired']}` +
                            '\nData size range:' + ` ${services['min_max_DATASIZE']}` +
                            '\n\nNumber of components per service:' + ` ${services['num_serviceComponentEach']}` +
                            '\nNumber of component versions:' + ` ${numVersions}` +
                            '\nNumber of total services:' + ` ${services['num_services']}` +
                            '\nNumber of users:' + ` ${numUsers}` +
                            '\nNumber of helpers:' + ` ${numHelpers}` +
                            '\nNumber of APs:' + ` ${numAPs}` +
                            '\nNumber of edge nodes:' + ` ${numEdgeNodes}` +
                            '\nNumber of cloud nodes:' + ` ${numCloudNodes}`;

        console.log(dataSetting);

        function saveJSON(jsonResult,str) {
            fs.writeFile(str, JSON.stringify(jsonResult, null, 2), 'utf8', (err) => {
                if (err) {
                    console.error('An error occurred while saving the file:', err);
                } else {
                    //console.log('JSON file has been saved!');
                }
            });
        }

        if (!fs.existsSync('newUsecase')) {
            fs.mkdir('newUsecase', (err) => {
              if (err) {
                console.error(`Error creating folder: ${err.message}`);
              } else {
                console.log(`Folder '${'newUsecase'}' created successfully.`);
              }
            });}
        saveJSON(services['services'],'./newUsecase/services.json')
        saveJSON(computingNodes,'./newUsecase/nodes.json')
        saveJSON(helperNodes,'./newUsecase/helpers.json')
        saveJSON(usersNodes,'./newUsecase/users.json')
        saveJSON(componentConnections,'./newUsecase/connections.json')
        saveJSON(dataSetting,'./newUsecase/setup.txt')

    }

    runAlgorithms (scale)
    {
        const usersNodes = readJSON(`./${scale}/users.json`);
        const helperNodes = readJSON(`./${scale}/helpers.json`);
        const computingNodes = readJSON(`./${scale}/nodes.json`);
        const services = readJSON(`./${scale}/services.json`);
        const componentConnections = readJSON(`./${scale}/connections.json`);
        
        if (configurations['cmd'] == "GA")
        {
        sendAxiosPost(url, {
            computingNodes: computingNodes,
            helperNodes: helperNodes,
            usersNodes: usersNodes,
            services: services,
            componentConnections: componentConnections,
    
            scale: scale,
            cmd: "GA",
            configsGA: {
                iteration: configurations['geneticAlgorithmConfigs']['iterations'],
                crossoverRate: configurations['geneticAlgorithmConfigs']['crossoverRate'],
                mutationRate: configurations['geneticAlgorithmConfigs']['mutationRate'],
                selectionSize: configurations['geneticAlgorithmConfigs']['selectionPressure'],
                populationSize: configurations['geneticAlgorithmConfigs']['populationSize']
            }
        });
        }
        else if (configurations['cmd'] == "SA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
        
                scale: scale,
                cmd: "SA",
                configsSA: {
                    termination: configurations['simulatedAnnealingConfigs']['terminationValue'],
                    temperature: configurations['simulatedAnnealingConfigs']['temperature'],
                    alpha: configurations['simulatedAnnealingConfigs']['alpha'],
                    rate: configurations['simulatedAnnealingConfigs']['updatingRate']
                }
            })
        }
        else if (configurations['cmd'] == "PGA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
        
                scale: scale,
                cmd: "PGA",
                configsPGA: {
                    iteration: configurations['parallelGeneticAlgorithmConfigs']['iterations'],
                    crossoverRate: configurations['parallelGeneticAlgorithmConfigs']['crossoverRate'],
                    mutationRate: configurations['parallelGeneticAlgorithmConfigs']['mutationRate'],
                    selectionSize: configurations['parallelGeneticAlgorithmConfigs']['selectionPressure'],
                    populationSize: configurations['parallelGeneticAlgorithmConfigs']['populationSize'],
                    numOfSlaves: configurations['parallelGeneticAlgorithmConfigs']['numberOfSlaves']
                }
            })
        }
        else if (configurations['cmd'] == "heuristics")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
        
                scale: scale,
                cmd: "heuristics"
            })
        }
    }

    tuningCommand(scale, tCommand)
    {
        if (scale != 'ave')
        {
            const usersNodes = readJSON(`./${scale}/users.json`);
            const helperNodes = readJSON(`./${scale}/helpers.json`);
            const computingNodes = readJSON(`./${scale}/nodes.json`);
            const services = readJSON(`./${scale}/services.json`);
            const componentConnections = readJSON(`./${scale}/connections.json`);
            
            let grid;
            if (tCommand == 'tGA')
            {
                grid = configurations['gridTuning']['GA']
            }
            else if (tCommand == "tSA")
            {
                grid = configurations['gridTuning']['SA']
            }
            sendAxiosPost(url, {
                characteristics: {
                usersNodes: usersNodes,
                helperNodes: helperNodes,
                computingNodes: computingNodes,
                services: services,
                componentConnections: componentConnections,
                },
                cmd: tCommand,
                scale: scale,
                gridSearch: grid
            })
        }
        else if (scale == 'ave')
        {
            const usersNodes_Small = readJSON('./small/users.json');
            const helperNodes_Small = readJSON('./small/helpers.json');
            const computingNodes_Small = readJSON('./small/nodes.json');
            const services_Small = readJSON('./small/services.json');
            const componentConnections_Small = readJSON('./small/connections.json');
        
            const usersNodes_Medium = readJSON('./medium/users.json');
            const helperNodes_Medium = readJSON('./medium/helpers.json');
            const computingNodes_Medium = readJSON('./medium/nodes.json');
            const services_Medium = readJSON('./medium/services.json');
            const componentConnections_Medium = readJSON('./medium/connections.json');
        
            const usersNodes_Larg = readJSON('./large/users.json');
            const helperNodes_Larg = readJSON('./large/helpers.json');
            const computingNodes_Larg = readJSON('./large/nodes.json');
            const services_Larg = readJSON('./large/services.json');
            const componentConnections_Larg = readJSON('./large/connections.json');
        
            const usersNodes_xLarg = readJSON('./xLarge/users.json');
            const helperNodes_xLarg = readJSON('./xLarge/helpers.json');
            const computingNodes_xLarg = readJSON('./xLarge/nodes.json');
            const services_xLarg = readJSON('./xLarge/services.json');
            const componentConnections_xLarg = readJSON('./xLarge/connections.json');
        
            sendAxiosPost(url, {
                small: {
                usersNodes: usersNodes_Small,
                helperNodes: helperNodes_Small,
                computingNodes: computingNodes_Small,
                services: services_Small,
                componentConnections: componentConnections_Small,
                },
                medium: {
                usersNodes: usersNodes_Medium,
                helperNodes: helperNodes_Medium,
                computingNodes: computingNodes_Medium,
                services: services_Medium,
                componentConnections: componentConnections_Medium,
                },
                large: {
                usersNodes: usersNodes_Larg,
                helperNodes: helperNodes_Larg,
                computingNodes: computingNodes_Larg,
                services: services_Larg,
                componentConnections: componentConnections_Larg,
                },
                xLarge: {
                usersNodes: usersNodes_xLarg,
                helperNodes: helperNodes_xLarg,
                computingNodes: computingNodes_xLarg,
                services: services_xLarg,
                componentConnections: componentConnections_xLarg,
                },
                cmd: tCommand,
                scale: "ave"
            })
        }
    }

    optConfigCommand(scale, oCommand)
    {
        sendAxiosPost(url, {
            cmd: oCommand,
            scale: scale
        })
    }
}


const cmd = new commands();

if (configurations['type'] == 'new')
{
    cmd.newUseCase();
}
else if (configurations['type'] == 'current')
{
    cmd.runAlgorithms(configurations['scale']);
}
else if (configurations['type'] == 'tuning')
{
    cmd.tuningCommand(configurations['scale'], configurations['cmd']);
}
else if (configurations['type'] == 'optimalConfigs')
{
    cmd.optConfigCommand(configurations['scale'], configurations['cmd']);
}