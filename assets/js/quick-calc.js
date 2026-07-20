/**
 * Kayıt oluşturmadan geçici prim senaryoları hesaplar.
 *
 * Görevleri:
 * - Tekli işlem kalemlerini ve aylık sabit prim değerlerini yönetir.
 * - İzin ve çalışılan tatil seçimlerine göre tahmini kazancı hesaplar.
 * - Geçici listeyi, özet değerleri ve PDF için kullanılacak verileri hazırlar.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
    DAY_TYPES,
    formatDisplayDate,
    getCurrentMonthValue,
    getMonthDayCounts,
    getMonthDays,
    isSaturday
} from "./date-utils.js";
import { formatCurrency } from "./format-utils.js";
import { isPublicHoliday } from "./holidays.js";

const quickItemSelect = document.querySelector("#quickItemSelect");
const quickQuantity = document.querySelector("#quickQuantity");
const quickUnitPrice = document.querySelector("#quickUnitPrice");
const quickSingleTotal = document.querySelector("#quickSingleTotal");
const quickSingleTotalSummary = document.querySelector("#quickSingleTotalSummary");
const quickAddSingleButton = document.querySelector("#quickAddSingleButton");
const quickSingleList = document.querySelector("#quickSingleList");
const quickMonth = document.querySelector("#quickMonth");
const quickWeekdayPrice = document.querySelector("#quickWeekdayPrice");
const quickWeekendPrice = document.querySelector("#quickWeekendPrice");
const quickHolidayPrice = document.querySelector("#quickHolidayPrice");
const quickWeekdayCount = document.querySelector("#quickWeekdayCount");
const quickWeekendCount = document.querySelector("#quickWeekendCount");
const quickHolidayCount = document.querySelector("#quickHolidayCount");
const quickLeaveCount = document.querySelector("#quickLeaveCount");
const quickWorkedHolidayCount = document.querySelector("#quickWorkedHolidayCount");
const quickPaidDayCount = document.querySelector("#quickPaidDayCount");
const quickMonthlyTotal = document.querySelector("#quickMonthlyTotal");
const quickMonthlyTotalPreview = document.querySelector("#quickMonthlyTotalPreview");
const quickGrandTotal = document.querySelector("#quickGrandTotal");
const quickLeaveSelector = document.querySelector("#quickLeaveSelector");
const quickHolidayWorkSelector = document.querySelector("#quickHolidayWorkSelector");
const quickClearButton = document.querySelector("#quickClearButton");

let currentUser = null;
let items = [];
let quickSingleItems = [];
let renderedMonth = "";
let defaultSettings = {
    weekdayFixedBonus: 0,
    weekendFixedBonus: 0,
    holidayFixedBonus: 0
};

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
        <label class="quick-day-option">
            <input type="checkbox" name="${name}" value="${day.dateText}">
            <span>
                <strong>${formatDisplayDate(day.dateText)}</strong>
                <small>${badge}${holidayText}</small>
            </span>
        </label>
    `;
}

function renderDaySelectors() {
    const monthValue = quickMonth?.value;
    if (!quickLeaveSelector || !quickHolidayWorkSelector || !monthValue) return;
    if (renderedMonth === monthValue) return;

    const days = getMonthDays(monthValue);
    const workingDays = days.filter((day) => day.type !== DAY_TYPES.HOLIDAY);
    const holidayDays = days.filter((day) => day.type === DAY_TYPES.HOLIDAY);

    quickLeaveSelector.className = workingDays.length ? "quick-day-selector" : "quick-day-selector empty-state";
    quickLeaveSelector.innerHTML = workingDays.length
        ? workingDays.map((day) => createDayOption(day, "quickLeaveDay")).join("")
        : "Bu ay izin seçilebilecek çalışma günü bulunmuyor.";

    quickHolidayWorkSelector.className = holidayDays.length ? "quick-day-selector" : "quick-day-selector empty-state";
    quickHolidayWorkSelector.innerHTML = holidayDays.length
        ? holidayDays.map((day) => createDayOption(day, "quickHolidayWorkDay")).join("")
        : "Bu ay pazar veya resmi tatil bulunmuyor.";

    quickLeaveSelector.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", updateQuickCalculation);
    });
    quickHolidayWorkSelector.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", updateQuickCalculation);
    });

    renderedMonth = monthValue;
}

function selectedItem() {
    return items.find((item) => item.id === quickItemSelect?.value);
}

function updateSingleFromItem() {
    const item = selectedItem();
    if (item && quickUnitPrice) quickUnitPrice.value = Number(item.unitPrice) || 0;
    updateQuickCalculation();
}

function calculateCurrentSingleRowTotal() {
    return (Number(quickQuantity?.value) || 0) * (Number(quickUnitPrice?.value) || 0);
}

function getSingleListTotal() {
    return quickSingleItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
}

function renderQuickSingleList() {
    if (!quickSingleList) return;

    if (!quickSingleItems.length) {
        quickSingleList.className = "list-area empty-state";
        quickSingleList.textContent = "Henüz hızlı listeye işlem eklenmedi.";
        return;
    }

    quickSingleList.className = "list-area";
    quickSingleList.innerHTML = quickSingleItems.map((item) => `
        <article class="quick-single-item">
            <div class="quick-single-info">
                <strong>${item.name}</strong>
                <span>${item.quantity} adet × ${formatCurrency(item.unitPrice)}</span>
            </div>
            <div class="quick-single-value">
                <strong>${formatCurrency(item.total)}</strong>
                <button class="small-btn danger" type="button" data-remove-quick-single="${item.id}">Sil</button>
            </div>
        </article>
    `).join("");
}

function addCurrentSingleToList() {
    const quantity = Number(quickQuantity?.value) || 0;
    const unitPrice = Number(quickUnitPrice?.value) || 0;
    const total = quantity * unitPrice;
    const name = selectedItem()?.name || "Manuel işlem";

    if (quantity <= 0 || unitPrice <= 0) {
        alert("Listeye eklemek için adet ve birim ücret 0'dan büyük olmalı.");
        return;
    }

    quickSingleItems.push({
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        quantity,
        unitPrice,
        total
    });

    if (quickItemSelect) quickItemSelect.value = "";
    if (quickQuantity) quickQuantity.value = 1;
    if (quickUnitPrice) quickUnitPrice.value = "";

    renderQuickSingleList();
    updateQuickCalculation();
}

function removeQuickSingleItem(itemId) {
    quickSingleItems = quickSingleItems.filter((item) => item.id !== itemId);
    renderQuickSingleList();
    updateQuickCalculation();
}

function calculateMonthlyTotal() {
    const monthValue = quickMonth?.value || getCurrentMonthValue();
    const { weekdayCount, weekendCount, holidayCount } = getMonthDayCounts(monthValue);
    const leaveDates = getCheckedDates(quickLeaveSelector);
    const workedHolidayDates = getCheckedDates(quickHolidayWorkSelector);
    const leaveFromWeekends = leaveDates.filter(isSaturday).length;
    const leaveFromWeekdays = leaveDates.length - leaveFromWeekends;
    const paidWeekdayCount = Math.max(weekdayCount - leaveFromWeekdays, 0);
    const paidWeekendCount = Math.max(weekendCount - leaveFromWeekends, 0);
    const workedHolidayCount = Math.min(workedHolidayDates.length, holidayCount);
    const weekdayPrice = Number(quickWeekdayPrice?.value) || 0;
    const weekendPrice = Number(quickWeekendPrice?.value) || 0;
    const holidayPrice = Number(quickHolidayPrice?.value) || 0;
    const total = (paidWeekdayCount * weekdayPrice) +
        (paidWeekendCount * weekendPrice) +
        (workedHolidayCount * holidayPrice);

    return {
        total,
        weekdayCount,
        weekendCount,
        holidayCount,
        leaveCount: leaveDates.length,
        workedHolidayCount,
        paidDayCount: paidWeekdayCount + paidWeekendCount
    };
}

function updateQuickCalculation() {
    renderDaySelectors();

    const currentSingleRowTotal = calculateCurrentSingleRowTotal();
    const singleListTotal = getSingleListTotal();
    const monthly = calculateMonthlyTotal();

    if (quickSingleTotal) quickSingleTotal.textContent = formatCurrency(currentSingleRowTotal);
    if (quickSingleTotalSummary) quickSingleTotalSummary.textContent = formatCurrency(singleListTotal);
    if (quickMonthlyTotal) quickMonthlyTotal.textContent = formatCurrency(monthly.total);
    if (quickMonthlyTotalPreview) quickMonthlyTotalPreview.textContent = formatCurrency(monthly.total);
    if (quickGrandTotal) quickGrandTotal.textContent = formatCurrency(singleListTotal + monthly.total);
    if (quickWeekdayCount) quickWeekdayCount.textContent = monthly.weekdayCount;
    if (quickWeekendCount) quickWeekendCount.textContent = monthly.weekendCount;
    if (quickHolidayCount) quickHolidayCount.textContent = monthly.holidayCount;
    if (quickLeaveCount) quickLeaveCount.textContent = `${monthly.leaveCount} gün`;
    if (quickWorkedHolidayCount) quickWorkedHolidayCount.textContent = `${monthly.workedHolidayCount} gün`;
    if (quickPaidDayCount) quickPaidDayCount.textContent = monthly.paidDayCount;
}

function renderItemOptions() {
    if (!quickItemSelect) return;

    quickItemSelect.innerHTML = `<option value="">Manuel birim ücret gir</option>`;
    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.name} - ${formatCurrency(item.unitPrice)}`;
        quickItemSelect.appendChild(option);
    });
}

function resetQuickCalc() {
    quickSingleItems = [];
    if (quickItemSelect) quickItemSelect.value = "";
    if (quickQuantity) quickQuantity.value = 1;
    if (quickUnitPrice) quickUnitPrice.value = "";
    if (quickMonth) quickMonth.value = getCurrentMonthValue();
    if (quickWeekdayPrice) quickWeekdayPrice.value = defaultSettings.weekdayFixedBonus;
    if (quickWeekendPrice) quickWeekendPrice.value = defaultSettings.weekendFixedBonus;
    if (quickHolidayPrice) quickHolidayPrice.value = defaultSettings.holidayFixedBonus;

    renderedMonth = "";
    renderQuickSingleList();
    updateQuickCalculation();
}

async function loadItems() {
    if (!currentUser) return;

    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "items"));
    items = snapshot.docs
        .map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }))
        .filter((item) => item.isActive !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));

    renderItemOptions();
}

async function loadUserSettings() {
    if (!currentUser) return;

    const userSnap = await getDoc(doc(db, "users", currentUser.uid));
    const settings = userSnap.exists() ? userSnap.data() : {};

    defaultSettings = {
        weekdayFixedBonus: Number(settings.weekdayFixedBonus ?? settings.dailyFixedBonus) || 0,
        weekendFixedBonus: Number(settings.weekendFixedBonus) || 0,
        holidayFixedBonus: Number(settings.holidayFixedBonus) || 0
    };
}

if (quickMonth && !quickMonth.value) quickMonth.value = getCurrentMonthValue();

[
    quickQuantity,
    quickUnitPrice,
    quickMonth,
    quickWeekdayPrice,
    quickWeekendPrice,
    quickHolidayPrice
].forEach((input) => {
    input?.addEventListener("input", () => {
        if (input === quickMonth) renderedMonth = "";
        updateQuickCalculation();
    });
    input?.addEventListener("change", () => {
        if (input === quickMonth) renderedMonth = "";
        updateQuickCalculation();
    });
});

quickItemSelect?.addEventListener("change", updateSingleFromItem);
quickAddSingleButton?.addEventListener("click", addCurrentSingleToList);
quickClearButton?.addEventListener("click", resetQuickCalc);
quickSingleList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-quick-single]");
    if (removeButton) removeQuickSingleItem(removeButton.dataset.removeQuickSingle);
});

renderQuickSingleList();

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) return;

    await Promise.all([loadUserSettings(), loadItems()]);
    resetQuickCalc();
});
