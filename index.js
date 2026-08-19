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

function updateAudioUI(audio) {
    if (!audio) return;
    const isLoaded = !!audio.fileName;
    const isLoading = !!audio.loading;

    // Update section.upload
    const uploadSection = qs(".section.upload");
    if (uploadSection) {
        uploadSection.setAttribute("data-audio-loaded", isLoaded ? "true" : "false");
        uploadSection.setAttribute("data-audio-loading", isLoading ? "true" : "false");
    }

    const uploadLoadingDesc = qs("#upload-audio-loading-desc");
    if (uploadLoadingDesc && audio.loadingFileName) {
        uploadLoadingDesc.textContent = `Reading & decoding ${audio.loadingFileName}...`;
    }

    if (isLoaded) {
        const uploadAudioName = qs("#upload-audio-name");
        const uploadAudioMeta = qs("#upload-audio-meta");
        if (uploadAudioName) uploadAudioName.textContent = audio.fileName;
        if (uploadAudioMeta) uploadAudioMeta.textContent = `${audio.format || ''} • ${audio.fileSize || ''}`.trim();
    }

    // Update section.audio (pure settings)
    const audioSection = qs(".section.audio");
    if (audioSection) {
        audioSection.setAttribute("data-audio-loaded", isLoaded ? "true" : "false");
        audioSection.setAttribute("data-audio-loading", isLoading ? "true" : "false");
    }

    const loadingDesc = qs("#audio-loading-desc");
    if (loadingDesc && audio.loadingFileName) {
        loadingDesc.textContent = `Reading & decoding ${audio.loadingFileName}...`;
    }

    const fileNameEl = qs("#audio-file-name");
    const fileMetaEl = qs("#audio-file-meta");
    const toggleEl = qs("#audio-enable-toggle");
    const trackSelect = qs("#audio-track-select");
    const trackGroup = qs("#audio-track-group");
    const volumeSlider = qs("#audio-volume");
    const volumeText = qs("#audio-volume-text");
    const muteBtn = qs("#audio-mute-btn");
    const delayInput = qs("#audio-delay");

    if (isLoaded) {
        if (fileNameEl) fileNameEl.textContent = audio.fileName;
        if (fileMetaEl) fileMetaEl.textContent = `${audio.format || ''} • ${audio.fileSize || ''}`.trim();
        if (toggleEl) toggleEl.checked = !!audio.enabled;

        if (trackSelect) {
            const currentOptionCount = trackSelect.options.length;
            const newOptionCount = (audio.tracks && audio.tracks.length > 0) ? audio.tracks.length : 1;
            if (currentOptionCount !== newOptionCount || trackSelect.getAttribute("data-file") !== audio.fileName) {
                trackSelect.setAttribute("data-file", audio.fileName || "");
                if (audio.tracks && audio.tracks.length > 0) {
                    trackSelect.innerHTML = audio.tracks.map((t, idx) => 
                        `<option value="${idx}" ${idx === audio.selectedTrack ? 'selected' : ''}>${t.name || ('Track ' + (idx + 1))} (${t.language || 'UND'}, ${t.codec || 'Audio'}, ${t.channels || 'Stereo'})</option>`
                    ).join('');
                } else {
                    trackSelect.innerHTML = `<option value="0">Track 1 (Default Audio)</option>`;
                }
            } else if (document.activeElement !== trackSelect) {
                trackSelect.value = audio.selectedTrack ?? 0;
            }
        }
        if (trackGroup) trackGroup.style.display = "flex";

        const volPct = Math.round((audio.volume ?? 1.0) * 100);
        if (volumeSlider) volumeSlider.value = volPct;
        if (volumeText) volumeText.textContent = `${volPct}%`;

        if (muteBtn) {
            muteBtn.textContent = audio.isMuted ? "🔇" : "🔊";
            muteBtn.classList.toggle("muted", !!audio.isMuted);
        }

        if (delayInput && document.activeElement !== delayInput) {
            delayInput.value = Math.round((audio.delay || 0) * 1000);
        }

        qa('input[name="audioEngineMode"]').forEach(r => {
            r.checked = (r.value === (audio.mode || 'stream'));
        });
    } else {
        if (fileNameEl) fileNameEl.textContent = "No file loaded";
        if (fileMetaEl) fileMetaEl.textContent = "Upload audio file in the Upload tab";
        if (trackSelect) trackSelect.innerHTML = `<option value="0">No audio tracks</option>`;
        if (trackGroup) trackGroup.style.display = "flex";
    }
}

