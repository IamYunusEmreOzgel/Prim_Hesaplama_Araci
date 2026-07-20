/**
 * Kullanıcıya ait maaş, sabit prim ve uygulama ayarlarını yönetir.
 *
 * Görevleri:
 * - Ayar değerlerini Firestore'dan yükler ve doğrulayarak kaydeder.
 * - Ay kilitleme ve kullanıcı profil bilgilerini günceller.
 * - Ayar formunun durumunu ve kullanıcı geri bildirimlerini yönetir.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { createInlineMessage, MESSAGE_TYPES } from "./message.js";

const settingsForm = document.querySelector("#settingsForm");
const baseSalaryInput = document.querySelector("#baseSalary");
const weekdayFixedBonusInput = document.querySelector("#weekdayFixedBonus");
const weekendFixedBonusInput = document.querySelector("#weekendFixedBonus");
const holidayFixedBonusInput = document.querySelector("#holidayFixedBonus");
const currencyInput = document.querySelector("#currency");
const settingsMessage = document.querySelector("#settingsMessage");
const lockMonthInput = document.querySelector("#lockMonthInput");
const lockMonthButton = document.querySelector("#lockMonthButton");
const unlockMonthButton = document.querySelector("#unlockMonthButton");
const lockedMonthsList = document.querySelector("#lockedMonthsList");
const showSettingsMessage = createInlineMessage(settingsMessage, MESSAGE_TYPES.SUCCESS);

let currentUser = null;
let lockedMonths = [];

function getUserDocRef() {
    return doc(db, "users", currentUser.uid);
}

// Kilitli aylar kullanıcıya okunabilir ay adıyla gösterilir; veri tarafında YYYY-MM biçimi korunur.
function renderLockedMonths() {
    if (!lockedMonthsList) return;

    const sortedLockedMonths = [...lockedMonths].sort().reverse();

    if (!sortedLockedMonths.length) {
        lockedMonthsList.className = "list-area empty-state";
        lockedMonthsList.textContent = "Kilitli ay bulunmuyor.";
        return;
    }

    lockedMonthsList.className = "list-area";
    lockedMonthsList.innerHTML = sortedLockedMonths.map((month) => `
        <article class="list-item">
            <div>
                <strong>${month}</strong>
                <span>Bu ay kilitli. Kayıt ekleme, düzenleme ve silme engellenir.</span>
            </div>
            <div class="item-actions">
                <button class="small-btn" type="button" data-unlock-month="${month}">Kilidi Kaldır</button>
            </div>
        </article>
    `).join("");
}

async function saveLockedMonths(message) {
    if (!currentUser) return;

    await setDoc(getUserDocRef(), {
        lockedMonths,
        updatedAt: serverTimestamp()
    }, { merge: true });

    renderLockedMonths();
    if (message) showSettingsMessage(message);
}

async function lockSelectedMonth() {
    if (!currentUser || !lockMonthInput) return;

    const monthValue = lockMonthInput.value;

    if (!monthValue) {
        showSettingsMessage("Kilitlemek için ay seç.", MESSAGE_TYPES.ERROR);
        return;
    }

    if (!lockedMonths.includes(monthValue)) {
        lockedMonths.push(monthValue);
    }

    await saveLockedMonths(`${monthValue} ayı kilitlendi.`);
}

async function unlockSelectedMonth(monthValueFromButton = "") {
    if (!currentUser || !lockMonthInput) return;

    const monthValue = monthValueFromButton || lockMonthInput.value;

    if (!monthValue) {
        showSettingsMessage("Kilidi kaldırmak için ay seç.", MESSAGE_TYPES.ERROR);
        return;
    }

    lockedMonths = lockedMonths.filter((month) => month !== monthValue);
    await saveLockedMonths(`${monthValue} ayının kilidi kaldırıldı.`);
}

async function loadSettings() {
    if (!currentUser) return;

    const userSnap = await getDoc(getUserDocRef());

    if (!userSnap.exists()) {
        if (currencyInput) currencyInput.value = "TRY";
        lockedMonths = [];
        renderLockedMonths();
        return;
    }

    const settings = userSnap.data();

    if (baseSalaryInput) baseSalaryInput.value = settings.baseSalary ?? "";
    if (weekdayFixedBonusInput) weekdayFixedBonusInput.value = settings.weekdayFixedBonus ?? settings.dailyFixedBonus ?? "";
    if (weekendFixedBonusInput) weekendFixedBonusInput.value = settings.weekendFixedBonus ?? "";
    if (holidayFixedBonusInput) holidayFixedBonusInput.value = settings.holidayFixedBonus ?? "";
    if (currencyInput) currencyInput.value = settings.currency || "TRY";

    lockedMonths = Array.isArray(settings.lockedMonths) ? settings.lockedMonths : [];
    renderLockedMonths();
}

if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!currentUser) return;

        const baseSalary = Number(baseSalaryInput.value) || 0;
        const weekdayFixedBonus = Number(weekdayFixedBonusInput.value) || 0;
        const weekendFixedBonus = Number(weekendFixedBonusInput.value) || 0;
        const holidayFixedBonus = Number(holidayFixedBonusInput.value) || 0;
        const currency = currencyInput.value || "TRY";

        if (baseSalary < 0 || weekdayFixedBonus < 0 || weekendFixedBonus < 0 || holidayFixedBonus < 0) {
            showSettingsMessage("Maaş ve günlük prim değerleri negatif olamaz.", MESSAGE_TYPES.ERROR);
            return;
        }

        try {
            showSettingsMessage("Ayarlar kaydediliyor...", MESSAGE_TYPES.INFO);

            await setDoc(getUserDocRef(), {
                email: currentUser.email,
                baseSalary,
                weekdayFixedBonus,
                weekendFixedBonus,
                holidayFixedBonus,
                currency,
                lockedMonths,
                updatedAt: serverTimestamp()
            }, { merge: true });

            showSettingsMessage("Ayarlar kaydedildi.");
        } catch (error) {
            console.error(error);
            showSettingsMessage("Ayarlar kaydedilirken hata oluştu.", MESSAGE_TYPES.ERROR);
        }
    });
}

if (lockMonthButton) {
    lockMonthButton.addEventListener("click", () => {
        lockSelectedMonth().catch((error) => {
            console.error(error);
            showSettingsMessage("Ay kilitlenirken hata oluştu.", MESSAGE_TYPES.ERROR);
        });
    });
}

if (unlockMonthButton) {
    unlockMonthButton.addEventListener("click", () => {
        unlockSelectedMonth().catch((error) => {
            console.error(error);
            showSettingsMessage("Ay kilidi kaldırılırken hata oluştu.", MESSAGE_TYPES.ERROR);
        });
    });
}

if (lockedMonthsList) {
    lockedMonthsList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-unlock-month]");
        if (!button) return;

        unlockSelectedMonth(button.dataset.unlockMonth).catch((error) => {
            console.error(error);
            showSettingsMessage("Ay kilidi kaldırılırken hata oluştu.", MESSAGE_TYPES.ERROR);
        });
    });
}

onAuthStateChanged(auth, (user) => {
    currentUser = user;

    if (user) {
        loadSettings().catch((error) => {
            console.error(error);
            showSettingsMessage("Ayarlar yüklenirken hata oluştu.", MESSAGE_TYPES.ERROR);
        });
    }
});
