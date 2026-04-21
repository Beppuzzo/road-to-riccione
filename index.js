import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* -----------------------------
   DOM - LOGIN ATLETA
----------------------------- */
const athleteLoginForm = document.getElementById('athleteLoginForm');
const athleteSlugInput = document.getElementById('athleteSlugInput');
const athletePinInput = document.getElementById('athletePinInput');
const athleteAuthStatus = document.getElementById('athleteAuthStatus');

/* -----------------------------
   DOM - LOGIN ADMIN
----------------------------- */
const loginForm = document.getElementById('loginForm');
const authMessage = document.getElementById('authMessage');

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

/* -----------------------------
   LOGIN ATLETA
----------------------------- */
async function athleteLogin(slugInputValue, pinInputValue) {
  const slug = slugify(slugInputValue);
  const pin = String(pinInputValue || '').trim();

  if (!slug) {
    if (athleteAuthStatus) {
      athleteAuthStatus.textContent = 'Inserisci uno slug valido.';
    }
    return;
  }

  if (!pin) {
    if (athleteAuthStatus) {
      athleteAuthStatus.textContent = 'Inserisci il PIN.';
    }
    return;
  }

  try {
    const athlete = await loadAthleteBySlug(slug);

    if (!athlete || !athlete.is_active) {
      if (athleteAuthStatus) {
        athleteAuthStatus.textContent = 'Atleta non trovato o non attivo.';
      }
      return;
    }

    if (String(athlete.pin || '') !== pin) {
      if (athleteAuthStatus) {
        athleteAuthStatus.textContent = 'Slug o PIN non corretti.';
      }
      return;
    }

    sessionStorage.setItem(`access_${slug}`, 'ok');

    if (athleteAuthStatus) {
      athleteAuthStatus.textContent = '';
    }

    window.location.href = `athlete.html?slug=${encodeURIComponent(slug)}`;
  } catch (error) {
    console.error(error);
    if (athleteAuthStatus) {
      athleteAuthStatus.textContent = 'Errore durante l’accesso atleta.';
    }
  }
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

/* -----------------------------
   EVENTS - ADMIN
----------------------------- */
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (authMessage) {
    authMessage.textContent = 'Accesso in corso...';
  }

  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);

    if (authMessage) {
      authMessage.textContent = '';
    }

    window.location.href = 'admin.html';
  } catch (error) {
    console.error(error);
    if (authMessage) {
      authMessage.textContent = `Login non riuscito: ${error.message}`;
    }
  }
});

/* -----------------------------
   SESSIONE ADMIN GIÀ ATTIVA
----------------------------- */
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = 'admin.html';
  }
});

