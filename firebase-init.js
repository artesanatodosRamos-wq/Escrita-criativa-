// ---------- Configuração do Firebase ----------
// Essas chaves não são secretas: identificam seu projeto, quem protege os
// dados de verdade são as Regras do Firestore (configuradas no console).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAJCs05wzTRHNhlik09cLpymxk7xVhcs2c",
  authDomain: "escrita-criativa-cd055.firebaseapp.com",
  projectId: "escrita-criativa-cd055",
  storageBucket: "escrita-criativa-cd055.firebasestorage.app",
  messagingSenderId: "827727236149",
  appId: "1:827727236149:web:24ff57fb2bd45d96def57c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };
