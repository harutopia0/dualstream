/**
 * DualStream - Subtitle Parser & Formatter Module
 * Handles ASS/SSA styles, formatting tags, positional alignment, SRT/VTT parsing and WebVTT generation.
 */

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
    let currentSection = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue;

      if (line.startsWith("[") && line.endsWith("]")) {
        currentSection = line.toLowerCase();
        continue;
      }

      if (currentSection === "[fonts]" || currentSection === "[graphics]") {
        continue;
      }

      const lowerLine = line.toLowerCase();

      if (lowerLine.startsWith("playresx:")) {
        const val = parseInt(line.substring(9).trim(), 10);
        if (!isNaN(val) && val > 0) playResX = val;
      } else if (lowerLine.startsWith("playresy:")) {
        const val = parseInt(line.substring(9).trim(), 10);
        if (!isNaN(val) && val > 0) playResY = val;
      } else if (lowerLine.startsWith("format:")) {
        const colonIdx = line.indexOf(":");
        const cols = line.substring(colonIdx + 1).split(",").map(c => c.trim())
        const startIdx = cols.findIndex(c => c.toLowerCase() === "start")
        const textIdx = cols.findIndex(c => c.toLowerCase() === "text")
        if (startIdx > -1 && textIdx > -1) {
          fmt.start = startIdx
          fmt.end = cols.findIndex(c => c.toLowerCase() === "end")
          fmt.text = textIdx
          fmt.style = cols.findIndex(c => c.toLowerCase() === "style")
          fmt.name = cols.findIndex(c => c.toLowerCase() === "name")
        }
      } 
      else if (lowerLine.startsWith("dialogue:")) {
        const colonIdx = line.indexOf(":");
        const dataStr = line.substring(colonIdx + 1).trim()
        const parts = splitAssDialogue(dataStr, fmt.text > -1 ? fmt.text + 1 : 10)
        
        if (fmt.start > -1 && fmt.text > -1 && parts.length > fmt.text) {
          const start = parseTime(parts[fmt.start])
          const end = parseTime(parts[fmt.end])
          const rawText = parts[fmt.text]
          
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
          } else if (parsedAlignment >= 7 && parsedAlignment <= 9) {
            const xMap = { 7: playResX * 0.05, 8: playResX * 0.5, 9: playResX * 0.95 };
            const pctMap = { 7: 5, 8: 50, 9: 95 };
            pos = {
              x: xMap[parsedAlignment],
              y: playResY * 0.05,
              alignment: parsedAlignment,
              leftPercent: pctMap[parsedAlignment],
              topPercent: 5
            };
          } else if (parsedAlignment >= 4 && parsedAlignment <= 6) {
            const xMap = { 4: playResX * 0.05, 5: playResX * 0.5, 6: playResX * 0.95 };
            const pctMap = { 4: 5, 5: 50, 6: 95 };
            pos = {
              x: xMap[parsedAlignment],
              y: playResY * 0.5,
              alignment: parsedAlignment,
              leftPercent: pctMap[parsedAlignment],
              topPercent: 50
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
  }
  return map[an] || "translate(-50%, -100%)";
}

// Export to window if needed
if (typeof window !== "undefined") {
  window.SubtitleParser = {
    parseTime,
    splitAssDialogue,
    assColorToCss,
    parseAssFormattedText,
    parseLines,
    toVTTTime,
    createVTT,
    getPosTransform
  };
}
