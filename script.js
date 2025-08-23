// Global variables
let ws = null;
let username = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallTarget = null;
let isMuted = false;
let isSpeakerOff = false;
let isAudioMode = false;
let vantaEffect = null;

// DOM elements
const loginModal = document.getElementById('loginModal');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const loginError = document.getElementById('loginError');
const userList = document.getElementById('userList');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const endCallBtn = document.getElementById('endCallBtn');
const muteBtn = document.getElementById('muteBtn');
const speakerBtn = document.getElementById('speakerBtn');
const audioModeBtn = document.getElementById('audioModeBtn');
const videoModeBtn = document.getElementById('videoModeBtn');
const activeCount = document.getElementById('activeCount');
const visitorCount = document.getElementById('visitorCount');
const latencyEl = document.getElementById('latency');
const statusValue = document.getElementById('statusValue');

// WebSocket URL
const WS_URL = .env.ws;
// For production: const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

// Fetch ICE servers from /config
async function getIceServers() {
  try {
    const response = await fetch(.env.config, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const config = await response.json();
    return config.iceServers;
  } catch (err) {
    console.error('Error fetching ICE servers:', err);
    return [{ urls: 'stun:stun.l.google.com:19302' }]; // Fallback
  }
}

// Initialize WebSocket
function initWebSocket() {
  console.log('Initializing WebSocket with URL:', WS_URL);
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    console.log('WebSocket connected');
    statusValue.textContent = 'Connected';
  };
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    statusValue.textContent = 'Disconnected';
    loginError.textContent = 'Disconnected from server';
  };
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    loginError.textContent = 'Failed to connect to server';
  };
  ws.onmessage = handleMessage;
}

// Handle WebSocket messages
async function handleMessage(event) {
  try {
    const data = JSON.parse(event.data);
    console.log('Received WS message:', data);
    if (!data.type) {
      console.warn('Message missing type:', data);
      return;
    }
    switch (data.type) {
      case 'join_ok':
        username = data.username;
        console.log('Hiding login modal for user:', username);
        loginModal.classList.add('hidden');
        loginError.textContent = '';
        updateUserList(data.users);
        break;
      case 'join_error':
        loginError.textContent = data.reason;
        break;
      case 'user_list':
        updateUserList(data.users);
        break;
      case 'call_request':
        currentCallTarget = data.from;
        await startCall(false); // false indicates callee
        break;
      case 'call_reject':
        alert(`Call rejected by ${data.from}: ${data.reason}`);
        resetCall();
        break;
      case 'offer':
        await handleOffer(data);
        break;
      case 'answer':
        await handleAnswer(data);
        break;
      case 'ice':
        await handleIceCandidate(data.candidate);
        break;
      case 'end':
        resetCall();
        break;
      case 'pong':
        const rtt = Date.now() - data.ts;
        latencyEl.textContent = rtt;
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
  } catch (err) {
    console.error('Error handling WS message:', err, 'Raw message:', event.data);
  }
}

// Update user list
function updateUserList(users) {
  userList.innerHTML = '';
  users.forEach(user => {
    if (user === username) return; // Don't show self
    const li = document.createElement('li');
    li.className = 'user-item';
    li.innerHTML = `<span>${user}</span><span class="dot"></span>`;
    li.onclick = () => initiateCall(user);
    userList.appendChild(li);
  });
  activeCount.textContent = users.length;
}

// Initiate call
async function initiateCall(target) {
  if (target === username) {
    alert('Cannot call yourself');
    return;
  }
  currentCallTarget = target;
  ws.send(JSON.stringify({ type: 'call_request', from: username, to: target }));
  await startCall(true); // true indicates caller
}

// Start call (get media, setup peer)
async function startCall(isCaller) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    const iceServers = await getIceServers();
    peerConnection = new RTCPeerConnection({ iceServers });

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
      if (!remoteStream) remoteStream = new MediaStream();
      remoteStream.addTrack(event.track);
      remoteVideo.srcObject = remoteStream;
    };

    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: 'ice', from: username, to: currentCallTarget, candidate: event.candidate }));
      }
    };

    if (isCaller) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'offer', from: username, to: currentCallTarget, sdp: offer }));
    }

    statusValue.textContent = 'In Call';
  } catch (err) {
    console.error('Error starting call:', err);
    resetCall();
  }
}

// Handle incoming offer
async function handleOffer(data) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', from: username, to: data.from, sdp: answer }));
}

// Handle incoming answer
async function handleAnswer(data) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
}

// Handle ICE candidate
async function handleIceCandidate(candidate) {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
}

// Reset call
function resetCall() {
  if (peerConnection) peerConnection.close();
  peerConnection = null;
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  remoteStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  currentCallTarget = null;
  statusValue.textContent = 'Disconnected';
  if (isAudioMode) toggleAudioMode();
}

// Controls
endCallBtn.onclick = () => {
  if (currentCallTarget) {
    ws.send(JSON.stringify({ type: 'end', from: username, to: currentCallTarget }));
  }
  resetCall();
};

muteBtn.onclick = () => {
  isMuted = !isMuted;
  if (localStream) localStream.getAudioTracks()[0].enabled = !isMuted;
  muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
};

speakerBtn.onclick = () => {
  isSpeakerOff = !isSpeakerOff;
  remoteVideo.muted = isSpeakerOff;
  speakerBtn.textContent = isSpeakerOff ? 'Quiet' : 'Speaker';
};

audioModeBtn.onclick = toggleAudioMode;
videoModeBtn.onclick = toggleAudioMode;

function toggleAudioMode() {
  isAudioMode = !isAudioMode;
  document.body.classList.toggle('audio-mode', isAudioMode);
  if (isAudioMode) {
    vantaEffect = VANTA.WAVES({
      el: "#callArea",
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 400.00,
      minWidth: 400.00,
      scale: 1.00,
      scaleMobile: 1.00
    });
  } else if (vantaEffect) {
    vantaEffect.destroy();
    vantaEffect = null;
  }
}

// Stats and latency
async function updateStats() {
  try {
    const response = await fetch(.env.stats, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const stats = await response.json();
    activeCount.textContent = stats.activeCount;
    visitorCount.textContent = stats.visitorCount;
  } catch (err) {
    console.error('Error fetching stats:', err);
    activeCount.textContent = activeCount.textContent || '0';
    visitorCount.textContent = visitorCount.textContent || '0';
  }
}

// Ensure setInterval runs after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setInterval(updateStats, 5000);
  updateStats(); // Call immediately to avoid initial delay
});

function sendPing() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
  }
}
setInterval(sendPing, 5000);

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, joinBtn:', joinBtn || 'Not found');
  console.log('Join button event listener attached:', joinBtn || 'Not found');
  if (!joinBtn) {
    console.error('Error: joinBtn element not found');
    return;
  }
  joinBtn.onclick = () => {
    console.log('Join button clicked');
    const input = usernameInput.value.trim();
    if (input) {
      loginError.textContent = 'Connecting...';
      initWebSocket();
      ws.onopen = () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({ type: 'join', username: input }));
        loginError.textContent = '';
      };
    } else {
      loginError.textContent = 'Username required';
    }
  };
  loginModal.classList.remove('hidden');
  updateStats();

});



