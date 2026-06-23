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
    let fmt = { start: 1, end: 2, text: 9, style: -1, name: -1 }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (line.startsWith("Format:")) {
        const cols = line.substring(7).split(",").map(c => c.trim())
        fmt.start = cols.indexOf("Start")
        fmt.end = cols.indexOf("End")
        fmt.text = cols.indexOf("Text")
        fmt.style = cols.indexOf("Style")
        fmt.name = cols.indexOf("Name")
      } 
      else if (line.startsWith("Dialogue:")) {
        const dataStr = line.substring(9).trim()
        const parts = dataStr.split(",")
        
        if (fmt.start > -1 && fmt.text > -1 && parts.length > fmt.text) {
          const start = parseTime(parts[fmt.start])
          const end = parseTime(parts[fmt.end])
          const rawText = parts.slice(fmt.text).join(",")
          
          const style = fmt.style > -1 ? parts[fmt.style] : ""
          const name = fmt.name > -1 ? parts[fmt.name] : ""
          
          let isDrawing = false;
          let cleanText = "";
          let inTag = false;
          let currentTag = "";
          let hasTopAlignTag = false;
          let hasPosOrMoveTag = false;
          
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
              if (/\\an[789]/.test(currentTag) || /\\a[567](?!\d)/.test(currentTag)) {
                hasTopAlignTag = true;
              }
              if (/\\pos|\\move/.test(currentTag)) {
                hasPosOrMoveTag = true;
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
          
          const isSignOrTitle = 
            /sign|location|title|credit|flash|staff|note|label/i.test(style) || 
            /sign|location|title|credit|flash|staff|note|label/i.test(name) ||
            hasPosOrMoveTag;
            
          const isDialogueStyle = /^(?:default|dialogue|main|subs|spoken|vocal)?$/i.test(style.trim());
          const isDialogueActor = name.trim() === "" || /^(?:speaker|character|voice|narrator)/i.test(name.trim());
          
          let isTop = false;
          if (isSignOrTitle) {
            isTop = true;
          } else if (hasTopAlignTag && !(isDialogueStyle && isDialogueActor)) {
            isTop = true;
          }
          
          const musicKeywordRegex = /(?:^|[^a-zA-Z])(?:op|ed\d*|opening|ending|lyrics|song|vocal|theme)(?:$|[^a-zA-Z])|(?:^|[^a-zA-Z])(?:romaji|kanji|trans(?:lation)?|eng(?:lish)?|viet(?:namese)?|vn)(?:op|ed)\d*(?:$|[^a-zA-Z])|(?:^|[^a-zA-Z])(?:op|ed)\d*(?:romaji|kanji|trans(?:lation)?|eng(?:lish)?|viet(?:namese)?|vn)(?:$|[^a-zA-Z])/i;
          const isMusic = /[\u2669-\u266F]/.test(cleanText) || cleanText.includes("♪") || cleanText.includes("♫") || musicKeywordRegex.test(style) || musicKeywordRegex.test(name);
          
          if (cleanText) {
            output.push({ id: `${start}-${end}-${output.length}`, from: start, to: end, text: cleanText, isTop, isMusic })
          }
        }
      }
    }
  } else {
    let current = { from: 0, to: 0, text: "", isTop: false, isMusic: false }
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim()
      if (line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) continue;
      
      if (/^\d+$/.test(line) && !line.includes("-->")) {
        current = { from: 0, to: 0, text: "", isTop: false, isMusic: false }
      } else if (line.includes("-->")) {
        const parts = line.split("-->")
        const start = parts[0].trim().split(" ")[0]
        const endPart = parts[1].trim()
        const end = endPart.split(" ")[0]
        current.from = parseTime(start)
        current.to = parseTime(end)
        
        if (/line:(?:[0-5]|(?:[1-2]?\d|30)%)/.test(endPart)) {
          current.isTop = true
        }
        const yCoordMatch = endPart.match(/Y1:\s*(\d+)/i)
        if (yCoordMatch && parseInt(yCoordMatch[1]) < 200) {
          current.isTop = true
        }
      } else if (line) {
        if (/{\\an[789]/.test(line) || /{\\a[567](?!\d)/.test(line)) {
          current.isTop = true
          line = line.replace(/{\\an[789]}/g, "").replace(/{\\a[567]}/g, "")
        }
        current.text = (current.text ? current.text + "<br>" : "") + line
      } else if (current.text) {
        current.isMusic = /[\u2669-\u266F]/.test(current.text) || current.text.includes("♪") || current.text.includes("♫")
        current.id = `${current.from}-${current.to}-${output.length}`;
        output.push(current)
        current = { from: 0, to: 0, text: "", isTop: false, isMusic: false }
      }
    }
    if (current.text) {
      current.isMusic = /[\u2669-\u266F]/.test(current.text) || current.text.includes("♪") || current.text.includes("♫")
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

const hexToRgba = (hex, opacity) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const updateSvgBorders = (parent) => {
  const svgs = parent.querySelectorAll('.ds-border-svg');
  for (let j = 0; j < svgs.length; j++) {
    const svg = svgs[j];
    const container = svg.parentElement;
    if (!container) continue;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    if (w === 0 || h === 0) continue;
    
    const currentW = svg.getAttribute('width');
    const currentH = svg.getAttribute('height');
    if (currentW === `${w}` && currentH === `${h}`) continue;
    
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    
    const pathOuter = svg.querySelector('.path-outer');
    const pathMiddle = svg.querySelector('.path-middle');
    const pathInner = svg.querySelector('.path-inner');
    
    const pathMusicBg = svg.querySelector('.path-music-bg');
    const pathMusicTopOuter = svg.querySelector('.path-music-top-outer');
    const pathMusicTopInner = svg.querySelector('.path-music-top-inner');
    const pathMusicBottomOuter = svg.querySelector('.path-music-bottom-outer');
    const pathMusicBottomInner = svg.querySelector('.path-music-bottom-inner');
    const noteLeft = svg.querySelector('.note-group-left');
    const noteRight = svg.querySelector('.note-group-right');
    
    if (pathOuter) {
      pathOuter.setAttribute('d', `M 14,2 L ${w - 14},2 L ${w - 14},6 A 8,8 0 0,0 ${w - 6},14 L ${w - 2},14 L ${w - 2},${h - 14} L ${w - 6},${h - 14} A 8,8 0 0,0 ${w - 14},${h - 6} L ${w - 14},${h - 2} L 14,${h - 2} L 14,${h - 6} A 8,8 0 0,0 6,${h - 14} L 2,${h - 14} L 2,14 L 6,14 A 8,8 0 0,0 14,6 L 14,2 Z`);
    }
    if (pathMiddle) {
      pathMiddle.setAttribute('d', `M 16,4 L ${w - 16},4 L ${w - 16},8 A 8,8 0 0,0 ${w - 8},16 L ${w - 4},16 L ${w - 4},${h - 16} L ${w - 8},${h - 16} A 8,8 0 0,0 ${w - 16},${h - 8} L ${w - 16},${h - 4} L 16,${h - 4} L 16,${h - 8} A 8,8 0 0,0 8,${h - 16} L 4,${h - 16} L 4,16 L 8,16 A 8,8 0 0,0 16,8 L 16,4 Z`);
    }
    if (pathInner) {
      pathInner.setAttribute('d', `M 22,10 L ${w - 22},10 L ${w - 22},14 A 8,8 0 0,0 ${w - 14},22 L ${w - 10},22 L ${w - 10},${h - 22} L ${w - 14},${h - 22} A 8,8 0 0,0 ${w - 22},${h - 14} L ${w - 22},${h - 10} L 22,${h - 10} L 22,${h - 14} A 8,8 0 0,0 14,${h - 22} L 10,${h - 22} L 10,22 L 14,22 A 8,8 0 0,0 22,14 L 22,10 Z`);
    }
    
    if (pathMusicBg) {
      pathMusicBg.setAttribute('d', `M 12,2 L ${w - 12},2 A 10,10 0 0,1 ${w - 2},12 L ${w - 2},${h - 12} A 10,10 0 0,1 ${w - 12},${h - 2} L 12,${h - 2} A 10,10 0 0,1 2,${h - 12} L 2,12 A 10,10 0 0,1 12,2 Z`);
      if (pathMusicTopOuter) {
        pathMusicTopOuter.setAttribute('d', `M 12,2 L ${w - 12},2`);
      }
      if (pathMusicTopInner) {
        pathMusicTopInner.setAttribute('d', `M 14,6 L ${w - 14},6`);
      }
      if (pathMusicBottomOuter) {
        pathMusicBottomOuter.setAttribute('d', `M 12,${h - 2} L ${w - 12},${h - 2}`);
      }
      if (pathMusicBottomInner) {
        pathMusicBottomInner.setAttribute('d', `M 14,${h - 6} L ${w - 14},${h - 6}`);
      }
    }
    if (noteLeft) {
      noteLeft.setAttribute('transform', `translate(18, ${h / 2})`);
    }
    if (noteRight) {
      noteRight.setAttribute('transform', `translate(${w - 18}, ${h / 2})`);
    }
  }
};

const data = { init: false, target: null, name: "none", names: [null, null], subs: [null, null] }
const time = { current: 0, duration: 0, sync: [0, 0] }
const activeSlotsDialogue = [[], []];
const activeSlotsSpecial = [[], []];

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
            
            const activeDialogue = activeLines.filter(l => !(l.isTop || l.isMusic));
            const activeSpecial = activeLines.filter(l => (l.isTop || l.isMusic));
            
            // Manage dialogue slots
            if (activeDialogue.length === 0 && activeSpecial.length === 0) {
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

            // Manage special slots
            if (activeSpecial.length === 0 && activeDialogue.length === 0) {
                activeSlotsSpecial[i] = [];
            } else {
                for (let s = 0; s < activeSlotsSpecial[i].length; s++) {
                    if (activeSlotsSpecial[i][s]) {
                        const isStillActive = activeSpecial.some(l => l.id === activeSlotsSpecial[i][s].id);
                        if (!isStillActive) {
                            activeSlotsSpecial[i][s] = null;
                        }
                    }
                }

                activeSpecial.forEach(l => {
                    const isAssigned = activeSlotsSpecial[i].some(s => s && s.id === l.id);
                    if (!isAssigned) {
                        const emptyIdx = activeSlotsSpecial[i].indexOf(null);
                        if (emptyIdx !== -1) {
                            activeSlotsSpecial[i][emptyIdx] = l;
                        } else {
                            activeSlotsSpecial[i].push(l);
                        }
                    }
                });

                if (activeSpecial.length > 0) {
                    while (activeSlotsSpecial[i].length > 0 && activeSlotsSpecial[i][activeSlotsSpecial[i].length - 1] === null) {
                        activeSlotsSpecial[i].pop();
                    }
                }
            }

            const colorsSignboard = [
                { border: '#423ee0', bg: '#423ee0', bgOpacity: 0.15 }, // Sub 1: Original Blue/Indigo
                { border: '#9b8ff3', bg: '#9b8ff3', bgOpacity: 0.20 }  // Sub 2: Original Lavender/Purple
            ];
            const colorsMusic = [
                { border: '#ff9f1c', bg: '#ff9f1c', bgOpacity: 0.04 }, // Sub 1: Warm Amber/Orange
                { border: '#ffb703', bg: '#ffb703', bgOpacity: 0.05 }  // Sub 2: Solar Yellow/Amber
            ];
            const colorSign = colorsSignboard[i];
            const colorMusic = colorsMusic[i];

            const createSvgMarkup = () => {
                return `<svg class="ds-border-svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; overflow: visible; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.35)); display: block; margin: 0; padding: 0;"><path class="path-outer" fill="${colorSign.bg}" fill-opacity="${colorSign.bgOpacity}" stroke="${colorSign.border}" stroke-opacity="0.5" stroke-width="0.8" /><path class="path-middle" fill="none" stroke="${colorSign.border}" stroke-opacity="0.95" stroke-width="2.2" /><path class="path-inner" fill="none" stroke="${colorSign.border}" stroke-opacity="0.75" stroke-width="1.0" /></svg>`;
            };

            const gradId = `ds-music-grad-${i}-${id}`;
            const glowId = `ds-music-glow-${i}-${id}`;
            const createMusicSvgMarkup = () => {
                return `<svg class="ds-border-svg music" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; overflow: visible; filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.65)); display: block; margin: 0; padding: 0;">` +
                    `<defs>` +
                        `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">` +
                            `<stop offset="0%" stop-color="${colorMusic.bg}" stop-opacity="0.00" />` +
                            `<stop offset="15%" stop-color="${colorMusic.bg}" stop-opacity="0.05" />` +
                            `<stop offset="50%" stop-color="${colorMusic.bg}" stop-opacity="0.10" />` +
                            `<stop offset="85%" stop-color="${colorMusic.bg}" stop-opacity="0.05" />` +
                            `<stop offset="100%" stop-color="${colorMusic.bg}" stop-opacity="0.00" />` +
                        `</linearGradient>` +
                        `<filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">` +
                            `<feGaussianBlur stdDeviation="3.0" result="coloredBlur"/>` +
                            `<feMerge>` +
                                `<feMergeNode in="coloredBlur"/>` +
                                `<feMergeNode in="coloredBlur"/>` +
                                `<feMergeNode in="SourceGraphic"/>` +
                            `</feMerge>` +
                        `</filter>` +
                    `</defs>` +
                    `<path class="path-music-bg" fill="url(#${gradId})" stroke="none" />` +
                    `<path class="path-music-top-outer" fill="none" stroke="${colorMusic.border}" stroke-opacity="0.90" stroke-width="3.2" filter="url(#${glowId})" />` +
                    `<path class="path-music-top-inner" fill="none" stroke="${colorMusic.border}" stroke-opacity="0.60" stroke-width="1.6" />` +
                    `<path class="path-music-bottom-outer" fill="none" stroke="${colorMusic.border}" stroke-opacity="0.90" stroke-width="3.2" filter="url(#${glowId})" />` +
                    `<path class="path-music-bottom-inner" fill="none" stroke="${colorMusic.border}" stroke-opacity="0.60" stroke-width="1.6" />` +
                    `<g class="note-group-left">` +
                        `<circle class="note-glow-left" r="13" fill="${colorMusic.border}" fill-opacity="0.15" filter="url(#${glowId})" />` +
                        `<text font-size="22" font-family="system-ui, sans-serif" font-weight="bold" dominant-baseline="central" text-anchor="middle" fill="#ffffff" style="text-shadow: 0 0 4px ${colorMusic.border};">♪</text>` +
                    `</g>` +
                    `<g class="note-group-right">` +
                        `<circle class="note-glow-right" r="13" fill="${colorMusic.border}" fill-opacity="0.15" filter="url(#${glowId})" />` +
                        `<text font-size="22" font-family="system-ui, sans-serif" font-weight="bold" dominant-baseline="central" text-anchor="middle" fill="#ffffff" style="text-shadow: 0 0 4px ${colorMusic.border};">♫</text>` +
                    `</g>` +
                `</svg>`;
            };

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

            let specialParts = [];
            if (activeSlotsSpecial[i].length > 0) {
                specialParts = activeSlotsSpecial[i].map(s => {
                    if (s) {
                        if (s.isMusic) {
                            const musicBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 12px 36px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important; font-style: italic;`;
                            return `<div style="display: flex; justify-content: center; margin: 6px 0;"><span class="ds-special music" style="${musicBoxStyle}">${createMusicSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span></div>`;
                        } else {
                            const specialBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 18px 28px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important;`;
                            return `<div style="display: flex; justify-content: center; margin: 6px 0;"><span class="ds-special" style="${specialBoxStyle}">${createSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span></div>`;
                        }
                    } else {
                        return `<div style="visibility: hidden;">&nbsp;</div>`;
                    }
                });
            }

            const combinedParts = [...dialogueParts, ...specialParts];
            const text = [...combinedParts].reverse().join("");
            
            if (text !== "") {
                if (overlay.inner[i].element.innerHTML !== text) {
                    overlay.inner[i].element.innerHTML = text;
                }
                overlay.inner[i].element.style.visibility = "visible";
                updateSvgBorders(overlay.inner[i].element);
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
            activeSlotsSpecial[i] = [];
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
    activeSlotsDialogue[idx] = [];
    activeSlotsSpecial[idx] = [];
    
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
    for (let i = 0; i < 2; i++) {
      activeSlotsDialogue[i] = [];
      activeSlotsSpecial[i] = [];
    }
    sendMessage("data", { data, time, overlay })
  } else if (action === "time") {
    sendMessage("time", { time })
  } else {
    if (!data.init) { init() }
    sendMessage("data", { data, time, overlay })
  }
  callback(true)
})