let recognition = null;
let isListening = false;
let onResultCallback = null;
let onErrorCallback = null;
let onStateChangeCallback = null;
let lastFinalTranscript = '';

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;

  recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    transcript = transcript.trim();
    if (transcript) {
      lastFinalTranscript = transcript;
      if (onResultCallback) onResultCallback(transcript, event.results[0].isFinal);
    }
  };

  recognition.onend = () => {
    isListening = false;
    if (onStateChangeCallback) onStateChangeCallback(false);
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    isListening = false;
    if (onStateChangeCallback) onStateChangeCallback(false);
    if (onErrorCallback) onErrorCallback(event.error);
  };

  return true;
}

function startListening(onResult, onError, onStateChange) {
  if (!recognition) {
    if (!initSpeech()) {
      if (onError) onError('Tu navegador no soporta reconocimiento de voz. Usa Chrome.');
      return false;
    }
  }
  onResultCallback = onResult;
  onErrorCallback = onError;
  onStateChangeCallback = onStateChange;
  lastFinalTranscript = '';

  try {
    recognition.start();
    isListening = true;
    if (onStateChangeCallback) onStateChangeCallback(true);
    return true;
  } catch (e) {
    if (e.message && e.message.includes('already started')) {
      recognition.stop();
      setTimeout(() => startListening(onResult, onError, onStateChange), 300);
    }
    return false;
  }
}

function stopListening() {
  if (recognition) {
    isListening = false;
    recognition.stop();
  }
}

function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
