// DOM Elements
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-audio-btn');
const kitSelector = document.getElementById('kit-selector');
const metroBtn = document.getElementById('metro-btn');
const bpmSlider = document.getElementById('bpm-slider');
const bpmDisplay = document.getElementById('bpm-display');
const recordBtn = document.getElementById('record-btn');
const playRecordBtn = document.getElementById('play-record-btn');
const clearRecordBtn = document.getElementById('clear-record-btn');
const keys = document.querySelectorAll('.key');

const visCanvas = document.getElementById('visualizer');
const visCtx = visCanvas.getContext('2d');
const partCanvas = document.getElementById('particles');
const partCtx = partCanvas.getContext('2d');

// Web Audio API State
let audioCtx;
let analyser;
let mainGain;
let audioBuffers = {}; // { '65': AudioBuffer }
const sounds = [
    { key: '65', name: 'clap' },
    { key: '83', name: 'hihat' },
    { key: '68', name: 'kick' },
    { key: '70', name: 'openhat' },
    { key: '71', name: 'boom' },
    { key: '72', name: 'ride' },
    { key: '74', name: 'snare' },
    { key: '75', name: 'tom' },
    { key: '76', name: 'tink' }
];

// Features State
let currentKit = 'acoustic';
let isRecording = false;
let recordedSequence = [];
let recordStartTime = 0;
let playbackTimeouts = [];

let metronomeOn = false;
let metronomeInterval = null;

// Initialize
function resizeCanvases() {
    visCanvas.width = window.innerWidth;
    visCanvas.height = window.innerHeight;
    partCanvas.width = window.innerWidth;
    partCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();

startBtn.addEventListener('click', async () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    mainGain = audioCtx.createGain();
    
    analyser.fftSize = 256;
    mainGain.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    // Load Sounds
    startBtn.textContent = "Loading Sounds...";
    startBtn.disabled = true;
    for (let s of sounds) {
        const response = await fetch(`sounds/${s.name}.wav`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioBuffers[s.key] = audioBuffer;
    }
    
    startOverlay.classList.add('hidden');
    drawVisualizer();
    animateParticles();
});

// Sound Playing Logic
function playSound(keyCode, isPlayback = false) {
    if (!audioCtx || !audioBuffers[keyCode]) return;
    
    const keyEl = document.querySelector(`.key[data-key="${keyCode}"]`);
    if (keyEl) {
        keyEl.classList.remove('playing');
        void keyEl.offsetWidth; // trigger reflow
        keyEl.classList.add('playing');
        spawnParticles(keyEl);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffers[keyCode];
    
    // Kit Routing & Effects
    if (currentKit === 'acoustic') {
        source.connect(mainGain);
    } else if (currentKit === 'electronic') {
        source.playbackRate.value = 0.6; // pitch down
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        source.connect(filter);
        filter.connect(mainGain);
    } else if (currentKit === 'lofi') {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        
        // Simple distortion
        const distortion = audioCtx.createWaveShaper();
        const curve = new Float32Array(400);
        for (let i = 0; i < 400; i++) {
            let x = i * 2 / 400 - 1;
            curve[i] = (Math.PI + 50) * x / (Math.PI + 50 * Math.abs(x));
        }
        distortion.curve = curve;
        distortion.oversample = '4x';
        
        source.connect(filter);
        filter.connect(distortion);
        distortion.connect(mainGain);
    }

    source.start(0);

    if (isRecording && !isPlayback) {
        recordedSequence.push({
            key: keyCode,
            time: audioCtx.currentTime - recordStartTime
        });
    }
}

// Input Handling
window.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Prevent holding down
    playSound(e.keyCode.toString());
});

keys.forEach(key => {
    key.addEventListener('transitionend', function(e) {
        if (e.propertyName !== 'transform') return;
        this.classList.remove('playing');
    });
    key.addEventListener('mousedown', function() {
        playSound(this.getAttribute('data-key'));
    });
});

kitSelector.addEventListener('change', (e) => {
    currentKit = e.target.value;
});

// Metronome Logic
metroBtn.addEventListener('click', () => {
    metronomeOn = !metronomeOn;
    if (metronomeOn) {
        metroBtn.textContent = "Metronome: ON";
        metroBtn.style.color = "var(--neon-pink)";
        startMetronome();
    } else {
        metroBtn.textContent = "Metronome: OFF";
        metroBtn.style.color = "white";
        clearInterval(metronomeInterval);
    }
});

bpmSlider.addEventListener('input', (e) => {
    bpmDisplay.textContent = `${e.target.value} BPM`;
    if (metronomeOn) {
        clearInterval(metronomeInterval);
        startMetronome();
    }
});

function startMetronome() {
    const msPerBeat = 60000 / parseInt(bpmSlider.value);
    metronomeInterval = setInterval(() => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.1);
    }, msPerBeat);
}

// Record & Playback Logic
recordBtn.addEventListener('click', () => {
    if (isRecording) {
        isRecording = false;
        recordBtn.textContent = "🔴 Record";
        recordBtn.classList.remove('recording');
        if (recordedSequence.length > 0) {
            playRecordBtn.disabled = false;
            clearRecordBtn.disabled = false;
        }
    } else {
        isRecording = true;
        recordedSequence = [];
        recordStartTime = audioCtx.currentTime;
        recordBtn.textContent = "⏹ Stop Rec";
        recordBtn.classList.add('recording');
        playRecordBtn.disabled = true;
        clearRecordBtn.disabled = true;
    }
});

playRecordBtn.addEventListener('click', () => {
    // Clear old timeouts if clicking play multiple times
    playbackTimeouts.forEach(clearTimeout);
    playbackTimeouts = [];
    
    recordedSequence.forEach(note => {
        const timeout = setTimeout(() => {
            playSound(note.key, true);
        }, note.time * 1000);
        playbackTimeouts.push(timeout);
    });
});

clearRecordBtn.addEventListener('click', () => {
    recordedSequence = [];
    playRecordBtn.disabled = true;
    clearRecordBtn.disabled = true;
});

// Audio Visualizer Logic
function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    visCtx.fillStyle = 'rgba(5, 1, 10, 0.2)'; // fade effect
    visCtx.fillRect(0, 0, visCanvas.width, visCanvas.height);

    const barWidth = (visCanvas.width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] * 2;
        
        // Neon color gradient based on frequency
        const r = barHeight + (25 * (i/bufferLength));
        const g = 50 * (i/bufferLength);
        const b = 255 - (50 * (i/bufferLength));

        visCtx.fillStyle = `rgb(${r},${g},${b})`;
        visCtx.fillRect(x, visCanvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }
}

// Particle System Logic
let particles = [];
function spawnParticles(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: centerX,
            y: centerY,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: Math.random() > 0.5 ? '#00f0ff' : '#ff00ff'
        });
    }
}

function animateParticles() {
    requestAnimationFrame(animateParticles);
    partCtx.clearRect(0, 0, partCanvas.width, partCanvas.height);
    
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }
        
        partCtx.beginPath();
        partCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        partCtx.fillStyle = p.color;
        partCtx.globalAlpha = p.life;
        partCtx.fill();
        partCtx.globalAlpha = 1.0;
    }
}
