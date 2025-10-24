// --- Firebase (CDN, modułowo) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, enableIndexedDbPersistence }
  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// 1) KONFIG – wklej z konsoli Firebase:
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAyr4czJXsL5a07g8vuR1zMp__rDVSlb9U",
  authDomain: "mini-duo.firebaseapp.com",
  projectId: "mini-duo",
  storageBucket: "mini-duo.firebasestorage.app",
  messagingSenderId: "314630300501",
  appId: "1:314630300501:web:cc1b6f6fe922d15f8545dc",
  measurementId: "G-LJBB1K58BL"
};

// 2) Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 3) Offline dla Firestore (kolejkuje zapisy i synchronizuje po powrocie sieci)
enableIndexedDbPersistence(db).catch(()=>{ /* np. w trybie prywatnym może się nie udać */ });

// ---- UI refs
const $ = s => document.querySelector(s);
const userInfo = $('#userInfo');
const btnSignIn = $('#btnSignIn');
const btnSignOut = $('#btnSignOut');
const lessonSelect = $('#lessonSelect');
const btnStart = $('#btnStart');
const quiz = $('#quiz');
const bar = $('#bar');
const qIdxEl = $('#qIdx');
const qTotalEl = $('#qTotal');
const questionEl = $('#question');
const choicesEl = $('#choices');
const msgEl = $('#msg');
const lessonTitleEl = $('#lessonTitle');

let user = null;
let lesson = null;
let idx = 0;
let answers = []; // 1 / 0 dla poprawności

// ---- Logowanie
btnSignIn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
};
btnSignOut.onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  user = u || null;
  btnSignOut.style.display = user ? 'inline-block' : 'none';
  btnSignIn.style.display  = user ? 'none' : 'inline-block';
  userInfo.textContent = user ? (user.displayName || user.email) : 'Nie zalogowano';
  // Załaduj dostępne lekcje (statycznie z folderu lessons)
  loadLessonsList();
  // Podbij pasek postępu na podstawie chmury, jeśli kiedyś zaczynałeś
  if (user && lesson && lesson.id) await restoreProgress(lesson.id);
});

// ---- Lista lekcji (możesz po prostu zahardkodować)
const LESSONS = [
  { id: 'en-a1-basics', title: 'English A1 · Basics', file: 'lessons/en-a1-basics.json' }
];
function loadLessonsList(){
  lessonSelect.innerHTML = LESSONS.map(l => `<option value="${l.id}">${l.title}</option>`).join('');
}

btnStart.onclick = async () => {
  const id = lessonSelect.value;
  const meta = LESSONS.find(l => l.id === id);
  const res = await fetch(meta.file);
  lesson = await res.json();
  answers = [];
  idx = 0;
  lessonTitleEl.textContent = lesson.title;
  qTotalEl.textContent = lesson.items.length;
  quiz.style.display = 'block';
  if (user) await restoreProgress(lesson.id);
  renderQuestion();
};

function renderQuestion(){
  const total = lesson.items.length;
  const pct = Math.round((idx/Math.max(1,total))*100);
  bar.style.width = pct + '%';
  qIdxEl.textContent = Math.min(idx+1, total);
  msgEl.textContent = '';

  const item = lesson.items[idx];
  questionEl.textContent = `Przetłumacz: "${item.q}"`;
  choicesEl.innerHTML = '';
  item.choices.forEach((text, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = text;
    b.onclick = () => checkAnswer(i === item.correct, b);
    choicesEl.appendChild(b);
  });
}

function checkAnswer(ok, btn){
  // zablokuj dalsze kliki
  Array.from(document.querySelectorAll('.choice')).forEach(c => c.disabled = true);
  btn.classList.add(ok ? 'correct' : 'wrong');
  msgEl.textContent = ok ? '✅ Dobrze!' : '❌ Spróbuj dalej';
  answers[idx] = ok ? 1 : 0;
  // zapisz postęp po każdym pytaniu
  if (user && lesson) saveProgress(lesson.id, { idx, ok });
}

$('#btnNext').onclick = () => {
  if (!lesson) return;
  if (idx < lesson.items.length - 1) {
    idx++;
    renderQuestion();
  } else {
    // koniec
    const score = answers.reduce((s,a)=>s+(a||0),0);
    msgEl.textContent = `Wynik: ${score}/${lesson.items.length}`;
    bar.style.width = '100%';
    // zapisz ukończenie
    if (user && lesson) saveProgress(lesson.id, { finished:true, score });
  }
};

// ---- Zapisy w Firestore: users/{uid}/progress/{lessonId}
async function saveProgress(lessonId, payload){
  const ref = doc(db, 'users', user.uid, 'progress', lessonId);
  const now = new Date().toISOString();
  const base = { updatedAt: now };
  if (payload.finished) Object.assign(base, { finished:true, score: payload.score });
  if ('idx' in payload) Object.assign(base, { lastIndex: payload.idx, lastOK: !!payload.ok });
  await setDoc(ref, base, { merge:true });
}

async function restoreProgress(lessonId){
  const ref = doc(db, 'users', user.uid, 'progress', lessonId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const p = snap.data();
    if (typeof p.lastIndex === 'number' && p.lastIndex < lesson.items.length) {
      idx = p.lastIndex; // kontynuuj od ostatniego pytania
    }
  }
}
