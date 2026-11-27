const VOICE_KEY = "solace-spoken-voice";
const SPEAK_KEY = "solace-speak-replies";
const RATE_KEY = "solace-speak-rate";

export function plainSpeech(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speakEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SPEAK_KEY) !== "off";
}

export function rememberSpeak(on: boolean) {
  window.localStorage.setItem(SPEAK_KEY, on ? "on" : "off");
}

export function rememberedVoice() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(VOICE_KEY) ?? "";
}

export function rememberVoice(uri: string) {
  window.localStorage.setItem(VOICE_KEY, uri);
}

export function spokenRate() {
  if (typeof window === "undefined") return 1;
  const raw = Number(window.localStorage.getItem(RATE_KEY));
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1.4, Math.max(0.6, Math.round(raw * 20) / 20));
}

export function rememberRate(rate: number) {
  const next = Math.min(1.4, Math.max(0.6, Math.round(rate * 20) / 20));
  window.localStorage.setItem(RATE_KEY, String(next));
}

export function isElevenVoice(voice: { name?: string; voiceURI?: string; lang?: string }) {
  return `${voice.name ?? ""} ${voice.voiceURI ?? ""} ${voice.lang ?? ""}`.toLowerCase().includes("eleven");
}

export function deviceVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  return [...pool].sort((a, b) => Number(isElevenVoice(b)) - Number(isElevenVoice(a)) || a.name.localeCompare(b.name));
}

export function canSpeakAloud() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

export function voiceKey(voice: { name?: string; voiceURI?: string; lang?: string }) {
  const uri = voice.voiceURI?.trim();
  if (uri) return uri;
  return `${voice.name ?? ""}|${voice.lang ?? ""}`;
}

let speakTimer = 0;

export function speakAloud(text: string, onEnd?: () => void) {
  if (!canSpeakAloud()) return;
  const line = plainSpeech(text).slice(0, 3500);
  if (!line) return;
  const synth = window.speechSynthesis;
  const saved = rememberedVoice();
  const voices = deviceVoices();
  const voice = saved === "eleven" ? voices.find(isElevenVoice) : voices.find((item) => voiceKey(item) === saved);
  const uttered = new SpeechSynthesisUtterance(line);
  if (voice) {
    uttered.voice = voice;
    uttered.lang = (voice.lang || "en-US").replace(/_/g, "-");
  }
  uttered.rate = spokenRate();
  uttered.onend = () => onEnd?.();
  uttered.onerror = () => onEnd?.();
  window.clearTimeout(speakTimer);
  synth.cancel();
  speakTimer = window.setTimeout(() => {
    synth.speak(uttered);
    if (synth.paused) synth.resume();
  }, 120);
}

export function openVoiceDownload() {
  const android = /android/i.test(navigator.userAgent);
  if (!android) return false;
  window.location.href = "intent:#Intent;action=com.android.settings.TTS_SETTINGS;end";
  return true;
}
type Heard = { transcript: string };
type HeardResult = { isFinal: boolean; 0: Heard };
type HeardEvent = { resultIndex: number; results: ArrayLike<HeardResult> };

type Listener = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: HeardEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function canHear() {
  if (typeof window === "undefined") return false;
  const host = window as Window & { SpeechRecognition?: new () => Listener; webkitSpeechRecognition?: new () => Listener };
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}

export function hear(onText: (text: string, final: boolean) => void, onEnd: () => void) {
  const host = window as Window & { SpeechRecognition?: new () => Listener; webkitSpeechRecognition?: new () => Listener };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    let final = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const piece = event.results[index];
      text += piece?.[0]?.transcript ?? "";
      if (piece?.isFinal) final = true;
    }
    onText(text.trim(), final);
  };
  recognition.onerror = () => onEnd();
  recognition.onend = () => onEnd();
  try {
    recognition.start();
  } catch {
    return null;
  }
  return recognition;
}
