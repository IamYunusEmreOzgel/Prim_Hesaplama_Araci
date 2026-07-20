/**
 * Prim kayıtlarını aylık takvim görünümünde sunar.
 *
 * Görevleri:
 * - Seçilen aya ait kayıtları Firestore'dan yükler ve günlere göre gruplar.
 * - Günlük prim toplamlarını ve kayıt ayrıntılarını hesaplayarak ekrana yansıtır.
 * - Ay seçimi ve takvim gezinme işlemlerini yönetir.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
    formatCurrency,
    getEntryMeta,
    getEntryMonth,
    getTodayDateInputValue,
    isMonthlyFixedEntry,
    renderListItem
} from "./main.js";
import { isPublicHoliday } from "./holidays.js";

const calendarMonth = document.querySelector("#calendarMonth");
const calendarGrid = document.querySelector("#calendarGrid");
const calendarMonthTotal = document.querySelector("#calendarMonthTotal");
const calendarDailyTotal = document.querySelector("#calendarDailyTotal");
const calendarMonthlyFixedTotal = document.querySelector("#calendarMonthlyFixedTotal");
const calendarActiveDayCount = document.querySelector("#calendarActiveDayCount");
const calendarBestDay = document.querySelector("#calendarBestDay");
const calendarLockStatus = document.querySelector("#calendarLockStatus");
const selectedDayTitle = document.querySelector("#selectedDayTitle");
const selectedDaySummary = document.querySelector("#selectedDaySummary");
const selectedDayList = document.querySelector("#selectedDayList");

let currentUser = null;
let entries = [];
let lockedMonths = [];
let selectedDate = "";

function getCurrentMonthValue() {
    return getTodayDateInputValue().slice(0, 7);
}

function getEntryDate(entry) {
    return entry.date || `${getEntryMonth(entry)}-01`;
}

function isDateHoliday(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getDay() === 0 || isPublicHoliday(dateText);
}

function isDateSaturday(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(year, month - 1, day).getDay() === 6;
}

function getMonthEntries(monthValue) {
    return entries.filter((entry) => getEntryMonth(entry) === monthValue);
}

function getDailyEntries(monthValue) {
    return getMonthEntries(monthValue).filter((entry) => !isMonthlyFixedEntry(entry));
}

function getMonthlyFixedEntries(monthValue) {
    return getMonthEntries(monthValue).filter((entry) => isMonthlyFixedEntry(entry));
}

function getMonthDayInfos(monthValue) {
    const [year, month] = monthValue.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const days = [];

    for (let day = 1; day <= lastDay; day += 1) {
        const dateText = `${monthValue}-${String(day).padStart(2, "0")}`;
        const holiday = isDateHoliday(dateText);
        const saturday = isDateSaturday(dateText);
        let type = "weekday";

        if (holiday) {
            type = "holiday";
        } else if (saturday) {
            type = "weekend";
        }

        days.push({ dateText, type });
    }

    return days;
}

function getFallbackLeaveDates(entry, dayInfos) {
    const leaveCount = Number(entry.leaveDayCount) || 0;
    if (!leaveCount) return [];

    return dayInfos
        .filter((day) => day.type === "weekday" || day.type === "weekend")
        .slice(-leaveCount)
        .map((day) => day.dateText);
}

function getFallbackWorkedHolidayDates(entry, dayInfos) {
    const holidayWorkCount = Number(entry.workedHolidayCount) || 0;
    if (!holidayWorkCount) return [];

    return dayInfos
        .filter((day) => day.type === "holiday")
        .slice(0, holidayWorkCount)
        .map((day) => day.dateText);
}

function createVirtualMonthlyEntries(monthValue) {
    const dayInfos = getMonthDayInfos(monthValue);
    const virtualEntries = [];

    getMonthlyFixedEntries(monthValue).forEach((entry) => {
        const leaveDates = Array.isArray(entry.leaveDates) && entry.leaveDates.length
            ? entry.leaveDates
            : getFallbackLeaveDates(entry, dayInfos);
        const leaveDateSet = new Set(leaveDates);
        const holidayWorkDates = Array.isArray(entry.workedHolidayDates) && entry.workedHolidayDates.length
            ? entry.workedHolidayDates
            : getFallbackWorkedHolidayDates(entry, dayInfos);
        const holidayWorkDateSet = new Set(holidayWorkDates);
        const weekdayUnitPrice = Number(entry.weekdayUnitPrice) || 0;
        const weekendUnitPrice = Number(entry.weekendUnitPrice) || 0;
        const holidayUnitPrice = Number(entry.holidayUnitPrice) || 0;

        dayInfos.forEach((day) => {
            let total = 0;
            let title = "Aylık Sabit Prim";
            let meta = "Sanal günlük dağıtım";

            if (leaveDateSet.has(day.dateText)) {
                title = "Aylık Sabit Prim - İzinli Gün";
                meta = "İzinli gün • Sabit prim yok";
            } else if (day.type === "holiday") {
                if (!holidayWorkDateSet.has(day.dateText)) return;
                total = holidayUnitPrice;
                title = "Aylık Sabit Prim - Resmi Tatil Çalışması";
                meta = Array.isArray(entry.workedHolidayDates) && entry.workedHolidayDates.length
                    ? "Resmi tatil çalışması • Tarih kullanıcı tarafından girildi"
                    : "Resmi tatil çalışması • Otomatik dağıtım";
            } else if (day.type === "weekend") {
                total = weekendUnitPrice;
                title = "Aylık Sabit Prim - Cumartesi";
                meta = "Cumartesi sabit primi • Sanal dağıtım";
            } else {
                total = weekdayUnitPrice;
                title = "Aylık Sabit Prim - Hafta İçi";
                meta = "Hafta içi sabit primi • Sanal dağıtım";
            }

            virtualEntries.push({
                id: `${entry.id}-${day.dateText}`,
                type: "virtual-monthly-day",
                itemName: title,
                date: day.dateText,
                quantity: total > 0 ? 1 : 0,
                unitPrice: total,
                total,
                virtualMeta: meta,
                sourceMonthlyEntryId: entry.id
            });
        });
    });

    return virtualEntries;
}

function getCalendarEntries(monthValue) {
    return [
        ...getDailyEntries(monthValue),
        ...createVirtualMonthlyEntries(monthValue)
    ];
}

function groupCalendarEntries(monthValue) {
    const grouped = new Map();

    getCalendarEntries(monthValue).forEach((entry) => {
        const date = getEntryDate(entry);
        const current = grouped.get(date) || { total: 0, count: 0, entries: [] };
        current.total += Number(entry.total) || 0;
        current.count += 1;
        current.entries.push(entry);
        grouped.set(date, current);
    });

    return grouped;
}

function getDayClass(dateText, total) {
    const today = getTodayDateInputValue();
    const isHoliday = isDateHoliday(dateText);
    const classes = ["calendar-day"];

    if (total > 0) classes.push("has-prime");
    if (isHoliday) classes.push("holiday-day");
    if (dateText === today) classes.push("today-day");
    if (dateText === selectedDate) classes.push("active");

    return classes.join(" ");
}

function updateSummary(monthValue, calendarGroups) {
    const monthEntries = getMonthEntries(monthValue);
    const monthlyFixedEntries = getMonthlyFixedEntries(monthValue);
    const monthTotal = monthEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
    const calendarShownTotal = Array.from(calendarGroups.values()).reduce((sum, day) => sum + (Number(day.total) || 0), 0);
    const monthlyFixedTotal = monthlyFixedEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
    const activeDays = Array.from(calendarGroups.values()).filter((day) => day.total > 0);
    const bestDay = activeDays.sort((a, b) => b.total - a.total)[0];
    const bestDayDate = bestDay ? Array.from(calendarGroups.entries()).find(([, value]) => value === bestDay)?.[0] : "";

    if (calendarMonthTotal) calendarMonthTotal.textContent = formatCurrency(monthTotal);
    if (calendarDailyTotal) calendarDailyTotal.textContent = formatCurrency(calendarShownTotal);
    if (calendarMonthlyFixedTotal) calendarMonthlyFixedTotal.textContent = formatCurrency(monthlyFixedTotal);
    if (calendarActiveDayCount) calendarActiveDayCount.textContent = activeDays.length;
    if (calendarBestDay) calendarBestDay.textContent = bestDay ? `${bestDayDate.slice(8, 10)} • ${formatCurrency(bestDay.total)}` : "-";
    if (calendarLockStatus) calendarLockStatus.textContent = lockedMonths.includes(monthValue) ? "Kilitli" : "Açık";
}

function renderSelectedDay(dateText) {
    if (!selectedDayTitle || !selectedDaySummary || !selectedDayList || !calendarMonth) return;

    const monthValue = calendarMonth.value || getCurrentMonthValue();
    const calendarEntries = getCalendarEntries(monthValue);
    const dayEntries = calendarEntries.filter((entry) => getEntryDate(entry) === dateText);
    const dayTotal = dayEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
    const isHoliday = isDateHoliday(dateText);

    selectedDayTitle.textContent = `${dateText} Detayı`;
    selectedDaySummary.innerHTML = `
        <span>${isHoliday ? "Pazar / resmi tatil" : "Seçilen Gün Toplamı"}</span>
        <strong>${formatCurrency(dayTotal)}</strong>
    `;

    if (!dayEntries.length) {
        selectedDayList.className = "list-area empty-state";
        selectedDayList.textContent = "Bu gün için prim kaydı bulunmuyor.";
        return;
    }

    selectedDayList.className = "list-area";
    selectedDayList.innerHTML = dayEntries.map((entry) => renderListItem({
        title: entry.itemName || "Prim işlemi",
        meta: entry.virtualMeta || getEntryMeta(entry),
        value: formatCurrency(entry.total || 0)
    })).join("");
}

// Ayın ilk gününden önceki boş hücreler haftalık takvim hizasını korur.
function renderCalendar() {
    if (!calendarGrid || !calendarMonth) return;

    const monthValue = calendarMonth.value || getCurrentMonthValue();
    const [year, month] = monthValue.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const firstDayIndex = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const lastDay = new Date(year, month, 0).getDate();
    const calendarGroups = groupCalendarEntries(monthValue);
    const today = getTodayDateInputValue();

    if (!selectedDate || selectedDate.slice(0, 7) !== monthValue) {
        selectedDate = today.slice(0, 7) === monthValue ? today : `${monthValue}-01`;
    }

    updateSummary(monthValue, calendarGroups);

    let html = "";

    for (let i = 0; i < firstDayIndex; i += 1) {
        html += `<div class="calendar-empty-day"></div>`;
    }

    for (let day = 1; day <= lastDay; day += 1) {
        const dateText = `${monthValue}-${String(day).padStart(2, "0")}`;
        const group = calendarGroups.get(dateText) || { total: 0, count: 0, entries: [] };
        const isHoliday = isDateHoliday(dateText);
        const metaText = group.count > 0 ? `${group.count} kalem` : isHoliday ? "Tatil" : "Kayıt yok";

        html += `
            <button class="${getDayClass(dateText, group.total)}" type="button" data-date="${dateText}">
                <span class="calendar-day-number">${day}</span>
                <span class="calendar-day-total">${formatCurrency(group.total)}</span>
                <span class="calendar-day-meta">${metaText}</span>
            </button>
        `;
    }

    calendarGrid.innerHTML = html;
    renderSelectedDay(selectedDate);
}

async function loadUserSettings() {
    if (!currentUser) return;

    const userSnap = await getDoc(doc(db, "users", currentUser.uid));
    const settings = userSnap.exists() ? userSnap.data() : {};
    lockedMonths = Array.isArray(settings.lockedMonths) ? settings.lockedMonths : [];
}

async function loadEntries() {
    if (!currentUser) return;

    const entriesQuery = query(collection(db, "users", currentUser.uid, "entries"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(entriesQuery);

    entries = [];
    snapshot.forEach((entryDoc) => {
        entries.push({ id: entryDoc.id, ...entryDoc.data() });
    });

    renderCalendar();
}

if (calendarMonth) {
    calendarMonth.max = getCurrentMonthValue();
    calendarMonth.value = getCurrentMonthValue();
    calendarMonth.addEventListener("change", () => {
        if (calendarMonth.value > getCurrentMonthValue()) {
            calendarMonth.value = getCurrentMonthValue();
        }

        selectedDate = "";
        renderCalendar();
    });
}

if (calendarGrid) {
    calendarGrid.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-date]");
        if (!button) return;

        selectedDate = button.dataset.date;
        renderCalendar();
    });
}

// Kullanıcı doğrulandıktan sonra yalnızca o kullanıcıya ait kayıtlar yüklenir.
onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
        await loadUserSettings();
        await loadEntries();
    }
});
