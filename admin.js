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
  '2026-04-16',
  '2026-04-17',
  '2026-04-19',
  '2026-04-20',
  '2026-04-22',
  '2026-04-24',
  '2026-04-27',
  '2026-04-29',
  '2026-05-04'
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
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function generatePin() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function isValidPin(pin) {
  return /^\d{8}$/.test(String(pin || ''));
}

function escapeHtml(v) {
  return String(v || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sessionTotal(score) {
  return (
    Number(score.attendance_points || 0) +
    Number(score.application_points || 0) +
    Number(score.technical_points || 0) +
    Number(score.resilience_points || 0)
  );
}

async function loadScoresByAthleteId(athleteId) {
  const scoresRef = collection(db, 'scores');
  const q = query(
    scoresRef,
    where('athlete_id', '==', athleteId),
    orderBy('session_date', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

function buildStageTotals(scores = []) {
  return STAGES.reduce((acc, date) => {
    const score = scores.find((item) => item.session_date === date);
    acc[date] = score ? sessionTotal(score) : 0;
    return acc;
  }, {});
}

function buildStageDetails(scores = []) {
  return scores.reduce((acc, score) => {
    if (!score.session_date) return acc;

    acc[score.session_date] = {
      attendance_points: Number(score.attendance_points || 0),
      application_points: Number(score.application_points || 0),
      technical_points: Number(score.technical_points || 0),
      resilience_points: Number(score.resilience_points || 0),
      notes: score.notes || ''
    };

    return acc;
  }, {});
}

async function syncPublicProgressForAthlete(athlete) {
  if (!athlete?.id || !athlete?.slug) return;

  const scores = await loadScoresByAthleteId(athlete.id);
  const totalPoints = scores.reduce((acc, item) => acc + sessionTotal(item), 0);
  const percent = Math.round((totalPoints / MAX_TOTAL_POINTS) * 100);

  await setDoc(doc(db, 'public_progress', athlete.slug), {
    athlete_id: athlete.id,
    slug: athlete.slug,
    full_name: athlete.full_name,
    is_active: athlete.is_active !== false,
    total_points: totalPoints,
    percent,
    target_points: TARGET_POINTS,
    max_total_points: MAX_TOTAL_POINTS,
    qualified: totalPoints >= TARGET_POINTS,
    stage_totals: buildStageTotals(scores),
    stage_details: buildStageDetails(scores),
    updated_at: serverTimestamp()
  }, { merge: true });
}

async function syncAllPublicProgress() {
  for (const athlete of athletesCache) {
    await syncPublicProgressForAthlete(athlete);
  }
}

function renderAthletesList() {
  athletesList.innerHTML = athletesCache.map(a => {
    const isEditing = editingAthleteId === a.id;
    const parts = String(a.full_name || '').split(' ');
    const lastName = parts[0] || '';
    const firstName = parts.slice(1).join(' ') || '';

    return `
      <div class="score-card">
        <strong>${escapeHtml(a.full_name)}</strong>
        <div>Slug: ${escapeHtml(a.slug)}</div>
        <div>PIN: ${escapeHtml(a.pin || 'Non assegnato')}</div>

        <button class="edit-btn" data-id="${a.id}">
          ${isEditing ? 'Chiudi' : 'Modifica'}
        </button>

        ${isEditing ? `
          <form class="edit-form" data-id="${a.id}">
            <input name="last_name" value="${escapeHtml(lastName)}" placeholder="Cognome" required>
            <input name="first_name" value="${escapeHtml(firstName)}" placeholder="Nome" required>
            <input name="pin" value="${escapeHtml(a.pin || '')}" placeholder="PIN 8 cifre" required>

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
  const snapshot = await getDocs(query(collection(db, 'athletes')));
  athletesCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAthletesList();
}

async function updateAthlete(id, formData) {
  const last = String(formData.get('last_name') || '').trim();
  const first = String(formData.get('first_name') || '').trim();
  const pin = String(formData.get('pin') || '').trim();

  const full_name = `${last} ${first}`.trim();
  const slug = slugify(full_name);

  if (!full_name) {
    alert("Nome atleta non valido");
    return;
  }

  if (!isValidPin(pin)) {
    alert("PIN non valido");
    return;
  }

  const athlete = athletesCache.find(a => a.id === id);
  if (!athlete) return;

  await setDoc(doc(db, 'athletes', id), {
    full_name,
    slug,
    pin,
    updated_at: serverTimestamp()
  }, { merge: true });

  if (athlete.slug && athlete.slug !== slug) {
    await deleteDoc(doc(db, 'public_progress', athlete.slug));
  }

  const updatedAthlete = {
    ...athlete,
    full_name,
    slug,
    pin
  };

  await syncPublicProgressForAthlete(updatedAthlete);

  editingAthleteId = null;
  await loadAthletes();
}

async function deleteAthlete(id) {
  if (!confirm("Eliminare atleta?")) return;

  const athlete = athletesCache.find(a => a.id === id);

  await deleteDoc(doc(db, 'athletes', id));

  if (athlete?.slug) {
    await deleteDoc(doc(db, 'public_progress', athlete.slug));
  }

  const q = query(collection(db, 'scores'), where('athlete_id', '==', id));
  const snap = await getDocs(q);

  for (const d of snap.docs) {
    await deleteDoc(doc(db, 'scores', d.id));
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
    form?.querySelector('[name=pin]')?.setAttribute('value', generatePin());
    if (form?.querySelector('[name=pin]')) {
      form.querySelector('[name=pin]').value = generatePin();
    }
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

athleteForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = String(document.getElementById('fullName')?.value || '').trim();
  const slugInput = document.getElementById('slug');
  const slug = slugify(slugInput?.value?.trim() || fullName || '');

  if (slugInput) slugInput.value = slug;

  if (!fullName || !slug) {
    if (athleteMessage) {
      athleteMessage.textContent = 'Inserisci nome atleta e slug valido.';
    }
    return;
  }

  try {
    const pin = generatePin();

    const athleteDoc = await addDoc(collection(db, 'athletes'), {
      full_name: fullName,
      slug,
      pin,
      is_active: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });

    await setDoc(doc(db, 'public_progress', slug), {
      athlete_id: athleteDoc.id,
      slug,
      full_name: fullName,
      is_active: true,
      total_points: 0,
      percent: 0,
      target_points: TARGET_POINTS,
      max_total_points: MAX_TOTAL_POINTS,
      qualified: false,
      stage_totals: STAGES.reduce((acc, date) => {
        acc[date] = 0;
        return acc;
      }, {}),
      stage_details: {},
      updated_at: serverTimestamp()
    });

    if (athleteMessage) {
      athleteMessage.textContent = `Atleta salvato. PIN assegnato: ${pin}`;
    }

    athleteForm.reset();
    await loadAthletes();
  } catch (error) {
    console.error(error);
    if (athleteMessage) {
      athleteMessage.textContent = 'Errore durante il salvataggio atleta.';
    }
  }
});

loginForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    if (authMessage) authMessage.textContent = '';
  } catch (error) {
    console.error(error);
    if (authMessage) {
      authMessage.textContent = 'Login non riuscito. Controlla email e password.';
    }
  }
});

logoutBtn?.addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = 'https://road-to-riccione.vercel.app/';
  } catch (error) {
    console.error(error);
  }
});

refreshAthletesBtn?.addEventListener('click', async () => {
  await loadAthletes();
  await syncAllPublicProgress();
});

onAuthStateChanged(auth, async user => {
  if (user) {
    authCard?.classList.add('hidden');
    adminApp?.classList.remove('hidden');
    await loadAthletes();
    await syncAllPublicProgress();
  } else {
    authCard?.classList.remove('hidden');
    adminApp?.classList.add('hidden');
  }
});