const updateVideoStatus = (hasVideo, duration = 0, current = 0) => {
  const banner = qs("#upload-video-banner");
  const statusText = qs("#status-text");
  const previewTime = qs("#upload-preview-time");
  
  if (hasVideo) {
    document.body.setAttribute("data-ready", "true");
    if (banner) banner.setAttribute("data-video-ready", "true");
    if (statusText) statusText.textContent = "Video connected";
    if (previewTime) {
      previewTime.textContent = `${toTimeString(current)} / ${toTimeString(duration)}`;
    }
  } else {
    document.body.removeAttribute("data-ready");
    if (banner) banner.setAttribute("data-video-ready", "false");
    if (statusText) statusText.textContent = "No video detected";
    if (previewTime) previewTime.textContent = "Open a video to play";
  }
};

chrome.runtime.onMessage.addListener(message => {
  if (!message) { return }
  const type = message.type
  if (type === "info") {
    const id = message.id
    const data = message.data
    const hasVideo = !!(data && (data.hasVideo || data.target));
    updateVideoStatus(hasVideo, data ? data.duration : 0, 0);
    if (states.iframe === null && hasVideo) {
      states.iframe = { id, duration: data.duration }
      const settings = JSON.parse(localStorage.getItem("settings") || "null")
      if (settings && settings.version === "2.6") {
        sendMessage("update", { outer: settings.outer.style, inner: [settings.inner[0].style, settings.inner[1].style] }).then(onInit)
      } else {
        sendMessage("data").then(onInit)
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
    
    const hasVideo = !!(data && (data.target || data.hasVideo)) || (time && (time.duration > 0 || time.current > 0));
    updateVideoStatus(hasVideo, time ? time.duration : 0, time ? time.current : 0);

    if (states.tab === "upload" || states.tab === "subtitles") { 
        onTiming(data.subs[states.activeSub] || []) 
    }
    
    // Update audio UI if present
    if (data.audio) {
        updateAudioUI(data.audio)
    }
    
    const formatBytes = (bytes) => {
        if (!bytes || isNaN(bytes)) return "";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    // Update Sub 1 Slot (index 0)
    const slot0 = qs("#sub-slot-0");
    if (slot0) {
      const isSub0Loaded = !!data.names[0];
      slot0.setAttribute("data-loaded", isSub0Loaded ? "true" : "false");
      if (isSub0Loaded) {
        const subName0 = qs("#sub-name-0");
        if (subName0) {
          subName0.textContent = data.names[0];
          subName0.setAttribute("title", data.names[0]);
        }
        const subMeta0 = qs("#sub-meta-0");
        if (subMeta0) {
          const meta = data.subMeta && data.subMeta[0];
          const ext = data.names[0].split('.').pop().toUpperCase();
          const sizeStr = meta && meta.size ? ` • ${formatBytes(meta.size)}` : "";
          subMeta0.textContent = `${meta && meta.format ? meta.format : ext}${sizeStr}`;
        }
      }
    }

    // Update Sub 2 Slot (index 1)
    const slot1 = qs("#sub-slot-1");
    if (slot1) {
      const isSub1Loaded = !!data.names[1];
      slot1.setAttribute("data-loaded", isSub1Loaded ? "true" : "false");
      if (isSub1Loaded) {
        const subName1 = qs("#sub-name-1");
        if (subName1) {
          subName1.textContent = data.names[1];
          subName1.setAttribute("title", data.names[1]);
        }
        const subMeta1 = qs("#sub-meta-1");
        if (subMeta1) {
          const meta = data.subMeta && data.subMeta[1];
          const ext = data.names[1].split('.').pop().toUpperCase();
          const sizeStr = meta && meta.size ? ` • ${formatBytes(meta.size)}` : "";
          subMeta1.textContent = `${meta && meta.format ? meta.format : ext}${sizeStr}`;
        }
      }
    }

    if (states.tab !== "settings") {
        updateSettingsUI(overlay)
    }
    if (states.tab !== "subtitles") {
      qs("#sync").value = Math.round((time.sync[states.activeSub] || 0) * 1000)
    }
    localStorage.setItem("settings", JSON.stringify(overlay))
    
  } else if (type === "time") {
    if (lastData) lastData.time = message.data.time;
    const time = message.data.time;
    const hasVideo = time && (time.duration > 0 || time.current > 0);
    updateVideoStatus(hasVideo, time ? time.duration : 0, time ? time.current : 0);
    onTimingUpdate(time)
    if (states.tab !== "subtitles" && document.activeElement !== qs("#sync")) { 
      qs("#sync").value = Math.round((time.sync[states.activeSub] || 0) * 1000) 
    }
    if (message.data.audio && document.activeElement !== qs("#audio-delay")) {
      const audioDelayInput = qs("#audio-delay");
      if (audioDelayInput) {
        audioDelayInput.value = Math.round((message.data.audio.delay || 0) * 1000);
      }
    }
  }
})

qa(".slot-empty[data-slot]").forEach(slotBtn => {
  slotBtn.addEventListener("click", () => {
    const slotIdx = parseInt(slotBtn.getAttribute("data-slot"));
    sendMessage("upload", { slot: slotIdx });
  });
});

qa(".sub-slot .remove-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const idx = parseInt(e.currentTarget.getAttribute("data-index"));
    sendMessage("remove", { index: idx });
  });
});

