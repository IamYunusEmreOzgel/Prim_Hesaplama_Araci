/**
 * Firebase uygulama bağlantısını yapılandırır.
 *
 * Görevleri:
 * - Firebase Authentication ve Firestore servislerini başlatır.
 * - Diğer modüllerin kullandığı auth ve db örneklerini dışa aktarır.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBWgLs3W7rxac1MmPDs8iWPr-MEe2Y-cZU",
    authDomain: "primhesaplama-8396c.firebaseapp.com",
    projectId: "primhesaplama-8396c",
    storageBucket: "primhesaplama-8396c.firebasestorage.app",
    messagingSenderId: "89487930218",
    appId: "1:89487930218:web:b4056c95aaf4f9b6b8ab13",
    measurementId: "G-1HB02E1RKQ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
