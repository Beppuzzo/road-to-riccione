import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  setDoc,
  doc,
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STAGES = [
  '2026-04-16','2026-04-17','2026-04-19','2026-04-20',
  '2026-04-22','2026-04-24','2026-04-27','2026-04-29','2026-05-04'
];

const MAX_TOTAL_POINTS = 360;
const TARGET_POINTS = 252;

const authCard = document.getElementById('authCard');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const authMessage = document.getElementById('authMessage');
const logoutBtn = document.getElementById('logoutBtn');
const refreshAthletesBtn = document.getElementById('refreshAthletes');

const athleteForm = document.getElementById('athleteForm');
const athleteMessage = document.getElementById('athleteMessage');
const athletesList = document.getElementById('athletesList');

let athletesCache = [];
let editingAthleteId = null;

function slugify(value) {
  return value.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function generatePin() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function isValidPin(pin) {
  return /^\d{8}$/.test(pin);
}

function escapeHtml(v) {
  return String(v || '')
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function renderAthletesList() {
  athletesList.innerHTML = athletesCache.map(a => {

    const isEditing = editingAthleteId === a.id;
    const parts = (a.full_name || '').split(' ');
    const lastName = parts[0] || '';
    const firstName = parts.slice(1).join(' ') || '';

    return `
    <div class="score-card">
      <strong>${escapeHtml(a.full_name)}</strong>
      <div>Slug: ${a.slug}</div>
      <div>PIN: ${a.pin || 'Non assegnato'}</div>

      <button class="edit-btn" data-id="${a.id}">
        ${isEditing ? 'Chiudi' : 'Modifica'}
      </button>

      ${isEditing ? `
        <form class="edit-form" data-id="${a.id}">
          <input name="last_name" value="${lastName}" placeholder="Cognome" required>
          <input name="first_name" value="${firstName}" placeholder="Nome" required>
          <input name="pin" value="${a.pin || ''}" placeholder="PIN 8 cifre" required>

          <button type="submit">Salva</button>
          <button type="button" class="gen-pin" data-id="${a.id}">Genera PIN</button>
          <button type="button" class="delete-btn" data-id="${a.id}">Elimina</button>
        </form>
      ` : ''}
    </div>
    `;
  }).join('');
}

async function loadAthletes() {
  const snapshot = await getDocs(query(collection(db,'athletes')));
  athletesCache = snapshot.docs.map(d => ({ id:d.id, ...d.data() }));
  renderAthletesList();
}

async function updateAthlete(id, formData) {
  const last = formData.get('last_name').trim();
  const first = formData.get('first_name').trim();
  const pin = formData.get('pin').trim();

  const full_name = `${last} ${first}`;
  const slug = slugify(full_name);

  if (!isValidPin(pin)) return alert("PIN non valido");

  const athlete = athletesCache.find(a => a.id === id);

  await setDoc(doc(db,'athletes',id), {
    full_name, slug, pin, updated_at: serverTimestamp()
  }, { merge:true });

  if (athlete.slug !== slug) {
    await deleteDoc(doc(db,'public_progress', athlete.slug));
  }

  editingAthleteId = null;
  await loadAthletes();
}

async function deleteAthlete(id) {
  if (!confirm("Eliminare atleta?")) return;

  const athlete = athletesCache.find(a => a.id === id);

  await deleteDoc(doc(db,'athletes',id));

  if (athlete.slug) {
    await deleteDoc(doc(db,'public_progress', athlete.slug));
  }

  const q = query(collection(db,'scores'), where('athlete_id','==',id));
  const snap = await getDocs(q);

  for (const d of snap.docs) {
    await deleteDoc(doc(db,'scores', d.id));
  }

  await loadAthletes();
}

athletesList.addEventListener('click', e => {

  const edit = e.target.closest('.edit-btn');
  const gen = e.target.closest('.gen-pin');
  const del = e.target.closest('.delete-btn');

  if (edit) {
    editingAthleteId = editingAthleteId === edit.dataset.id ? null : edit.dataset.id;
    renderAthletesList();
  }

  if (gen) {
    const form = document.querySelector(`form[data-id="${gen.dataset.id}"]`);
    form.querySelector('[name=pin]').value = generatePin();
  }

  if (del) {
    deleteAthlete(del.dataset.id);
  }
});

athletesList.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  await updateAthlete(form.dataset.id, new FormData(form));
});

loginForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  await signInWithEmailAndPassword(auth,email,pass);
});

logoutBtn?.addEventListener('click', () => signOut(auth));

refreshAthletesBtn?.addEventListener('click', loadAthletes);

onAuthStateChanged(auth, user => {
  if (user) {
    authCard.classList.add('hidden');
    adminApp.classList.remove('hidden');
    loadAthletes();
  } else {
    authCard.classList.remove('hidden');
    adminApp.classList.add('hidden');
  }
});
