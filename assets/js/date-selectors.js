/**
 * Tarih ve ay alanları için özel seçim bileşenleri oluşturur.
 *
 * Görevleri:
 * - Yerel tarih değerlerini kullanıcı dostu etiketlere dönüştürür.
 * - Seçim listelerini güncel tarih aralığına göre üretir.
 * - Yerel input değerleri ile özel arayüz bileşenlerini senkronize eder.
 */

import {
    formatLocalDate,
    getAvailableMonthValues,
    getCurrentMonthValue,
    isValidDateText
} from "./date-utils.js";

const MONTH_NAMES = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

function pad(value) {
    return String(value).padStart(2, "0");
}

function dispatchNativeChange(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function createSelect(className, ariaLabel) {
    const select = document.createElement("select");
    select.className = className;
    select.setAttribute("aria-label", ariaLabel);
    return select;
}

function getMonthLabel(monthValue) {
    const [year, month] = monthValue.split("-").map(Number);
    return `${MONTH_NAMES[month - 1]} ${year}`;
}

function createMonthOptions(selectedValue = "") {
    const options = getAvailableMonthValues(72).map((value) => ({
        value,
        label: getMonthLabel(value)
    }));

    if (selectedValue && !options.some((option) => option.value === selectedValue)) {
        options.push({ value: selectedValue, label: getMonthLabel(selectedValue) });
    }

    return options;
}

function enhanceMonthInput(input) {
    if (input.dataset.dateSelectorReady === "true") return;
    input.dataset.dateSelectorReady = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-date-control custom-month-control";

    const select = createSelect("custom-date-select", "Ay seç");
    const currentValue = input.value || getCurrentMonthValue();

    select.innerHTML = createMonthOptions(currentValue)
        .map((option) => `<option value="${option.value}">${option.label}</option>`)
        .join("");
    select.value = currentValue;

    input.value = select.value;
    input.classList.add("native-date-hidden");
    input.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(select);

    select.addEventListener("change", () => {
        input.value = select.value;
        dispatchNativeChange(input);
    });

    input.addEventListener("input", () => {
        if (!input.value || input.value === select.value) return;

        if (!Array.from(select.options).some((option) => option.value === input.value)) {
            const option = document.createElement("option");
            option.value = input.value;
            option.textContent = getMonthLabel(input.value);
            select.prepend(option);
        }

        select.value = input.value;
    });
}

function getDaysInMonth(year, month) {
    return new Date(Number(year), Number(month), 0).getDate();
}

function fillDayOptions(daySelect, year, month, selectedDay) {
    const daysInMonth = getDaysInMonth(year, month);
    const safeSelectedDay = Math.min(Number(selectedDay) || 1, daysInMonth);

    daySelect.replaceChildren();

    for (let day = 1; day <= daysInMonth; day += 1) {
        const option = document.createElement("option");
        option.value = pad(day);
        option.textContent = pad(day);
        daySelect.appendChild(option);
    }

    daySelect.value = pad(safeSelectedDay);
}

function enhanceDateInput(input) {
    if (input.dataset.dateSelectorReady === "true") return;
    input.dataset.dateSelectorReady = "true";

    const today = formatLocalDate();
    const value = isValidDateText(input.value) ? input.value : today;
    const [selectedYear, selectedMonth, selectedDay] = value.split("-");
    const currentYear = Number(today.slice(0, 4));

    const wrapper = document.createElement("div");
    wrapper.className = "custom-date-control custom-full-date-control";

    const daySelect = createSelect("custom-date-select", "Gün seç");
    const monthSelect = createSelect("custom-date-select", "Ay seç");
    const yearSelect = createSelect("custom-date-select", "Yıl seç");

    MONTH_NAMES.forEach((monthName, index) => {
        const option = document.createElement("option");
        option.value = pad(index + 1);
        option.textContent = monthName;
        monthSelect.appendChild(option);
    });

    for (let year = currentYear; year >= currentYear - 6; year -= 1) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.appendChild(option);
    }

    if (!Array.from(yearSelect.options).some((option) => option.value === selectedYear)) {
        const option = document.createElement("option");
        option.value = selectedYear;
        option.textContent = selectedYear;
        yearSelect.appendChild(option);
    }

    yearSelect.value = selectedYear;
    monthSelect.value = selectedMonth;
    fillDayOptions(daySelect, selectedYear, selectedMonth, selectedDay);

    function syncSelectsFromInput() {
        if (!isValidDateText(input.value)) return;
        const [year, month, day] = input.value.split("-");
        yearSelect.value = year;
        monthSelect.value = month;
        fillDayOptions(daySelect, year, month, day);
    }

    function updateInputFromSelects() {
        fillDayOptions(daySelect, yearSelect.value, monthSelect.value, daySelect.value);
        const nextValue = `${yearSelect.value}-${monthSelect.value}-${daySelect.value}`;
        input.value = nextValue > today ? today : nextValue;
        syncSelectsFromInput();
        dispatchNativeChange(input);
    }

    [daySelect, monthSelect, yearSelect].forEach((select) => {
        select.addEventListener("change", updateInputFromSelects);
    });

    input.value = value;
    input.classList.add("native-date-hidden");
    input.insertAdjacentElement("afterend", wrapper);
    wrapper.append(daySelect, monthSelect, yearSelect);
    input.addEventListener("input", syncSelectsFromInput);
}

function enhanceDateControls(root = document) {
    root.querySelectorAll?.("input[type='month']").forEach(enhanceMonthInput);
    root.querySelectorAll?.("input[type='date']").forEach(enhanceDateInput);
}

enhanceDateControls();

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                enhanceDateControls(node);
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });
