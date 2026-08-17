/**
 * DualStream - Content Script Coordinator
 * Manages video detection, DOM overlay lifecycle, RAF synchronization loop, and popup messaging.
 */

const id = typeof crypto === "object" && typeof crypto.randomUUID === "function" ? `${performance.now()}-${crypto.randomUUID()}-${Math.random()}` : `${performance.now()}-${Math.random()}-${Date.now() * Math.random()}`
function sendMessage(type, data) { chrome.runtime.sendMessage({ id, type, data }).catch(() => { }) }

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

const audioEngine = typeof window.DualStreamAudioEngine !== "undefined" ? new window.DualStreamAudioEngine() : null

const data = {
  init: false,
  target: null,
  name: "none",
  names: [null, null],
  subs: [null, null],
  audio: {
    enabled: false,
    fileName: null,
    fileSize: null,
    format: null,
    tracks: [],
    selectedTrack: 0,
    volume: 1.0,
    isMuted: false,
    delay: 0.0,
    mode: "buffer"
  }
}
const time = { current: 0, duration: 0, sync: [0, 0] }

const activeSlotsDialogue = [[], []];

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

const posContainer = document.createElement("div");
posContainer.id = "-ext-sub-stream-overlay-pos";
posContainer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: 2147483647;";

outer.id = "-ext-sub-stream-overlay-outer"
stack.id = "-ext-sub-stream-overlay-stack"

applyStyle(outer, outerStyle)
applyStyle(stack, stackStyle)

outer.appendChild(stack)
outer.appendChild(posContainer)
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
    
    // Sync audio replacement if active
    if (audioEngine && data.audio && data.audio.enabled) {
      audioEngine.syncWithVideo();
    }
    
    let allPosMarkup = "";
    for (let i = 0; i < 2; i++) {
        if (data.subs[i]) {
            const current = time.current - time.sync[i];
            const activeLines = data.subs[i].filter(l => l.from <= current && l.to >= current);
            
            const activeDialogue = activeLines.filter(l => !l.pos);
            const activePos = activeLines.filter(l => l.pos);

            activePos.forEach(s => {
                const transform = getPosTransform(s.pos.alignment);
                let leftPercent = 0;
                let topPercent = 0;
                
                if (s.pos.move) {
                    const m = s.pos.move;
                    const lineDurMs = (s.to - s.from) * 1000;
                    const elapsedMs = (current - s.from) * 1000;
                    const tStart = m.t1 !== null ? m.t1 : 0;
                    const tEnd = m.t2 !== null ? m.t2 : (lineDurMs > 0 ? lineDurMs : 1);
                    
                    let curX = m.x1;
                    let curY = m.y1;
                    if (elapsedMs <= tStart) {
                        curX = m.x1;
                        curY = m.y1;
                    } else if (elapsedMs >= tEnd) {
                        curX = m.x2;
                        curY = m.y2;
                    } else {
                        const progress = (elapsedMs - tStart) / (tEnd - tStart);
                        curX = m.x1 + (m.x2 - m.x1) * progress;
                        curY = m.y1 + (m.y2 - m.y1) * progress;
                    }
                    leftPercent = (curX / s.pos.playResX) * 100;
                    topPercent = (curY / s.pos.playResY) * 100;
                } else {
                    leftPercent = s.pos.leftPercent;
                    topPercent = s.pos.topPercent;
                }

                const left = `${leftPercent.toFixed(2)}%`;
                const top = `${topPercent.toFixed(2)}%`;
                const html = `<div>${s.text}</div>`;

                const innStyle = overlay.inner[i].style;
                const fontSz = innStyle.fontSize ? (typeof innStyle.fontSize === 'number' ? `${innStyle.fontSize}px` : innStyle.fontSize) : '40px';
                const posWrapperStyle = `position: absolute; left: ${left}; top: ${top}; transform: ${transform}; pointer-events: none; text-align: center; white-space: nowrap; font-size: ${fontSz}; color: ${innStyle.color || '#ffffff'}; font-weight: ${innStyle.fontWeight || 'normal'}; text-shadow: ${innStyle.textShadow || '0px 0px 10px #000'}; font-family: ${innStyle.fontFamily || 'sans-serif'};`;
                allPosMarkup += `<div style="${posWrapperStyle}">${html}</div>`;
            });
            
            // Manage dialogue slots
            if (activeDialogue.length === 0) {
                activeSlotsDialogue[i] = [];
            } else {
                for (let s = 0; s < activeSlotsDialogue[i].length; s++) {
                    if (activeSlotsDialogue[i][s]) {
                        const isStillActive = activeDialogue.some(l => l.id === activeSlotsDialogue[i][s].id);
                        if (!isStillActive) {
                            activeSlotsDialogue[i][s] = null;
                        }
                    }
                }

                activeDialogue.forEach(l => {
                    const isAssigned = activeSlotsDialogue[i].some(s => s && s.id === l.id);
                    if (!isAssigned) {
                        const emptyIdx = activeSlotsDialogue[i].indexOf(null);
                        if (emptyIdx !== -1) {
                            activeSlotsDialogue[i][emptyIdx] = l;
                        } else {
                            activeSlotsDialogue[i].push(l);
                        }
                    }
                });

                if (activeDialogue.length > 0) {
                    while (activeSlotsDialogue[i].length > 0 && activeSlotsDialogue[i][activeSlotsDialogue[i].length - 1] === null) {
                        activeSlotsDialogue[i].pop();
                    }
                }
            }

            let dialogueParts = [];
            if (activeSlotsDialogue[i].length > 0) {
                dialogueParts = activeSlotsDialogue[i].map(s => {
                    if (s) {
                        return `<div>${s.text}</div>`;
                    } else {
                        return `<div style="visibility: hidden;">&nbsp;</div>`;
                    }
                });
            }

            const text = [...dialogueParts].reverse().join("");
            
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
            activeSlotsDialogue[i] = [];
        }
    }

    if (posContainer.innerHTML !== allPosMarkup) {
        posContainer.innerHTML = allPosMarkup;
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
  const durations = elements.map(item => item.duration).filter(item => !isNaN(item)).filter(item => item > 60)
  if (durations.length === 0) { return }
  const maximum = Math.max(...durations)
  if (data.target && document.body.contains(data.target) && data.target.duration === maximum) { return }
  const newTarget = elements.find(item => item.duration === maximum && document.body.contains(item))
  if (newTarget) {
    data.target = newTarget
    if (audioEngine) {
      audioEngine.attachVideo(newTarget)
      if (data.audio && data.audio.enabled) {
        audioEngine.enable(newTarget)
      }
    }
  }
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

const showAudioToast = (title, message, type = "loading", duration = 0) => {
  let toast = document.getElementById("-ext-audio-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "-ext-audio-toast";
    toast.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      background: rgba(24, 24, 24, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.12);
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Ubuntu", sans-serif;
      font-size: 13px;
      pointer-events: none;
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(-8px);
      max-width: 380px;
    `;
    document.body.appendChild(toast);
  }

  if (data.target && document.body.contains(data.target)) {
    const parent = data.target.parentElement;
    if (parent && parent !== document.body) {
      if (getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }
      if (toast.parentElement !== parent) {
        parent.appendChild(toast);
      }
    }
  }

  let iconHtml = "";
  if (type === "loading") {
    iconHtml = `<div style="width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.2); border-top: 2.5px solid #9b8ff3; border-radius: 50%; animation: ext-spin 0.8s linear infinite; flex-shrink: 0;"></div>`;
  } else if (type === "success") {
    iconHtml = `<div style="width: 20px; height: 20px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; color: #FFF;">✓</div>`;
  } else if (type === "error") {
    iconHtml = `<div style="width: 20px; height: 20px; background: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; color: #FFF;">✕</div>`;
  }

  toast.innerHTML = `
    ${iconHtml}
    <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
      <div style="font-weight: 700; font-size: 12px; color: #9b8ff3; letter-spacing: 0.3px;">${title}</div>
      <div style="font-size: 11.5px; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${message}</div>
    </div>
  `;

  if (!document.getElementById("-ext-spin-style")) {
    const style = document.createElement("style");
    style.id = "-ext-spin-style";
    style.textContent = `@keyframes ext-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  toast.style.display = "flex";
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  if (toast._timeout) clearTimeout(toast._timeout);
  if (duration > 0) {
    toast._timeout = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => {
        if (toast.style.opacity === "0") toast.style.display = "none";
      }, 300);
    }, duration);
  }
};

