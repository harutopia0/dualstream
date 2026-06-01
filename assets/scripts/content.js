const id = typeof crypto === "object" && typeof crypto.randomUUID === "function" ? `${performance.now()}-${crypto.randomUUID()}-${Math.random()}` : `${performance.now()}-${Math.random()}-${Date.now() * Math.random()}`
function sendMessage(type, data) { chrome.runtime.sendMessage({ id, type, data }).catch(() => { }) }

function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const secParts = parts.pop().split(/[,.]/);
  const secs = parseInt(secParts[0] || "0", 10);
  let ms = 0;
  if (secParts[1]) {
    ms = parseInt(secParts[1].padEnd(3, '0').substring(0, 3), 10);
  }
  const mins = parseInt(parts.pop() || "0", 10);
  const hrs = parseInt(parts.pop() || "0", 10);
  return hrs * 3600 + mins * 60 + secs + ms / 1000;
}

function parseLines(text, ext) {
  const lines = text.split(/\r?\n/)
  const output = []
  
  if (ext === "ass" || ext === "ssa") {
    let fmt = { start: 1, end: 2, text: 9 }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (line.startsWith("Format:")) {
        const cols = line.substring(7).split(",").map(c => c.trim())
        fmt.start = cols.indexOf("Start")
        fmt.end = cols.indexOf("End")
        fmt.text = cols.indexOf("Text")
      } 
      else if (line.startsWith("Dialogue:")) {
        const dataStr = line.substring(9).trim()
        const parts = dataStr.split(",")
        
        if (fmt.start > -1 && fmt.text > -1 && parts.length > fmt.text) {
          const start = parseTime(parts[fmt.start])
          const end = parseTime(parts[fmt.end])
          const rawText = parts.slice(fmt.text).join(",")
          
          let isDrawing = false;
          let cleanText = "";
          let inTag = false;
          let currentTag = "";
          
          for (let j = 0; j < rawText.length; j++) {
            const char = rawText[j];
            if (char === '{') {
              inTag = true;
              currentTag = "";
            } else if (char === '}') {
              inTag = false;
              if (/\\p[1-9]/.test(currentTag)) {
                isDrawing = true;
              } else if (/\\p0/.test(currentTag)) {
                isDrawing = false;
              }
            } else {
              if (inTag) {
                currentTag += char;
              } else {
                if (!isDrawing) {
                  cleanText += char;
                }
              }
            }
          }
          
          cleanText = cleanText.replace(/\\[Nn]/g, "<br>").replace(/\\h/g, " ").trim()
          
          if (cleanText) {
            output.push({ id: `${start}-${end}-${output.length}`, from: start, to: end, text: cleanText })
          }
        }
      }
    }
  } else {
    let current = { from: 0, to: 0, text: "" }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) continue;
      
      if (/^\d+$/.test(line) && !line.includes("-->")) {
        current = { from: 0, to: 0, text: "" }
      } else if (line.includes("-->")) {
        const [start, end] = line.split("-->").map(time => time.trim().split(" ")[0])
        current.from = parseTime(start)
        current.to = parseTime(end)
      } else if (line) {
        current.text = (current.text ? current.text + "<br>" : "") + line
      } else if (current.text) {
        current.id = `${current.from}-${current.to}-${output.length}`;
        output.push(current)
        current = { from: 0, to: 0, text: "" }
      }
    }
    if (current.text) {
      current.id = `${current.from}-${current.to}-${output.length}`;
      output.push(current)
    }
  }
  return output
}

function toVTTTime(seconds) {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return [hrs.toString().padStart(2, '0'), mins.toString().padStart(2, '0'), secs.toString().padStart(2, '0')].join(':') + '.' + ms.toString().padStart(3, '0')
}

function createVTT(lines) {
  const text = "WEBVTT\n\n" + lines.map(line => {
    const from = toVTTTime(line.from)
    const to = toVTTTime(line.to)
    const textStr = line.text.replace(/<br\s*\/?>/gi, '\n')
    return `${from} --> ${to}\n${textStr}`
  }).join("\n\n")
  
  return "data:text/vtt;charset=utf-8," + encodeURIComponent(text)
}

const applyStyle = (element, current, history = null) => {
  const keys = Object.keys(current)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const value = current[key]
    if (!history || history[key] !== value) {
      element.style[key] = typeof value === "number" ? `${value}px` : value
      if (history) { history[key] = value }
    }
  }
}

const data = { init: false, target: null, name: "none", names: [null, null], subs: [null, null] }
const time = { current: 0, duration: 0, sync: [0, 0] }
const activeSlots = [[], []];

