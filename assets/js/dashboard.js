/**
 * Ana paneldeki prim, maaş ve işlem özetlerini yükler.
 *
 * Görevleri:
 * - Seçilen aya ait kayıtları ve kullanıcı ayarlarını Firestore'dan okur.
 * - Günlük, aylık ve prim kalemi bazlı toplamları hesaplar.
 * - Dashboard ay seçimi ve sıralama kontrollerini yönetir.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    doc,
    getDoc,
    getDocs,
    orderBy,
    query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
    DAY_TYPES,
    getCurrentMonthValue,
    getMonthDays,
    getTodayDateInputValue,
    isFutureDate
} from "./date-utils.js";
import {
    getEntryMonth,
    getUserCollection,
    isMonthlyFixedEntry
} from "./entry-utils.js";
import { formatCurrency } from "./format-utils.js";

function formatPercentage(value) {
    const numberValue = Number(value) || 0;
    return numberValue.toLocaleString("tr-TR", {
        maximumFractionDigits: 1
    });
}

function formatEmailName(email = "") {
    const emailName = email.split("@")[0] || "";
    const cleanedName = emailName
        .replace(/[._-]+/g, " ")
        .replace(/[0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleanedName) return "";

    return cleanedName
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1).toLocaleLowerCase("tr-TR"))
        .join(" ");
}

function renderWelcomeTitle(user) {
    const welcomeTitle = document.querySelector("#welcomeTitle");
    if (!welcomeTitle) return;

    const userName = formatEmailName(user?.email || "");
    welcomeTitle.textContent = userName ? `Merhaba ${userName} 👋` : "Merhaba 👋";
}

function getFallbackLeaveDates(entry, dayInfos) {
    const leaveCount = Number(entry.leaveDayCount) || 0;
    if (!leaveCount) return [];

    return dayInfos
        .filter((day) => day.type === DAY_TYPES.WEEKDAY || day.type === DAY_TYPES.WEEKEND)
        .slice(-leaveCount)
        .map((day) => day.dateText);
}

function getFallbackWorkedHolidayDates(entry, dayInfos) {
    const holidayWorkCount = Number(entry.workedHolidayCount) || 0;
    if (!holidayWorkCount) return [];

    return dayInfos
        .filter((day) => day.type === DAY_TYPES.HOLIDAY)
        .slice(0, holidayWorkCount)
        .map((day) => day.dateText);
}

function getMonthlyFixedTotalForDate(entry, dateText) {
    const monthValue = getEntryMonth(entry);
    if (!monthValue || dateText.slice(0, 7) !== monthValue) return 0;

    const dayInfos = getMonthDays(monthValue, { throughToday: true });
    const dayInfo = dayInfos.find((day) => day.dateText === dateText);
    if (!dayInfo) return 0;

    const leaveDates = Array.isArray(entry.leaveDates) && entry.leaveDates.length
        ? entry.leaveDates
        : getFallbackLeaveDates(entry, dayInfos);

    if (new Set(leaveDates).has(dateText)) return 0;

    const holidayWorkDates = Array.isArray(entry.workedHolidayDates) && entry.workedHolidayDates.length
        ? entry.workedHolidayDates
        : getFallbackWorkedHolidayDates(entry, dayInfos);

    if (dayInfo.type === DAY_TYPES.HOLIDAY) {
        return new Set(holidayWorkDates).has(dateText)
            ? Number(entry.holidayUnitPrice) || 0
            : 0;
    }

    if (dayInfo.type === DAY_TYPES.WEEKEND) {
        return Number(entry.weekendUnitPrice) || 0;
    }

    return Number(entry.weekdayUnitPrice) || 0;
}

function preventFutureDates() {
    const today = getTodayDateInputValue();

    document.querySelectorAll("input[type='date']").forEach((input) => {
        input.max = today;

        if (isFutureDate(input.value, today)) {
            input.value = today;
        }

        input.addEventListener("change", () => {
            if (isFutureDate(input.value, today)) {
                input.value = today;
                alert("Henüz gelmemiş bir tarih seçilemez.");
            }
        });
    });
}

function preventFutureMonths() {
    const currentMonth = getCurrentMonthValue();

    document.querySelectorAll("input[type='month']").forEach((input) => {
        input.max = currentMonth;

        if (input.value && input.value > currentMonth) {
            input.value = currentMonth;
        }

        input.addEventListener("change", () => {
            if (input.value && input.value > currentMonth) {
                input.value = currentMonth;
                alert("Henüz gelmemiş bir ay seçilemez.");
            }
        });
    });
}

async function loadUserSettings(user) {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    return userSnapshot.exists() ? userSnapshot.data() : {};
}

function getEntryTypeName(entry) {
    return entry.itemName || "Prim işlemi";
}

function getEntryTypeCount(entry) {
    return isMonthlyFixedEntry(entry) ? 1 : Number(entry.quantity) || 0;
}

function renderMonthlyTypeBreakdown(entries, selectedMonth) {
    const breakdownContainer = document.querySelector("#monthlyTypeBreakdown");
    const breakdownSort = document.querySelector("#breakdownSort");
    if (!breakdownContainer) return;

    const monthEntries = entries.filter((entry) => getEntryMonth(entry) === selectedMonth);

    if (!monthEntries.length) {
        breakdownContainer.className = "empty-state";
        breakdownContainer.textContent = "Seçilen ay için prim kaydı bulunmuyor.";
        return;
    }

    const grouped = new Map();

    monthEntries.forEach((entry) => {
        const typeName = getEntryTypeName(entry);
        const current = grouped.get(typeName) || { count: 0, total: 0 };
        current.count += getEntryTypeCount(entry);
        current.total += Number(entry.total) || 0;
        grouped.set(typeName, current);
    });

    const sortType = breakdownSort?.value || "count";
    const groups = Array.from(grouped.entries()).map(([name, data]) => ({ name, ...data }));
    const totalAmount = groups.reduce((sum, group) => sum + group.total, 0);
    const totalCount = groups.reduce((sum, group) => sum + group.count, 0);

    groups.sort((a, b) => sortType === "total" ? b.total - a.total : b.count - a.count);

    const maxValue = Math.max(
        ...groups.map((group) => sortType === "total" ? group.total : group.count),
        1
    );

    breakdownContainer.className = "breakdown-list";
    breakdownContainer.innerHTML = groups.map((group) => {
        const barValue = sortType === "total" ? group.total : group.count;
        const denominator = sortType === "total" ? totalAmount : totalCount;
        const sharePercentage = denominator > 0 ? (barValue / denominator) * 100 : 0;
        const percentage = Math.max((barValue / maxValue) * 100, 8);
        const countLabel = group.name === "Aylık Toplu Sabit Prim"
            ? `${group.count} kayıt`
            : `${group.count} adet`;
        const insightText = sortType === "total"
            ? `${group.name}, seçilen dönemdeki prim dağılımının %${formatPercentage(sharePercentage)} kadarını oluşturuyor.`
            : `${group.name}, seçilen dönemdeki adet dağılımının %${formatPercentage(sharePercentage)} kadarını oluşturuyor.`;

        return `
            <article class="breakdown-item">
                <div class="breakdown-row">
                    <strong>${group.name}</strong>
                    <span>${countLabel} • ${formatCurrency(group.total)}</span>
                </div>
                <p class="helper-text breakdown-insight">${insightText}</p>
                <div class="breakdown-track" title="${insightText}">
                    <div class="breakdown-fill" style="width: ${percentage}%;"></div>
                </div>
            </article>
        `;
    }).join("");
}

async function loadDashboard(user) {
    const todayTotal = document.querySelector("#todayTotal");
    const monthTotal = document.querySelector("#monthTotal");
    const entryCount = document.querySelector("#entryCount");
    const baseSalaryTotal = document.querySelector("#baseSalaryTotal");
    const monthlyBonusTotal = document.querySelector("#monthlyBonusTotal");
    const estimatedSalaryTotal = document.querySelector("#estimatedSalaryTotal");
    const dashboardMonth = document.querySelector("#dashboardMonth");

    if (!todayTotal || !monthTotal || !entryCount) return;

    renderWelcomeTitle(user);

    const today = getTodayDateInputValue();
    const currentMonth = getCurrentMonthValue();

    if (dashboardMonth && !dashboardMonth.value) {
        dashboardMonth.value = currentMonth;
    }

    const selectedMonth = dashboardMonth?.value || currentMonth;
    const entriesSnapshot = await getDocs(
        query(getUserCollection(user.uid, "entries"), orderBy("createdAt", "desc"))
    );
    const settings = await loadUserSettings(user);
    const baseSalary = Number(settings.baseSalary) || 0;
    const entries = [];
    let todaySum = 0;
    let selectedMonthSum = 0;

    entriesSnapshot.forEach((documentSnapshot) => {
        const entry = { id: documentSnapshot.id, ...documentSnapshot.data() };
        entries.push(entry);

        if (!isMonthlyFixedEntry(entry) && entry.date === today) {
            todaySum += Number(entry.total) || 0;
        }

        if (isMonthlyFixedEntry(entry) && getEntryMonth(entry) === currentMonth) {
            todaySum += getMonthlyFixedTotalForDate(entry, today);
        }

        if (getEntryMonth(entry) === selectedMonth) {
            selectedMonthSum += Number(entry.total) || 0;
        }
    });

    todayTotal.textContent = formatCurrency(todaySum);
    monthTotal.textContent = formatCurrency(selectedMonthSum);
    entryCount.textContent = entries.filter((entry) => getEntryMonth(entry) === selectedMonth).length;

    if (baseSalaryTotal) baseSalaryTotal.textContent = formatCurrency(baseSalary);
    if (monthlyBonusTotal) monthlyBonusTotal.textContent = formatCurrency(selectedMonthSum);
    if (estimatedSalaryTotal) estimatedSalaryTotal.textContent = formatCurrency(baseSalary + selectedMonthSum);

    renderMonthlyTypeBreakdown(entries, selectedMonth);
}

preventFutureDates();
preventFutureMonths();

onAuthStateChanged(auth, (user) => {
    if (!user) return;

    loadDashboard(user).catch(console.error);

    document.querySelector("#dashboardMonth")?.addEventListener("change", () => {
        loadDashboard(user).catch(console.error);
    });

    document.querySelector("#breakdownSort")?.addEventListener("change", () => {
        loadDashboard(user).catch(console.error);
    });
});
