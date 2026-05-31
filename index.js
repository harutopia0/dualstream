const qs = selector => document.querySelector(selector)
const qa = selector => document.querySelectorAll(selector)

function toTimeString(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = parseInt(seconds % 60)
  const ph = h.toString().padStart(2, "0")
  const pm = m.toString().padStart(2, "0")
  const ps = s.toString().padStart(2, "0")
  return `${ph}:${pm}:${ps}`
}

const exceptions = ["about:", "chrome://", "chrome-extension://", "https://chrome.google.com/webstore"]

const sendMessage = (action, payload = null) => {
  return new Promise(resolve => {
    const message = { id: states.iframe ? states.iframe.id : null, action, payload }
    if (action !== "info" && !states.iframe) { return }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) { return resolve(false) }
      const activeTab = tabs[0]
      if (!activeTab.url) { return resolve(false) }
      if (exceptions.some(part => activeTab.url.startsWith(part))) { return resolve(false) }
      chrome.tabs.sendMessage(activeTab.id, message).then(data => resolve(data)).catch(() => resolve(false))
    })
  })
}

const states = { tab: "upload", lines: [], time: null, iframe: null, activeSub: 0 }
let lastData = null; 

function updateSettingsUI(overlay) {
    if (!overlay) return;
    const outerStyle = overlay.outer.style
    const innerStyle = overlay.inner[states.activeSub].style

    qs("#spacing-x").value = parseInt(outerStyle.paddingLeft || 0)
    qs("#spacing-y").value = parseInt(outerStyle.paddingTop || 0)
    qs("[data-position]").setAttribute("data-position", `${outerStyle.alignItems}-${outerStyle.justifyContent}`)
    
    qs("#font-size").value = parseInt(innerStyle.fontSize || 40)
    qs("#text-color").value = innerStyle.color
    qs("[data-weight]").setAttribute("data-weight", innerStyle.fontWeight)
    qs("#text-shadow").value = parseInt((innerStyle.textShadow || "").split(" ")[2] || 0)
    
    let bgOpacity = 0;
    if (innerStyle.backgroundColor) {
        bgOpacity = (innerStyle.backgroundColor.split(/[,)]/g)[3] || 0) * 100;
    }
    qs("#background-opacity").value = bgOpacity;
}

function syncRadioButtons(value) {
    qa(`input[name="activeSubTiming"], input[name="activeSubSettings"]`).forEach(radio => {
        radio.checked = (parseInt(radio.value) === value);
    });
}

chrome.runtime.onMessage.addListener(message => {
  if (!message) { return }
  const type = message.type
  if (type === "info") {
    const id = message.id
    const data = message.data
    if (states.iframe === null && data.target) {
      if (data.duration > 60) {
        qs(".upload-tray").classList.add("ready")
        document.body.setAttribute("data-ready", "true")
        states.iframe = { id, duration: data.duration }
        const settings = JSON.parse(localStorage.getItem("settings") || "null")
        if (settings && settings.version === "2.6") {
          sendMessage("update", { outer: settings.outer.style, inner: [settings.inner[0].style, settings.inner[1].style] }).then(onInit)
        } else {
          sendMessage("data").then(onInit)
        }
      }
    }
    return
  }
  
  if (!message.data) return;
  
  if (type === "data") {
    lastData = message.data;
    const data = message.data.data
    const time = message.data.time
    const overlay = message.data.overlay
    
    if (states.tab === "upload" || states.tab === "timing") { 
        onTiming(data.subs[states.activeSub] || []) 
    }
    
    const validSubs = [];
    if (data.names[1]) validSubs.push({ idx: 1, name: data.names[1], type: 'Sub 2', color: '#9b8ff3' });
    if (data.names[0]) validSubs.push({ idx: 0, name: data.names[0], type: 'Sub 1', color: '#423ee0' }); 

    const isLoaded = validSubs.length > 0;
    qs(".section.upload").setAttribute("data-name", isLoaded ? "loaded" : "none");

    const uploadTray = qs(".upload-tray");
    if (validSubs.length >= 2) {
        uploadTray.classList.add("locked");
    } else {
        uploadTray.classList.remove("locked");
    }
    
    const listContainer = qs(".upload-preview-list");
    if (listContainer) {
      if (isLoaded) {
        listContainer.innerHTML = validSubs.map(item => 
          `<div class="sub-item">
             <div class="sub-name-item"><span style="color:${item.color}; margin-right: 5px;">[${item.type}]</span>${item.name}</div>
             <button class="remove-btn" data-index="${item.idx}">Remove</button>
           </div>`
        ).join('')
        qa(".remove-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const idx = parseInt(e.currentTarget.getAttribute("data-index"))
            sendMessage("remove", { index: idx })
          })
        })
      } else {
        listContainer.innerHTML = ""
      }
    }

    if (states.tab !== "settings") {
        updateSettingsUI(overlay)
    }
    if (states.tab !== "timing") {
      qs("#sync").value = Math.round((time.sync[states.activeSub] || 0) * 1000)
    }
    localStorage.setItem("settings", JSON.stringify(overlay))
    qs(".upload-preview-time").innerHTML = `${toTimeString(time.current)} / ${toTimeString(time.duration)}`
    
  } else if (type === "time") {
    if (lastData) lastData.time = message.data.time;
    const time = message.data.time;
    onTimingUpdate(time)
    if (states.tab !== "timing" && document.activeElement !== qs("#sync")) { 
      qs("#sync").value = Math.round((time.sync[states.activeSub] || 0) * 1000) 
    }
    qs(".upload-preview-time").innerHTML = `${toTimeString(time.current)} / ${toTimeString(time.duration)}`
  }
})