const overlay = {
  version: "2.6", 
  outer: { element: document.createElement("div"), style: { all: "initial", width: 0, height: 0, left: 0, top: 0, justifyContent: "center", alignItems: "end", paddingLeft: 65, paddingRight: 65, paddingTop: 86, paddingBottom: 86, pointerEvents: "none", position: "fixed", display: "flex", flexDirection: "row", boxSizing: "border-box", zIndex: 2147483647 } },
  stack: { element: document.createElement("div"), style: { display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", pointerEvents: "none" } },
  inner: [
    { element: document.createElement("div"), style: { all: "initial", fontSize: 40, color: "#ffffff", fontWeight: "normal", textAlign: "center", textShadow: "0px 0px 10px #000", backgroundColor: "rgba(0, 0, 0, 0.0)", pointerEvents: "none", borderRadius: 10, padding: "8px 12px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif" } },
    { element: document.createElement("div"), style: { all: "initial", fontSize: 40, color: "#ffffff", fontWeight: "normal", textAlign: "center", textShadow: "0px 0px 10px #000", backgroundColor: "rgba(0, 0, 0, 0.0)", pointerEvents: "none", borderRadius: 10, padding: "8px 12px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif" } }
  ]
}

const outer = overlay.outer.element
const outerStyle = overlay.outer.style
const stack = overlay.stack.element
const stackStyle = overlay.stack.style

outer.id = "-ext-sub-stream-overlay-outer"
stack.id = "-ext-sub-stream-overlay-stack"

applyStyle(outer, outerStyle)
applyStyle(stack, stackStyle)

outer.appendChild(stack)
stack.appendChild(overlay.inner[1].element) 
stack.appendChild(overlay.inner[0].element) 

overlay.inner.forEach((inn, i) => {
    inn.element.id = `-ext-sub-stream-overlay-inner-${i}`;
    applyStyle(inn.element, inn.style);
});

const init = () => { data.init = true; update() }
const update = () => {
  if (data.init) { requestAnimationFrame(update) }
  const video = data.target
  if (video && document.body.contains(video)) {
    time.current = video.currentTime
    time.duration = video.duration
    
    for (let i = 0; i < 2; i++) {
        if (data.subs[i]) {
            const current = time.current - time.sync[i];
            const activeLines = data.subs[i].filter(l => l.from <= current && l.to >= current);
            
            if (activeLines.length === 0) {
                activeSlots[i] = [];
            } else {
                for (let s = 0; s < activeSlots[i].length; s++) {
                    if (activeSlots[i][s]) {
                        const isStillActive = activeLines.some(l => l.id === activeSlots[i][s].id);
                        if (!isStillActive) {
                            activeSlots[i][s] = null;
                        }
                    }
                }

                activeLines.forEach(l => {
                    const isAssigned = activeSlots[i].some(s => s && s.id === l.id);
                    if (!isAssigned) {
                        const emptyIdx = activeSlots[i].indexOf(null);
                        if (emptyIdx !== -1) {
                            activeSlots[i][emptyIdx] = l;
                        } else {
                            activeSlots[i].push(l);
                        }
                    }
                });

                while (activeSlots[i].length > 0 && activeSlots[i][activeSlots[i].length - 1] === null) {
                    activeSlots[i].pop();
                }
            }

            let htmlParts = [];
            if (activeSlots[i].length > 0) {
                htmlParts = activeSlots[i].map(s => {
                    if (s) {
                        return `<div>${s.text}</div>`;
                    } else {
                        return `<div style="visibility: hidden;">&nbsp;</div>`;
                    }
                });
            }

            const text = [...htmlParts].reverse().join("");
            
            if (text !== "") {
                if (overlay.inner[i].element.innerHTML !== text) {
                    overlay.inner[i].element.innerHTML = text;
                }
                overlay.inner[i].element.style.visibility = "visible";
            } else {
                if (overlay.inner[i].element.innerHTML !== "&nbsp;") {
                    overlay.inner[i].element.innerHTML = "&nbsp;";
                }
                overlay.inner[i].element.style.visibility = "hidden";
            }
            
            overlay.inner[i].element.style.display = "block";
        } else {
            overlay.inner[i].element.style.display = "none";
            activeSlots[i] = [];
        }
    }

    const rect = video.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
        applyStyle(outer, { width: rect.width, height: rect.height, left: rect.left, top: rect.top }, outerStyle)
    }
    
    const alignMap = { "start": "flex-start", "center": "center", "end": "flex-end" };
    const horizontalAlign = alignMap[outerStyle.justifyContent] || "center";
    if (stack.style.alignItems !== horizontalAlign) {
        stack.style.alignItems = horizontalAlign;
    }

    const parent = video.parentElement
    if (parent && !parent.querySelector("#" + outer.id)) { parent.appendChild(outer) }
  }
}
const onElement = () => {
  const elements = Array.from(document.querySelectorAll("video"))
  const durations = elements.map(item => item.duration).filter(item => !isNaN(item)).filter(item => item > 10)
  if (durations.length === 0) { return }
  const maximum = Math.max(...durations)
  if (data.target && document.body.contains(data.target) && data.target.duration === maximum) { return }
  data.target = elements.find(item => item.duration === maximum && document.body.contains(item))
}

const onUpload = () => {
  return new Promise(resolve => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".srt,.vtt,.ass,.ssa"
    input.multiple = false
    input.addEventListener("input", () => {
      const file = input.files[0]
      if (!file) return resolve()
      const reader = new FileReader()
      reader.addEventListener("load", () => {
        const ext = file.name.split('.').pop().toLowerCase()
        if (!data.subs[0]) {
          data.names[0] = file.name
          data.subs[0] = parseLines(reader.result, ext)
        } else if (!data.subs[1]) {
          data.names[1] = file.name
          data.subs[1] = parseLines(reader.result, ext)
        } else {
          data.names[1] = file.name
          data.subs[1] = parseLines(reader.result, ext)
        }
        
        data.name = data.names.filter(Boolean).join(" & ") || "none"
        resolve()
      })
      reader.readAsText(file)
    })
    input.click()
  })
}

