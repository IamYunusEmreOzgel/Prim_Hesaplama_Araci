/**
 * Tekli ve aylık toplu prim kayıtlarının eklenmesini yönetir.
 *
 * Görevleri:
 * - Form girdilerini, tarihleri, izin günlerini ve çalışılan tatilleri doğrular.
 * - Aylık sabit prim tutarını kullanıcı ayarlarına göre hesaplar.
 * - Mükerrer ve kilitli ay kontrollerini uygulayarak Firestore kayıtlarını oluşturur.
 * - Form önizlemelerini ve kullanıcı bildirimlerini günceller.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { formatCurrency } from "./main.js";
import { isPublicHoliday } from "./holidays.js";
import {
    DAY_TYPES,
    formatDisplayDate,
    formatMonthLabel,
    getAvailableMonthValues,
    getCurrentMonthValue,
    getMonthDayCounts,
    getMonthDays,
    getMonthKey,
    getTodayDateInputValue,
    isFutureDate,
    isHolidayDate,
    isSameMonth,
    isSaturday,
    isValidDateText,
    isWorkingBonusDay
} from "./date-utils.js";
import { MESSAGE_TYPES, notifyUser } from "./message.js";

const entryForm = document.querySelector("#entryForm");
const monthlyEntryForm = document.querySelector("#monthlyEntryForm");
const itemSelect = document.querySelector("#itemSelect");
const quantityInput = document.querySelector("#quantity");
const calculatedTotal = document.querySelector("#calculatedTotal");
const entryDate = document.querySelector("#entryDate");
const modeButtons = document.querySelectorAll(".mode-button");
const singleEntrySection = document.querySelector("#singleEntrySection");
const monthlyEntrySection = document.querySelector("#monthlyEntrySection");
const monthlyEntryMonth = document.querySelector("#monthlyEntryMonth");
const weekdayCountPreview = document.querySelector("#weekdayCountPreview");
const weekendCountPreview = document.querySelector("#weekendCountPreview");
const holidayCountPreview = document.querySelector("#holidayCountPreview");
const leaveDaySelector = document.querySelector("#leaveDaySelector");
const workedHolidaySelector = document.querySelector("#workedHolidaySelector");
const leaveDayCountPreview = document.querySelector("#leaveDayCountPreview");
const workedHolidayCountPreview = document.querySelector("#workedHolidayCountPreview");
const paidDayCountPreview = document.querySelector("#paidDayCountPreview");
const monthlyFixedTotalPreview = document.querySelector("#monthlyFixedTotalPreview");
const monthlyEntryWarning = document.querySelector("#monthlyEntryWarning");

let currentUser = null;
let items = [];
let entries = [];
let lockedMonths = [];
let renderedSelectorMonth = "";
let userSettings = {
    weekdayFixedBonus: 0,
    weekendFixedBonus: 0,
    holidayFixedBonus: 0
};

function selectedItem() {
    return items.find((item) => item.id === itemSelect?.value);
}

function isMonthLocked(monthValue) {
    return lockedMonths.includes(monthValue);
}

// Eski ve yeni veri modellerindeki aylık sabit prim kayıtlarını birlikte destekler.
function isMonthlyFixedEntry(entry) {
    return entry.type === "monthly-fixed" || entry.itemId === "monthly-fixed-bonus";
}

function hasMonthlyEntry(monthValue) {
    return entries.some((entry) => {
        const entryMonth = entry.month || getMonthKey(entry.date || "");
        return isMonthlyFixedEntry(entry) && entryMonth === monthValue;
    });
}

// Kullanıcı kayıt oluşturmadan önce kilitli veya daha önce hesaplanmış ayları görünür kılar.
function updateMonthlyWarning() {
    if (!monthlyEntryWarning || !monthlyEntryMonth) return;

    const monthValue = monthlyEntryMonth.value;

    if (!monthValue) {
        monthlyEntryWarning.className = "empty-state hidden";
        monthlyEntryWarning.textContent = "";
        return;
    }

    if (isMonthLocked(monthValue)) {
        monthlyEntryWarning.className = "empty-state";
        monthlyEntryWarning.textContent = `${monthValue} ayı kilitli. Bu ay için yeni kayıt eklenemez veya mevcut kayıt değiştirilemez.`;
        return;
    }

    if (hasMonthlyEntry(monthValue)) {
        monthlyEntryWarning.className = "empty-state";
        monthlyEntryWarning.textContent = `${monthValue} ayı için daha önce aylık toplu kayıt oluşturulmuş. Yeni kayıt eklersen önceki aylık toplu kayıt silinip yenisi oluşturulacak.`;
        return;
    }

    monthlyEntryWarning.className = "empty-state hidden";
    monthlyEntryWarning.textContent = "";
}

function setEntryMode(mode) {
    const isMonthly = mode === "monthly";

    modeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.mode === mode);
    });

    singleEntrySection?.classList.toggle("hidden", isMonthly);
    monthlyEntrySection?.classList.toggle("hidden", !isMonthly);
    updateMonthlyWarning();
}

function populateMonthOptions() {
    if (!monthlyEntryMonth || monthlyEntryMonth.dataset.optionsReady === "true") return;

    const currentMonth = getCurrentMonthValue();
    const selectedValue = monthlyEntryMonth.value || currentMonth;
    const monthValues = getAvailableMonthValues();

    monthlyEntryMonth.innerHTML = monthValues
        .map((monthValue) => `<option value="${monthValue}">${formatMonthLabel(monthValue)}</option>`)
        .join("");

    monthlyEntryMonth.value = monthValues.includes(selectedValue) ? selectedValue : currentMonth;
    monthlyEntryMonth.dataset.optionsReady = "true";
}

function prepareMonthSelection() {
    populateMonthOptions();

    if (monthlyEntryMonth && !monthlyEntryMonth.value) {
        monthlyEntryMonth.value = getCurrentMonthValue();
    }
}

function getCheckedDates(selector) {
    if (!selector) return [];

    return Array.from(selector.querySelectorAll("input[type='checkbox']:checked"))
        .map((input) => input.value)
        .sort();
}

function createDayOption(day, name) {
    const badge = day.type === DAY_TYPES.WEEKEND
        ? "Cumartesi"
        : day.type === DAY_TYPES.HOLIDAY
            ? "Tatil"
            : "Hafta içi";
    const holidayText = isPublicHoliday(day.dateText) ? " • Resmi tatil" : "";

    return `
        <label class="day-option">
            <input type="checkbox" name="${name}" value="${day.dateText}">
            <span>
                <strong>${formatDisplayDate(day.dateText)}</strong>
                <small>${badge}${holidayText}</small>
            </span>
        </label>
    `;
}

function renderDaySelectors(monthValue) {
    if (!leaveDaySelector || !workedHolidaySelector || !monthValue) return;
    if (renderedSelectorMonth === monthValue) return;

    const days = getMonthDays(monthValue);
    const workingDays = days.filter((day) => day.type === DAY_TYPES.WEEKDAY || day.type === DAY_TYPES.WEEKEND);
    const holidayDays = days.filter((day) => day.type === DAY_TYPES.HOLIDAY);

    leaveDaySelector.className = workingDays.length ? "day-selector" : "day-selector empty-state";
    leaveDaySelector.innerHTML = workingDays.length
        ? workingDays.map((day) => createDayOption(day, "leaveDay")).join("")
        : "Bu ay izin seçilebilecek çalışma günü bulunmuyor.";

    workedHolidaySelector.className = holidayDays.length ? "day-selector" : "day-selector empty-state";
    workedHolidaySelector.innerHTML = holidayDays.length
        ? holidayDays.map((day) => createDayOption(day, "workedHolidayDay")).join("")
        : "Bu ay pazar veya resmi tatil bulunmuyor.";

    leaveDaySelector.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", updateMonthlyPreview);
    });

    workedHolidaySelector.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", updateMonthlyPreview);
    });

    renderedSelectorMonth = monthValue;
}

// İzin seçiminin yalnızca seçili aydaki geçmiş çalışma günlerinden oluşmasını sağlar.
function validateLeaveDates(leaveDates, monthValue) {
    const invalidDates = [];
    const outOfMonthDates = [];
    const nonWorkingDates = [];
    const futureDates = [];

    leaveDates.forEach((dateText) => {
        if (!isValidDateText(dateText)) {
            invalidDates.push(dateText);
            return;
        }

        if (!isSameMonth(dateText, monthValue)) {
            outOfMonthDates.push(dateText);
            return;
        }

        if (isFutureDate(dateText)) {
            futureDates.push(dateText);
            return;
        }

        if (!isWorkingBonusDay(dateText)) {
            nonWorkingDates.push(dateText);
        }
    });

    return { invalidDates, outOfMonthDates, nonWorkingDates, futureDates };
}

// Tatil çalışması olarak sadece seçili aya ait geçmiş pazar ve resmî tatil günleri kabul edilir.
function validateWorkedHolidayDates(workedHolidayDates, monthValue) {
    const invalidDates = [];
    const outOfMonthDates = [];
    const nonHolidayDates = [];
    const futureDates = [];

    workedHolidayDates.forEach((dateText) => {
        if (!isValidDateText(dateText)) {
            invalidDates.push(dateText);
            return;
        }

        if (!isSameMonth(dateText, monthValue)) {
            outOfMonthDates.push(dateText);
            return;
        }

        if (isFutureDate(dateText)) {
            futureDates.push(dateText);
            return;
        }

        if (!isHolidayDate(dateText)) {
            nonHolidayDates.push(dateText);
        }
    });

    return { invalidDates, outOfMonthDates, nonHolidayDates, futureDates };
}

function calculateMonthlyBonus(monthValue) {
    const { weekdayCount, weekendCount, holidayCount } = getMonthDayCounts(monthValue);
    const leaveDates = getCheckedDates(leaveDaySelector);
    const workedHolidayDates = getCheckedDates(workedHolidaySelector);
    const leaveValidation = validateLeaveDates(leaveDates, monthValue);
    const workedHolidayValidation = validateWorkedHolidayDates(workedHolidayDates, monthValue);

    const validLeaveDates = leaveDates.filter((dateText) => {
        return isValidDateText(dateText) &&
            isSameMonth(dateText, monthValue) &&
            !isFutureDate(dateText) &&
            isWorkingBonusDay(dateText);
    });

    const validWorkedHolidayDates = workedHolidayDates.filter((dateText) => {
        return isValidDateText(dateText) &&
            isSameMonth(dateText, monthValue) &&
            !isFutureDate(dateText) &&
            isHolidayDate(dateText);
    });

    const leaveFromWeekends = validLeaveDates.filter(isSaturday).length;
    const leaveFromWeekdays = validLeaveDates.length - leaveFromWeekends;
    const paidWeekdayCount = Math.max(weekdayCount - leaveFromWeekdays, 0);
    const paidWeekendCount = Math.max(weekendCount - leaveFromWeekends, 0);
    const workedHolidayCount = validWorkedHolidayDates.length;
    // Hatalı veya yinelenen seçimlerin aylık tatil gününden fazla ödeme üretmesini önler.
    const safeWorkedHolidayCount = Math.min(Math.max(workedHolidayCount, 0), holidayCount);
    const weekdayUnitPrice = Number(userSettings.weekdayFixedBonus) || 0;
    const weekendUnitPrice = Number(userSettings.weekendFixedBonus) || 0;
    const holidayUnitPrice = Number(userSettings.holidayFixedBonus) || 0;
    const total = (paidWeekdayCount * weekdayUnitPrice) +
        (paidWeekendCount * weekendUnitPrice) +
        (safeWorkedHolidayCount * holidayUnitPrice);

    return {
        weekdayCount,
        weekendCount,
        holidayCount,
        leaveDates: validLeaveDates,
        workedHolidayDates: validWorkedHolidayDates,
        leaveValidation,
        workedHolidayValidation,
        leaveDayCount: validLeaveDates.length,
        paidWeekdayCount,
        paidWeekendCount,
        workedHolidayCount,
        safeWorkedHolidayCount,
        weekdayUnitPrice,
        weekendUnitPrice,
        holidayUnitPrice,
        total
    };
}

function updateSinglePreview() {
    const quantity = Number(quantityInput?.value) || 0;
    const item = selectedItem();
    const unitPrice = Number(item?.unitPrice) || 0;

    if (calculatedTotal) {
        calculatedTotal.textContent = formatCurrency(quantity * unitPrice);
    }
}

function updateMonthlyPreview() {
    prepareMonthSelection();

    const monthValue = monthlyEntryMonth?.value;
    renderDaySelectors(monthValue);

    const monthlyBonus = calculateMonthlyBonus(monthValue);
    const paidDayCount = monthlyBonus.paidWeekdayCount + monthlyBonus.paidWeekendCount;

    if (weekdayCountPreview) weekdayCountPreview.textContent = monthlyBonus.weekdayCount;
    if (weekendCountPreview) weekendCountPreview.textContent = monthlyBonus.weekendCount;
    if (holidayCountPreview) holidayCountPreview.textContent = monthlyBonus.holidayCount;
    if (leaveDayCountPreview) leaveDayCountPreview.textContent = `${monthlyBonus.leaveDayCount} gün`;
    if (workedHolidayCountPreview) workedHolidayCountPreview.textContent = `${monthlyBonus.safeWorkedHolidayCount} gün`;
    if (paidDayCountPreview) paidDayCountPreview.textContent = paidDayCount;
    if (monthlyFixedTotalPreview) monthlyFixedTotalPreview.textContent = formatCurrency(monthlyBonus.total);

    updateMonthlyWarning();
}

function renderItemSelect() {
    if (!itemSelect) return;

    itemSelect.innerHTML = `<option value="">Prim kalemi seç</option>`;

    if (!items.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Önce prim kalemi ekleyin";
        option.disabled = true;
        itemSelect.appendChild(option);
        updateSinglePreview();
        return;
    }

    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.name} - ${formatCurrency(item.unitPrice)}`;
        itemSelect.appendChild(option);
    });

    updateSinglePreview();
}

async function loadItems() {
    if (!currentUser || !itemSelect) return;

    try {
        const snapshot = await getDocs(collection(db, "users", currentUser.uid, "items"));
        items = [];

        snapshot.forEach((itemDoc) => {
            const item = { id: itemDoc.id, ...itemDoc.data() };
            if (item.isActive !== false) items.push(item);
        });

        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderItemSelect();
    } catch (error) {
        console.error("Prim kalemleri yüklenirken hata oluştu:", error);
        itemSelect.innerHTML = `<option value="">Prim kalemleri yüklenemedi</option>`;
    }
}

async function loadEntries() {
    if (!currentUser) return;

    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "entries"));
    entries = [];
    snapshot.forEach((entryDoc) => entries.push({ id: entryDoc.id, ...entryDoc.data() }));
    updateMonthlyWarning();
}

async function loadUserSettings() {
    if (!currentUser) return;

    const userSnap = await getDoc(doc(db, "users", currentUser.uid));

    if (!userSnap.exists()) {
        userSettings = { weekdayFixedBonus: 0, weekendFixedBonus: 0, holidayFixedBonus: 0 };
        lockedMonths = [];
        updateMonthlyPreview();
        return;
    }

    const settings = userSnap.data();
    userSettings = {
        weekdayFixedBonus: Number(settings.weekdayFixedBonus ?? settings.dailyFixedBonus) || 0,
        weekendFixedBonus: Number(settings.weekendFixedBonus) || 0,
        holidayFixedBonus: Number(settings.holidayFixedBonus) || 0
    };
    lockedMonths = Array.isArray(settings.lockedMonths) ? settings.lockedMonths : [];
    updateMonthlyPreview();
}

async function deleteExistingMonthlyEntry(monthValue) {
    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "entries"));
    const deleteTasks = [];

    snapshot.forEach((entryDoc) => {
        const entry = entryDoc.data();
        const entryMonth = entry.month || getMonthKey(entry.date || "");

        if (isMonthlyFixedEntry(entry) && entryMonth === monthValue) {
            deleteTasks.push(deleteDoc(doc(db, "users", currentUser.uid, "entries", entryDoc.id)));
        }
    });

    await Promise.all(deleteTasks);
    return deleteTasks.length;
}

function showLeaveDateValidationError(monthlyBonus) {
    const { invalidDates, outOfMonthDates, nonWorkingDates, futureDates } = monthlyBonus.leaveValidation;

    if (invalidDates.length) {
        notifyUser(`Geçersiz izin tarihi formatı: ${invalidDates.join(", ")}.`, MESSAGE_TYPES.ERROR);
        return true;
    }
    if (outOfMonthDates.length) {
        notifyUser(`İzin tarihleri seçilen ay içinde olmalı: ${outOfMonthDates.join(", ")}`, MESSAGE_TYPES.ERROR);
        return true;
    }
    if (futureDates.length) {
        notifyUser(`Gelecek tarihler izinli gün olarak seçilemez: ${futureDates.join(", ")}`, MESSAGE_TYPES.ERROR);
        return true;
    }
    if (nonWorkingDates.length) {
        notifyUser(`Pazar veya resmi tatil olan günler izinli gün olarak seçilemez: ${nonWorkingDates.join(", ")}`, MESSAGE_TYPES.ERROR);
        return true;
    }

    return false;
}

function showWorkedHolidayDateValidationError(monthlyBonus) {
    const { invalidDates, outOfMonthDates, nonHolidayDates, futureDates } = monthlyBonus.workedHolidayValidation;

    if (invalidDates.length) {
        notifyUser(`Geçersiz resmi tatil çalışma tarihi formatı: ${invalidDates.join(", ")}.`, MESSAGE_TYPES.ERROR);
        return true;
    }
    if (outOfMonthDates.length) {
        notifyUser(`Resmi tatil çalışma tarihleri seçilen ay içinde olmalı: ${outOfMonthDates.join(", ")}`, MESSAGE_TYPES.ERROR);
        return true;
    }
    if (futureDates.length) {
        notifyUser(`Gelecek tarihler resmi tatil çalışması olarak seçilemez: ${futureDates.join(", ")}`, MESSAGE_TYPES.ERROR);
        return true;
    }
    if (nonHolidayDates.length) {
        notifyUser(`Resmi tatil çalışması tarihi pazar veya resmi tatil olmalı: ${nonHolidayDates.join(", ")}`, MESSAGE_TYPES.ERROR);
        return true;
    }

    return false;
}

if (entryDate && !entryDate.value) entryDate.value = getTodayDateInputValue();
prepareMonthSelection();

quantityInput?.addEventListener("input", updateSinglePreview);
itemSelect?.addEventListener("change", updateSinglePreview);
monthlyEntryMonth?.addEventListener("change", () => {
    renderedSelectorMonth = "";
    updateMonthlyPreview();
});
modeButtons.forEach((button) => button.addEventListener("click", () => setEntryMode(button.dataset.mode)));

if (entryForm) {
    entryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!currentUser) return;

        const item = selectedItem();
        const quantity = Number(quantityInput.value) || 0;
        const date = entryDate.value;
        const entryMonth = getMonthKey(date);

        if (!item || quantity <= 0 || !isValidDateText(date)) {
            notifyUser("Prim kalemi, adet ve geçerli bir tarih zorunludur.", MESSAGE_TYPES.ERROR);
            return;
        }
        if (isFutureDate(date)) {
            notifyUser("Henüz gelmemiş bir tarih için kayıt oluşturulamaz.", MESSAGE_TYPES.ERROR);
            return;
        }
        if (isMonthLocked(entryMonth)) {
            notifyUser(`${entryMonth} ayı kilitli olduğu için bu aya kayıt eklenemez.`, MESSAGE_TYPES.ERROR);
            return;
        }

        const unitPrice = Number(item.unitPrice) || 0;

        await addDoc(collection(db, "users", currentUser.uid, "entries"), {
            type: "single",
            itemId: item.id,
            itemName: item.name,
            quantity,
            unitPrice,
            total: quantity * unitPrice,
            date,
            createdAt: serverTimestamp()
        });

        entryForm.reset();
        entryDate.value = getTodayDateInputValue();
        updateSinglePreview();
        await loadEntries();
        notifyUser("Tekli işlem kaydedildi.", MESSAGE_TYPES.SUCCESS);
    });
}

if (monthlyEntryForm) {
    monthlyEntryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!currentUser) return;

        prepareMonthSelection();
        const monthValue = monthlyEntryMonth.value;
        const currentMonth = getCurrentMonthValue();

        if (!monthValue) {
            notifyUser("Ay seçimi zorunludur.", MESSAGE_TYPES.ERROR);
            return;
        }
        if (monthValue > currentMonth) {
            notifyUser("Henüz gelmemiş bir ay için kayıt oluşturulamaz.", MESSAGE_TYPES.ERROR);
            return;
        }
        if (isMonthLocked(monthValue)) {
            notifyUser(`${monthValue} ayı kilitli olduğu için aylık toplu kayıt oluşturulamaz.`, MESSAGE_TYPES.ERROR);
            return;
        }

        const monthlyBonus = calculateMonthlyBonus(monthValue);

        if (showLeaveDateValidationError(monthlyBonus) || showWorkedHolidayDateValidationError(monthlyBonus)) {
            updateMonthlyPreview();
            return;
        }
        if (monthlyBonus.workedHolidayCount !== monthlyBonus.safeWorkedHolidayCount) {
            notifyUser("Resmi tatilde çalışılan gün sayısı, o aydaki tatil günlerinden fazla olamaz.", MESSAGE_TYPES.ERROR);
            updateMonthlyPreview();
            return;
        }
        if (monthlyBonus.total <= 0) {
            notifyUser("Aylık toplu kayıt için önce Ayarlar sayfasından günlük prim değerlerini gir veya prim hesabına dahil çalışma günü olduğundan emin ol.", MESSAGE_TYPES.ERROR);
            return;
        }

        const deletedCount = await deleteExistingMonthlyEntry(monthValue);

        await addDoc(collection(db, "users", currentUser.uid, "entries"), {
            type: "monthly-fixed",
            itemId: "monthly-fixed-bonus",
            itemName: "Aylık Toplu Sabit Prim",
            quantity: monthlyBonus.paidWeekdayCount + monthlyBonus.paidWeekendCount + monthlyBonus.safeWorkedHolidayCount,
            weekdayCount: monthlyBonus.weekdayCount,
            weekendCount: monthlyBonus.weekendCount,
            holidayCount: monthlyBonus.holidayCount,
            leaveDayCount: monthlyBonus.leaveDayCount,
            leaveDates: monthlyBonus.leaveDates,
            paidWeekdayCount: monthlyBonus.paidWeekdayCount,
            paidWeekendCount: monthlyBonus.paidWeekendCount,
            workedHolidayCount: monthlyBonus.safeWorkedHolidayCount,
            workedHolidayDates: monthlyBonus.workedHolidayDates,
            weekdayUnitPrice: monthlyBonus.weekdayUnitPrice,
            weekendUnitPrice: monthlyBonus.weekendUnitPrice,
            holidayUnitPrice: monthlyBonus.holidayUnitPrice,
            unitPrice: 0,
            total: monthlyBonus.total,
            date: `${monthValue}-01`,
            month: monthValue,
            createdAt: serverTimestamp()
        });

        await loadEntries();
        notifyUser(
            deletedCount > 0
                ? "Önceki aylık toplu kayıt silindi ve yeni kayıt eklendi."
                : "Aylık toplu kayıt eklendi.",
            MESSAGE_TYPES.SUCCESS
        );
        updateMonthlyPreview();
    });
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) return;

    await loadItems();
    await loadUserSettings();
    await loadEntries();
});
