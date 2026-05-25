let recognition = null;
let isListening = false;
let onResultCallback = null;
let onErrorCallback = null;
let onStateChangeCallback = null;

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;

  recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    if (onResultCallback) onResultCallback(final || interim, !!final);
  };

  recognition.onend = () => {
    isListening = false;
    if (onStateChangeCallback) onStateChangeCallback(false);
  };

  recognition.onerror = (event) => {
    isListening = false;
    if (onStateChangeCallback) onStateChangeCallback(false);
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      if (onErrorCallback) onErrorCallback(event.error);
    }
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
  if (recognition && isListening) {
    recognition.stop();
    isListening = false;
  }
}

function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