document.addEventListener("fullscreenchange", () => {
  const element = document.fullscreenElement
  if (element && element === data.target) {
    data.subs.forEach((subLines, index) => {
      if (!subLines) return;
      const track = document.createElement("track")
      track.kind = "subtitles"
      track.label = `DualSubStream ${index === 0 ? 'Sub 1' : 'Sub 2'}`
      track.default = true
      track.className = "-ext-sub-stream-track"
      track.src = createVTT(subLines)
      data.target.appendChild(track)
    })
  } else {
    const tracks = document.querySelectorAll(".-ext-sub-stream-track")
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      track.remove()
    }
  }
})

chrome.runtime.onMessage.addListener(async (message, _s, callback) => {
  const action = message.action
  const payload = message.payload
  onElement()
  const iframes = document.querySelectorAll("iframe")
  iframes.forEach((iframe) => {
    if (iframe.contentWindow) { iframe.contentWindow.postMessage(message, "*") }
  })
  if (action === "info") {
    sendMessage("info", { target: data.target, duration: data.target ? data.target.duration : 0 })
    return callback(true)
  }
  if (message.id !== id) { return }
  if (action === "update") {
    const subIdx = payload.subIndex ?? 0;
    if ("name" in payload) { data.name = payload.name }
    if ("sync" in payload) { time.sync[subIdx] = payload.sync }
    if ("outer" in payload) { applyStyle(outer, payload.outer, outerStyle) }
    
    if ("inner" in payload && Array.isArray(payload.inner)) {
        applyStyle(overlay.inner[0].element, payload.inner[0], overlay.inner[0].style)
        applyStyle(overlay.inner[1].element, payload.inner[1], overlay.inner[1].style)
    } 
    else if ("inner" in payload) { 
        applyStyle(overlay.inner[subIdx].element, payload.inner, overlay.inner[subIdx].style) 
    }
  } else if (action === "upload") {
    await onUpload()
  } else if (action === "remove") {
    const idx = payload.index
    
    data.names[idx] = null;
    data.subs[idx] = null;
    
    time.sync[idx] = 0;
    overlay.inner[idx].element.style.display = "none";
    overlay.inner[idx].element.innerHTML = "";
    
    data.name = data.names.filter(Boolean).join(" & ") || "none"
    if (data.names.filter(Boolean).length === 0) {
      data.init = false
    }
  }
  
  if (action === "stop") {
    data.init = false
    overlay.inner.forEach(inn => {
      inn.element.style.display = "none";
      inn.element.innerHTML = "";
    });
    data.name = "none"
    data.names = [null, null]
    data.subs = [null, null]
    time.sync = [0, 0]
    sendMessage("data", { data, time, overlay })
  } else if (action === "time") {
    sendMessage("time", { time })
  } else {
    if (!data.init) { init() }
    sendMessage("data", { data, time, overlay })
  }
  callback(true)
})