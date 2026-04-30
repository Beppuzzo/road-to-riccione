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
  getDoc,
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
const sessionInfo = document.getElementById('sessionInfo');

const athleteForm = document.getElementById('athleteForm');
const athleteMessage = document.getElementById('athleteMessage');
const athletesList = document.getElementById('athletesList');
const athletesSummary = document.getElementById('athletesSummary');

const adminAthlete = document.getElementById('adminAthlete');
const sessionDate = document.getElementById('sessionDate');
const scoreForm = document.getElementById('scoreForm');
const adminMessage = document.getElementById('adminMessage');
const adminScores = document.getElementById('adminScores');

let athletesCache = [];
let adminBooted = false;
let editingAthleteId = null;

function sessionTotal(score) {
  return (
    Number(score.attendance_points || 0) +
    Number(score.application_points || 0) +
    Number(score.technical_points || 0) +
    Number(score.resilience_points || 0)
  );
}

function labelDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

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

function buildStageTotals(scores = []) {
  return STAGES.reduce((acc, date) => {
    const score = scores.find((item) => item.session_date === date);
    acc[date] = score ? sessionTotal(score) : 0;
    return acc;
  }, {});
}

function buildStageDetails(scores = []) {
  return STAGES.reduce((acc, date) => {
    const score = scores.find((item) => item.session_date === date);

    if (!score) {
      acc[date] = {
        attendance_points: 0,
        application_points: 0,
        technical_points: 0,
        resilience_points: 0,
        notes: ''
      };
      return acc;
    }

    acc[date] = {
      attendance_points: Number(score.attendance_points || 0),
      application_points: Number(score.application_points || 0),
      technical_points: Number(score.technical_points || 0),
      resilience_points: Number(score.resilience_points || 0),
      notes: score.notes || ''
    };

    return acc;
  }, {});
}

function setAuthenticatedUI(user) {
  authCard?.classList.add('hidden');
  adminApp?.classList.remove('hidden');
  if (sessionInfo) {
    sessionInfo.textContent = `Sessione attiva: ${user.email}`;
  }
}

function setLoggedOutUI() {
  authCard?.classList.remove('hidden');
  adminApp?.classList.add('hidden');
  if (authMessage) authMessage.textContent = '';
  if (sessionInfo) sessionInfo.textContent = '';
}

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
    const lastName = escapeHtml(parts[0] || '');
    const firstName = escapeHtml(parts.slice(1).join(' ') || '');

    return `
      <div class="score-card" data-athlete-id="${a.id}">
        <strong>${safeName}</strong>
        <div class="score-line">Slug: ${safeSlug}</div>
        <div class="score-line">PIN: ${safePin || 'Non assegnato'}</div>
        <div class="score-line">Stato: ${statusLabel}</div>
        <div class="score-line">
          Link personale:
          <a href="athlete.html?slug=${encodeURIComponent(a.slug || '')}" target="_blank" rel="noopener noreferrer">
            athlete.html?slug=${safeSlug}
          </a>
        </div>
        <div class="score-line" style="margin-top:10px;">
          <button type="button" class="edit-athlete-btn" data-athlete-id="${a.id}">
            ${isEditing ? 'Chiudi modifica' : 'Modifica'}
          </button>
        </div>

        ${isEditing ? `
          <form class="edit-athlete-form" data-athlete-id="${a.id}" style="margin-top:12px;">
            <div class="score-line" style="margin-bottom:8px;">
              <label>
                Cognome<br>
                <input
                  type="text"
                  name="last_name"
                  value="${lastName}"
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
                  value="${firstName}"
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
                Elimina Atleta
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

