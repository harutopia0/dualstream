/**
 * DualStream - Audio Engine Module
 * High-performance, low-latency audio replacement and synchronization for HTML5 video.
 * Handles MKV/MKA, MP4/M4A, WebM, MP3, WAV, AAC, Opus, Ogg, FLAC.
 */

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// -------------------------------------------------------------------------
// 1. EBML / Matroska (MKV / MKA / WebM) Parser & Demuxer
// -------------------------------------------------------------------------
class MatroskaParser {
  static readVint(view, offset) {
    if (offset >= view.byteLength) return null;
    const firstByte = view.getUint8(offset);
    if (firstByte === 0) return null;
    
    let length = 1;
    let mask = 0x80;
    while (!(firstByte & mask) && length <= 8) {
      mask >>= 1;
      length++;
    }
    if (length > 8 || offset + length > view.byteLength) return null;

    let value = firstByte & (mask - 1);
    for (let i = 1; i < length; i++) {
      value = (value * 256) + view.getUint8(offset + i);
    }
    return { length, value };
  }

  static readElementId(view, offset) {
    if (offset >= view.byteLength) return null;
    const firstByte = view.getUint8(offset);
    if (firstByte === 0) return null;

    let length = 1;
    let mask = 0x80;
    while (!(firstByte & mask) && length <= 4) {
      mask >>= 1;
      length++;
    }
    if (length > 4 || offset + length > view.byteLength) return null;

    let id = 0;
    for (let i = 0; i < length; i++) {
      id = (id * 256) + view.getUint8(offset + i);
    }
    return { length, id };
  }

