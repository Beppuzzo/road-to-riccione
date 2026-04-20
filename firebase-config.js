// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configurazione Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAQ9lC0hPuFtf2FX5y08KX60iRUpvEIG1U",
  authDomain: "road-to-riccione.firebaseapp.com",
  projectId: "road-to-riccione",
  storageBucket: "road-to-riccione.firebasestorage.app",
  messagingSenderId: "361885843706",
  appId: "1:361885843706:web:6f99a53853021d8c73c943"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);

// Servizi
const auth = getAuth(app);
const db = getFirestore(app);

// Esporta
export { auth, db };