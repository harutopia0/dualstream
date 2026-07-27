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

function splitAssDialogue(dataStr, maxCols) {
  const parts = [];
  let current = "";
  for (let i = 0; i < dataStr.length; i++) {
    if (dataStr[i] === ',' && parts.length < maxCols - 1) {
      parts.push(current);
      current = "";
    } else {
      current += dataStr[i];
    }
  }
  parts.push(current);
  return parts;
}

function assColorToCss(assColor, assAlpha) {
  if (!assColor) return null;
  let clean = assColor.replace(/&H|&/gi, "").trim();
  if (clean.length === 0) return null;
  clean = clean.padStart(6, '0');
  let b = clean.substring(clean.length - 6, clean.length - 4);
  let g = clean.substring(clean.length - 4, clean.length - 2);
  let r = clean.substring(clean.length - 2);
  
  let alphaVal = 1.0;
  if (assAlpha) {
    let cleanAlpha = assAlpha.replace(/&H|&/gi, "").trim();
    if (cleanAlpha.length > 0) {
      let aHex = parseInt(cleanAlpha, 16);
      if (!isNaN(aHex)) {
        alphaVal = 1.0 - (aHex / 255);
        if (alphaVal < 0) alphaVal = 0;
        if (alphaVal > 1) alphaVal = 1;
      }
    }
  }
  const rDec = parseInt(r, 16) || 0;
  const gDec = parseInt(g, 16) || 0;
  const bDec = parseInt(b, 16) || 0;
  if (alphaVal < 1.0) {
    return `rgba(${rDec}, ${gDec}, ${bDec}, ${alphaVal.toFixed(2)})`;
  }
  return `#${r.padStart(2, '0')}${g.padStart(2, '0')}${b.padStart(2, '0')}`;
}

