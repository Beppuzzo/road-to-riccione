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
  getDoc,
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

/* -----------------------------
   DOM - AREE PRINCIPALI
----------------------------- */
const publicAccess = document.getElementById('publicAccess');
const athleteApp = document.getElementById('athleteApp');
const adminApp = document.getElementById('adminApp');

/* -----------------------------
   DOM - LOGIN ATLETA
----------------------------- */
const athleteLoginForm = document.getElementById('athleteLoginForm');
const athleteSlugInput = document.getElementById('athleteSlugInput');
const athletePinInput = document.getElementById('athletePinInput');
const athleteAuthStatus = document.getElementById('athleteAuthStatus');
const athleteLogoutBtn = document.getElementById('athleteLogoutBtn');
const athleteSessionInfo = document.getElementById('athleteSessionInfo');

/* -----------------------------
   DOM - DASHBOARD ATLETA
----------------------------- */
const dashboard = document.getElementById('dashboard');
const athleteNameEl = document.getElementById('athleteName');
const qualificationBadge = document.getElementById('qualificationBadge');
const currentPointsEl = document.getElementById('currentPoints');
const currentPercentEl = document.getElementById('currentPercent');
const missingToTargetEl = document.getElementById('missingToTarget');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const timelineEl = document.getElementById('timeline');
const emptyState = document.getElementById('emptyState');
const statusText = document.getElementById('statusText');

/* -----------------------------
   DOM - LOGIN ADMIN
----------------------------- */
const authCard = document.getElementById('authCard');
const loginForm = document.getElementById('loginForm');
const authMessage = document.getElementById('authMessage');
const logoutBtn = document.getElementById('logoutBtn');
const refreshAthletesBtn = document.getElementById('refreshAthletes');
const sessionInfo = document.getElementById('sessionInfo');

/* -----------------------------
   DOM - ADMIN OPERATIVO
----------------------------- */
const athleteForm = document.getElementById('athleteForm');
const athleteMessage = document.getElementById('athleteMessage');
const athletesList = document.getElementById('athletesList');

const adminAthlete = document.getElementById('adminAthlete');
const sessionDate = document.getElementById('sessionDate');
const scoreForm = document.getElementById('scoreForm');
const adminMessage = document.getElementById('adminMessage');
const adminScores = document.getElementById('adminScores');

/* -----------------------------
   STATE
----------------------------- */
let athletesCache = [];
let adminBooted = false;
let editingAthleteId = null;
let currentAthlete = null;
let currentAthleteSlug = null;

