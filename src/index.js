const needle = require("needle")
const fs = require("fs")
const asyncPool = require("tiny-async-pool")
const ping = require("ping")

function loadData(file = "exporters.json"){
    let exporters = []
    try{
        exporters = JSON.parse(fs.readFileSync("./../data/"+file))
    } catch(e){}
    return exporters
}
function saveData(file = "exporters.json", data){
    fs.writeFileSync("./../data/"+file, JSON.stringify(data, null, 4))
}
function saveTargets(){
    let targets = [
        {
            labels: {
                job: "service-discovery"
            },
            targets: exporters.map(x => x.replace("http://", "").replace("/metrics",""))
        }
    ]
    saveData("targets.json", targets)
}
let exporters = loadData()

// scanHost("192.168.10.31")
 
scanSubnet()
setInterval(scanSubnet, 1000*60*60) // Once an hour

async function scanSubnet(subnet = "192.168.10", mask = "255.255.255.0"){
    console.log(`Scanning subnet ${subnet} netmast ${mask}`)
    let hostsToScan = []
    for(let i = 1; i < 255; i++){
        hostsToScan.push(`${subnet}.${i}`)
    }
    return asyncPool(15, hostsToScan, scanHost).then(hosts => {

    })
}
async function scanHost(hostname){
    return new Promise((resolve, reject) => {
        console.time(`Scanning host ${hostname}`)
        ping.promise.probe(hostname, {
            timeout: 500,
        }).then(function (res) {
            //console.log(res)
            if(res.alive){
                let addresses = []
                for(let i = 1000; i < 10000/*49151*/; i++){
                    let address = `http://${hostname}:${i}/metrics`
                    addresses.push(address)
                    //console.log(`Scanning ${address}`)
                    //console.time("checkAddress")
                    //console.timeEnd("checkAddress")
                    // let status = await checkAddress(address)
                }
                let resultsPromise = asyncPool(2, addresses, checkAddress).then(results => {
                    for(result of results){
                        if(result.ok){
                            if(!exporters.includes(result.address)){
                                exporters.push(result.address)
                                console.log(`Added address to exporters: ${result.address}`)
                                saveTargets()
                            }
                        }
                    }
                    console.timeEnd(`Scanning host ${hostname}`)
                })
                resolve(resultsPromise)
            } else {
                console.timeEnd(`Scanning host ${hostname}`)
                if(exporters.find(x => x.includes(hostname))){
                    console.log("Removing host "+hostname)
                    exporters = exporters.filter(x => !x.includes(hostname))
                    saveTargets()
                }
                resolve()
            }
        })
    })
}
function checkAddress(address){
    return new Promise((resolve, reject) => {
        needle("get", address, {timeout: 50})
        .then(resp => {
            if(isPrometheusFormat(resp.body)){
                resolve({ok:true, address})
            } else {
                resolve({ok:false, address})
            }
        })
        .catch(err => {
            if(err.code == "ECONNREFUSED" // Host refused
            || err.code == "ECONNRESET"){ // Timeout
                resolve({ok:false, address})
            } else {
                console.log(address)
                console.log(err)
                resolve({ok:false, address})
            }
        })
    })
}
function isPrometheusFormat(data) {
    let lines = data.split("\n")
    let validLines = lines.filter(line => {
        // comment lines
        if(line.trim()[0] === "#"){
            return true
        }
        // Blank lines
        if(!line.trim()) return true
        // Metrics lines (bad filter, but works)
        if(line.split('"').length % 2 === 0
        || ((
            !line.includes("{")
            || !line.includes("}")
        ) && line.split(" ").length !== 2
        )
        ){
            return false
        } 
        return true
    })
    //console.log(lines.length)
    //console.log(validLines.length)
    return lines.length == validLines.length
    console.log(lines)
}

// Save stuff on exit logic
function exitHandler(options, exitCode) {
    saveData("exporters.json", exporters)
    if (options.cleanup) console.log('clean');
    if (exitCode || exitCode === 0) console.log(exitCode);
    if (options.exit) process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
