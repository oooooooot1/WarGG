// تهيئة Gun للدردشة
const gun = Gun({
  peers: ['https://gun-manhattan.herokuapp.com/gun']
});
const chat = gun.get('globalChat');

// PeerJS للإتصال الصوتي
let peer = new Peer(undefined, {
  host: 'peerjs.com',
  secure: true,
  port: 443
});
let localStream;
let currentCall;
let callStartTime;
let timerInterval;

const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileBtn = document.getElementById('fileBtn');
const fileInput = document.getElementById('fileInput');
const recordBtn = document.getElementById('recordBtn');
const callBtn = document.getElementById('callBtn');
const remoteAudio = document.getElementById('remoteAudio');

const myPeerIdEl = document.getElementById('myPeerId');
const peerIdInput = document.getElementById('peerIdInput');
const startCallBtn = document.getElementById('startCallBtn');
const statusEl = document.getElementById('status');
const callTimerEl = document.getElementById('callTimer');
const callQualityEl = document.getElementById('callQuality');
const muteBtn = document.getElementById('muteBtn');
const hangupBtn = document.getElementById('hangupBtn');
const participantsList = document.getElementById('participants');

const loadHistoryBtn = document.getElementById('loadHistoryBtn');
let historyLoaded = false;

// عرض معرفك عند الاتصال بـ PeerJS
peer.on('open', id => {
  myPeerIdEl.textContent = id;
  updateStatus('جاهز للمكالمات');
});

// إضافة رسالة إلى الدردشة
function addMessage(data) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  const time = new Date(data.timestamp).toLocaleTimeString('ar-EG');
  switch(data.type) {
    case 'text':
      messageEl.textContent = data.text;
      break;
    case 'image':
      const img = document.createElement('img');
      img.src = data.dataURL;
      messageEl.appendChild(img);
      break;
    case 'audio':
      const aud = document.createElement('audio');
      aud.src = data.dataURL;
      aud.controls = true;
      messageEl.appendChild(aud);
      break;
    case 'video':
      const vid = document.createElement('video');
      vid.src = data.dataURL;
      vid.controls = true;
      messageEl.appendChild(vid);
      break;
    case 'file':
      const link = document.createElement('a');
      link.href = data.dataURL;
      link.download = data.name;
      link.textContent = data.name;
      messageEl.appendChild(link);
      break;
  }
  const timeEl = document.createElement('div');
  timeEl.classList.add('time');
  timeEl.textContent = time;
  messageEl.appendChild(timeEl);
  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// الاستماع للدردشة (يتفعل بعد الضغط على زر التحميل)
function loadHistory() {
  if (historyLoaded) return;
  chat.map().on(data => {
    if (data) addMessage(data);
  });
  historyLoaded = true;
}

// إرسال نص
sendBtn.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (!text) return;
  chat.set({ type: 'text', text, timestamp: Date.now() });
  messageInput.value = '';
});

// إرسال بالضغط على Enter
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn.click();
});

// إرسال ملف
fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let type = 'file';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    chat.set({ type, name: file.name, dataURL: reader.result, timestamp: Date.now() });
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
});

// تسجيل صوت
recordBtn.addEventListener('click', async () => {
  if (recordBtn.classList.contains('recording')) {
    // إيقاف التسجيل
    mediaRecorder.stop();
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      recordedChunks = [];
      mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          chat.set({ type: 'audio', dataURL: reader.result, timestamp: Date.now() });
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      recordBtn.classList.add('recording');
      recordBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    } catch (err) {
      console.error('تعذر الوصول إلى الميكروفون:', err);
    }
  }
});

// زر تحميل المحادثات القديمة
loadHistoryBtn.addEventListener('click', loadHistory);

// تحديث حالة الاتصال
function updateStatus(text) {
  statusEl.textContent = text;
}

// بدء عداد المكالمة
function startCallTimer() {
  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const diff = Date.now() - callStartTime;
    const minutes = String(Math.floor(diff / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    callTimerEl.textContent = `مدة المكالمة: ${minutes}:${seconds}`;
  }, 1000);
}

// تحديث جودة المكالمة
function updateCallQuality() {
  if (currentCall && currentCall.peerConnection) {
    currentCall.peerConnection.getStats(null).then(stats => {
      let quality = 'عادية';
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.selected) {
          if (report.availableOutgoingBitrate > 50000) quality = 'جيدة';
          else quality = 'متوسطة';
        }
      });
      callQualityEl.textContent = `جودة: ${quality}`;
    });
  }
}

// بدء أو قبول المكالمة
startCallBtn.addEventListener('click', async () => {
  const remotePeerId = peerIdInput.value.trim();
  if (!remotePeerId) return;
  updateStatus('جارٍ الاتصال...');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentCall = peer.call(remotePeerId, localStream);
    setupCallHandlers(currentCall);
  } catch (err) {
    console.error('خطأ في بدء المكالمة:', err);
    updateStatus('خطأ في المكالمة');
  }
});

// استقبال المكالمة
peer.on('call', async call => {
  updateStatus('استقبال مكالمة...');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    call.answer(localStream);
    currentCall = call;
    setupCallHandlers(call);
  } catch (err) {
    console.error('خطأ في قبول المكالمة:', err);
    updateStatus('خطأ في قبول المكالمة');
  }
});

// إعداد ردود النداء
function setupCallHandlers(call) {
  updateStatus('متصل');
  call.on('stream', remoteStream => {
    remoteAudio.srcObject = remoteStream;
    muteBtn.classList.remove('hidden');
    hangupBtn.classList.remove('hidden');
    startCallTimer();
    setInterval(updateCallQuality, 5000);
  });
  call.on('close', () => endCall());
  call.on('error', () => endCall());
}

// كتم الصوت
let micEnabled = true;
muteBtn.addEventListener('click', () => {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = !micEnabled);
    micEnabled = !micEnabled;
    muteBtn.innerHTML = micEnabled ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
  }
});

// إنهاء المكالمة
hangerBtn.addEventListener('click', () => {
  if (currentCall) currentCall.close();
  endCall();
});

function endCall() {
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  clearInterval(timerInterval);
  updateStatus('لا توجد مكالمات');
  callTimerEl.textContent = 'مدة المكالمة: 00:00';
  callQualityEl.textContent = 'جودة: -';
  currentCall = null;
  micEnabled = true;
  muteBtn.classList.add('hidden');
  hangupBtn.classList.add('hidden');
}