/* -----------------------------
   UTILS
----------------------------- */
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatStage(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

function getBadge(points) {
  if (points >= TARGET_POINTS) return { text: 'Qualificato', cls: 'success' };
  if (points >= TARGET_POINTS * 0.85) return { text: 'Vicino all’obiettivo', cls: 'warning' };
  return { text: 'In corsa', cls: 'neutral' };
}

function sessionTotal(score) {
  return (
    Number(score.attendance_points || 0) +
    Number(score.application_points || 0) +
    Number(score.technical_points || 0) +
    Number(score.resilience_points || 0)
  );
}

function buildStageTotals(scores = []) {
  return STAGES.reduce((acc, date) => {
    const score = scores.find((item) => item.session_date === date);
    acc[date] = score ? sessionTotal(score) : 0;
    return acc;
  }, {});
}

/* -----------------------------
   UI ROOT MODES
----------------------------- */
function hideAllApps() {
  publicAccess?.classList.add('hidden');
  athleteApp?.classList.add('hidden');
  adminApp?.classList.add('hidden');
}

function showPublicAccess() {
  publicAccess?.classList.remove('hidden');
  athleteApp?.classList.add('hidden');
  adminApp?.classList.add('hidden');
}

function showAthleteApp() {
  publicAccess?.classList.add('hidden');
  athleteApp?.classList.remove('hidden');
  adminApp?.classList.add('hidden');
}

function showAdminApp(user) {
  publicAccess?.classList.add('hidden');
  athleteApp?.classList.add('hidden');
  adminApp?.classList.remove('hidden');

  if (sessionInfo && user?.email) {
    sessionInfo.textContent = `Sessione attiva: ${user.email}`;
  }
}

function resetAthleteUI() {
  currentAthlete = null;
  currentAthleteSlug = null;

  if (athleteSlugInput) athleteSlugInput.value = '';
  if (athletePinInput) athletePinInput.value = '';
  if (athleteAuthStatus) {
    athleteAuthStatus.textContent = 'Inserisci slug e PIN per aprire il tuo percorso.';
  }
  if (athleteSessionInfo) athleteSessionInfo.textContent = 'Area atleta';

  dashboard?.classList.add('hidden');
  emptyState?.classList.add('hidden');
}

function setLoggedOutUI() {
  if (authMessage) authMessage.textContent = '';
  if (sessionInfo) sessionInfo.textContent = '';
  showPublicAccess();
}

/* -----------------------------
   ATHLETE DATA
----------------------------- */
async function loadAthleteBySlug(slug) {
  const q = query(
    collection(db, 'athletes'),
    where('slug', '==', slug)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

function showAthleteEmpty(message) {
  dashboard?.classList.add('hidden');
  emptyState?.classList.remove('hidden');
  if (statusText) statusText.textContent = message;
}

async function loadPublicProgress(slug) {
  const publicRef = doc(db, 'public_progress', slug);
  const snapshot = await getDoc(publicRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data();
}

function renderTimeline(stageTotals = {}) {
  if (!timelineEl) return;

  timelineEl.innerHTML = STAGES.map((date) => {
    const total = Number(stageTotals[date] || 0);

    if (!total) {
      return `
        <article class="stage pending">
          <div class="stage-date">${formatStage(date)}</div>
          <div class="stage-status">Tappa non ancora valutata</div>
          <div class="stage-points">0 / 40 punti</div>
        </article>
      `;
    }

    return `
      <article class="stage completed">
        <div class="stage-date">${formatStage(date)}</div>
        <div class="stage-status">Valutazione completata</div>
        <div class="stage-points">${total} / 40 punti</div>
      </article>
    `;
  }).join('');
}

async function loadAthleteDashboard(slug) {
  try {
    const progress = await loadPublicProgress(slug);

    if (!progress || !progress.is_active) {
      showAthleteEmpty('Percorso non trovato. Controlla slug e PIN oppure chiedi allo staff.');
      return;
    }

    const totalPoints = Number(progress.total_points || 0);
    const percent = Number(progress.percent || 0);
    const missing = Math.max(TARGET_POINTS - totalPoints, 0);
    const badge = getBadge(totalPoints);

    athleteNameEl.textContent = progress.full_name || '-';
    qualificationBadge.textContent = badge.text;
    qualificationBadge.className = `badge ${badge.cls}`;
    currentPointsEl.textContent = totalPoints;
    currentPercentEl.textContent = `${percent}%`;
    missingToTargetEl.textContent = missing;
    progressFill.style.width = `${Math.min(percent, 100)}%`;
    progressLabel.textContent = `${totalPoints} / ${MAX_TOTAL_POINTS} punti`;

    renderTimeline(progress.stage_totals || {});
    dashboard?.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    if (athleteSessionInfo) {
      athleteSessionInfo.textContent = `Area atleta: ${progress.full_name || slug}`;
    }
  } catch (error) {
    console.error(error);
    showAthleteEmpty('Errore nel caricamento del percorso.');
  }
}

async function athleteLogin(slugInputValue, pinInputValue) {
  const slug = slugify(slugInputValue);
  const pin = String(pinInputValue || '').trim();

  if (!slug) {
    if (athleteAuthStatus) athleteAuthStatus.textContent = 'Inserisci uno slug valido.';
    return;
  }

  if (!pin) {
    if (athleteAuthStatus) athleteAuthStatus.textContent = 'Inserisci il PIN.';
    return;
  }

  try {
    const athlete = await loadAthleteBySlug(slug);

    if (!athlete || !athlete.is_active) {
      if (athleteAuthStatus) athleteAuthStatus.textContent = 'Atleta non trovato o non attivo.';
      return;
    }

    if (String(athlete.pin || '') !== pin) {
      if (athleteAuthStatus) athleteAuthStatus.textContent = 'Slug o PIN non corretti.';
      return;
    }

    currentAthlete = athlete;
    currentAthleteSlug = slug;
    sessionStorage.setItem('athlete_slug', slug);
    sessionStorage.setItem(`access_${slug}`, 'ok');

    if (athleteAuthStatus) athleteAuthStatus.textContent = '';
    showAthleteApp();
    await loadAthleteDashboard(slug);
  } catch (error) {
    console.error(error);
    if (athleteAuthStatus) athleteAuthStatus.textContent = 'Errore durante l’accesso atleta.';
  }
}

function athleteLogout() {
  if (currentAthleteSlug) {
    sessionStorage.removeItem(`access_${currentAthleteSlug}`);
  }
  sessionStorage.removeItem('athlete_slug');
  resetAthleteUI();
  showPublicAccess();
}

async function restoreAthleteSessionIfAny() {
  const savedSlug = sessionStorage.getItem('athlete_slug');
  if (!savedSlug) return false;

  const access = sessionStorage.getItem(`access_${savedSlug}`);
  if (access !== 'ok') return false;

  try {
    const athlete = await loadAthleteBySlug(savedSlug);
    if (!athlete || !athlete.is_active) {
      sessionStorage.removeItem('athlete_slug');
      sessionStorage.removeItem(`access_${savedSlug}`);
      return false;
    }

    currentAthlete = athlete;
    currentAthleteSlug = savedSlug;
    showAthleteApp();
    await loadAthleteDashboard(savedSlug);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

/* -----------------------------
   ADMIN DATA
----------------------------- */
function loadStageOptions() {
  if (!sessionDate) return;
  sessionDate.innerHTML =
    '<option value="">Seleziona data</option>' +
    STAGES.map(date => `<option value="${date}">${labelDate(date)}</option>`).join('');
}

async function loadScoresByAthleteId(athleteId) {
  const scoresRef = collection(db, 'scores');
  const q = query(
    scoresRef,
    where('athlete_id', '==', athleteId),
    orderBy('session_date', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

async function syncPublicProgressForAthlete(athlete) {
  if (!athlete?.slug || !athlete?.id) return;

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
    updated_at: serverTimestamp()
  }, { merge: true });
}

async function syncAllPublicProgress() {
  for (const athlete of athletesCache) {
    await syncPublicProgressForAthlete(athlete);
  }
}

function refreshAdminAthleteSelect() {
  if (!adminAthlete) return;

  const currentValue = adminAthlete.value;

  adminAthlete.innerHTML =
    '<option value="">Seleziona atleta</option>' +
    athletesCache
      .map(a => `<option value="${a.id}">${escapeHtml(a.full_name)}</option>`)
      .join('');

  if (currentValue && athletesCache.some(a => a.id === currentValue)) {
    adminAthlete.value = currentValue;
  }
}

function setEditMessage(athleteId, message, isError = false) {
  const el = document.querySelector(`.athlete-edit-message[data-athlete-id="${athleteId}"]`);
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#b00020' : '';
}

function renderAthletesList() {
  if (!athletesList) return;

  if (!athletesCache.length) {
    athletesList.innerHTML = '<p class="status-text">Nessun atleta registrato.</p>';
    return;
  }

  athletesList.innerHTML = athletesCache.map((a) => {
    const isEditing = editingAthleteId === a.id;
    const safeName = escapeHtml(a.full_name || '');
    const safeSlug = escapeHtml(a.slug || '');
    const safePin = escapeHtml(a.pin || '');
    const statusLabel = a.is_active === false ? 'Inattivo' : 'Attivo';

    const parts = String(a.full_name || '').trim().split(/\s+/);
    const lastName = parts[0] || '';
    const firstName = parts.slice(1).join(' ') || '';

    return `
      <div class="score-card" data-athlete-id="${a.id}">
        <strong>${safeName}</strong>
        <div class="score-line">Slug: ${safeSlug}</div>
        <div class="score-line">PIN: ${safePin || 'Non assegnato'}</div>
        <div class="score-line">Stato: ${statusLabel}</div>

        <div class="score-line" style="margin-top:10px;">
          <button type="button" class="edit-athlete-btn" data-athlete-id="${a.id}">
            ${isEditing ? 'Chiudi modifica' : 'Modifica'}
          </button>
        </div>

        ${isEditing ? `
          <form class="edit-athlete-form" data-athlete-id="${a.id}" style="margin-top:12px;">
            <div class="score-line" style="margin-bottom:8px;">
              Slug: ${safeSlug}
            </div>

            <div class="score-line" style="margin-bottom:8px;">
              <label>
                Cognome<br>
                <input
                  type="text"
                  name="last_name"
                  value="${escapeHtml(lastName)}"
                  required
                  style="width:100%;margin-top:4px;"
                >
              </label>
            </div>

            <div class="score-line" style="margin-bottom:8px;">
              <label>
                Nome<br>
                <input
                  type="text"
                  name="first_name"
                  value="${escapeHtml(firstName)}"
                  required
                  style="width:100%;margin-top:4px;"
                >
              </label>
            </div>

            <div class="score-line" style="margin-bottom:8px;">
              <label>
                PIN (8 cifre)<br>
                <input
                  type="text"
                  name="pin"
                  value="${safePin}"
                  inputmode="numeric"
                  maxlength="8"
                  pattern="\\d{8}"
                  required
                  style="width:100%;margin-top:4px;"
                >
              </label>
            </div>

            <div class="score-line" style="margin-bottom:8px;">
              <label>
                <input
                  type="checkbox"
                  name="is_active"
                  ${a.is_active === false ? '' : 'checked'}
                >
                Atleta attivo
              </label>
            </div>

            <div class="score-line" style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="submit">Salva</button>
              <button type="button" class="generate-pin-btn" data-athlete-id="${a.id}">
                Genera PIN
              </button>
              <button type="button" class="delete-athlete-btn" data-athlete-id="${a.id}">
                Elimina atleta
              </button>
              <button type="button" class="cancel-edit-athlete-btn" data-athlete-id="${a.id}">
                Annulla
              </button>
            </div>

            <div class="score-line athlete-edit-message" data-athlete-id="${a.id}" style="margin-top:10px;"></div>
          </form>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function loadAthletes() {
  try {
    const athletesRef = collection(db, 'athletes');
    const q = query(athletesRef, orderBy('full_name', 'asc'));
    const snapshot = await getDocs(q);

    athletesCache = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    refreshAdminAthleteSelect();
    renderAthletesList();

    if (athleteMessage) athleteMessage.textContent = '';
  } catch (error) {
    console.error(error);
    if (athleteMessage) {
      athleteMessage.textContent = 'Errore nel caricamento atleti.';
    }
  }
}

async function loadScores() {
  const athleteId = adminAthlete?.value;

  if (!athleteId) {
    if (adminScores) {
      adminScores.innerHTML = '<p class="status-text">Seleziona un atleta per vedere le valutazioni.</p>';
    }
    return;
  }

  try {
    const data = await loadScoresByAthleteId(athleteId);

    if (!data.length) {
      adminScores.innerHTML = '<p class="status-text">Nessuna valutazione registrata.</p>';
      return;
    }

    adminScores.innerHTML = data.map(item => `
      <div class="score-card">
        <strong>${labelDate(item.session_date)} · ${sessionTotal(item)} / 40 punti</strong>
        <div class="score-line">
          Presenza: ${item.attendance_points} ·
          Applicazione: ${item.application_points} ·
          Tecnico-tattico: ${item.technical_points} ·
          Resilienza: ${item.resilience_points}
        </div>
        <div class="score-line">${escapeHtml(item.notes || 'Nessuna nota')}</div>
      </div>
    `).join('');

    if (adminMessage) adminMessage.textContent = '';
  } catch (error) {
    console.error(error);
    if (adminMessage) {
      adminMessage.textContent = 'Errore nel caricamento valutazioni.';
    }
  }
}

async function slugAlreadyUsed(slug, excludeAthleteId = null) {
  const athletesRef = collection(db, 'athletes');
  const slugQuery = query(athletesRef, where('slug', '==', slug));
  const slugSnapshot = await getDocs(slugQuery);

  return slugSnapshot.docs.some((docSnap) => docSnap.id !== excludeAthleteId);
}

async function updateAthleteProfile(athleteId, formData) {
  const athlete = athletesCache.find((item) => item.id === athleteId);
  if (!athlete) return;

  const lastName = formData.get('last_name')?.toString().trim() || '';
  const firstName = formData.get('first_name')?.toString().trim() || '';
  const fullName = `${lastName} ${firstName}`.trim();
  const slug = slugify(fullName);
  const pin = formData.get('pin')?.toString().trim() || '';
  const isActive = formData.get('is_active') === 'on';

  if (!fullName) {
    setEditMessage(athleteId, 'Nome non valido', true);
    return;
  }

  if (!slug) {
    setEditMessage(athleteId, 'Slug non valido', true);
    return;
  }

  if (!isValidPin(pin)) {
    setEditMessage(athleteId, 'PIN non valido', true);
    return;
  }

  try {
    const slugInUse = await slugAlreadyUsed(slug, athleteId);
    if (slugInUse) {
      setEditMessage(athleteId, 'Slug già usato', true);
      return;
    }

    await setDoc(doc(db, 'athletes', athleteId), {
      full_name: fullName,
      slug,
      pin,
      is_active: isActive,
      updated_at: serverTimestamp()
    }, { merge: true });

    if (athlete.slug && athlete.slug !== slug) {
      await deleteDoc(doc(db, 'public_progress', athlete.slug));
    }

    await syncPublicProgressForAthlete({
      ...athlete,
      full_name: fullName,
      slug,
      pin,
      is_active: isActive
    });

    editingAthleteId = null;
    await loadAthletes();

    if (adminAthlete?.value === athleteId) {
      await loadScores();
    }

    if (athleteMessage) {
      athleteMessage.textContent = `Atleta aggiornato correttamente: ${fullName}`;
    }
  } catch (error) {
    console.error(error);
    setEditMessage(athleteId, 'Errore salvataggio', true);
  }
}

async function deleteAthleteById(athleteId) {
  const athlete = athletesCache.find(a => a.id === athleteId);
  if (!athlete) return;

  const confirmDelete = window.confirm('Sei sicuro di voler eliminare questo atleta?');
  if (!confirmDelete) return;

  try {
    await deleteDoc(doc(db, 'athletes', athleteId));

    if (athlete.slug) {
      await deleteDoc(doc(db, 'public_progress', athlete.slug));
    }

    const scoresRef = collection(db, 'scores');
    const q = query(scoresRef, where('athlete_id', '==', athleteId));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      await deleteDoc(doc(db, 'scores', docSnap.id));
    }

    editingAthleteId = null;
    await loadAthletes();
    if (adminScores) {
      adminScores.innerHTML = '<p class="status-text">Seleziona un atleta per vedere le valutazioni.</p>';
    }
  } catch (error) {
    console.error(error);
    alert('Errore eliminazione atleta');
  }
}

async function bootAdmin() {
  if (adminBooted) return;
  adminBooted = true;

  loadStageOptions();
  await loadAthletes();
  await syncAllPublicProgress();
  await loadScores();
}

/* -----------------------------
   EVENTS - ATHLETE
----------------------------- */
athleteLoginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await athleteLogin(
    athleteSlugInput?.value || '',
    athletePinInput?.value || ''
  );
});

athleteLogoutBtn?.addEventListener('click', () => {
  athleteLogout();
});

/* -----------------------------
   EVENTS - ADMIN LOGIN
----------------------------- */
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
  
    if (authMessage) authMessage.textContent = 'Accesso in corso...';
  
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
  
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
  
      // pulizia eventuale sessione atleta
      athleteLogout();
  
      // mostra subito area admin
      showAdminApp(userCredential.user);
      await bootAdmin();
  
      if (authMessage) authMessage.textContent = '';
    } catch (error) {
      console.error(error);
      if (authMessage) {
        authMessage.textContent = `Login non riuscito: ${error.message}`;
      }
    }
  });

logoutBtn?.addEventListener('click', async () => {
  try {
    await signOut(auth);
    adminBooted = false;
    setLoggedOutUI();
  } catch (error) {
    console.error(error);
  }
});

refreshAthletesBtn?.addEventListener('click', async () => {
  await loadAthletes();
  await syncAllPublicProgress();
  await loadScores();
});

/* -----------------------------
   EVENTS - ADMIN ATHLETES
----------------------------- */
athleteForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName')?.value.trim();
  const slugInput = document.getElementById('slug');
  const slug = slugify(slugInput?.value.trim() || fullName || '');

  if (slugInput) slugInput.value = slug;

  if (!fullName || !slug) {
    if (athleteMessage) {
      athleteMessage.textContent = 'Inserisci nome atleta e slug valido.';
    }
    return;
  }

  try {
    const athletesRef = collection(db, 'athletes');

    const slugInUse = await slugAlreadyUsed(slug);
    if (slugInUse) {
      athleteMessage.textContent = 'Slug già usato. Scegline uno diverso.';
      return;
    }

    const pin = generatePin();

    const athleteDoc = await addDoc(athletesRef, {
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
      updated_at: serverTimestamp()
    });

    athleteMessage.textContent = `Atleta salvato. PIN assegnato: ${pin}`;
    athleteForm.reset();

    const slugField = document.getElementById('slug');
    if (slugField) delete slugField.dataset.touched;

    await loadAthletes();
  } catch (error) {
    console.error(error);
    athleteMessage.textContent = 'Errore durante il salvataggio atleta.';
  }
});

adminAthlete?.addEventListener('change', loadScores);

document.getElementById('fullName')?.addEventListener('input', (e) => {
  const currentSlugInput = document.getElementById('slug');
  if (currentSlugInput && !currentSlugInput.dataset.touched) {
    currentSlugInput.value = slugify(e.target.value);
  }
});

document.getElementById('slug')?.addEventListener('input', (e) => {
  e.target.dataset.touched = 'true';
  e.target.value = slugify(e.target.value);
});

athletesList?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.edit-athlete-btn');
  const cancelBtn = e.target.closest('.cancel-edit-athlete-btn');
  const generatePinBtn = e.target.closest('.generate-pin-btn');
  const deleteBtn = e.target.closest('.delete-athlete-btn');

  if (editBtn) {
    const athleteId = editBtn.dataset.athleteId;
    editingAthleteId = editingAthleteId === athleteId ? null : athleteId;
    renderAthletesList();
    return;
  }

  if (cancelBtn) {
    editingAthleteId = null;
    renderAthletesList();
    return;
  }

  if (generatePinBtn) {
    const athleteId = generatePinBtn.dataset.athleteId;
    const formEl = document.querySelector(`.edit-athlete-form[data-athlete-id="${athleteId}"]`);
    const pinInput = formEl?.querySelector('input[name="pin"]');
    if (pinInput) {
      pinInput.value = generatePin();
      pinInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }

  if (deleteBtn) {
    const athleteId = deleteBtn.dataset.athleteId;
    await deleteAthleteById(athleteId);
  }
});

athletesList?.addEventListener('input', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.name === 'pin') {
    target.value = target.value.replace(/\D/g, '').slice(0, 8);
  }
});

