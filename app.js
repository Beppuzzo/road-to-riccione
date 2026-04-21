import { db } from './firebase-config.js';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAX_TOTAL_POINTS = 360;
const TARGET_POINTS = 252;
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

let currentAthlete = null;
let currentSlug = getSlugFromUrl();
let currentProgress = null;

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

function formatStage(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

function getBadge(points) {
  if (points >= TARGET_POINTS) return { text: 'Qualificato', cls: 'success' };
  if (points >= TARGET_POINTS * 0.85) return { text: 'Vicino all’obiettivo', cls: 'warning' };
  return { text: 'In corsa', cls: 'neutral' };
}

function getSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug')?.trim().toLowerCase() || '';
}

async function loadAthlete() {
  const q = query(
    collection(db, "athletes"),
    where("slug", "==", currentSlug)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  return snapshot.docs[0].data();
}

function showEmpty(message) {
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

function showStageDetail(date) {
  if (!currentProgress) return;

  const total = Number(currentProgress.stage_totals?.[date] || 0);
  const detail = currentProgress.stage_details?.[date];

  if (!detail) {
    alert(
      `📅 Tappa ${formatStage(date)}\n\n` +
      `Totale: ${total} / 40 punti\n\n` +
      `Nessun dettaglio disponibile per questa tappa.`
    );
    return;
  }

  const message =
    `📅 Tappa ${formatStage(date)}\n\n` +
    `Presenza: ${detail.attendance_points ?? '-'}\n` +
    `Applicazione: ${detail.application_points ?? '-'}\n` +
    `Tecnico/Tattico: ${detail.technical_points ?? '-'}\n` +
    `Resilienza: ${detail.resilience_points ?? '-'}\n\n` +
    `Totale: ${total} / 40 punti\n\n` +
    `Note:\n${detail.notes || 'Nessuna nota'}`;

  alert(message);
}

function renderTimeline(stageTotals = {}) {
  timelineEl.innerHTML = STAGES.map((date) => {
    const total = Number(stageTotals[date] || 0);

    if (!total) {
      return `
        <article class="stage pending" data-date="${date}" style="cursor:pointer;">
          <div class="stage-date">${formatStage(date)}</div>
          <div class="stage-status">Tappa non ancora valutata</div>
          <div class="stage-points">0 / 40 punti</div>
        </article>
      `;
    }

    return `
      <article class="stage completed" data-date="${date}" style="cursor:pointer;">
        <div class="stage-date">${formatStage(date)}</div>
        <div class="stage-status">Valutazione completata</div>
        <div class="stage-points">${total} / 40 punti</div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.stage').forEach((stageEl) => {
    stageEl.addEventListener('click', () => {
      const date = stageEl.dataset.date;
      if (!date) return;
      showStageDetail(date);
    });
  });
}

async function loadAthleteDashboard(slug) {
  try {
    const progress = await loadPublicProgress(slug);
    currentProgress = progress;

    if (!progress || !progress.is_active) {
      showEmpty('Percorso non trovato. Controlla il link personale o chiedi allo staff.');
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
  } catch (error) {
    console.error(error);
    showEmpty('Errore nel caricamento del percorso. Controlla il link personale.');
  }
}

async function init() {
  if (!currentSlug) {
    showEmpty('Manca lo slug dell’atleta nel link.');
    return;
  }

  currentAthlete = await loadAthlete();

  if (!currentAthlete) {
    showEmpty('Atleta non trovato.');
    return;
  }

  const access = sessionStorage.getItem(`access_${currentSlug}`);
  const prefillPin = sessionStorage.getItem(`prefill_pin_${currentSlug}`);

  if (access === "ok") {
    document.getElementById("pin-gate").style.display = "none";
    dashboard.classList.remove("hidden");
    loadAthleteDashboard(currentSlug);

  } else if (prefillPin && prefillPin === currentAthlete.pin) {
    sessionStorage.setItem(`access_${currentSlug}`, "ok");
    sessionStorage.removeItem(`prefill_pin_${currentSlug}`);

    document.getElementById("pin-gate").style.display = "none";
    dashboard.classList.remove("hidden");

    loadAthleteDashboard(currentSlug);

  } else {
    dashboard.classList.add("hidden");
  }
}

init();

window.unlock = function () {
  const input = document.getElementById("pin-input").value;

  if (input === currentAthlete?.pin) {
    sessionStorage.setItem(`access_${currentSlug}`, "ok");

    document.getElementById("pin-gate").style.display = "none";
    dashboard.classList.remove("hidden");

    loadAthleteDashboard(currentSlug);
  } else {
    document.getElementById("pin-error").style.display = "block";
  }
};

const athleteLogoutBtn = document.getElementById('logoutBtn');

athleteLogoutBtn?.addEventListener('click', () => {
  if (currentSlug) {
    sessionStorage.removeItem(`access_${currentSlug}`);
    sessionStorage.removeItem(`prefill_pin_${currentSlug}`);
  }

  sessionStorage.removeItem('athlete_slug');
  window.location.href = 'https://road-to-riccione.vercel.app/';
});