  static readString(view, offset, length) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
    return new TextDecoder("utf-8").decode(bytes).replace(/\0/g, "");
  }

  static readUint(view, offset, length) {
    let val = 0;
    for (let i = 0; i < length; i++) {
      val = (val * 256) + view.getUint8(offset + i);
    }
    return val;
  }

  static readFloat(view, offset, length) {
    if (length === 4) return view.getFloat32(offset);
    if (length === 8) return view.getFloat64(offset);
    return 0;
  }

  static async scanTracks(file) {
    const scanSize = Math.min(file.size, 8 * 1024 * 1024);
    const buffer = await file.slice(0, scanSize).arrayBuffer();
    const view = new DataView(buffer);
    const tracks = [];

    const ID_TRACKS = 0x1654AE6B;
    const ID_TRACK_ENTRY = 0xAE;
    const ID_TRACK_NUM = 0xD7;
    const ID_TRACK_UID = 0x73C5;
    const ID_TRACK_TYPE = 0x83;
    const ID_NAME = 0x536E;
    const ID_LANG = 0x22B59C;
    const ID_LANG_IETF = 0x22B59D;
    const ID_CODEC_ID = 0x86;
    const ID_AUDIO = 0xE1;
    const ID_SAMPLING_FREQ = 0xB5;
    const ID_CHANNELS = 0x9F;
    const ID_BIT_DEPTH = 0x6264;

    let offset = 0;
    while (offset < view.byteLength - 4) {
      const el = this.readElementId(view, offset);
      if (!el) { offset++; continue; }
      offset += el.length;

      const sizeVint = this.readVint(view, offset);
      if (!sizeVint) { offset++; continue; }
      offset += sizeVint.length;
      const size = sizeVint.value;

      if (el.id === ID_TRACKS) {
        let trackOffset = offset;
        const tracksEnd = Math.min(offset + size, view.byteLength);

        while (trackOffset < tracksEnd) {
          const entryEl = this.readElementId(view, trackOffset);
          if (!entryEl) break;
          trackOffset += entryEl.length;

          const entrySizeVint = this.readVint(view, trackOffset);
          if (!entrySizeVint) break;
          trackOffset += entrySizeVint.length;
          const entrySize = entrySizeVint.value;

          if (entryEl.id === ID_TRACK_ENTRY) {
            let cur = trackOffset;
            const curEnd = Math.min(trackOffset + entrySize, view.byteLength);

            let trackNum = tracks.length + 1;
            let trackUid = null;
            let trackType = 0;
            let name = "";
            let language = "und";
            let codecId = "";
            let sampleRate = 48000;
            let channels = 2;
            let bitDepth = 16;

            while (cur < curEnd) {
              const subEl = this.readElementId(view, cur);
              if (!subEl) break;
              cur += subEl.length;

              const subSizeV = this.readVint(view, cur);
              if (!subSizeV) break;
              cur += subSizeV.length;
              const subSize = subSizeV.value;

              if (subEl.id === ID_TRACK_NUM) {
                trackNum = this.readUint(view, cur, subSize);
              } else if (subEl.id === ID_TRACK_UID) {
                trackUid = this.readUint(view, cur, subSize);
              } else if (subEl.id === ID_TRACK_TYPE) {
                trackType = this.readUint(view, cur, subSize);
              } else if (subEl.id === ID_NAME) {
                name = this.readString(view, cur, subSize);
              } else if (subEl.id === ID_LANG || subEl.id === ID_LANG_IETF) {
                language = this.readString(view, cur, subSize);
              } else if (subEl.id === ID_CODEC_ID) {
                codecId = this.readString(view, cur, subSize);
              } else if (subEl.id === ID_AUDIO) {
                let aCur = cur;
                const aEnd = Math.min(cur + subSize, view.byteLength);
                while (aCur < aEnd) {
                  const aEl = this.readElementId(view, aCur);
                  if (!aEl) break;
                  aCur += aEl.length;
                  const aSzV = this.readVint(view, aCur);
                  if (!aSzV) break;
                  aCur += aSzV.length;
                  const aSz = aSzV.value;

                  if (aEl.id === ID_SAMPLING_FREQ) {
                    sampleRate = Math.round(this.readFloat(view, aCur, aSz));
                  } else if (aEl.id === ID_CHANNELS) {
                    channels = this.readUint(view, aCur, aSz);
                  } else if (aEl.id === ID_BIT_DEPTH) {
                    bitDepth = this.readUint(view, aCur, aSz);
                  }
                  aCur += aSz;
                }
              }
              cur += subSize;
            }

            if (trackType === 2) {
              const friendlyCodec = MatroskaParser.friendlyCodecName(codecId);
              tracks.push({
                index: tracks.length,
                trackNumber: trackNum,
                trackUid: trackUid || trackNum,
                name: name || `Audio Track ${tracks.length + 1}`,
                language: language.toUpperCase(),
                codec: friendlyCodec,
                rawCodec: codecId,
                channels: channels === 1 ? "Mono" : (channels === 2 ? "Stereo" : `${channels} ch`),
                channelCount: channels,
                sampleRate: `${(sampleRate / 1000).toFixed(1)} kHz`,
                sampleRateRaw: sampleRate
              });
            }
          }
          trackOffset += entrySize;
        }
        break;
      } else {
        offset += size;
      }
    }
    return tracks;
  }

  static friendlyCodecName(codecId) {
    if (!codecId) return "Audio";
    const c = codecId.toUpperCase();
    if (c.includes("AAC")) return "AAC";
    if (c.includes("OPUS")) return "Opus";
    if (c.includes("VORBIS")) return "Vorbis";
    if (c.includes("FLAC")) return "FLAC";
    if (c.includes("MPEG/L3")) return "MP3";
    if (c.includes("EAC3") || c.includes("E_AC3")) return "E-AC3";
    if (c.includes("AC3")) return "AC3";
    if (c.includes("DTS")) return "DTS";
    if (c.includes("TRUEHD")) return "TrueHD";
    if (c.includes("PCM")) return "PCM (Lossless)";
    return codecId.replace(/^A_/, "");
  }

  static async extractAudioBlob(file, trackInfo) {
    const isAac = trackInfo.rawCodec && trackInfo.rawCodec.toUpperCase().includes("AAC");
    const isMp3 = trackInfo.rawCodec && trackInfo.rawCodec.toUpperCase().includes("MPEG/L3");

    if (!isAac && !isMp3) {
      return null;
    }

    const freqTable = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    let freqIdx = freqTable.indexOf(trackInfo.sampleRateRaw);
    if (freqIdx === -1) freqIdx = 4;
    const chanCfg = trackInfo.channelCount || 2;
    const profile = 1;

    function createAdtsHeader(dataLength) {
      const packetLen = dataLength + 7;
      const header = new Uint8Array(7);
      header[0] = 0xFF;
      header[1] = 0xF1;
      header[2] = ((profile & 0x3) << 6) | ((freqIdx & 0xF) << 2) | ((chanCfg >> 2) & 0x1);
      header[3] = ((chanCfg & 0x3) << 6) | ((packetLen >> 11) & 0x3);
      header[4] = (packetLen >> 3) & 0xFF;
      header[5] = ((packetLen & 0x7) << 5) | 0x1F;
      header[6] = 0xFC;
      return header;
    }

    const chunks = [];
    const chunkSize = 16 * 1024 * 1024;
    const totalSize = file.size;
    let fileOffset = 0;
    const targetTrackNum = trackInfo.trackNumber;

    const ID_CLUSTER = 0x1F43B675;
    const ID_SIMPLE_BLOCK = 0xA3;
    const ID_BLOCK_GROUP = 0xA0;
    const ID_BLOCK = 0xA1;

    while (fileOffset < totalSize) {
      const readLen = Math.min(chunkSize + 65536, totalSize - fileOffset);
      const arrayBuffer = await file.slice(fileOffset, fileOffset + readLen).arrayBuffer();
      const view = new DataView(arrayBuffer);
      let offset = 0;

      while (offset < view.byteLength - 8) {
        const el = MatroskaParser.readElementId(view, offset);
        if (!el) { offset++; continue; }
        offset += el.length;

        const sizeVint = MatroskaParser.readVint(view, offset);
        if (!sizeVint) { offset++; continue; }
        offset += sizeVint.length;
        const size = sizeVint.value;

        if (el.id === ID_CLUSTER || el.id === ID_BLOCK_GROUP) {
          continue;
        } else if (el.id === ID_SIMPLE_BLOCK || el.id === ID_BLOCK) {
          if (offset + size > view.byteLength) {
            offset -= (el.length + sizeVint.length);
            break;
          }

          const trackNumVint = MatroskaParser.readVint(view, offset);
          if (trackNumVint && trackNumVint.value === targetTrackNum) {
            const headerSize = trackNumVint.length + 3;
            const frameOffset = offset + headerSize;
            const frameSize = size - headerSize;

            if (frameSize > 0) {
              const frameBytes = new Uint8Array(view.buffer, view.byteOffset + frameOffset, frameSize);
              if (isAac) {
                chunks.push(createAdtsHeader(frameSize));
                chunks.push(frameBytes);
              } else if (isMp3) {
                chunks.push(frameBytes);
              }
            }
          }
          offset += size;
        } else {
          offset += size;
        }
      }

      fileOffset += offset;
      if (offset === 0) {
        fileOffset += chunkSize;
      }
    }

    if (chunks.length > 0) {
      const mimeType = isAac ? "audio/aac" : "audio/mp3";
      return new Blob(chunks, { type: mimeType });
    }
    return null;
  }
}