athletesList?.addEventListener('submit', async (e) => {
  const form = e.target.closest('.edit-athlete-form');
  if (!form) return;

  e.preventDefault();

  const athleteId = form.dataset.athleteId;
  const formData = new FormData(form);

  await updateAthleteProfile(athleteId, formData);
});

/* -----------------------------
   EVENTS - ADMIN SCORES
----------------------------- */
scoreForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    athlete_id: adminAthlete?.value || '',
    session_date: sessionDate?.value || '',
    attendance_points: Number(document.getElementById('attendance')?.value || 0),
    application_points: Number(document.getElementById('application')?.value || 0),
    technical_points: Number(document.getElementById('technical')?.value || 0),
    resilience_points: Number(document.getElementById('resilience')?.value || 0),
    notes: document.getElementById('notes')?.value.trim() || '',
    updated_at: serverTimestamp()
  };

  if (!payload.athlete_id || !payload.session_date) {
    if (adminMessage) adminMessage.textContent = 'Seleziona atleta e data.';
    return;
  }

  try {
    const docId = `${payload.athlete_id}_${payload.session_date}`;

    await setDoc(doc(db, 'scores', docId), {
      ...payload,
      created_at: serverTimestamp()
    }, { merge: true });

    const athlete = athletesCache.find((item) => item.id === payload.athlete_id);
    if (athlete) {
      await syncPublicProgressForAthlete(athlete);
    }

    if (adminMessage) {
      adminMessage.textContent = 'Valutazione salvata correttamente.';
    }

    scoreForm.reset();

    const attendance = document.getElementById('attendance');
    const application = document.getElementById('application');
    const technical = document.getElementById('technical');
    const resilience = document.getElementById('resilience');

    if (attendance) attendance.value = 10;
    if (application) application.value = 6;
    if (technical) technical.value = 6;
    if (resilience) resilience.value = 6;
    if (adminAthlete) adminAthlete.value = payload.athlete_id;
    if (sessionDate) sessionDate.value = payload.session_date;

    await loadScores();
  } catch (error) {
    console.error(error);
    if (adminMessage) {
      adminMessage.textContent = 'Errore durante il salvataggio.';
    }
  }
});

/* -----------------------------
   AUTH STATE
----------------------------- */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    showAdminApp(user);
    await bootAdmin();
  } else {
    adminBooted = false;

    const restoredAthlete = await restoreAthleteSessionIfAny();
    if (!restoredAthlete) {
      setLoggedOutUI();
    }
  }
});

/* -----------------------------
   FIRST LOAD
----------------------------- */
hideAllApps();
showPublicAccess();