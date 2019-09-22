settings = []
function addSetting(name, type = "number", handler){
    let settingsContainer = document.querySelector("#settings")
    settings.push({name, type, handler})
    settingsContainer.innerHTML += `<div class="setting">
        <p class="name">${name}</p>
        <input type="${type}" step="1">
    </div>
    `
    // Rebind all handlers
    settings.forEach((setting, i) => {
        document.querySelectorAll("setting > input")[i].onchange = e => setting.handler(e.target.value)
    })
}

async function fetchJSON(url){
    return (await fetch(url)).json()
}

setInterval(updateInterface, 1000)
updateInterface()
async function updateInterface(){
    let targets = (await fetchJSON("/api/targets.json"))[0].targets

    // Update detected targets
    let container = document.querySelector("#detected > ul")
    newHTML = ""
    targets.forEach(target => {
        newHTML += `
        <li>
            <a href="http://${target}/metrics">${target}/metrics</a>
        </li>`
    })
    container.innerHTML = newHTML

    // Update statistics
    // Targets detected
    statTargetsDetected.innerHTML = targets.length

    // Number of servers
    statNumServers.innerHTML = targets.reduce((acc, val) => acc.find(x => x.includes(val.split(":")[0])) ? acc : acc.concat([val]), []).length
    
    let info = await fetchJSON("/api/info.json")
    // Time since last scan
    statLastScan.innerHTML = info.last_scan_complete? moment(info.last_scan_complete).fromNow() : "-"
    // Scan duration
    statScanDuration.innerHTML = info.last_scan_complete? moment.duration(info.last_scan_duration).humanize() : "-"
    // Time until next scan
    statNextScan.innerHTML = moment(info.next_scan_start).fromNow()
}