qs(".upload-tray").addEventListener("click", (e) => {
  if (e.currentTarget.classList.contains("locked")) return;
  sendMessage("upload");
})

const scrollToActive = () => {
  const container = qs(".timing-lines")
  if (!container) return;
  
  let activeItem = container.querySelector(".timing-line.active")
  
  if (!activeItem && states.time && states.lines && states.lines.length > 0) {
    const current = states.time.current - states.time.sync[states.activeSub]
    let closestIdx = 0;
    for (let i = 0; i < states.lines.length; i++) {
      if (states.lines[i].from > current) {
        closestIdx = i;
        break;
      }
      closestIdx = i;
    }
    const items = qa(".timing-line")
    if (items[closestIdx]) activeItem = items[closestIdx];
  }

  if (activeItem) {
    activeItem.scrollIntoView({ block: "center", behavior: "smooth" })
  }
}

Array.from(qa(".tab")).forEach(tab => {
  tab.addEventListener("click", () => {
    states.tab = tab.classList[1]
    document.body.setAttribute("data-tab", states.tab)
    if (states.tab === "timing" && lastData && lastData.data) {
        onTiming(lastData.data.subs[states.activeSub] || []);
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollToActive);
        });
    }
  })
})

qa(`input[name="activeSubTiming"], input[name="activeSubSettings"]`).forEach(radio => {
    radio.addEventListener("change", (e) => {
        states.activeSub = parseInt(e.target.value);
        syncRadioButtons(states.activeSub);
        if (lastData && lastData.data) {
            onTiming(lastData.data.subs[states.activeSub] || []);
            updateSettingsUI(lastData.overlay);
            qs("#sync").value = Math.round((lastData.time.sync[states.activeSub] || 0) * 1000);
            
            if (states.tab === "timing") {
                requestAnimationFrame(() => {
                  requestAnimationFrame(scrollToActive);
                });
            }
        }
    });
});

const onTiming = lines => {
  states.lines = lines
  const container = qs(".timing-lines")
  container.innerHTML = ""
  if (!lines || lines.length === 0) return;
  
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const item = document.createElement("div")
    item.className = "timing-line"
    item.innerHTML = line.text.replace(/<br>/g, " ")
    item.innerHTML = item.innerText
    const outer = document.createElement("div")
    outer.className = "timing-line-outer"
    outer.addEventListener("click", () => {
      if (!states.time) { return }
      const amount = (states.time.current - line.from).toFixed(4)
      qs("#sync").value = Math.round(amount * 1000)
      sendMessage("update", { sync: amount, subIndex: states.activeSub })
    })
    outer.appendChild(item)
    fragment.appendChild(outer)
  }
  container.appendChild(fragment)

  if (states.time) {
    onTimingUpdate(states.time);
  }
}

const onTimingUpdate = time => {
  states.time = time
  const items = qa(".timing-line")
  if (!states.lines || items.length === 0) return;
  const current = time.current - time.sync[states.activeSub]
  for (let i = 0; i < states.lines.length; i++) {
    const line = states.lines[i]
    const item = items[i]
    if (!item) continue;
    if (line.from <= current && line.to >= current) {
      const amount = (current - line.from) / (line.to - line.from)
      item.classList.add("active")
      item.classList.remove("done")
      item.style.boxShadow = `inset ${400 * amount}px 0px 0px 0px #000`
    } else if (line.from < current) {
      item.classList.add("done")
      item.classList.remove("active")
      item.style.boxShadow = "none"
    } else {
      item.classList.remove("done")
      item.classList.remove("active")
      item.style.boxShadow = "none"
    }
  }
}