// -------------------------------------------------------------------------
// 2. MP4 / M4A / MOV Parser
// -------------------------------------------------------------------------
class Mp4Parser {
  static async scanTracks(file) {
    const scanSize = Math.min(file.size, 8 * 1024 * 1024);
    const buffer = await file.slice(0, scanSize).arrayBuffer();
    const view = new DataView(buffer);
    const tracks = [];

    let offset = 0;
    while (offset < view.byteLength - 8) {
      const size = view.getUint32(offset);
      const type = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );

      const boxSize = size === 1 ? Number(view.getBigUint64(offset + 8)) : (size === 0 ? view.byteLength - offset : size);
      if (boxSize < 8) break;

      if (type === "moov") {
        let moovOffset = offset + 8;
        const moovEnd = offset + boxSize;

        while (moovOffset < moovEnd - 8) {
          const tSize = view.getUint32(moovOffset);
          const tType = String.fromCharCode(
            view.getUint8(moovOffset + 4),
            view.getUint8(moovOffset + 5),
            view.getUint8(moovOffset + 6),
            view.getUint8(moovOffset + 7)
          );
          if (tSize < 8) break;

          if (tType === "trak") {
            const trackInfo = this.parseTrak(view, moovOffset + 8, tSize - 8);
            if (trackInfo && trackInfo.isAudio) {
              tracks.push({
                index: tracks.length,
                trackNumber: trackInfo.trackId,
                name: trackInfo.name || `Audio Track ${tracks.length + 1}`,
                language: trackInfo.language.toUpperCase(),
                codec: trackInfo.codec,
                channels: trackInfo.channels === 1 ? "Mono" : (trackInfo.channels === 2 ? "Stereo" : `${trackInfo.channels} ch`),
                sampleRate: `${(trackInfo.sampleRate / 1000).toFixed(1)} kHz`
              });
            }
          }
          moovOffset += tSize;
        }
        break;
      }
      offset += boxSize;
    }
    return tracks;
  }

  static parseTrak(view, offset, size) {
    let cur = offset;
    const end = offset + size;
    let isAudio = false;
    let trackId = 1;
    let language = "und";
    let codec = "AAC";
    let channels = 2;
    let sampleRate = 44100;
    let name = "";

    while (cur < end - 8) {
      const bSize = view.getUint32(cur);
      const bType = String.fromCharCode(
        view.getUint8(cur + 4),
        view.getUint8(cur + 5),
        view.getUint8(cur + 6),
        view.getUint8(cur + 7)
      );
      if (bSize < 8) break;

      if (bType === "tkhd") {
        const version = view.getUint8(cur + 8);
        trackId = version === 1 ? view.getUint32(cur + 28) : view.getUint32(cur + 20);
      } else if (bType === "mdia") {
        let mCur = cur + 8;
        const mEnd = cur + bSize;
        while (mCur < mEnd - 8) {
          const mbSize = view.getUint32(mCur);
          const mbType = String.fromCharCode(
            view.getUint8(mCur + 4),
            view.getUint8(mCur + 5),
            view.getUint8(mCur + 6),
            view.getUint8(mCur + 7)
          );
          if (mbSize < 8) break;

          if (mbType === "mdhd") {
            const version = view.getUint8(mCur + 8);
            const langOffset = version === 1 ? mCur + 36 : mCur + 28;
            const langCode = view.getUint16(langOffset);
            const c1 = String.fromCharCode(((langCode >> 10) & 0x1F) + 0x60);
            const c2 = String.fromCharCode(((langCode >> 5) & 0x1F) + 0x60);
            const c3 = String.fromCharCode((langCode & 0x1F) + 0x60);
            if (c1 && c2 && c3) language = `${c1}${c2}${c3}`;
          } else if (mbType === "hdlr") {
            const hdlrType = String.fromCharCode(
              view.getUint8(mCur + 16),
              view.getUint8(mCur + 17),
              view.getUint8(mCur + 18),
              view.getUint8(mCur + 19)
            );
            if (hdlrType === "soun") isAudio = true;
          } else if (mbType === "minf") {
            let minfCur = mCur + 8;
            const minfEnd = mCur + mbSize;
            while (minfCur < minfEnd - 8) {
              const sSize = view.getUint32(minfCur);
              const sType = String.fromCharCode(
                view.getUint8(minfCur + 4),
                view.getUint8(minfCur + 5),
                view.getUint8(minfCur + 6),
                view.getUint8(minfCur + 7)
              );
              if (sSize < 8) break;

              if (sType === "stbl") {
                let stblCur = minfCur + 8;
                const stblEnd = minfCur + sSize;
                while (stblCur < stblEnd - 8) {
                  const sdSize = view.getUint32(stblCur);
                  const sdType = String.fromCharCode(
                    view.getUint8(stblCur + 4),
                    view.getUint8(stblCur + 5),
                    view.getUint8(stblCur + 6),
                    view.getUint8(stblCur + 7)
                  );
                  if (sdSize < 8) break;

                  if (sdType === "stsd") {
                    if (sdSize > 36) {
                      const entryType = String.fromCharCode(
                        view.getUint8(stblCur + 16),
                        view.getUint8(stblCur + 17),
                        view.getUint8(stblCur + 18),
                        view.getUint8(stblCur + 19)
                      );
                      codec = entryType.toUpperCase();
                      if (codec === "MP4A") codec = "AAC";
                      else if (codec === "AC-3") codec = "AC3";
                      else if (codec === "EC-3") codec = "E-AC3";

                      channels = view.getUint16(stblCur + 32);
                      sampleRate = view.getUint32(stblCur + 36) >> 16 || 44100;
                    }
                  }
                  stblCur += sdSize;
                }
              }
              minfCur += sSize;
            }
          }
          mCur += mbSize;
        }
      }
      cur += bSize;
    }

    return { isAudio, trackId, language, codec, channels, sampleRate, name };
  }
}