function renderAthletesSummary() {
  if (!athletesSummary) return;

  if (!athletesCache.length) {
    athletesSummary.innerHTML = '<p class="status-text">Nessun atleta.</p>';
    return;
  }

  const sorted = [...athletesCache].sort((a, b) => {
    return (b.total_points || 0) - (a.total_points || 0);
  });

  athletesSummary.innerHTML = sorted.map(a => {
    const total = Number(a.total_points || 0);
    const percent = Math.round((total / MAX_TOTAL_POINTS) * 100);
    const presencesTotal = Number(a.presences_total || 0);
    const lastEvaluatedDate = a.last_evaluated_date ? labelDate(a.last_evaluated_date) : 'Non ancora valutata';

    return `
      <div class="score-card">
        <strong>${escapeHtml(a.full_name)}</strong>

        <div style="
          display:grid;
          grid-template-columns: minmax(180px, 1fr) minmax(140px, 220px) minmax(130px, auto) minmax(170px, auto);
          gap:12px;
          align-items:center;
          margin-top:8px;
        ">
          <div class="score-line">
            ${total} / ${MAX_TOTAL_POINTS} punti
          </div>

          <div>
            <div style="
              height:8px;
              background:rgba(255,255,255,0.1);
              border-radius:10px;
              overflow:hidden;
            ">
              <div style="
                width:${percent}%;
                height:100%;
                background:${percent >= 70 ? '#59e3a7' : '#48c7f9'};
                transition:width 0.3s;
              "></div>
            </div>
            <div style="
              font-size:0.8rem;
              margin-top:4px;
              color:#c8d4e4;
            ">
              ${percent}%
            </div>
          </div>

          <div class="score-line">
            Presenze totali: ${presencesTotal}
          </div>

          <div class="score-line">
            Ultima lezione valutata: ${lastEvaluatedDate}
          </div>
        </div>
      </div>
    `;
  }).join('');
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

async function bootAdmin() {
  if (adminBooted) return;
  adminBooted = true;

  loadStageOptions();
  await loadAthletes();
  await syncAllPublicProgress();
  await loadScores();
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

    for (const athlete of athletesCache) {
      const progressSnap = await getDoc(doc(db, 'public_progress', athlete.slug));
      const progress = progressSnap.exists() ? progressSnap.data() : null;
      const scores = await loadScoresByAthleteId(athlete.id);

      athlete.total_points = progress?.total_points || 0;
      athlete.presences_total = scores.filter((score) => Number(score.attendance_points || 0) > 0).length;
      athlete.last_evaluated_date = scores.length ? scores[0].session_date : '';
    }

    refreshAdminAthleteSelect();
    renderAthletesList();
    renderAthletesSummary();

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

  if (!athlete) {
    setEditMessage(athleteId, 'Atleta non trovato.', true);
    return;
  }

  const lastName = formData.get('last_name')?.toString().trim() || '';
  const firstName = formData.get('first_name')?.toString().trim() || '';
  const fullName = `${lastName} ${firstName}`.trim();
  const slug = slugify(fullName);
  const pin = formData.get('pin')?.toString().trim() || '';
  const isActive = formData.get('is_active') === 'on';

  const formEl = document.querySelector(`.edit-athlete-form[data-athlete-id="${athleteId}"]`);
  const pinInput = formEl?.querySelector('input[name="pin"]');

  if (pinInput) pinInput.value = pin.replace(/\D/g, '').slice(0, 8);

  if (!fullName || !slug) {
    setEditMessage(athleteId, 'Nome atleta non valido.', true);
    return;
  }

  if (!isValidPin(pin)) {
    setEditMessage(athleteId, 'Il PIN deve avere esattamente 8 cifre.', true);
    return;
  }

  try {
    const slugInUse = await slugAlreadyUsed(slug, athleteId);
    if (slugInUse) {
      setEditMessage(athleteId, 'Slug già usato. Correggi nome/cognome.', true);
      return;
    }

    setEditMessage(athleteId, 'Salvataggio in corso...');

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

    const updatedAthlete = {
      ...athlete,
      full_name: fullName,
      slug,
      pin,
      is_active: isActive
    };

    await syncPublicProgressForAthlete(updatedAthlete);

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
    setEditMessage(athleteId, 'Errore durante il salvataggio.', true);
  }
}

async function deleteAthlete(athleteId) {
  const athlete = athletesCache.find(a => a.id === athleteId);
  if (!athlete) return;

  const confirmed = window.confirm(`Confermi eliminazione atleta "${athlete.full_name}"?`);
  if (!confirmed) return;

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

    if (adminAthlete?.value === athleteId) {
      adminAthlete.value = '';
      if (adminScores) {
        adminScores.innerHTML = '<p class="status-text">Seleziona un atleta per vedere le valutazioni.</p>';
      }
    }

    editingAthleteId = null;
    await loadAthletes();

    if (athleteMessage) {
      athleteMessage.textContent = `Atleta eliminato: ${athlete.full_name}`;
    }
  } catch (error) {
    console.error(error);
    alert("Errore eliminazione atleta");
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (authMessage) authMessage.textContent = 'Accesso in corso...';

  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    if (authMessage) authMessage.textContent = 'Accesso effettuato.';
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
  try {
    await loadAthletes();
    await syncAllPublicProgress();
    await loadScores();
    alert('Elenco atleti aggiornato correttamente.');
  } catch (error) {
    console.error(error);
    alert(`Errore refresh: ${error.message}`);
  }
});

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
      stage_details: STAGES.reduce((acc, date) => {
        acc[date] = {
          attendance_points: 0,
          application_points: 0,
          technical_points: 0,
          resilience_points: 0,
          notes: ''
        };
        return acc;
      }, {}),
      updated_at: serverTimestamp()
    });

    athleteMessage.textContent = `Atleta salvato. Link personale: athlete.html?slug=${slug}`;
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
  const currentSlug = document.getElementById('slug');
  if (currentSlug && !currentSlug.dataset.touched) {
    currentSlug.value = slugify(e.target.value);
  }
});

document.getElementById('slug')?.addEventListener('input', (e) => {
  e.target.dataset.touched = 'true';
  e.target.value = slugify(e.target.value);
});

athletesList?.addEventListener('click', (e) => {
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
    deleteAthlete(athleteId);
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

    await loadAthletes();
    await loadScores();
  } catch (error) {
    console.error(error);
    if (adminMessage) {
      adminMessage.textContent = 'Errore durante il salvataggio.';
    }
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    setAuthenticatedUI(user);
    await bootAdmin();
  } else {
    adminBooted = false;
    setLoggedOutUI();
  }
});