const onSettings = event => {
  const target = event.target
  if (!target.value) { return }
  const key = target.id
  const value = target.value.toLowerCase()
  if (key === "font-size") {
    sendMessage("update", { inner: { fontSize: parseInt(value) }, subIndex: states.activeSub })
  } else if (key === "text-color") {
    sendMessage("update", { inner: { color: value }, subIndex: states.activeSub })
  } else if (key === "font-weight") {
    qs("[data-weight]").setAttribute("data-weight", value)
    sendMessage("update", { inner: { fontWeight: value }, subIndex: states.activeSub })
  } else if (key === "text-shadow") {
    sendMessage("update", { inner: { textShadow: `0px 0px ${value}px #000` }, subIndex: states.activeSub })
  } else if (key === "background-opacity") {
    sendMessage("update", { inner: { backgroundColor: `rgba(0, 0, 0, ${value / 100})` }, subIndex: states.activeSub })
  } else if (key === "spacing-x") {
    sendMessage("update", { outer: { paddingLeft: parseInt(value), paddingRight: parseInt(value) } })
  } else if (key === "spacing-y") {
    sendMessage("update", { outer: { paddingTop: parseInt(value), paddingBottom: parseInt(value) } })
  } else if (key === "position") {
    qs("[data-position]").setAttribute("data-position", value)
    sendMessage("update", {
      outer: { alignItems: value.split("-")[0], justifyContent: value.split("-")[1] },
      inner: { textAlign: { start: "left", center: "center", end: "right" }[value.split("-")[1]] },
      subIndex: states.activeSub
    })
  }
}

qs("#settings").addEventListener("input", onSettings)
qs("#settings").addEventListener("click", onSettings)

function evaluateMath(str) {
  str = str.replace(/\s+/g, "");
  if (!/^[0-9+\-*/.]+$/.test(str)) return parseFloat(str) || 0;
  
  const parts = str.match(/([0-9.]+)|[\+\-\*\/]/g);
  if (!parts) return 0;

  const tokens = [];
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];
    if ((token === '-' || token === '+') && (tokens.length === 0 || ['+', '-', '*', '/'].includes(tokens[tokens.length - 1]))) {
      if (i + 1 < parts.length && !['+', '-', '*', '/'].includes(parts[i + 1])) {
        tokens.push(token + parts[i + 1]);
        i++;
      } else {
        tokens.push(token);
      }
    } else {
      tokens.push(token);
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i];
      const prev = parseFloat(tokens[i - 1]) || 0;
      const next = parseFloat(tokens[i + 1]) || 0;
      const res = op === '*' ? prev * next : prev / next;
      tokens.splice(i - 1, 3, res.toString());
      i--;
    }
  }

  let total = parseFloat(tokens[0]) || 0;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const next = parseFloat(tokens[i + 1]) || 0;
    if (op === '+') total += next;
    if (op === '-') total -= next;
  }
  return total;
}

function adjustSync(deltaMs) {
  const currentMs = parseFloat(qs("#sync").value) || 0
  const newMs = currentMs + deltaMs
  qs("#sync").value = newMs
  const amount = (newMs / 1000).toFixed(4)
  sendMessage("update", { sync: amount, subIndex: states.activeSub })
}

function makeRepeatable(btn, amount) {
  let timerId = null
  let intervalId = null
  
  const start = (e) => {
    if (e.button !== 0) return
    adjustSync(amount)
    timerId = setTimeout(() => {
      intervalId = setInterval(() => {
        adjustSync(amount)
      }, 60)
    }, 350)
  }
  
  const stop = () => {
    clearTimeout(timerId)
    clearInterval(intervalId)
  }
  
  btn.addEventListener("mousedown", start)
  btn.addEventListener("mouseup", stop)
  btn.addEventListener("mouseleave", stop)
}

qa(".sync-btn[data-amount]").forEach(btn => {
  const amount = parseInt(btn.getAttribute("data-amount"))
  makeRepeatable(btn, amount)
})

qs("#sync-reset").addEventListener("click", () => {
  qs("#sync").value = 0
  sendMessage("update", { sync: "0.0000", subIndex: states.activeSub })
})

qs("#sync").addEventListener("input", event => {
  const ms = evaluateMath(event.target.value);
  const amount = (ms / 1000).toFixed(4);
  sendMessage("update", { sync: amount, subIndex: states.activeSub });
});

qs("#sync").addEventListener("blur", event => {
  const ms = evaluateMath(event.target.value);
  event.target.value = Math.round(ms);
});

qs("#sync").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    const ms = evaluateMath(event.target.value);
    event.target.value = Math.round(ms);
    event.target.blur();
  }
});

const onInit = () => setInterval(() => sendMessage("time"), 100)

const checkLoop = () => {
  sendMessage("info").then(() => {
    setTimeout(() => { if (!states.iframe) { checkLoop() } }, 100)
  })
}

checkLoop()