function parseAssFormattedText(rawText, playResY, defaultFontFamily) {
  let inTag = false;
  let currentTag = "";
  let isDrawing = false;
  
  let state = {
    fontSize: null,
    bold: null,
    italic: null,
    underline: false,
    strikeout: false,
    color: null,
    borderColor: null,
    shadowColor: null,
    borderWidth: null,
    shadowDist: null,
    letterSpacing: null,
    scaleX: null,
    scaleY: null,
    rotateZ: null,
    skewX: null,
    alpha: null
  };
  
  let resultHtml = "";
  let currentText = "";
  
  function flushText() {
    if (!currentText) return;
    let clean = currentText.replace(/\\[Nn]/g, "<br>").replace(/\\h/g, "&nbsp;");
    
    let cssRules = [];
    if (state.fontSize && playResY) {
      const fsVh = ((state.fontSize / playResY) * 100).toFixed(2);
      cssRules.push(`font-size: ${fsVh}vh;`);
    }
    if (state.bold === true) cssRules.push("font-weight: bold;");
    else if (state.bold === false) cssRules.push("font-weight: normal;");
    else if (typeof state.bold === 'number') cssRules.push(`font-weight: ${state.bold};`);
    
    if (state.italic === true) cssRules.push("font-style: italic;");
    else if (state.italic === false) cssRules.push("font-style: normal;");
    
    let decor = [];
    if (state.underline) decor.push("underline");
    if (state.strikeout) decor.push("line-through");
    if (decor.length > 0) cssRules.push(`text-decoration: ${decor.join(" ")};`);
    
    if (state.color) cssRules.push(`color: ${state.color};`);
    
    if (state.borderWidth !== null && state.borderWidth > 0 && playResY) {
      const strokeColor = state.borderColor || "#000000";
      const strokeVh = ((state.borderWidth / playResY) * 100).toFixed(2);
      cssRules.push(`-webkit-text-stroke: ${strokeVh}vh ${strokeColor}; paint-order: stroke fill; -webkit-paint-order: stroke fill;`);
    } else if (state.borderWidth !== null && state.borderWidth > 0) {
      const strokeColor = state.borderColor || "#000000";
      cssRules.push(`-webkit-text-stroke: ${state.borderWidth}px ${strokeColor}; paint-order: stroke fill; -webkit-paint-order: stroke fill;`);
    } else if (state.borderColor) {
      cssRules.push(`-webkit-text-stroke: 0.1vh ${state.borderColor}; paint-order: stroke fill; -webkit-paint-order: stroke fill;`);
    }
    
    if (state.shadowDist !== null && state.shadowDist > 0 && playResY) {
      const shadColor = state.shadowColor || "rgba(0,0,0,0.8)";
      const shadVh = ((state.shadowDist / playResY) * 100).toFixed(2);
      cssRules.push(`text-shadow: ${shadVh}vh ${shadVh}vh 0.2vh ${shadColor};`);
    } else if (state.shadowDist !== null && state.shadowDist > 0) {
      const shadColor = state.shadowColor || "rgba(0,0,0,0.8)";
      cssRules.push(`text-shadow: ${state.shadowDist}px ${state.shadowDist}px 2px ${shadColor};`);
    }
    
    if (state.letterSpacing) cssRules.push(`letter-spacing: ${state.letterSpacing}px;`);
    
    let transforms = [];
    if ((state.scaleX !== null && state.scaleX !== 100) || (state.scaleY !== null && state.scaleY !== 100)) {
      const sx = state.scaleX !== null ? state.scaleX / 100 : 1;
      const sy = state.scaleY !== null ? state.scaleY / 100 : 1;
      transforms.push(`scale(${sx}, ${sy})`);
    }
    if (state.rotateZ !== null && state.rotateZ !== 0) {
      transforms.push(`rotate(${-state.rotateZ}deg)`);
    }
    if (state.skewX !== null && state.skewX !== 0) {
      transforms.push(`skewX(${-state.skewX}deg)`);
    }
    if (transforms.length > 0) {
      cssRules.push(`display: inline-block; transform: ${transforms.join(" ")};`);
    }
    
    if (cssRules.length > 0) {
      resultHtml += `<span style="${cssRules.join(" ")}">${clean}</span>`;
    } else {
      resultHtml += clean;
    }
    currentText = "";
  }
  
  for (let i = 0; i < rawText.length; i++) {
    const char = rawText[i];
    if (char === '{') {
      flushText();
      inTag = true;
      currentTag = "";
    } else if (char === '}') {
      inTag = false;
      
      if (/\\p[1-9]/.test(currentTag)) isDrawing = true;
      else if (/\\p0/.test(currentTag)) isDrawing = false;
      
      const fsMatch = currentTag.match(/\\fs([\d.]+)/);
      if (fsMatch) state.fontSize = parseFloat(fsMatch[1]);
      
      const bMatch = currentTag.match(/\\b([019]|\d{3})/);
      if (bMatch) {
        if (bMatch[1] === "1") state.bold = true;
        else if (bMatch[1] === "0") state.bold = false;
        else state.bold = parseInt(bMatch[1], 10);
      }
      
      const iMatch = currentTag.match(/\\i([01])/);
      if (iMatch) state.italic = iMatch[1] === "1";
      
      const uMatch = currentTag.match(/\\u([01])/);
      if (uMatch) state.underline = uMatch[1] === "1";
      
      const sMatch = currentTag.match(/\\s([01])/);
      if (sMatch) state.strikeout = sMatch[1] === "1";
      
      const cMatch = currentTag.match(/\\(?:c|1c)(&H[0-9a-fA-F]+&?)/);
      if (cMatch) state.color = assColorToCss(cMatch[1], state.alpha);
      
      const c3Match = currentTag.match(/\\3c(&H[0-9a-fA-F]+&?)/);
      if (c3Match) state.borderColor = assColorToCss(c3Match[1]);
      
      const c4Match = currentTag.match(/\\4c(&H[0-9a-fA-F]+&?)/);
      if (c4Match) state.shadowColor = assColorToCss(c4Match[1]);
      
      const aMatch = currentTag.match(/\\(?:alpha|1a)(&H[0-9a-fA-F]+&?)/);
      if (aMatch) state.alpha = aMatch[1];
      
      const bordMatch = currentTag.match(/\\bord([\d.]+)/);
      if (bordMatch) state.borderWidth = parseFloat(bordMatch[1]);
      
      const shadMatch = currentTag.match(/\\shad([\d.]+)/);
      if (shadMatch) state.shadowDist = parseFloat(shadMatch[1]);
      
      const fspMatch = currentTag.match(/\\fsp(-?[\d.]+)/);
      if (fspMatch) state.letterSpacing = parseFloat(fspMatch[1]);
      
      const fscxMatch = currentTag.match(/\\fscx([\d.]+)/);
      if (fscxMatch) state.scaleX = parseFloat(fscxMatch[1]);
      const fscyMatch = currentTag.match(/\\fscy([\d.]+)/);
      if (fscyMatch) state.scaleY = parseFloat(fscyMatch[1]);
      
      const frzMatch = currentTag.match(/\\frz?(-?[\d.]+)/);
      if (frzMatch) state.rotateZ = parseFloat(frzMatch[1]);
      
      const faxMatch = currentTag.match(/\\fax(-?[\d.]+)/);
      if (faxMatch) state.skewX = parseFloat(faxMatch[1]);
      
    } else {
      if (inTag) {
        currentTag += char;
      } else {
        if (!isDrawing) {
          currentText += char;
        }
      }
    }
  }
  flushText();
  return resultHtml;
}

