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
let notificationTimeout = null;

// DOM elements
const loginModal = document.getElementById('loginModal');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const loginError = document.getElementById('loginError');
const userList = document.getElementById('userList');
const userSearch = document.getElementById('userSearch');
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
const callTitle = document.getElementById('callTitle');
const callSubtitle = document.getElementById('callSubtitle');
const localUsername = document.getElementById('localUsername');
const remoteUsername = document.getElementById('remoteUsername');
const localBitrate = document.getElementById('localBitrate');
const remoteBitrate = document.getElementById('remoteBitrate');
const wsStatus = document.getElementById('wsStatus');
const mediaStatus = document.getElementById('mediaStatus');
const peerStatus = document.getElementById('peerStatus');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const recordBtn = document.getElementById('recordBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const loadingSpinner = document.getElementById('loadingSpinner');

// WebSocket URL
// const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
const WS_URL = 'wss://PR1NC3-Discussion.hf.space/ws'; 

// ===== NOTIFICATION SYSTEM =====
function showNotification(message, type = 'info', duration = 5000) {
  const notificationContainer = document.getElementById('notificationContainer');

  // Clear existing notifications
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
  notificationContainer.innerHTML = '';

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  notificationContainer.appendChild(notification);

  // Auto-remove notification
  notificationTimeout = setTimeout(() => {
    notification.remove();
  }, duration);

  return notification;
}

// ===== LOADING SPINNER =====
function showLoading() {
  if (loadingSpinner) {
    loadingSpinner.classList.remove('hidden');
  }
}

function hideLoading() {
  if (loadingSpinner) {
    loadingSpinner.classList.add('hidden');
  }
}

// ===== SEARCH FUNCTIONALITY =====
function filterUsers(searchTerm) {
  const userItems = userList.querySelectorAll('.user-item');
  userItems.forEach(item => {
    const username = item.querySelector('span').textContent.toLowerCase();
    if (username.includes(searchTerm.toLowerCase())) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

if (userSearch) {
  userSearch.addEventListener('input', (e) => {
    filterUsers(e.target.value);
  });
}

// ===== STATUS UPDATES =====
function updateStatus(type, status, message) {
  switch (type) {
    case 'websocket':
      wsStatus.textContent = status;
      wsStatus.style.color = status === 'Connected' ? 'var(--success)' : 'var(--danger)';
      break;
    case 'media':
      mediaStatus.textContent = status;
      mediaStatus.style.color = status === 'Active' ? 'var(--success)' : 'var(--warning)';
      break;
    case 'peer':
      peerStatus.textContent = status;
      peerStatus.style.color = status === 'Connected' ? 'var(--success)' : 'var(--danger)';
      break;
    case 'call':
      statusValue.textContent = message;
      break;
  }
}

// ===== QUICK ACTIONS =====
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      showNotification('Entered fullscreen mode', 'success');
    } else {
      document.exitFullscreen();
      showNotification('Exited fullscreen mode', 'info');
    }
  });
}

if (recordBtn) {
  recordBtn.addEventListener('click', () => {
    showNotification('Recording feature coming soon!', 'info');
  });
}

