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
          
          const topStyleRegex = /\btop\b|ontop|on top|above|upper/i;
          const musicStyleRegex = /^(?:op|ed\d*|opening|ending|lyrics?|songs?|vocals?|theme|music|romaji|kanji|trans(?:lation)?|eng(?:lish)?|viet(?:namese)?|vn|karaoke|singers?)(?:\s+alt|\s+italic)?$/i;
          const musicKeywordRegex = /(?:^|[^a-zA-Z])(?:op|ed\d*|opening|ending|lyrics|song|vocal|theme)(?:$|[^a-zA-Z])|(?:^|[^a-zA-Z])(?:romaji|kanji|trans(?:lation)?|eng(?:lish)?|viet(?:namese)?|vn)(?:op|ed)\d*(?:$|[^a-zA-Z])|(?:^|[^a-zA-Z])(?:op|ed)\d*(?:romaji|kanji|trans(?:lation)?|eng(?:lish)?|viet(?:namese)?|vn)(?:$|[^a-zA-Z])|lyrics|karaoke|singer/i;
          const flashbackStyleRegex = /flashback|fb/i;
          const deviceStyleRegex = /phone|radio|tv|speaker|device|transmitter|comm|intercom|megaphone|robot/i;
          const whisperStyleRegex = /whisper|low|murmur|quiet/i;
          const signStyleRegex = /sign|location|title|credit|flash|staff|note|label|caption|screen|text|card|insert/i;
          const thoughtStyleRegex = /italic|thoughts?|internal|monologue|offscreen|os\b|behind|voiceover|vo\b/i;

          const isFlashback = flashbackStyleRegex.test(style) || flashbackStyleRegex.test(name);
          const isDevice = deviceStyleRegex.test(style) || deviceStyleRegex.test(name);
          const isWhisper = whisperStyleRegex.test(style) || whisperStyleRegex.test(name);
          const isItalic = thoughtStyleRegex.test(style) || thoughtStyleRegex.test(name);
          const isTopStyle = topStyleRegex.test(style) || topStyleRegex.test(name);
          
          const isMusic = /[\u2669-\u266F]/.test(plainText) || plainText.includes("♪") || plainText.includes("♫") || musicStyleRegex.test(style) || musicKeywordRegex.test(style) || musicStyleRegex.test(name) || musicKeywordRegex.test(name);
          const isSignOrTitle = signStyleRegex.test(style) || signStyleRegex.test(name);
          
          let isTop = false;
          if (isSignOrTitle || isFlashback || isDevice || isWhisper || isTopStyle || hasTopAlignTag) {
            isTop = true;
          }
          
          if (plainText) {
            output.push({ id: `${start}-${end}-${output.length}`, from: start, to: end, text: cleanText, pos, isTop, isSignOrTitle, isMusic, isFlashback, isDevice, isWhisper, isItalic })
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
          // Keep normal dialogue styling (no signboard border)
        }
        const yCoordMatch = endPart.match(/Y1:\s*(\d+)/i)
        if (yCoordMatch && parseInt(yCoordMatch[1]) < 200) {
          // Keep normal dialogue styling (no signboard border)
        }
      } else if (line) {
        if (/{\\an[789]/.test(line) || /{\\a[567](?!\d)/.test(line)) {
          line = line.replace(/{\\an[789]}/g, "").replace(/{\\a[567]}/g, "")
        }
        current.text = (current.text ? current.text + "<br>" : "") + line
      } else if (current.text) {
        let isFlashback = false;
        let isDevice = false;
        let isWhisper = false;
        let isItalic = false;
        let cleanText = current.text;
        
        if (/^\s*<i>?\s*[\[\(\{](?:flashback|fb)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
          cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:flashback|fb)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
          isFlashback = true;
        }
        if (/^\s*<i>?\s*[\[\(\{](?:phone|radio|tv|device|comm)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
          cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:phone|radio|tv|device|comm)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
          isDevice = true;
        }
        if (/^\s*<i>?\s*[\[\(\{](?:whisper|low|murmur|quiet)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
          cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:whisper|low|murmur|quiet)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
          isWhisper = true;
        }
        if (/^\s*<i>?\s*[\[\(\{](?:italic|thought|monologue|offscreen|os|vo)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
          cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:italic|thought|monologue|offscreen|os|vo)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
          isItalic = true;
        }
        
        current.text = cleanText.trim();
        current.isMusic = /[\u2669-\u266F]/.test(current.text) || current.text.includes("♪") || current.text.includes("♫");
        current.isFlashback = isFlashback;
        current.isDevice = isDevice;
        current.isWhisper = isWhisper;
        current.isItalic = isItalic || (current.text.startsWith("<i>") && current.text.endsWith("</i>"));
        current.isTop = current.isTop || isFlashback || isDevice || isWhisper;
        
        current.id = `${current.from}-${current.to}-${output.length}`;
        output.push(current)
        current = { from: 0, to: 0, text: "", isTop: false, isMusic: false }
      }
    }
    if (current.text) {
      let isFlashback = false;
      let isDevice = false;
      let isWhisper = false;
      let isItalic = false;
      let cleanText = current.text;
      
      if (/^\s*<i>?\s*[\[\(\{](?:flashback|fb)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
        cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:flashback|fb)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
        isFlashback = true;
      }
      if (/^\s*<i>?\s*[\[\(\{](?:phone|radio|tv|device|comm)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
        cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:phone|radio|tv|device|comm)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
        isDevice = true;
      }
      if (/^\s*<i>?\s*[\[\(\{](?:whisper|low|murmur|quiet)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
        cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:whisper|low|murmur|quiet)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
        isWhisper = true;
      }
      if (/^\s*<i>?\s*[\[\(\{](?:italic|thought|monologue|offscreen|os|vo)[\]\)\}]\s*<\/i>?/i.test(cleanText)) {
        cleanText = cleanText.replace(/^\s*(<i>?\s*)[\[\(\{](?:italic|thought|monologue|offscreen|os|vo)[\]\)\}](\s*<\/i>?\s*)/i, "$1$2");
        isItalic = true;
      }
      
      current.text = cleanText.trim();
      current.isMusic = /[\u2669-\u266F]/.test(current.text) || current.text.includes("♪") || current.text.includes("♫");
      current.isFlashback = isFlashback;
      current.isDevice = isDevice;
      current.isWhisper = isWhisper;
      current.isItalic = isItalic || (current.text.startsWith("<i>") && current.text.endsWith("</i>"));
      current.isTop = current.isTop || isFlashback || isDevice || isWhisper;
      
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

    const sprocketsL = svg.querySelectorAll('.fb-sprocket-l');
    const sprocketsR = svg.querySelectorAll('.fb-sprocket-r');
    
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

    if (sprocketsL.length > 0) {
      for (let k = 0; k < sprocketsL.length; k++) {
        const yVal = h / 2 - 17 + k * 13;
        sprocketsL[k].setAttribute('y', yVal);
        sprocketsL[k].setAttribute('x', 14);
      }
    }
    if (sprocketsR.length > 0) {
      for (let k = 0; k < sprocketsR.length; k++) {
        const yVal = h / 2 - 17 + k * 13;
        sprocketsR[k].setAttribute('y', yVal);
        sprocketsR[k].setAttribute('x', w - 20);
      }
    }
  }
};

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
            
            const activeDialogue = activeLines.filter(l => !l.pos && !(l.isTop || l.isMusic));
            const activeSpecial = activeLines.filter(l => !l.pos && (l.isTop || l.isMusic));
            const activePos = activeLines.filter(l => l.pos);

            const colorsSignboard = [
                { border: '#423ee0', bg: '#423ee0', bgOpacity: 0.15 },
                { border: '#9b8ff3', bg: '#9b8ff3', bgOpacity: 0.20 }
            ];
            const colorsMusic = [
                { border: '#ff9f1c', bg: '#ff9f1c', bgOpacity: 0.04 },
                { border: '#ffb703', bg: '#ffb703', bgOpacity: 0.05 }
            ];
            const colorsFlashback = [
                { border: '#d4af37', borderInner: '#ebd58b', bg: '#1b120c', bgOpacity: 0.15 },
                { border: '#c2a649', borderInner: '#ebd58b', bg: '#18130f', bgOpacity: 0.20 }
            ];
            const colorsDevice = [
                { border: '#00f0ff', bg: '#0a1d20', bgOpacity: 0.15 },
                { border: '#39ff14', bg: '#0a200b', bgOpacity: 0.20 }
            ];
            const colorsWhisper = [
                { border: '#e0e0e0', bg: '#ffffff', bgOpacity: 0.12 },
                { border: '#cccccc', bg: '#ffffff', bgOpacity: 0.12 }
            ];
            const colorSign = colorsSignboard[i];
            const colorMusic = colorsMusic[i];
            const colorFlashback = colorsFlashback[i];
            const colorDevice = colorsDevice[i];
            const colorWhisper = colorsWhisper[i];

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
            const createFlashbackSvgMarkup = () => {
                return `<svg class="ds-border-svg ds-flashback" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; overflow: visible; filter: drop-shadow(0px 2px 6px rgba(0,0,0,0.5)); display: block; margin: 0; padding: 0;">` +
                    `<path class="path-outer" fill="${colorFlashback.bg}" fill-opacity="${colorFlashback.bgOpacity}" stroke="${colorFlashback.border}" stroke-opacity="0.5" stroke-width="0.8" />` +
                    `<path class="path-middle" fill="none" stroke="${colorFlashback.border}" stroke-opacity="0.9" stroke-width="2.2" />` +
                    `<path class="path-inner" fill="none" stroke="${colorFlashback.borderInner}" stroke-opacity="0.7" stroke-width="1.0" />` +
                    `<rect class="fb-sprocket-l" width="6" height="10" rx="1.5" fill="#0b0805" stroke="${colorFlashback.border}" stroke-width="0.6" stroke-opacity="0.8" />` +
                    `<rect class="fb-sprocket-l" width="6" height="10" rx="1.5" fill="#0b0805" stroke="${colorFlashback.border}" stroke-width="0.6" stroke-opacity="0.8" />` +
                    `<rect class="fb-sprocket-l" width="6" height="10" rx="1.5" fill="#0b0805" stroke="${colorFlashback.border}" stroke-width="0.6" stroke-opacity="0.8" />` +
                    `<rect class="fb-sprocket-r" width="6" height="10" rx="1.5" fill="#0b0805" stroke="${colorFlashback.border}" stroke-width="0.6" stroke-opacity="0.8" />` +
                    `<rect class="fb-sprocket-r" width="6" height="10" rx="1.5" fill="#0b0805" stroke="${colorFlashback.border}" stroke-width="0.6" stroke-opacity="0.8" />` +
                    `<rect class="fb-sprocket-r" width="6" height="10" rx="1.5" fill="#0b0805" stroke="${colorFlashback.border}" stroke-width="0.6" stroke-opacity="0.8" />` +
                `</svg>`;
            };
 
            const devGlowId = `ds-device-glow-${i}-${id}`;
            const createDeviceSvgMarkup = () => {
                return `<svg class="ds-border-svg ds-device" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; overflow: visible; display: block; margin: 0; padding: 0;">` +
                    `<defs>` +
                        `<filter id="${devGlowId}" x="-30%" y="-30%" width="160%" height="160%">` +
                            `<feGaussianBlur stdDeviation="3.5" result="blur" />` +
                            `<feMerge>` +
                                `<feMergeNode in="blur" />` +
                                `<feMergeNode in="SourceGraphic" />` +
                            `</feMerge>` +
                        `</filter>` +
                    `</defs>` +
                    `<path class="path-outer" fill="${colorDevice.bg}" fill-opacity="${colorDevice.bgOpacity}" stroke="${colorDevice.border}" stroke-opacity="0.4" stroke-width="0.8" />` +
                    `<path class="path-middle" fill="none" stroke="${colorDevice.border}" stroke-opacity="0.9" stroke-width="2.2" filter="url(#${devGlowId})" />` +
                    `<path class="path-inner" fill="none" stroke="${colorDevice.border}" stroke-opacity="0.6" stroke-width="1.0" stroke-dasharray="6,3" />` +
                `</svg>`;
            };
 
            const createWhisperSvgMarkup = () => {
                return `<svg class="ds-border-svg ds-whisper" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; overflow: visible; filter: drop-shadow(0px 1px 3px rgba(0,0,0,0.15)); display: block; margin: 0; padding: 0;">` +
                    `<path class="path-outer" fill="${colorWhisper.bg}" fill-opacity="${colorWhisper.bgOpacity}" stroke="none" />` +
                    `<path class="path-middle" fill="none" stroke="${colorWhisper.border}" stroke-opacity="0.8" stroke-width="1.5" stroke-dasharray="5,4" />` +
                `</svg>`;
            };

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
                
                let html = "";
                if (s.isMusic) {
                    const musicBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 12px 36px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important; font-style: italic;`;
                    html = `<span class="ds-special music" style="${musicBoxStyle}">${createMusicSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span>`;
                } else if (s.isFlashback) {
                    const flashbackBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 20px 42px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.3 !important; font-style: italic !important;`;
                    html = `<span class="ds-special ds-flashback" style="${flashbackBoxStyle}">${createFlashbackSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.3 !important; box-sizing: border-box !important;">${s.text}</span></span>`;
                } else if (s.isDevice) {
                    const deviceBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 18px 30px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.25 !important;`;
                    html = `<span class="ds-special ds-device" style="${deviceBoxStyle}">${createDeviceSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.25 !important; box-sizing: border-box !important; font-weight: bold !important;">${s.text}</span></span>`;
                } else if (s.isWhisper) {
                    const whisperBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 14px 26px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important; font-style: italic !important; font-size: 0.9em !important;`;
                    html = `<span class="ds-special ds-whisper" style="${whisperBoxStyle}">${createWhisperSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span>`;
                } else if (s.isSignOrTitle) {
                    const specialBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 18px 28px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important;`;
                    html = `<span class="ds-special" style="${specialBoxStyle}">${createSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span>`;
                } else {
                    if (s.isItalic) {
                        html = `<div style="font-style: italic;">${s.text}</div>`;
                    } else {
                        html = `<div>${s.text}</div>`;
                    }
                }

                const innStyle = overlay.inner[i].style;
                const fontSz = innStyle.fontSize ? (typeof innStyle.fontSize === 'number' ? `${innStyle.fontSize}px` : innStyle.fontSize) : '40px';
                const posWrapperStyle = `position: absolute; left: ${left}; top: ${top}; transform: ${transform}; pointer-events: none; text-align: center; white-space: nowrap; font-size: ${fontSz}; color: ${innStyle.color || '#ffffff'}; font-weight: ${innStyle.fontWeight || 'normal'}; text-shadow: ${innStyle.textShadow || '0px 0px 10px #000'}; font-family: ${innStyle.fontFamily || 'sans-serif'};`;
                allPosMarkup += `<div style="${posWrapperStyle}">${html}</div>`;
            });
            
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


            let dialogueParts = [];
            if (activeSlotsDialogue[i].length > 0) {
                dialogueParts = activeSlotsDialogue[i].map(s => {
                    if (s) {
                        if (s.isItalic) {
                            return `<div style="font-style: italic;">${s.text}</div>`;
                        }
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
                        } else if (s.isFlashback) {
                            const flashbackBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 20px 42px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.3 !important; font-style: italic !important;`;
                            return `<div style="display: flex; justify-content: center; margin: 6px 0;"><span class="ds-special ds-flashback" style="${flashbackBoxStyle}">${createFlashbackSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.3 !important; box-sizing: border-box !important;">${s.text}</span></span></div>`;
                        } else if (s.isDevice) {
                            const deviceBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 18px 30px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.25 !important;`;
                            return `<div style="display: flex; justify-content: center; margin: 6px 0;"><span class="ds-special ds-device" style="${deviceBoxStyle}">${createDeviceSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.25 !important; box-sizing: border-box !important; font-weight: bold !important;">${s.text}</span></span></div>`;
                        } else if (s.isWhisper) {
                            const whisperBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 14px 26px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important; font-style: italic !important; font-size: 0.9em !important;`;
                            return `<div style="display: flex; justify-content: center; margin: 6px 0;"><span class="ds-special ds-whisper" style="${whisperBoxStyle}">${createWhisperSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span></div>`;
                        } else if (s.isSignOrTitle) {
                            const specialBoxStyle = `position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 18px 28px; z-index: 0; vertical-align: middle; background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; text-align: center; box-sizing: border-box; line-height: 1.2 !important;`;
                            return `<div style="display: flex; justify-content: center; margin: 6px 0;"><span class="ds-special" style="${specialBoxStyle}">${createSvgMarkup()}<span style="display: block !important; text-align: center !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; line-height: 1.2 !important; box-sizing: border-box !important;">${s.text}</span></span></div>`;
                        } else {
                            if (s.isItalic) {
                                return `<div style="font-style: italic;">${s.text}</div>`;
                            }
                            return `<div>${s.text}</div>`;
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

    if (posContainer.innerHTML !== allPosMarkup) {
        posContainer.innerHTML = allPosMarkup;
        updateSvgBorders(posContainer);
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
    posContainer.innerHTML = "";
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