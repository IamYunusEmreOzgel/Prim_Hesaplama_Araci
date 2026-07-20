/**
 * Firebase Authentication üzerinden kullanıcı oturumunu yönetir.
 *
 * Görevleri:
 * - Giriş formunu doğrular ve Firebase hata kodlarını kullanıcı mesajlarına dönüştürür.
 * - Oturum durumuna göre giriş ve ana sayfa yönlendirmelerini gerçekleştirir.
 * - Güvenli çıkış işlemini yürütür.
 */

import { auth } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { createInlineMessage, MESSAGE_TYPES, notifyUser } from "./message.js";

const loginForm = document.querySelector("#loginForm");
const logoutButton = document.querySelector("#logoutButton");
const authMessage = document.querySelector("#authMessage");
const loginButton = loginForm?.querySelector("button[type='submit']");
const showAuthMessage = createInlineMessage(authMessage, MESSAGE_TYPES.ERROR);

const isLoginPage = window.location.pathname.includes("/pages/login.html");

function getLoginPath() {
    return window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
}

function getHomePath() {
    return window.location.pathname.includes("/pages/") ? "../index.html" : "index.html";
}

function getFirebaseErrorMessage(error) {
    switch (error.code) {
        case "auth/invalid-email":
            return "E-posta formatı hatalı.";
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "E-posta veya şifre hatalı.";
        case "auth/too-many-requests":
            return "Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.";
        case "auth/network-request-failed":
            return "Ağ bağlantısı hatası. İnternet bağlantını kontrol et.";
        case "auth/unauthorized-domain":
            return "Bu alan adı Firebase Authentication için yetkili değil. Firebase Console > Authentication > Settings > Authorized domains kısmına iamyunusemreozgel.github.io eklenmeli.";
        default:
            return `Giriş başarısız: ${error.code || "Bilinmeyen hata"}`;
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user && !isLoginPage) {
        window.location.href = getLoginPath();
        return;
    }

    if (user && isLoginPage) {
        window.location.href = getHomePath();
    }
});

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailInput = document.querySelector("#email");
        const passwordInput = document.querySelector("#password");
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showAuthMessage("E-posta ve şifre zorunludur.");
            return;
        }

        try {
            if (loginButton) {
                loginButton.disabled = true;
                loginButton.textContent = "Giriş yapılıyor...";
            }

            showAuthMessage("Giriş yapılıyor...", MESSAGE_TYPES.SUCCESS);
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = "../index.html";
        } catch (error) {
            console.error("Firebase giriş hatası:", error);
            showAuthMessage(getFirebaseErrorMessage(error));
        } finally {
            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent = "Giriş Yap";
            }
        }
    });
}

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "login.html";
        } catch (error) {
            console.error(error);
            notifyUser("Çıkış yapılırken hata oluştu.", MESSAGE_TYPES.ERROR);
        }
    });
}