if (screenshotBtn) {
  screenshotBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (remoteVideo.srcObject && remoteVideo.videoWidth > 0) {
      canvas.width = remoteVideo.videoWidth;
      canvas.height = remoteVideo.videoHeight;
      context.drawImage(remoteVideo, 0, 0);

      const link = document.createElement('a');
      link.download = `screenshot-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();

      showNotification('Screenshot saved!', 'success');
    } else {
      showNotification('No video to capture', 'warning');
    }
  });
}

// Fetch ICE servers from /config
async function getIceServers() {
  try {
    const response = await fetch('https://PR1NC3-Discussion.hf.space/config' , { mode: 'cors' });
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
function initWebSocket(usernameToJoin) {
  console.log('Initializing WebSocket with URL:', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('WebSocket connected');
    updateStatus('websocket', 'Connected');
    updateStatus('call', 'Ready to Launch');
    showNotification('Connected to server', 'success');
    ws.send(JSON.stringify({ type: 'join', username: usernameToJoin }));
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    hideLoading();
    updateStatus('websocket', 'Disconnected');
    updateStatus('call', 'Connection Lost');
    loginError.textContent = 'Disconnected from server';
    showNotification('Disconnected from server', 'error');
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    hideLoading();
    updateStatus('websocket', 'Error');
    loginError.textContent = 'Failed to connect to server';
    showNotification('Connection failed', 'error');
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
        localUsername.textContent = username;
        showNotification(`Welcome, ${username}!`, 'success');
        break;

      case 'join_error':
        loginError.textContent = data.reason;
        showNotification(data.reason, 'error');
        break;

      case 'user_list':
        updateUserList(data.users);
        break;

      case 'call_request':
        currentCallTarget = data.from;
        showNotification(`Incoming call from ${data.from}`, 'info');
        await startCall(false); // false indicates callee
        break;

      case 'call_reject':
        showNotification(`Call rejected by ${data.from}: ${data.reason}`, 'warning');
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
        showNotification('Call ended', 'info');
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
    li.innerHTML = `
      <span>${user}</span>
      <span class="dot"></span>
    `;
    li.onclick = () => initiateCall(user);
    userList.appendChild(li);
  });

  const activeCountElements = document.querySelectorAll('.active-count');
  activeCountElements.forEach(el => {
    el.textContent = users.length;
  });
}

// Initiate call
async function initiateCall(target) {
  if (target === username) {
    showNotification('Cannot call yourself', 'warning');
    return;
  }

  currentCallTarget = target;
  showNotification(`Calling ${target}...`, 'info');
  ws.send(JSON.stringify({ type: 'call_request', from: username, to: target }));
  await startCall(true); // true indicates caller
}

// Start call (get media, setup peer)
async function startCall(isCaller) {
  try {
    showLoading();
    updateStatus('media', 'Initializing...');

    const mediaConstraints = {
      video: !isAudioMode,
      audio: true
    };
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    localVideo.srcObject = localStream;

    console.log(localStream);
    
    updateStatus('media', 'Active');

    const iceServers = await getIceServers();
    peerConnection = new RTCPeerConnection({ iceServers });
    updateStatus('peer', 'Connecting...');

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
      if (!remoteStream) remoteStream = new MediaStream();
      remoteStream.addTrack(event.track);
      remoteVideo.srcObject = remoteStream;
      updateStatus('peer', 'Connected');
      hideLoading();
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

    updateStatus('call', 'In Call');
    callTitle.textContent = `Call with ${currentCallTarget}`;
    callSubtitle.textContent = 'Connection established';
    remoteUsername.textContent = currentCallTarget;

    showNotification(`Call started with ${currentCallTarget}`, 'success');

  } catch (err) {
    console.error('Error starting call:', err);
    hideLoading();
    showNotification('Failed to start call', 'error');
    resetCall();
  }
}

// Handle incoming offer
async function handleOffer(data) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', from: username, to: data.from, sdp: answer }));
  } catch (err) {
    console.error('Error handling offer:', err);
    showNotification('Failed to accept call', 'error');
  }
}

// Handle incoming answer
async function handleAnswer(data) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } catch (err) {
    console.error('Error handling answer:', err);
  }
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

  updateStatus('call', 'Ready to Launch');
  updateStatus('media', 'Inactive');
  updateStatus('peer', 'Disconnected');

  callTitle.textContent = 'NeoCall Hub';
  callSubtitle.textContent = 'Select a user to begin your journey';
  remoteUsername.textContent = 'Remote User';

  if (isAudioMode) toggleAudioMode();
}

// Controls
if (endCallBtn) endCallBtn.onclick = () => {
  if (currentCallTarget) {
    ws.send(JSON.stringify({ type: 'end', from: username, to: currentCallTarget }));
  }
  resetCall();
  showNotification('Call ended', 'info');
};

if (muteBtn) muteBtn.onclick = () => {
  isMuted = !isMuted;
  if (localStream && localStream.getAudioTracks().length > 0) localStream.getAudioTracks()[0].enabled = !isMuted;

  const icon = muteBtn.querySelector('i');
  if (isMuted) {
    icon.className = 'fas fa-microphone-slash';
    showNotification('Microphone muted', 'info');
  } else {
    icon.className = 'fas fa-microphone';
    showNotification('Microphone unmuted', 'info');
  }
};

if (speakerBtn) speakerBtn.onclick = () => {
  isSpeakerOff = !isSpeakerOff;
  if (remoteVideo) remoteVideo.muted = isSpeakerOff;

  const icon = speakerBtn.querySelector('i');
  if (isSpeakerOff) {
    icon.className = 'fas fa-volume-mute';
    showNotification('Speaker off', 'info');
  } else {
    icon.className = 'fas fa-volume-up';
    showNotification('Speaker on', 'info');
  }
};

if (audioModeBtn) audioModeBtn.onclick = toggleAudioMode;
if (videoModeBtn) videoModeBtn.onclick = toggleAudioMode;

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
    showNotification('Switched to audio mode', 'info');
  } else if (vantaEffect) {
    vantaEffect.destroy();
    vantaEffect = null;
    showNotification('Switched to video mode', 'info');
  }
}

// Stats and latency
async function updateStats() {
  try {
    const response = await fetch('https://PR1NC3-Discussion.hf.space/stats', { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const stats = await response.json();

    const activeCountElements = document.querySelectorAll('.active-count');
    activeCountElements.forEach(el => {
      el.textContent = stats.activeCount;
    });

    if (visitorCount) visitorCount.textContent = stats.visitorCount;
  } catch (err) {
    console.error('Error fetching stats:', err);
    const activeCountElements = document.querySelectorAll('.active-count');
    activeCountElements.forEach(el => {
      el.textContent = el.textContent || '0';
    });
    if (visitorCount) visitorCount.textContent = visitorCount.textContent || '0';
  }
}

setInterval(updateStats, 5000);

function sendPing() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
  }
}
setInterval(sendPing, 5000);

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, joinBtn:', joinBtn || 'Not found');

  if (!joinBtn) {
    console.error('Error: joinBtn element not found');
    return;
  }

  joinBtn.onclick = () => {
    console.log('Join button clicked');
    const input = usernameInput.value.trim();

    if (input) {
      loginError.textContent = 'Connecting...';
      initWebSocket(input);
    } else {
      loginError.textContent = 'Username required';
      showNotification('Please enter a username', 'warning');
    }
  };

  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinBtn.click();
    }
  });

  loginModal.classList.remove('hidden');
  updateStats();

  updateStatus('websocket', 'Disconnected');
  updateStatus('media', 'Inactive');
  updateStatus('peer', 'Disconnected');

  showNotification('Welcome to NeoCall!', 'info');
});