function parseLines(text, ext) {
  const lines = text.split(/\r?\n/)
  const output = []
  
  if (ext === "ass" || ext === "ssa") {
    let fmt = { start: 1, end: 2, text: 9, style: -1, name: -1 }
    let playResX = 1920;
    let playResY = 1080;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (line.startsWith("PlayResX:")) {
        const val = parseInt(line.substring(9).trim(), 10);
        if (!isNaN(val) && val > 0) playResX = val;
      } else if (line.startsWith("PlayResY:")) {
        const val = parseInt(line.substring(9).trim(), 10);
        if (!isNaN(val) && val > 0) playResY = val;
      } else if (line.startsWith("Format:")) {
        const cols = line.substring(7).split(",").map(c => c.trim())
        fmt.start = cols.indexOf("Start")
        fmt.end = cols.indexOf("End")
        fmt.text = cols.indexOf("Text")
        fmt.style = cols.indexOf("Style")
        fmt.name = cols.indexOf("Name")
      } 
      else if (line.startsWith("Dialogue:")) {
        const dataStr = line.substring(9).trim()
        const parts = splitAssDialogue(dataStr, fmt.text > -1 ? fmt.text + 1 : 10)
        
        if (fmt.start > -1 && fmt.text > -1 && parts.length > fmt.text) {
          const start = parseTime(parts[fmt.start])
          const end = parseTime(parts[fmt.end])
          const rawText = parts[fmt.text]
          
          const style = fmt.style > -1 ? parts[fmt.style] : ""
          const name = fmt.name > -1 ? parts[fmt.name] : ""
          
          let inTag = false;
          let currentTag = "";
          let hasTopAlignTag = false;
          let parsedPos = null;
          let parsedMove = null;
          let parsedAlignment = 2;
          
          for (let j = 0; j < rawText.length; j++) {
            const char = rawText[j];
            if (char === '{') {
              inTag = true;
              currentTag = "";
            } else if (char === '}') {
              inTag = false;
              if (/\\an[789]/.test(currentTag) || /\\a[567](?!\d)/.test(currentTag)) {
                hasTopAlignTag = true;
              }
              const anMatch = currentTag.match(/\\an([1-9])/);
              const aMatch = currentTag.match(/\\a([1-9]|10|11)/);
              if (anMatch) {
                parsedAlignment = parseInt(anMatch[1], 10);
              } else if (aMatch) {
                const aVal = parseInt(aMatch[1], 10);
                const aToAn = { 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 };
                if (aToAn[aVal]) parsedAlignment = aToAn[aVal];
              }
              const posMatch = currentTag.match(/\\pos\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
              const moveMatch = currentTag.match(/\\move\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)(?:\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+))?\s*\)/);
              if (posMatch) {
                const posX = parseFloat(posMatch[1]);
                const posY = parseFloat(posMatch[2]);
                if (!isNaN(posX) && !isNaN(posY)) {
                  parsedPos = { x: posX, y: posY };
                }
              } else if (moveMatch) {
                const x1 = parseFloat(moveMatch[1]);
                const y1 = parseFloat(moveMatch[2]);
                const x2 = parseFloat(moveMatch[3]);
                const y2 = parseFloat(moveMatch[4]);
                const t1 = moveMatch[5] !== undefined ? parseFloat(moveMatch[5]) : null;
                const t2 = moveMatch[6] !== undefined ? parseFloat(moveMatch[6]) : null;
                if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                  parsedMove = { x1, y1, x2, y2, t1, t2 };
                }
              }
            } else {
              if (inTag) {
                currentTag += char;
              }
            }
          }
          
          const cleanText = parseAssFormattedText(rawText, playResY);
          const plainText = cleanText.replace(/<[^>]*>/g, "").trim();
          
          let pos = null;
          if (parsedPos) {
            pos = {
              x: parsedPos.x,
              y: parsedPos.y,
              alignment: parsedAlignment,
              leftPercent: (parsedPos.x / playResX) * 100,
              topPercent: (parsedPos.y / playResY) * 100
            };
          } else if (parsedMove) {
            pos = {
              move: parsedMove,
              alignment: parsedAlignment,
              playResX: playResX,
              playResY: playResY
            };
          }
          
          if (plainText) {
            output.push({ id: `${start}-${end}-${output.length}`, from: start, to: end, text: cleanText, pos })
          }
        }
      }
    }
  } else {
    let current = { from: 0, to: 0, text: "" }
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim()
      if (line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) continue;
      
      if (/^\d+$/.test(line) && !line.includes("-->")) {
        current = { from: 0, to: 0, text: "" }
      } else if (line.includes("-->")) {
        const parts = line.split("-->")
        const start = parts[0].trim().split(" ")[0]
        const end = parts[1].trim().split(" ")[0]
        current.from = parseTime(start)
        current.to = parseTime(end)
      } else if (line) {
        if (/{\\an[789]/.test(line) || /{\\a[567](?!\d)/.test(line)) {
          line = line.replace(/{\\an[789]}/g, "").replace(/{\\a[567]}/g, "")
        }
        current.text = (current.text ? current.text + "<br>" : "") + line
      } else if (current.text) {
        current.text = current.text.trim();
        current.id = `${current.from}-${current.to}-${output.length}`;
        output.push(current)
        current = { from: 0, to: 0, text: "" }
      }
    }
    if (current.text) {
      current.text = current.text.trim();
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
function getPosTransform(an) {
  const map = {
    1: "translate(0%, -100%)",
    2: "translate(-50%, -100%)",
    3: "translate(-100%, -100%)",
    4: "translate(0%, -50%)",
    5: "translate(-50%, -50%)",
    6: "translate(-100%, -50%)",
    7: "translate(0%, 0%)",
    8: "translate(-50%, 0%)",
    9: "translate(-100%, 0%)"
  };
  return map[an] || "translate(-50%, -100%)";
}

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
    posContainer.innerHTML = "";
    data.name = "none"
    data.names = [null, null]
    data.subs = [null, null]
    time.sync = [0, 0]
    for (let i = 0; i < 2; i++) {
      activeSlotsDialogue[i] = [];
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