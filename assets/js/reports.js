/**
 * Prim kayıtlarının raporlanmasını ve geçmiş kayıt yönetimini gerçekleştirir.
 *
 * Görevleri:
 * - Kayıtları tarih, ay ve prim kalemine göre filtreler ve sıralar.
 * - Rapor özetlerini ve liste görünümünü oluşturur.
 * - Kilitli ay kurallarını gözeterek kayıt düzenleme ve silme işlemlerini yürütür.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    updateDoc
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

const filterForm = document.querySelector("#filterForm");
const reportList = document.querySelector("#reportList");
const reportTotal = document.querySelector("#reportTotal");
const reportCount = document.querySelector("#reportCount");
const reportItemSelect = document.querySelector("#reportItemSelect");
const reportMonth = document.querySelector("#reportMonth");
const startDate = document.querySelector("#startDate");
const endDate = document.querySelector("#endDate");
const clearFiltersButton = document.querySelector("#clearFiltersButton");
const editEntryModal = document.querySelector("#editEntryModal");
const editEntryForm = document.querySelector("#editEntryForm");
const closeEditModalButton = document.querySelector("#closeEditModalButton");
const cancelEditModalButton = document.querySelector("#cancelEditModalButton");
const editEntryId = document.querySelector("#editEntryId");
const editEntryType = document.querySelector("#editEntryType");
const editDate = document.querySelector("#editDate");
const editMonth = document.querySelector("#editMonth");
const editQuantity = document.querySelector("#editQuantity");
const editTotal = document.querySelector("#editTotal");
const editDateLabel = document.querySelector("#editDateLabel");
const editMonthLabel = document.querySelector("#editMonthLabel");
const editQuantityLabel = document.querySelector("#editQuantityLabel");
const editTotalLabel = document.querySelector("#editTotalLabel");
const editMonthlyFields = document.querySelector("#editMonthlyFields");
const editLeaveDateList = document.querySelector("#editLeaveDateList");
const editLeaveDayCountPreview = document.querySelector("#editLeaveDayCountPreview");
const editWorkedHolidayCount = document.querySelector("#editWorkedHolidayCount");
const editWorkedHolidayDateList = document.querySelector("#editWorkedHolidayDateList");
const editWeekdayUnitPrice = document.querySelector("#editWeekdayUnitPrice");
const editWeekendUnitPrice = document.querySelector("#editWeekendUnitPrice");
const editHolidayUnitPrice = document.querySelector("#editHolidayUnitPrice");
const editMonthlyBreakdown = document.querySelector("#editMonthlyBreakdown");
const editCalculatedTotal = document.querySelector("#editCalculatedTotal");
const editModalMessage = document.querySelector("#editModalMessage");

let currentUser = null;
let entries = [];
let items = [];
let lockedMonths = [];
let editingEntry = null;

function getCurrentMonthValue() {
    return getTodayDateInputValue().slice(0, 7);
}

// Kilitli dönemlerde rapor görüntülenebilir; ancak düzenleme ve silme işlemleri engellenir.
function isMonthLocked(monthValue) {
    return lockedMonths.includes(monthValue);
}

function getDayIndex(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(year, month - 1, day).getDay();
}

function isWorkingBonusDay(dateText) {
    const dayIndex = getDayIndex(dateText);
    return dayIndex !== 0 && !isPublicHoliday(dateText);
}

function isSaturday(dateText) {
    return getDayIndex(dateText) === 6;
}

function isHolidayDate(dateText) {
    return getDayIndex(dateText) === 0 || isPublicHoliday(dateText);
}

function parseDateList(text = "") {
    return Array.from(new Set(text
        .split(/[\n,;\s]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    )).sort();
}

function validateLeaveDates(leaveDates, monthValue) {
    const invalidDates = [];
    const outOfMonthDates = [];
    const nonWorkingDates = [];
    const futureDates = [];
    const today = getTodayDateInputValue();

    leaveDates.forEach((dateText) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
            invalidDates.push(dateText);
            return;
        }

        if (dateText.slice(0, 7) !== monthValue) {
            outOfMonthDates.push(dateText);
            return;
        }

        if (dateText > today) {
            futureDates.push(dateText);
            return;
        }

        if (!isWorkingBonusDay(dateText)) {
            nonWorkingDates.push(dateText);
        }
    });

    return { invalidDates, outOfMonthDates, nonWorkingDates, futureDates };
}

function validateWorkedHolidayDates(workedHolidayDates, monthValue) {
    const invalidDates = [];
    const outOfMonthDates = [];
    const nonHolidayDates = [];
    const futureDates = [];
    const today = getTodayDateInputValue();

    workedHolidayDates.forEach((dateText) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
            invalidDates.push(dateText);
            return;
        }

        if (dateText.slice(0, 7) !== monthValue) {
            outOfMonthDates.push(dateText);
            return;
        }

        if (dateText > today) {
            futureDates.push(dateText);
            return;
        }

        if (!isHolidayDate(dateText)) {
            nonHolidayDates.push(dateText);
        }
    });

    return { invalidDates, outOfMonthDates, nonHolidayDates, futureDates };
}

function getMonthDayCounts(monthValue) {
    if (!monthValue) {
        return { weekdayCount: 0, weekendCount: 0, holidayCount: 0 };
    }

    const [year, month] = monthValue.split("-").map(Number);
    const today = new Date(getTodayDateInputValue());
    const selectedMonthDate = new Date(year, month - 1, 1);
    const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(year, month, 0).getDate();
    const maxDay = selectedMonthDate.getTime() === currentMonthDate.getTime() ? today.getDate() : lastDay;

    let weekdayCount = 0;
    let weekendCount = 0;
    let holidayCount = 0;

    for (let day = 1; day <= maxDay; day += 1) {
        const dateText = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayIndex = getDayIndex(dateText);

        if (dayIndex === 0 || isPublicHoliday(dateText)) {
            holidayCount += 1;
        } else if (dayIndex === 6) {
            weekendCount += 1;
        } else {
            weekdayCount += 1;
        }
    }

    return { weekdayCount, weekendCount, holidayCount };
}

function calculateMonthlyEdit() {
    const monthValue = editMonth?.value || "";
    const { weekdayCount, weekendCount, holidayCount } = getMonthDayCounts(monthValue);
    const leaveDates = parseDateList(editLeaveDateList?.value || "");
    const workedHolidayDates = parseDateList(editWorkedHolidayDateList?.value || "");
    const leaveValidation = validateLeaveDates(leaveDates, monthValue);
    const workedHolidayValidation = validateWorkedHolidayDates(workedHolidayDates, monthValue);
    const validLeaveDates = leaveDates.filter((dateText) => {
        return /^\d{4}-\d{2}-\d{2}$/.test(dateText) &&
            dateText.slice(0, 7) === monthValue &&
            dateText <= getTodayDateInputValue() &&
            isWorkingBonusDay(dateText);
    });
    const validWorkedHolidayDates = workedHolidayDates.filter((dateText) => {
        return /^\d{4}-\d{2}-\d{2}$/.test(dateText) &&
            dateText.slice(0, 7) === monthValue &&
            dateText <= getTodayDateInputValue() &&
            isHolidayDate(dateText);
    });
    const leaveFromWeekends = validLeaveDates.filter(isSaturday).length;
    const leaveFromWeekdays = validLeaveDates.length - leaveFromWeekends;
    const paidWeekdayCount = Math.max(weekdayCount - leaveFromWeekdays, 0);
    const paidWeekendCount = Math.max(weekendCount - leaveFromWeekends, 0);
    const rawWorkedHolidayCount = Number(editWorkedHolidayCount?.value) || 0;
    const workedHolidayCount = validWorkedHolidayDates.length ? validWorkedHolidayDates.length : rawWorkedHolidayCount;
    const safeWorkedHolidayCount = Math.min(Math.max(workedHolidayCount, 0), holidayCount);
    const weekdayUnitPrice = Number(editWeekdayUnitPrice?.value) || 0;
    const weekendUnitPrice = Number(editWeekendUnitPrice?.value) || 0;
    const holidayUnitPrice = Number(editHolidayUnitPrice?.value) || 0;
    const total = (paidWeekdayCount * weekdayUnitPrice) + (paidWeekendCount * weekendUnitPrice) + (safeWorkedHolidayCount * holidayUnitPrice);

    return {
        weekdayCount,
        weekendCount,
        holidayCount,
        leaveDates: validLeaveDates,
        requestedLeaveDates: leaveDates,
        workedHolidayDates: validWorkedHolidayDates,
        requestedWorkedHolidayDates: workedHolidayDates,
        leaveValidation,
        workedHolidayValidation,
        leaveDayCount: validLeaveDates.length,
        paidWeekdayCount,
        paidWeekendCount,
        workedHolidayCount,
        rawWorkedHolidayCount,
        safeWorkedHolidayCount,
        weekdayUnitPrice,
        weekendUnitPrice,
        holidayUnitPrice,
        total
    };
}

function setMonthDateRange(monthValue) {
    if (!monthValue || !startDate || !endDate) return;

    const [year, month] = monthValue.split("-").map(Number);
    const today = getTodayDateInputValue();
    const lastDay = new Date(year, month, 0).getDate();
    const monthStart = `${monthValue}-01`;
    const monthEnd = `${monthValue}-${String(lastDay).padStart(2, "0")}`;

    startDate.value = monthStart;
    endDate.value = monthEnd > today ? today : monthEnd;
}

function getReportDateValue(entry) {
    const entryMonth = getEntryMonth(entry);
    const entryDate = entry.date || (entryMonth ? `${entryMonth}-01` : "");
    return /^\d{4}-\d{2}-\d{2}$/.test(entryDate) ? entryDate : "0000-00-00";
}

function getCreatedOrderValue(entry) {
    const createdAt = entry.createdAt;

    if (createdAt?.toMillis) {
        return createdAt.toMillis();
    }

    if (typeof createdAt?.seconds === "number") {
        return createdAt.seconds * 1000;
    }

    if (typeof createdAt === "string") {
        return Date.parse(createdAt) || 0;
    }

    return 0;
}

function sortEntriesByReportDateDesc(entryList) {
    return [...entryList].sort((firstEntry, secondEntry) => {
        const firstDate = getReportDateValue(firstEntry);
        const secondDate = getReportDateValue(secondEntry);

        if (firstDate !== secondDate) {
            return secondDate.localeCompare(firstDate);
        }

        const createdOrderDiff = getCreatedOrderValue(secondEntry) - getCreatedOrderValue(firstEntry);
        if (createdOrderDiff !== 0) {
            return createdOrderDiff;
        }

        return String(secondEntry.id || "").localeCompare(String(firstEntry.id || ""));
    });
}

function clearFilters() {
    if (reportMonth) reportMonth.value = "";
    if (startDate) startDate.value = "";
    if (endDate) endDate.value = "";
    if (reportItemSelect) reportItemSelect.value = "";
    renderReports();
}

function showEditMessage(message = "") {
    if (!editModalMessage) return;
    editModalMessage.textContent = message;
}

function showLeaveDateValidationMessage(monthlyEdit) {
    const { invalidDates, outOfMonthDates, nonWorkingDates, futureDates } = monthlyEdit.leaveValidation;

    if (invalidDates.length) {
        showEditMessage(`Geçersiz izin tarihi formatı: ${invalidDates.join(", ")}. Format YYYY-AA-GG olmalı.`);
        return true;
    }

    if (outOfMonthDates.length) {
        showEditMessage(`İzin tarihleri seçilen ay içinde olmalı: ${outOfMonthDates.join(", ")}`);
        return true;
    }

    if (futureDates.length) {
        showEditMessage(`Henüz gelmemiş tarihler izinli gün olarak girilemez: ${futureDates.join(", ")}`);
        return true;
    }

    if (nonWorkingDates.length) {
        showEditMessage(`Pazar veya resmi tatil olan günler izinli gün olarak girilemez: ${nonWorkingDates.join(", ")}`);
        return true;
    }

    return false;
}

function showWorkedHolidayDateValidationMessage(monthlyEdit) {
    const { invalidDates, outOfMonthDates, nonHolidayDates, futureDates } = monthlyEdit.workedHolidayValidation;

    if (invalidDates.length) {
        showEditMessage(`Geçersiz resmi tatil çalışma tarihi formatı: ${invalidDates.join(", ")}. Format YYYY-AA-GG olmalı.`);
        return true;
    }

    if (outOfMonthDates.length) {
        showEditMessage(`Resmi tatil çalışma tarihleri seçilen ay içinde olmalı: ${outOfMonthDates.join(", ")}`);
        return true;
    }

    if (futureDates.length) {
        showEditMessage(`Henüz gelmemiş tarihler resmi tatil çalışması olarak girilemez: ${futureDates.join(", ")}`);
        return true;
    }

    if (nonHolidayDates.length) {
        showEditMessage(`Resmi tatil çalışması tarihi pazar veya resmi tatil olmalı: ${nonHolidayDates.join(", ")}`);
        return true;
    }

    return false;
}

function updateEditCalculatedTotal() {
    if (!editingEntry || !editCalculatedTotal) return;

    if (isMonthlyFixedEntry(editingEntry)) {
        const monthlyEdit = calculateMonthlyEdit();

        if (editWorkedHolidayCount && monthlyEdit.workedHolidayDates.length) {
            editWorkedHolidayCount.value = monthlyEdit.safeWorkedHolidayCount;
        } else if (editWorkedHolidayCount && Number(editWorkedHolidayCount.value) !== monthlyEdit.safeWorkedHolidayCount) {
            editWorkedHolidayCount.value = monthlyEdit.safeWorkedHolidayCount;
        }

        if (editLeaveDayCountPreview) editLeaveDayCountPreview.textContent = monthlyEdit.leaveDayCount;
        if (editTotal) editTotal.value = monthlyEdit.total;
        if (editCalculatedTotal) editCalculatedTotal.textContent = formatCurrency(monthlyEdit.total);
        if (editMonthlyBreakdown) {
            editMonthlyBreakdown.textContent = `${monthlyEdit.paidWeekdayCount}/${monthlyEdit.weekdayCount} hafta içi + ${monthlyEdit.paidWeekendCount}/${monthlyEdit.weekendCount} cumartesi + ${monthlyEdit.safeWorkedHolidayCount}/${monthlyEdit.holidayCount} resmi tatil`;
        }
        return;
    }

    const quantity = Number(editQuantity?.value) || 0;
    const unitPrice = Number(editingEntry.unitPrice) || 0;
    editCalculatedTotal.textContent = formatCurrency(quantity * unitPrice);
}

function closeEditModal() {
    editingEntry = null;
    editEntryModal?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    editEntryForm?.reset();
    showEditMessage("");
}

function openEditModal(entry) {
    const entryMonth = getEntryMonth(entry);

    if (isMonthLocked(entryMonth)) {
        alert(`${entryMonth} ayı kilitli olduğu için bu kayıt düzenlenemez.`);
        return;
    }

    editingEntry = entry;
    showEditMessage("");

    if (editEntryId) editEntryId.value = entry.id;
    if (editEntryType) editEntryType.value = isMonthlyFixedEntry(entry) ? "monthly" : "single";

    const isMonthly = isMonthlyFixedEntry(entry);

    editDateLabel?.classList.toggle("hidden", isMonthly);
    editQuantityLabel?.classList.toggle("hidden", isMonthly);
    editMonthLabel?.classList.toggle("hidden", !isMonthly);
    editMonthlyFields?.classList.toggle("hidden", !isMonthly);
    editTotalLabel?.classList.toggle("hidden", !isMonthly);

    if (editDate) {
        editDate.max = getTodayDateInputValue();
        editDate.value = entry.date || getTodayDateInputValue();
    }

    if (editMonth) {
        editMonth.max = getCurrentMonthValue();
        editMonth.value = entry.month || getEntryMonth(entry);
    }

    if (editQuantity) editQuantity.value = entry.quantity || 1;
    if (editLeaveDateList) editLeaveDateList.value = Array.isArray(entry.leaveDates) ? entry.leaveDates.join("\n") : "";
    if (editWorkedHolidayCount) editWorkedHolidayCount.value = entry.workedHolidayCount || 0;
    if (editWorkedHolidayDateList) editWorkedHolidayDateList.value = Array.isArray(entry.workedHolidayDates) ? entry.workedHolidayDates.join("\n") : "";
    if (editWeekdayUnitPrice) editWeekdayUnitPrice.value = Number(entry.weekdayUnitPrice) || 0;
    if (editWeekendUnitPrice) editWeekendUnitPrice.value = Number(entry.weekendUnitPrice) || 0;
    if (editHolidayUnitPrice) editHolidayUnitPrice.value = Number(entry.holidayUnitPrice) || 0;
    if (editTotal) editTotal.value = Number(entry.total) || 0;

    updateEditCalculatedTotal();
    editEntryModal?.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

async function loadUserSettings() {
    if (!currentUser) return;

    const userSnap = await getDoc(doc(db, "users", currentUser.uid));
    const settings = userSnap.exists() ? userSnap.data() : {};
    lockedMonths = Array.isArray(settings.lockedMonths) ? settings.lockedMonths : [];
}

async function loadItems() {
    if (!currentUser || !reportItemSelect) return;

    const itemsQuery = query(collection(db, "users", currentUser.uid, "items"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(itemsQuery);

    items = [];
    snapshot.forEach((itemDoc) => {
        items.push({ id: itemDoc.id, ...itemDoc.data() });
    });

    reportItemSelect.innerHTML = `<option value="">Tüm kalemler</option>`;

    const monthlyOption = document.createElement("option");
    monthlyOption.value = "monthly-fixed-bonus";
    monthlyOption.textContent = "Aylık Toplu Sabit Prim";
    reportItemSelect.appendChild(monthlyOption);

    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        reportItemSelect.appendChild(option);
    });
}

async function loadEntries() {
    if (!currentUser) return;

    const entriesQuery = query(collection(db, "users", currentUser.uid, "entries"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(entriesQuery);

    entries = [];
    snapshot.forEach((entryDoc) => {
        entries.push({ id: entryDoc.id, ...entryDoc.data() });
    });

    renderReports();
}

function getFilteredEntries() {
    const monthValue = reportMonth?.value;
    const startValue = startDate?.value;
    const endValue = endDate?.value;
    const itemId = reportItemSelect?.value;

    const filteredEntries = entries.filter((entry) => {
        const entryMonth = getEntryMonth(entry);
        const entryDate = entry.date || `${entryMonth}-01`;
        const sameMonth = !monthValue || entryMonth === monthValue;
        const afterStart = !startValue || entryDate >= startValue;
        const beforeEnd = !endValue || entryDate <= endValue;
        const sameItem = !itemId || entry.itemId === itemId;
        return sameMonth && afterStart && beforeEnd && sameItem;
    });

    return sortEntriesByReportDateDesc(filteredEntries);
}

function getReportActions(entry) {
    const entryMonth = getEntryMonth(entry);

    if (isMonthLocked(entryMonth)) {
        return `<span class="helper-text">Kilitli ay</span>`;
    }

    return `
        <div class="item-actions report-actions">
            <button class="small-btn" type="button" data-action="edit" data-id="${entry.id}">Düzenle</button>
            <button class="small-btn danger" type="button" data-action="delete" data-id="${entry.id}">Sil</button>
        </div>
    `;
}

function renderReports() {
    if (!reportList) return;

    const filteredEntries = getFilteredEntries();
    const total = filteredEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);

    if (reportTotal) reportTotal.textContent = formatCurrency(total);
    if (reportCount) reportCount.textContent = filteredEntries.length;

    if (!filteredEntries.length) {
        reportList.className = "list-area empty-state";
        reportList.textContent = "Henüz raporlanacak işlem bulunmuyor.";
        return;
    }

    reportList.className = "list-area";
    reportList.innerHTML = filteredEntries.map((entry) => renderListItem({
        title: entry.itemName || "Prim işlemi",
        meta: getEntryMeta(entry),
        value: formatCurrency(entry.total || 0),
        actions: getReportActions(entry)
    })).join("");
}

// Silme işleminden hemen önce kilit durumu yeniden kontrol edilerek eski ekran verisine güvenilmez.
async function deleteEntry(entryId) {
    const entry = entries.find((entryItem) => entryItem.id === entryId);
    if (!entry || !currentUser) return;

    const entryMonth = getEntryMonth(entry);

    if (isMonthLocked(entryMonth)) {
        alert(`${entryMonth} ayı kilitli olduğu için bu kayıt silinemez.`);
        return;
    }

    const isConfirmed = confirm("Bu kaydı silmek istiyor musun?");
    if (!isConfirmed) return;

    await deleteDoc(doc(db, "users", currentUser.uid, "entries", entryId));
    await loadEntries();
}

async function saveSingleEntry() {
    if (!editingEntry || !currentUser) return;

    const quantity = Number(editQuantity?.value) || 0;
    const newDate = editDate?.value || "";
    const today = getTodayDateInputValue();
    const newMonth = newDate.slice(0, 7);

    if (quantity <= 0) {
        showEditMessage("Adet 0'dan büyük olmalı.");
        return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate > today) {
        showEditMessage("Geçerli ve bugünden ileri olmayan bir tarih seç.");
        return;
    }

    if (isMonthLocked(newMonth)) {
        showEditMessage(`${newMonth} ayı kilitli olduğu için kayıt bu aya taşınamaz.`);
        return;
    }

    const unitPrice = Number(editingEntry.unitPrice) || 0;
    const total = quantity * unitPrice;

    await updateDoc(doc(db, "users", currentUser.uid, "entries", editingEntry.id), {
        quantity,
        date: newDate,
        total
    });

    closeEditModal();
    await loadEntries();
}

async function saveMonthlyEntry() {
    if (!editingEntry || !currentUser) return;

    const newMonth = editMonth?.value || "";
    const currentMonth = getCurrentMonthValue();

    if (!/^\d{4}-\d{2}$/.test(newMonth) || newMonth > currentMonth) {
        showEditMessage("Geçerli ve bugünden ileri olmayan bir ay seç.");
        return;
    }

    if (isMonthLocked(newMonth)) {
        showEditMessage(`${newMonth} ayı kilitli olduğu için kayıt bu aya taşınamaz.`);
        return;
    }

    const monthlyEdit = calculateMonthlyEdit();

    if (showLeaveDateValidationMessage(monthlyEdit)) {
        updateEditCalculatedTotal();
        return;
    }

    if (showWorkedHolidayDateValidationMessage(monthlyEdit)) {
        updateEditCalculatedTotal();
        return;
    }

    if (monthlyEdit.workedHolidayCount !== monthlyEdit.safeWorkedHolidayCount) {
        showEditMessage("Resmi tatilde çalışılan gün sayısı, o aydaki tatil günlerinden fazla olamaz.");
        updateEditCalculatedTotal();
        return;
    }

    if (monthlyEdit.weekdayUnitPrice < 0 || monthlyEdit.weekendUnitPrice < 0 || monthlyEdit.holidayUnitPrice < 0) {
        showEditMessage("Günlük prim değerleri negatif olamaz.");
        return;
    }

    await updateDoc(doc(db, "users", currentUser.uid, "entries", editingEntry.id), {
        month: newMonth,
        date: `${newMonth}-01`,
        weekdayCount: monthlyEdit.weekdayCount,
        weekendCount: monthlyEdit.weekendCount,
        holidayCount: monthlyEdit.holidayCount,
        leaveDayCount: monthlyEdit.leaveDayCount,
        leaveDates: monthlyEdit.leaveDates,
        paidWeekdayCount: monthlyEdit.paidWeekdayCount,
        paidWeekendCount: monthlyEdit.paidWeekendCount,
        workedHolidayCount: monthlyEdit.safeWorkedHolidayCount,
        workedHolidayDates: monthlyEdit.workedHolidayDates,
        weekdayUnitPrice: monthlyEdit.weekdayUnitPrice,
        weekendUnitPrice: monthlyEdit.weekendUnitPrice,
        holidayUnitPrice: monthlyEdit.holidayUnitPrice,
        quantity: monthlyEdit.paidWeekdayCount + monthlyEdit.paidWeekendCount + monthlyEdit.safeWorkedHolidayCount,
        total: monthlyEdit.total
    });

    closeEditModal();
    await loadEntries();
}

function editEntry(entryId) {
    const entry = entries.find((entryItem) => entryItem.id === entryId);
    if (!entry || !currentUser) return;
    openEditModal(entry);
}

if (filterForm) {
    filterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        renderReports();
    });
}

if (reportMonth) {
    reportMonth.max = getCurrentMonthValue();
    reportMonth.addEventListener("change", () => {
        if (reportMonth.value > getCurrentMonthValue()) {
            reportMonth.value = getCurrentMonthValue();
        }

        setMonthDateRange(reportMonth.value);
        renderReports();
    });
}

if (reportItemSelect) {
    reportItemSelect.addEventListener("change", renderReports);
}

if (startDate) {
    startDate.addEventListener("change", renderReports);
}

if (endDate) {
    endDate.addEventListener("change", renderReports);
}

if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", clearFilters);
}

if (editQuantity) {
    editQuantity.addEventListener("input", updateEditCalculatedTotal);
}

[editMonth, editLeaveDateList, editWorkedHolidayCount, editWorkedHolidayDateList, editWeekdayUnitPrice, editWeekendUnitPrice, editHolidayUnitPrice].forEach((input) => {
    if (input) {
        input.addEventListener("input", updateEditCalculatedTotal);
        input.addEventListener("change", updateEditCalculatedTotal);
    }
});

if (closeEditModalButton) {
    closeEditModalButton.addEventListener("click", closeEditModal);
}

if (cancelEditModalButton) {
    cancelEditModalButton.addEventListener("click", closeEditModal);
}

if (editEntryModal) {
    editEntryModal.addEventListener("click", (event) => {
        if (event.target === editEntryModal) {
            closeEditModal();
        }
    });
}

if (editEntryForm) {
    editEntryForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
            showEditMessage("");

            if (editingEntry && isMonthlyFixedEntry(editingEntry)) {
                await saveMonthlyEntry();
                return;
            }

            await saveSingleEntry();
        } catch (error) {
            console.error(error);
            showEditMessage("Kayıt güncellenirken hata oluştu.");
        }
    });
}

if (reportList) {
    reportList.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;

        const entryId = button.dataset.id;
        const action = button.dataset.action;

        try {
            if (action === "delete") {
                await deleteEntry(entryId);
            }

            if (action === "edit") {
                editEntry(entryId);
            }
        } catch (error) {
            console.error(error);
            alert("İşlem yapılırken hata oluştu.");
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
        await loadUserSettings();
        await loadItems();
        await loadEntries();
    }
});