const audioUploadTray = qs("#audio-upload-tray");
if (audioUploadTray) {
  audioUploadTray.addEventListener("click", () => {
    sendMessage("audio_upload");
  });
}

const uploadAudioRemoveBtn = qs("#upload-audio-remove-btn");
if (uploadAudioRemoveBtn) {
  uploadAudioRemoveBtn.addEventListener("click", () => {
    sendMessage("audio_remove");
  });
}

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
    if (states.tab === "subtitles" && lastData && lastData.data) {
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
            
            if (states.tab === "subtitles") {
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

// Audio Controls Listeners
const audioRemoveBtn = qs("#audio-remove-btn");
if (audioRemoveBtn) {
  audioRemoveBtn.addEventListener("click", () => {
    sendMessage("audio_remove");
  });
}

const audioToggle = qs("#audio-enable-toggle");
if (audioToggle) {
  audioToggle.addEventListener("change", () => {
    sendMessage("audio_toggle");
  });
}

const audioTrackSelect = qs("#audio-track-select");
if (audioTrackSelect) {
  audioTrackSelect.addEventListener("change", (e) => {
    const idx = parseInt(e.target.value);
    sendMessage("audio_select_track", { trackIndex: idx });
  });
}

const audioVolumeSlider = qs("#audio-volume");
if (audioVolumeSlider) {
  audioVolumeSlider.addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    const volumeBadge = qs("#audio-volume-text");
    if (volumeBadge) volumeBadge.textContent = `${val}%`;
    sendMessage("audio_update", { volume: val / 100 });
  });
}

const audioMuteBtn = qs("#audio-mute-btn");
if (audioMuteBtn) {
  audioMuteBtn.addEventListener("click", () => {
    const isCurrentlyMuted = audioMuteBtn.classList.contains("muted");
    sendMessage("audio_update", { isMuted: !isCurrentlyMuted });
  });
}

function adjustAudioDelay(deltaMs) {
  const currentMs = parseFloat(qs("#audio-delay").value) || 0;
  const newMs = currentMs + deltaMs;
  qs("#audio-delay").value = newMs;
  const amount = newMs / 1000;
  sendMessage("audio_update", { delay: amount });
}

function makeRepeatableAudio(btn, amount) {
  let timerId = null;
  let intervalId = null;
  
  const start = (e) => {
    if (e.button !== 0) return;
    adjustAudioDelay(amount);
    timerId = setTimeout(() => {
      intervalId = setInterval(() => {
        adjustAudioDelay(amount);
      }, 60);
    }, 350);
  };
  
  const stop = () => {
    clearTimeout(timerId);
    clearInterval(intervalId);
  };
  
  btn.addEventListener("mousedown", start);
  btn.addEventListener("mouseup", stop);
  btn.addEventListener("mouseleave", stop);
}

qa(".audio-sync-btn[data-audio-amount]").forEach(btn => {
  const amount = parseInt(btn.getAttribute("data-audio-amount"));
  makeRepeatableAudio(btn, amount);
});

const audioDelayReset = qs("#audio-delay-reset");
if (audioDelayReset) {
  audioDelayReset.addEventListener("click", () => {
    qs("#audio-delay").value = 0;
    sendMessage("audio_update", { delay: 0 });
  });
}

const audioDelayInput = qs("#audio-delay");
if (audioDelayInput) {
  audioDelayInput.addEventListener("input", event => {
    const ms = evaluateMath(event.target.value);
    const amount = ms / 1000;
    sendMessage("audio_update", { delay: amount });
  });

  audioDelayInput.addEventListener("blur", event => {
    const ms = evaluateMath(event.target.value);
    event.target.value = Math.round(ms);
  });

  audioDelayInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      const ms = evaluateMath(event.target.value);
      event.target.value = Math.round(ms);
      event.target.blur();
    }
  });
}

qa('input[name="audioEngineMode"]').forEach(radio => {
  radio.addEventListener("change", (e) => {
    sendMessage("audio_update", { mode: e.target.value });
  });
});

const checkLoop = () => {
  sendMessage("info").then(() => {
    setTimeout(() => { if (!states.iframe) { checkLoop() } }, 100)
  })
}

checkLoop()