// -------------------------------------------------------------------------
// 3. Audio Engine Core Controller
// -------------------------------------------------------------------------
class DualStreamAudioEngine {
  constructor() {
    this.audioContext = null;
    this.gainNode = null;
    this.audioElement = null;
    this.mediaSourceNode = null;
    
    // Buffer mode properties for instant sample-accurate seeking
    this.bufferSourceNode = null;
    this.audioBuffer = null;
    this.bufferStartTime = 0;
    this.bufferStartOffset = 0;
    this.bufferPlaybackRate = 1.0;
    this.isBufferPlaying = false;

    this.file = null;
    this.fileUrl = null;
    this.tracks = [];
    this.selectedTrackIndex = 0;

    this.enabled = false;
    this.mode = "stream"; // Default to stream mode for minimal RAM & natural pitch across all speeds
    this.volume = 1.0;
    this.isMuted = false;
    this.delay = 0.0; // in seconds

    this.videoTarget = null;
    this.videoOriginalState = { muted: false, volume: 1.0, replaced: false };
    this.isSeeking = false;
    this.lastSeekRequestTime = 0;
    this.lastVideoTime = 0;
    this.lastSeekTime = 0;
  }

  ensureAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
  }

  async loadFile(file) {
    this.file = file;
    const ext = file.name.split('.').pop().toLowerCase();
    this.tracks = [];
    this.selectedTrackIndex = 0;

    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = null;
    }

    if (ext === "mkv" || ext === "mka" || ext === "webm") {
      try {
        this.tracks = await MatroskaParser.scanTracks(file);
      } catch (e) {
        console.warn("DualStream: Matroska scan fallback:", e);
      }
    } else if (ext === "mp4" || ext === "m4a" || ext === "mov") {
      try {
        this.tracks = await Mp4Parser.scanTracks(file);
      } catch (e) {
        console.warn("DualStream: MP4 scan fallback:", e);
      }
    }

    if (this.tracks.length === 0) {
      const codecName = ext.toUpperCase();
      this.tracks.push({
        index: 0,
        trackNumber: 1,
        name: file.name,
        language: "UND",
        codec: codecName,
        channels: "Stereo",
        sampleRate: "44.1 kHz"
      });
    }

    await this.setupPlaybackEngine();

    return {
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      format: ext.toUpperCase(),
      tracks: this.tracks,
      selectedTrack: this.selectedTrackIndex
    };
  }

  async selectTrack(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.selectedTrackIndex = index;
      await this.setupPlaybackEngine();
      if (this.enabled) {
        this.syncWithVideo(true);
      }
    }
  }

  async setupPlaybackEngine() {
    this.ensureAudioContext();

    if (this.bufferSourceNode) {
      try { this.bufferSourceNode.stop(); } catch (e) {}
      this.bufferSourceNode.disconnect();
      this.bufferSourceNode = null;
      this.isBufferPlaying = false;
    }

    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = null;
    }

    const selectedTrack = this.tracks[this.selectedTrackIndex];
    let playBlob = this.file;

    const ext = this.file ? this.file.name.split('.').pop().toLowerCase() : '';
    if ((ext === "mkv" || ext === "mka") && selectedTrack) {
      try {
        const demuxedBlob = await MatroskaParser.extractAudioBlob(this.file, selectedTrack);
        if (demuxedBlob) {
          playBlob = demuxedBlob;
        }
      } catch (e) {
        console.warn("DualStream: Demux fallback to direct file:", e);
      }
    }

    // Prepare buffer decoding in parallel (gives instant sample-accurate seek for skip buttons and arrow keys)
    if (playBlob) {
      try {
        const arrayBuffer = await playBlob.arrayBuffer();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      } catch (e) {
        console.warn("DualStream: Buffer decode error:", e);
      }
    }

    // Also prepare HTML5 Audio element for stream mode
    this.fileUrl = URL.createObjectURL(playBlob);
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
      this.audioElement.preservesPitch = true;
      this.mediaSourceNode = this.audioContext.createMediaElementSource(this.audioElement);
      this.mediaSourceNode.connect(this.gainNode);
    }

    const audio = this.audioElement;
    audio.src = this.fileUrl;

    const onMetadataReady = () => {
      if (this.enabled && this.videoTarget) {
        this.syncWithVideo(true);
      }
    };

    audio.addEventListener("loadedmetadata", onMetadataReady, { once: true });
    audio.addEventListener("canplay", onMetadataReady, { once: true });
    audio.load();

    if (this.enabled && this.videoTarget) {
      this.syncWithVideo(true);
    }
  }

  setMode(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.pause();
      this.syncWithVideo(true);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1.5, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
    }
  }

  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
    }
  }

  setDelay(delaySeconds) {
    this.delay = delaySeconds;
    if (this.enabled) {
      this.syncWithVideo(true);
    }
  }

  enable(videoElement) {
    this.enabled = true;
    this.attachVideo(videoElement);
    this.ensureAudioContext();
    if (this.videoTarget) {
      this.muteOriginalVideo();
      this.syncWithVideo(true);
    }
  }

  disable() {
    this.enabled = false;
    this.pause();
    this.restoreOriginalVideo();
  }

  attachVideo(video) {
    if (this.videoTarget === video) return;
    if (this.videoTarget && this.videoOriginalState.replaced) {
      this.restoreOriginalVideo();
    }

    this.videoTarget = video;
    if (video && this.enabled) {
      this.muteOriginalVideo();
      this.hookVideoEvents();
    }
  }

  muteOriginalVideo() {
    if (!this.videoTarget) return;
    if (!this.videoOriginalState.replaced) {
      this.videoOriginalState.muted = this.videoTarget.muted;
      this.videoOriginalState.volume = this.videoTarget.volume;
      this.videoOriginalState.replaced = true;
    }
    this.videoTarget.muted = true;
  }

  restoreOriginalVideo() {
    if (!this.videoTarget || !this.videoOriginalState.replaced) return;
    this.videoTarget.muted = this.videoOriginalState.muted;
    this.videoTarget.volume = this.videoOriginalState.volume;
    this.videoOriginalState.replaced = false;
  }

  hookVideoEvents() {
    if (!this.videoTarget || this.videoTarget._dualSubAudioHooked) return;
    this.videoTarget._dualSubAudioHooked = true;

    const v = this.videoTarget;
    this.lastVideoTime = v.currentTime;
    this.lastCheckedVideoTime = -1;
    this.lastVideoProgressTime = performance.now();

    v.addEventListener("play", () => {
      if (this.enabled) {
        this.isWaiting = false;
        this.ensureAudioContext();
        this.muteOriginalVideo();
        if (v.readyState >= 3 && !v.seeking) {
          this.syncWithVideo(false);
        }
      }
    });

    v.addEventListener("pause", () => {
      if (this.enabled) this.pause();
    });

    v.addEventListener("seeking", () => {
      if (this.enabled) {
        this.isSeeking = true;
        this.pause();
      }
    });

    v.addEventListener("seeked", () => {
      if (this.enabled) {
        this.isSeeking = false;
        if (!v.paused && v.readyState >= 3) {
          this.isWaiting = false;
          this.syncWithVideo(true);
        } else {
          this.pause();
        }
      }
    });

    v.addEventListener("timeupdate", () => {
      if (this.enabled) {
        const delta = Math.abs(v.currentTime - this.lastVideoTime);
        if (delta > 0.4) {
          this.lastSeekRequestTime = performance.now();
          if (!v.paused && v.readyState >= 3 && !v.seeking) {
            this.syncWithVideo(true);
          }
        }
        this.lastVideoTime = v.currentTime;
      }
    });

    v.addEventListener("ratechange", () => {
      if (this.enabled) {
        if (this.mode === "stream" && this.audioElement) {
          this.audioElement.playbackRate = v.playbackRate;
        } else if (this.mode === "buffer" && this.bufferSourceNode) {
          this.bufferPlaybackRate = v.playbackRate;
          this.bufferSourceNode.playbackRate.value = v.playbackRate;
        }
      }
    });

    v.addEventListener("waiting", () => {
      if (this.enabled) {
        this.isWaiting = true;
        this.pause();
      }
    });

    v.addEventListener("stalled", () => {
      if (this.enabled) {
        this.isWaiting = true;
        this.pause();
      }
    });

    v.addEventListener("playing", () => {
      if (this.enabled) {
        this.isWaiting = false;
        this.isSeeking = false;
        this.muteOriginalVideo();
        this.syncWithVideo(false);
      }
    });

    v.addEventListener("canplay", () => {
      if (this.enabled && !v.paused && !v.seeking) {
        this.isWaiting = false;
        this.syncWithVideo(false);
      }
    });

    v.addEventListener("ended", () => {
      if (this.enabled) this.pause();
    });
  }

  playBuffer(offset) {
    if (!this.audioBuffer || !this.audioContext || !this.videoTarget) return;
    this.ensureAudioContext();

    const now = performance.now();
    // Debounce micro-restarts within 100ms if offset is virtually identical
    if (this.isBufferPlaying && now - this.lastSeekTime < 100 && Math.abs(offset - this.bufferStartOffset) < 0.05) {
      return;
    }

    if (this.bufferSourceNode) {
      try { this.bufferSourceNode.stop(0); } catch (e) {}
      try { this.bufferSourceNode.disconnect(); } catch (e) {}
      this.bufferSourceNode = null;
      this.isBufferPlaying = false;
    }

    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }

    if (offset < this.audioBuffer.duration) {
      this.bufferSourceNode = this.audioContext.createBufferSource();
      this.bufferSourceNode.buffer = this.audioBuffer;
      this.bufferSourceNode.playbackRate.value = this.videoTarget.playbackRate;
      this.bufferSourceNode.connect(this.gainNode);
      this.bufferStartTime = this.audioContext.currentTime;
      this.bufferStartOffset = Math.max(0, offset);
      this.bufferPlaybackRate = this.videoTarget.playbackRate;
      this.bufferSourceNode.start(0, this.bufferStartOffset);
      this.isBufferPlaying = true;
      this.lastSeekTime = now;
    }
  }

  getBufferCurrentTime() {
    if (!this.isBufferPlaying || !this.audioContext || !this.videoTarget) return this.bufferStartOffset;
    const elapsed = (this.audioContext.currentTime - this.bufferStartTime) * this.videoTarget.playbackRate;
    return this.bufferStartOffset + elapsed;
  }

  play() {
    if (!this.enabled || !this.videoTarget) return;
    this.ensureAudioContext();

    const targetAudioTime = Math.max(0, this.videoTarget.currentTime - this.delay);
    if (this.mode === "buffer" && this.audioBuffer) {
      this.playBuffer(targetAudioTime);
    } else if (this.mode === "stream" && this.audioElement) {
      if (this.audioElement.paused) {
        this.audioElement.play().catch(() => {});
      }
    }
  }

  pause() {
    if (this.mode === "stream" && this.audioElement) {
      if (!this.audioElement.paused) {
        this.audioElement.pause();
      }
    }
    if (this.bufferSourceNode) {
      try { this.bufferSourceNode.stop(0); } catch (e) {}
      try { this.bufferSourceNode.disconnect(); } catch (e) {}
      this.bufferSourceNode = null;
      this.isBufferPlaying = false;
    }
  }

  /**
   * Continuous Sync & Instant Seek Loop
   * Called on every frame from requestAnimationFrame and on video events
   */
  syncWithVideo(forceHardSeek = false) {
    if (!this.enabled || !this.videoTarget || (!this.fileUrl && !this.audioBuffer)) return;

    const v = this.videoTarget;

    // Check if web video is paused, ended, seeking, stalled, or buffering/waiting (readyState < 3)
    if (v.paused || v.ended || v.seeking || v.readyState < 3 || this.isWaiting || this.isSeeking) {
      this.pause();
      return;
    }

    const now = performance.now();

    // Check if video is stalled (currentTime unchanged while playing)
    if (v.currentTime === this.lastCheckedVideoTime) {
      if (now - this.lastVideoProgressTime > 150) {
        // Video is buffering / frozen on screen -> Pause audio immediately
        this.pause();
        return;
      }
    } else {
      this.lastCheckedVideoTime = v.currentTime;
      this.lastVideoProgressTime = now;
    }

    const targetAudioTime = Math.max(0, v.currentTime - this.delay);

    // 1. Buffer Mode (Instantaneous, 100% constant playbackRate, zero pitch shift, zero double-play)
    if (this.mode === "buffer" && this.audioBuffer) {
      if (this.audioElement && !this.audioElement.paused) {
        this.audioElement.pause();
      }

      if (!this.isBufferPlaying) {
        // Clean single startup on unpause/resume
        this.playBuffer(targetAudioTime);
        return;
      }

      // Always maintain exact video playback rate (100% constant - no speed/pitch modifications)
      if (this.bufferSourceNode && this.bufferSourceNode.playbackRate.value !== v.playbackRate) {
        this.bufferSourceNode.playbackRate.value = v.playbackRate;
      }

      const currentAudioTime = this.getBufferCurrentTime();
      const drift = currentAudioTime - targetAudioTime;
      const timeSinceSeek = now - this.lastSeekTime;

      // During the initial 500ms window after resume/seek, never restart unless user made a real seek (> 0.5s)
      if (timeSinceSeek < 500) {
        if (forceHardSeek || Math.abs(drift) > 0.5) {
          this.playBuffer(targetAudioTime);
        }
        return;
      }

      // Steady playback:
      // If natural DAC clock drift accumulates beyond 0.15s (150ms) over minutes, snap sample-accurately in 0ms
      if (forceHardSeek || Math.abs(drift) > 0.15) {
        this.playBuffer(targetAudioTime);
      }
      return;
    }

    // 2. Stream Mode (HTML5 Audio tag, 100% constant playbackRate, zero pitch shift)
    if (this.mode === "stream" && this.audioElement) {
      const audio = this.audioElement;
      if (audio.readyState < 1) return;

      const audioTime = audio.currentTime;
      const drift = audioTime - targetAudioTime;

      // Always maintain exact video playback rate (100% constant - no micro rate adjustments)
      if (audio.playbackRate !== v.playbackRate) {
        audio.playbackRate = v.playbackRate;
      }

      if (audio.paused && !v.paused) {
        audio.play().catch(() => {});
      }

      if (audio.seeking) return;

      // Steady playback:
      // If natural clock drift accumulates beyond 0.15s (150ms) over minutes, snap cleanly
      if (forceHardSeek || Math.abs(drift) > 0.15) {
        audio.currentTime = targetAudioTime;
        this.lastSeekRequestTime = now;
      }
    }
  }

  cleanup() {
    this.disable();
    if (this.fileUrl) {
      URL.revokeObjectURL(this.fileUrl);
      this.fileUrl = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

// Export singleton
if (typeof window !== "undefined") {
  window.DualStreamAudioEngine = DualStreamAudioEngine;
}
