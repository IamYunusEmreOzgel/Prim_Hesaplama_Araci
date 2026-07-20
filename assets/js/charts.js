/**
 * Prim verilerinin grafik ve kompozisyon analizlerini oluşturur.
 *
 * Görevleri:
 * - Firestore kayıtlarını seçilen dönem ve prim kalemine göre filtreler.
 * - Aylık değişim, prim dağılımı ve özet değerlerini hesaplar.
 * - Chart.js grafiklerinin oluşturulmasını ve yenilenmesini yönetir.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    collection,
    getDocs,
    orderBy,
    query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
    formatCurrency,
    getEntryMonth,
    getTodayDateInputValue,
    isMonthlyFixedEntry
} from "./main.js";
import { isPublicHoliday } from "./holidays.js";

const chartFilterForm = document.querySelector("#chartFilterForm");
const chartViewMode = document.querySelector("#chartViewMode");
const chartModeInfo = document.querySelector("#chartModeInfo");
const chartMonth = document.querySelector("#chartMonth");
const chartStartDate = document.querySelector("#chartStartDate");
const chartEndDate = document.querySelector("#chartEndDate");
const chartItemSelect = document.querySelector("#chartItemSelect");
const clearChartFiltersButton = document.querySelector("#clearChartFiltersButton");
const chartTotal = document.querySelector("#chartTotal");
const chartCount = document.querySelector("#chartCount");
const chartTopItem = document.querySelector("#chartTopItem");
const compositionSummary = document.querySelector("#compositionSummary");
const compositionList = document.querySelector("#compositionList");
const compositionComment = document.querySelector("#compositionComment");

let currentUser = null;
let entries = [];
let items = [];
let amountByTypeChart = null;
let countByTypeChart = null;
let dailyTrendChart = null;
let monthlyTrendChart = null;

function getCurrentMonthValue() {
    return getTodayDateInputValue().slice(0, 7);
}

function getSelectedViewMode() {
    return chartViewMode?.value || "accrued";
}

function formatPercentage(value) {
    return (Number(value) || 0).toLocaleString("tr-TR", {
        maximumFractionDigits: 1
    });
}

function setMonthDateRange(monthValue) {
    if (!monthValue || !chartStartDate || !chartEndDate) return;

    const [year, month] = monthValue.split("-").map(Number);
    const today = getTodayDateInputValue();
    const lastDay = new Date(year, month, 0).getDate();
    const monthStart = `${monthValue}-01`;
    const monthEnd = `${monthValue}-${String(lastDay).padStart(2, "0")}`;

    chartStartDate.value = monthStart;
    chartEndDate.value = getSelectedViewMode() === "accrued" && monthEnd > today ? today : monthEnd;
}

function getEntryDate(entry) {
    return entry.date || `${getEntryMonth(entry)}-01`;
}

function getEntryTypeName(entry) {
    return entry.chartTypeName || entry.itemName || "Prim işlemi";
}

function getEntryCountValue(entry) {
    if (entry.chartCount !== undefined) {
        return Number(entry.chartCount) || 0;
    }

    if (isMonthlyFixedEntry(entry)) {
        return 1;
    }

    return Number(entry.quantity) || 0;
}

function getDayIndex(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(year, month - 1, day).getDay();
}

function isDateHoliday(dateText) {
    return getDayIndex(dateText) === 0 || isPublicHoliday(dateText);
}

function isDateSaturday(dateText) {
    return getDayIndex(dateText) === 6;
}

function getMonthDayInfos(monthValue) {
    if (!monthValue) return [];

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

function createVirtualMonthlyEntries(entry) {
    const monthValue = getEntryMonth(entry);
    const dayInfos = getMonthDayInfos(monthValue);
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
    const virtualEntries = [];

    dayInfos.forEach((day) => {
        let total = 0;
        let chartTypeName = "Aylık sabit prim";
        let compositionCategory = "fixed";

        if (leaveDateSet.has(day.dateText)) {
            total = 0;
        } else if (day.type === "holiday") {
            if (!holidayWorkDateSet.has(day.dateText)) return;
            total = holidayUnitPrice;
            chartTypeName = "Resmi tatil çalışması";
            compositionCategory = "holiday";
        } else if (day.type === "weekend") {
            total = weekendUnitPrice;
        } else {
            total = weekdayUnitPrice;
        }

        virtualEntries.push({
            id: `${entry.id}-${day.dateText}`,
            type: "virtual-monthly-day",
            itemId: "monthly-fixed-bonus",
            itemName: "Aylık Toplu Sabit Prim",
            chartTypeName,
            compositionCategory,
            date: day.dateText,
            month: monthValue,
            quantity: total > 0 ? 1 : 0,
            chartCount: total > 0 ? 1 : 0,
            unitPrice: total,
            total,
            sourceMonthlyEntryId: entry.id
        });
    });

    return virtualEntries;
}

function getPlannedEntries() {
    return entries.map((entry) => ({ ...entry, chartSourceMode: "planned" }));
}

function getAccruedEntries() {
    return entries.flatMap((entry) => {
        if (isMonthlyFixedEntry(entry)) {
            return createVirtualMonthlyEntries(entry);
        }

        return [{ ...entry, chartSourceMode: "single" }];
    });
}

function getChartSourceEntries() {
    return getSelectedViewMode() === "planned" ? getPlannedEntries() : getAccruedEntries();
}

function getEffectiveEndDate() {
    const endValue = chartEndDate?.value || "";
    const today = getTodayDateInputValue();

    if (getSelectedViewMode() === "planned") {
        return endValue;
    }

    if (!endValue) return today;
    return endValue > today ? today : endValue;
}

function getFilteredEntries(sourceEntries = getChartSourceEntries()) {
    const monthValue = chartMonth?.value;
    const startValue = chartStartDate?.value;
    const endValue = getEffectiveEndDate();
    const itemId = chartItemSelect?.value;

    return sourceEntries.filter((entry) => {
        const entryMonth = getEntryMonth(entry);
        const entryDate = getEntryDate(entry);
        const sameMonth = !monthValue || entryMonth === monthValue;
        const afterStart = !startValue || entryDate >= startValue;
        const beforeEnd = !endValue || entryDate <= endValue;
        const sameItem = !itemId || entry.itemId === itemId;

        return sameMonth && afterStart && beforeEnd && sameItem;
    });
}

function groupByType(filteredEntries) {
    const grouped = new Map();

    filteredEntries.forEach((entry) => {
        const name = getEntryTypeName(entry);
        const current = grouped.get(name) || { name, total: 0, count: 0 };
        current.total += Number(entry.total) || 0;
        current.count += getEntryCountValue(entry);
        grouped.set(name, current);
    });

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
}

function groupDaily(filteredEntries) {
    const grouped = new Map();

    filteredEntries.forEach((entry) => {
        const date = getEntryDate(entry);
        grouped.set(date, (grouped.get(date) || 0) + (Number(entry.total) || 0));
    });

    return Array.from(grouped.entries())
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function groupMonthly(sourceEntries) {
    const grouped = new Map();

    sourceEntries.forEach((entry) => {
        const month = getEntryMonth(entry);
        if (!month) return;
        grouped.set(month, (grouped.get(month) || 0) + (Number(entry.total) || 0));
    });

    return Array.from(grouped.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

function getMonthlyHolidayTotal(entry) {
    const workedHolidayCount = Number(entry.workedHolidayCount) || 0;
    const holidayUnitPrice = Number(entry.holidayUnitPrice) || 0;
    const holidayTotal = workedHolidayCount * holidayUnitPrice;
    const entryTotal = Number(entry.total) || 0;
    return Math.min(holidayTotal, entryTotal);
}

function getComposition(filteredEntries) {
    const composition = {
        fixed: 0,
        single: 0,
        holiday: 0
    };

    filteredEntries.forEach((entry) => {
        const entryTotal = Number(entry.total) || 0;

        if (getSelectedViewMode() === "accrued" && entry.type === "virtual-monthly-day") {
            if (entry.compositionCategory === "holiday") {
                composition.holiday += entryTotal;
            } else {
                composition.fixed += entryTotal;
            }
            return;
        }

        if (isMonthlyFixedEntry(entry)) {
            const holidayTotal = getMonthlyHolidayTotal(entry);
            composition.holiday += holidayTotal;
            composition.fixed += Math.max(entryTotal - holidayTotal, 0);
            return;
        }

        composition.single += entryTotal;
    });

    const total = composition.fixed + composition.single + composition.holiday;

    return {
        ...composition,
        total
    };
}

function getModeLabel() {
    return getSelectedViewMode() === "planned" ? "ay sonu planlanan" : "bugüne kadar hak edilen";
}

function renderModeInfo() {
    if (!chartModeInfo) return;

    chartModeInfo.textContent = getSelectedViewMode() === "planned"
        ? "Ay Sonu Planlanan modunda aylık toplu primler tam ay toplamı olarak hesaplanır."
        : "Bugüne Kadar Hak Edilen modunda aylık toplu primler günlere dağıtılır ve mevcut ayda bugünden sonrası hesaba katılmaz.";
}

function renderCompositionCard(filteredEntries) {
    if (!compositionSummary || !compositionList || !compositionComment) return;

    const composition = getComposition(filteredEntries);
    const total = composition.total;
    const modeLabel = getModeLabel();

    if (total <= 0) {
        compositionSummary.textContent = `Seçilen filtreye göre ${modeLabel} prim kompozisyonu oluşturacak veri bulunmuyor.`;
        compositionList.className = "composition-list empty-state";
        compositionList.textContent = "Henüz kompozisyon oluşturacak veri bulunmuyor.";
        compositionComment.textContent = "";
        return;
    }

    const items = [
        {
            key: "fixed",
            title: "Aylık sabit prim",
            value: composition.fixed,
            description: "Hafta içi ve cumartesi sabit primlerinden gelen kazanç."
        },
        {
            key: "single",
            title: "Tekli işlem primleri",
            value: composition.single,
            description: "Graston, Lenfödem, Gözetimli gibi tekli işlem kayıtlarından gelen kazanç."
        },
        {
            key: "holiday",
            title: "Resmi tatil çalışması",
            value: composition.holiday,
            description: "Aylık toplu kayıt içindeki resmi tatil çalışma primi."
        }
    ].filter((item) => item.value > 0);

    const dominantItem = [...items].sort((a, b) => b.value - a.value)[0];
    const dominantPercentage = dominantItem ? (dominantItem.value / total) * 100 : 0;

    compositionSummary.textContent = `Seçilen dönemde ${modeLabel} toplam primin ${formatCurrency(total)}. En büyük pay ${dominantItem?.title || "-"} tarafında.`;
    compositionList.className = "composition-list";
    compositionList.innerHTML = items.map((item) => {
        const percentage = total > 0 ? (item.value / total) * 100 : 0;

        return `
            <article class="composition-item">
                <div class="composition-row">
                    <div>
                        <strong>${item.title}</strong>
                        <span>${item.description}</span>
                    </div>
                    <b>%${formatPercentage(percentage)} • ${formatCurrency(item.value)}</b>
                </div>
                <div class="breakdown-track">
                    <div class="breakdown-fill" style="width: ${Math.max(percentage, 6)}%;"></div>
                </div>
            </article>
        `;
    }).join("");

    if (dominantItem?.key === "fixed") {
        compositionComment.textContent = `Kazancın ağırlıklı olarak sabit günlük primden geliyor. Seçilen dönemde ${modeLabel} toplam primin yaklaşık %${formatPercentage(dominantPercentage)} kadarı sabit prim kaynaklı.`;
    } else if (dominantItem?.key === "single") {
        compositionComment.textContent = `Kazancın ağırlıklı olarak tekli işlem primlerinden geliyor. Seçilen dönemde ${modeLabel} toplam primin yaklaşık %${formatPercentage(dominantPercentage)} kadarı işlem bazlı kazançtan oluşuyor.`;
    } else if (dominantItem?.key === "holiday") {
        compositionComment.textContent = `Bu dönemde resmi tatil çalışması güçlü bir katkı sağlamış. ${modeLabel} toplam primin yaklaşık %${formatPercentage(dominantPercentage)} kadarı resmi tatil çalışmasından geliyor.`;
    } else {
        compositionComment.textContent = "";
    }
}

function destroyChart(chart) {
    if (chart) {
        chart.destroy();
    }
}

function createBarChart(canvasId, labels, data, title, valueFormatter) {
    const canvas = document.querySelector(`#${canvasId}`);
    if (!canvas) return null;

    return new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: title,
                data,
                borderWidth: 1,
                borderRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => valueFormatter(context.raw)
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => valueFormatter(value)
                    }
                }
            }
        }
    });
}

function createLineChart(canvasId, labels, data, title) {
    const canvas = document.querySelector(`#${canvasId}`);
    if (!canvas) return null;

    return new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: title,
                data,
                borderWidth: 3,
                tension: 0.35,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => formatCurrency(context.raw)
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });
}

function updateSummary(filteredEntries, groupedTypes) {
    const total = filteredEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
    const topItem = groupedTypes[0];

    if (chartTotal) chartTotal.textContent = formatCurrency(total);
    if (chartCount) chartCount.textContent = filteredEntries.length;
    if (chartTopItem) chartTopItem.textContent = topItem ? topItem.name : "-";
}

function renderCharts() {
    renderModeInfo();

    const sourceEntries = getChartSourceEntries();
    const filteredEntries = getFilteredEntries(sourceEntries);
    const groupedTypes = groupByType(filteredEntries);
    const dailyData = groupDaily(filteredEntries);
    const monthlyData = groupMonthly(sourceEntries);

    updateSummary(filteredEntries, groupedTypes);
    renderCompositionCard(filteredEntries);

    destroyChart(amountByTypeChart);
    destroyChart(countByTypeChart);
    destroyChart(dailyTrendChart);
    destroyChart(monthlyTrendChart);

    amountByTypeChart = createBarChart(
        "amountByTypeChart",
        groupedTypes.map((item) => item.name),
        groupedTypes.map((item) => item.total),
        "Hakediş",
        formatCurrency
    );

    countByTypeChart = createBarChart(
        "countByTypeChart",
        groupedTypes.map((item) => item.name),
        groupedTypes.map((item) => item.count),
        "Adet",
        (value) => `${Number(value) || 0} adet`
    );

    dailyTrendChart = createLineChart(
        "dailyTrendChart",
        dailyData.map((item) => item.date),
        dailyData.map((item) => item.total),
        "Günlük prim"
    );

    monthlyTrendChart = createLineChart(
        "monthlyTrendChart",
        monthlyData.map((item) => item.month),
        monthlyData.map((item) => item.total),
        "Aylık prim"
    );
}

async function loadItems() {
    if (!currentUser || !chartItemSelect) return;

    const itemsQuery = query(collection(db, "users", currentUser.uid, "items"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(itemsQuery);

    items = [];
    snapshot.forEach((itemDoc) => {
        items.push({ id: itemDoc.id, ...itemDoc.data() });
    });

    chartItemSelect.innerHTML = `<option value="">Tüm kalemler</option>`;

    const monthlyOption = document.createElement("option");
    monthlyOption.value = "monthly-fixed-bonus";
    monthlyOption.textContent = "Aylık Toplu Sabit Prim";
    chartItemSelect.appendChild(monthlyOption);

    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        chartItemSelect.appendChild(option);
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

    renderCharts();
}

function clearFilters() {
    if (chartMonth) chartMonth.value = "";
    if (chartStartDate) chartStartDate.value = "";
    if (chartEndDate) chartEndDate.value = "";
    if (chartItemSelect) chartItemSelect.value = "";
    renderCharts();
}

if (chartFilterForm) {
    chartFilterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        renderCharts();
    });
}

if (chartViewMode) {
    chartViewMode.addEventListener("change", () => {
        if (chartMonth?.value) {
            setMonthDateRange(chartMonth.value);
        }

        renderCharts();
    });
}

if (chartMonth) {
    chartMonth.max = getCurrentMonthValue();
    chartMonth.addEventListener("change", () => {
        if (chartMonth.value > getCurrentMonthValue()) {
            chartMonth.value = getCurrentMonthValue();
        }

        setMonthDateRange(chartMonth.value);
        renderCharts();
    });
}

if (chartItemSelect) {
    chartItemSelect.addEventListener("change", renderCharts);
}

if (chartStartDate) {
    chartStartDate.addEventListener("change", renderCharts);
}

if (chartEndDate) {
    chartEndDate.addEventListener("change", renderCharts);
}

if (clearChartFiltersButton) {
    clearChartFiltersButton.addEventListener("click", clearFilters);
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
        await loadItems();
        await loadEntries();
    }
});
