const needle = require("needle")
const fs = require("fs")
const asyncPool = require("tiny-async-pool")
const ping = require("ping")
const express = require("express")

const app = express()

app.use(express.json());
app.use(express.static("./static"))

app.listen(3000, () => {
    console.log("Webserver listening on port 3000")
})

app.get("/api/targets.json", (req, res) => {
    res.send(getTargets())
})
app.get("/api/exporters.json", (req, res) => {
    res.send(exporters)
})
app.get("/api/info.json", (req, res) => {
    res.send(info)
})
app.get("/api/settings.json", (req, res) => {
    res.send(settings)
})
app.post("/api/setSetting", (req, res) => {
    let token = req.body.token // Do something about this some time in the future
    if(settings[req.body.setting] !== undefined){
        settings[req.body.setting] = req.body.value
        console.log(`Set setting ${req.body.setting} to ${req.body.value}`)
        res.send({
            ok: true,
            msg: `Successfully set setting ${req.body.setting} to ${req.body.value}`
        })
        saveData("prometheus-service-scanner-settings.json", settings)
    }
})

let info = {
    last_scan_start: 0,
    last_scan_complete: 0,
    last_scan_duration: 0,
    next_scan_start: 0,
}
let settings = loadData("prometheus-service-scanner-settings.json", {
    minPort: 1000,
    maxPort: 10000,
    parallelIPs: 15,
    parallelPorts: 3,
    scanInterval: 1000*60*60,
    pingTimeout: 500,
    subnet: "192.168.10",
    netmask: "255.255.255.0"
})
function loadData(file = "exporters.json", placeholder = []){
    let exporters = placeholder
    try{
        exporters = JSON.parse(fs.readFileSync("./../data/"+file))
    } catch(e){}
    return exporters
}
function saveData(file = "exporters.json", data){
    fs.writeFileSync("./../data/"+file, JSON.stringify(data, null, 4))
}
function getTargets(){
    return [
        {
            labels: {
                job: "service-discovery"
            },
            targets: exporters.map(x => x.replace("http://", "").replace("/metrics",""))
        }
    ]
}
function saveTargets(){
    saveData("targets.json", getTargets())
}
let exporters = loadData()

// scanHost("192.168.10.31")
 
info.next_scan_start = Date.now()
scanSubnet(settings.subnet, settings.netmask)
setInterval(() => scanSubnet(settings.subnet, settings.netmask), 1000*60*60) // Once an hour

let x = 0;
async function scanSubnet(subnet = "192.168.10", mask = "255.255.255.0"){
    console.log(`Scanning subnet ${subnet} netmast ${mask}`)
    info.last_scan_start = Date.now()
    info.next_scan_start = Date.now() + 1000*60*60
    let hostsToScan = []
    for(let i = 1; i < 254; i++){
        hostsToScan.push(`${subnet}.${i}`)
    }
    return asyncPool(settings.parallelIPs, hostsToScan, scanHost).then(hosts => {
        console.log("Scanning finished!")
        info.last_scan_complete = Date.now()
        info.last_scan_duration = info.last_scan_complete - info.last_scan_start
    })
}
async function scanHost(hostname){
    return new Promise((resolve, reject) => {
        console.time(`Scanning host ${hostname}`)
        let startTime = Date.now()
        ping.promise.probe(hostname, {
            timeout: settings.pingTimeout,
        }).then(function (res) {
            //console.log(res)
            if(res.alive){
                let addresses = []
                for(let i = settings.minPort; i < settings.maxPort/*49151*/; i++){
                    let address = `http://${hostname}:${i}/metrics`
                    addresses.push(address)
                    //console.log(`Scanning ${address}`)
                    //console.time("checkAddress")
                    //console.timeEnd("checkAddress")
                    // let status = await checkAddress(address)
                }
                // Quit early after 5 minutes if we take too long
                let quitEarly = setTimeout(() => resolve([]), 300000)
                let resultsPromise = asyncPool(settings.parallelPorts, addresses, checkAddress).then(results => {
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
                    clearTimeout(quitEarly)
                    resolve(results)
                })
            } else {
                console.timeEnd(`Scanning host ${hostname}`)
                // X: "http://192.168.10.37:9080/metrics"
                if(exporters.find(x => x.split(":")[1].replace("//","") == hostname)){
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
            || err.code == "ENOPROTOOPT" // Protocol not available (super weird)
            || err.code == "ECONNRESET"){ // Timeout
                resolve({ok:false, address})
            } else {
                //console.log(address)
                //console.log(err)
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
    saveData("prometheus-service-scanner-settings.json", settings)
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