const onAudioUpload = () => {
  return new Promise(resolve => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".mkv,.mp4,.webm,.mka,.m4a,.aac,.opus,.ogg,.wav,.mp3,.flac"
    input.multiple = false
    input.addEventListener("input", async () => {
      const file = input.files[0]
      if (!file) return resolve()
      
      data.audio.loading = true
      data.audio.loadingFileName = file.name
      sendMessage("data", { data, time, overlay })

      showAudioToast("DualStream • Audio", `Reading & decoding ${file.name}...`, "loading", 0)

      onElement()
      if (audioEngine) {
        try {
          const fileInfo = await audioEngine.loadFile(file)
          data.audio.fileName = fileInfo.fileName
          data.audio.fileSize = fileInfo.fileSize
          data.audio.format = fileInfo.format
          data.audio.tracks = fileInfo.tracks
          data.audio.selectedTrack = fileInfo.selectedTrack
          data.audio.enabled = true
          data.audio.loading = false

          if (data.target) {
            audioEngine.enable(data.target)
          }
          showAudioToast("DualStream • Audio", `${file.name} ready & synced!`, "success", 3000)
        } catch (e) {
          data.audio.loading = false
          showAudioToast("DualStream • Audio", `Error loading audio: ${e.message || e}`, "error", 4000)
        }
      }
      
      sendMessage("data", { data, time, overlay })
      resolve()
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
      track.label = `DualStream ${index === 0 ? 'Sub 1' : 'Sub 2'}`
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
  } else if (action === "audio_upload") {
    await onAudioUpload()
  } else if (action === "audio_toggle") {
    data.audio.enabled = !data.audio.enabled
    if (audioEngine) {
      if (data.audio.enabled && data.target) {
        audioEngine.enable(data.target)
      } else {
        audioEngine.disable()
      }
    }
    sendMessage("data", { data, time, overlay })
  } else if (action === "audio_select_track") {
    const trackIdx = payload.trackIndex
    data.audio.selectedTrack = trackIdx
    if (audioEngine) {
      audioEngine.selectTrack(trackIdx)
    }
    sendMessage("data", { data, time, overlay })
  } else if (action === "audio_update") {
    if ("volume" in payload) {
      data.audio.volume = payload.volume
      if (audioEngine) audioEngine.setVolume(payload.volume)
    }
    if ("isMuted" in payload) {
      data.audio.isMuted = payload.isMuted
      if (audioEngine) audioEngine.setMute(payload.isMuted)
    }
    if ("delay" in payload) {
      data.audio.delay = payload.delay
      if (audioEngine) audioEngine.setDelay(payload.delay)
    }
    if ("mode" in payload) {
      data.audio.mode = payload.mode
      if (audioEngine) audioEngine.setMode(payload.mode)
    }
    sendMessage("data", { data, time, overlay })
  } else if (action === "audio_remove") {
    if (audioEngine) {
      audioEngine.cleanup()
    }
    data.audio = {
      enabled: false,
      fileName: null,
      fileSize: null,
      format: null,
      tracks: [],
      selectedTrack: 0,
      volume: 1.0,
      isMuted: false,
      delay: 0.0,
      mode: "stream"
    }
    sendMessage("data", { data, time, overlay })
  } else if (action === "remove") {
    const idx = payload.index
    
    data.names[idx] = null;
    data.subs[idx] = null;
    
    time.sync[idx] = 0;
    overlay.inner[idx].element.style.display = "none";
    overlay.inner[idx].element.innerHTML = "";
    activeSlotsDialogue[idx] = [];
    
    data.name = data.names.filter(Boolean).join(" & ") || "none"
    if (data.names.filter(Boolean).length === 0 && !data.audio.fileName) {
      data.init = false
    }
  }
  
  if (action === "stop") {
    data.init = false
    overlay.inner.forEach(inn => {
      inn.element.style.display = "none";
      inn.element.innerHTML = "";
    });
    posContainer.innerHTML = "";
    data.name = "none"
    data.names = [null, null]
    data.subs = [null, null]
    time.sync = [0, 0]
    for (let i = 0; i < 2; i++) {
      activeSlotsDialogue[i] = [];
    }
    if (audioEngine) {
      audioEngine.cleanup()
    }
    data.audio = {
      enabled: false,
      fileName: null,
      fileSize: null,
      format: null,
      tracks: [],
      selectedTrack: 0,
      volume: 1.0,
      isMuted: false,
      delay: 0.0,
      mode: "stream"
    }
    sendMessage("data", { data, time, overlay })
  } else if (action === "time") {
    sendMessage("time", { time, audio: data.audio })
  } else {
    if (!data.init) { init() }
    sendMessage("data", { data, time, overlay })
  }
  callback(true)
})