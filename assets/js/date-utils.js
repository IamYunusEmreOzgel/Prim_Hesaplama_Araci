/**
 * Uygulamanın ortak tarih, ay ve gün türü işlemlerini sağlar.
 *
 * Görevleri:
 * - Tarih ve ay değerlerini doğrular, biçimlendirir ve yerel saatle işler.
 * - Hafta içi, cumartesi ve tatil günlerini sınıflandırır.
 * - Ay içindeki günleri, gün sayılarını ve kullanılabilir ay seçeneklerini üretir.
 */

import { isPublicHoliday } from "./holidays.js";

export const DAY_TYPES = Object.freeze({
    WEEKDAY: "weekday",
    WEEKEND: "weekend",
    HOLIDAY: "holiday"
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function getTodayDateInputValue() {
    return formatLocalDate();
}

export function getMonthKey(dateText = getTodayDateInputValue()) {
    return isValidDateText(dateText) ? dateText.slice(0, 7) : "";
}

export function getCurrentMonthValue() {
    return getMonthKey();
}

// Biçim kontrolüne ek olarak taşan tarihleri (ör. 31 Şubat) yeniden biçimlendirerek reddeder.
export function isValidDateText(dateText) {
    if (!DATE_PATTERN.test(dateText || "")) return false;

    const date = parseLocalDate(dateText);
    return formatLocalDate(date) === dateText;
}

export function isValidMonthText(monthValue) {
    if (!MONTH_PATTERN.test(monthValue || "")) return false;

    const [year, month] = monthValue.split("-").map(Number);
    return year >= 1 && month >= 1 && month <= 12;
}

// YYYY-MM-DD metnini UTC yerine yerel saatle oluşturur; böylece gün kayması yaşanmaz.
export function parseLocalDate(dateText) {
    const [year, month, day] = String(dateText).split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function isFutureDate(dateText, today = getTodayDateInputValue()) {
    return isValidDateText(dateText) && dateText > today;
}

export function isSameMonth(dateText, monthValue) {
    return isValidDateText(dateText) &&
        isValidMonthText(monthValue) &&
        dateText.slice(0, 7) === monthValue;
}

export function getDayType(dateText) {
    if (!isValidDateText(dateText)) return null;

    const dayIndex = parseLocalDate(dateText).getDay();

    // Pazar günleri ve tanımlı resmî tatiller aynı prim kategorisinde değerlendirilir.
    if (dayIndex === 0 || isPublicHoliday(dateText)) {
        return DAY_TYPES.HOLIDAY;
    }

    if (dayIndex === 6) {
        return DAY_TYPES.WEEKEND;
    }

    return DAY_TYPES.WEEKDAY;
}

export function isSaturday(dateText) {
    return getDayType(dateText) === DAY_TYPES.WEEKEND;
}

export function isHolidayDate(dateText) {
    return getDayType(dateText) === DAY_TYPES.HOLIDAY;
}

export function isWorkingBonusDay(dateText) {
    const dayType = getDayType(dateText);
    return dayType === DAY_TYPES.WEEKDAY || dayType === DAY_TYPES.WEEKEND;
}

export function getMonthDays(monthValue, { throughToday = false } = {}) {
    if (!isValidMonthText(monthValue)) return [];

    const [year, month] = monthValue.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const currentMonth = getCurrentMonthValue();
    // Güncel ay raporlarında henüz yaşanmamış günlerin hesaba katılmasını engeller.
    const maxDay = throughToday && monthValue === currentMonth
        ? Number(getTodayDateInputValue().slice(8, 10))
        : lastDay;

    return Array.from({ length: maxDay }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        const dateText = `${monthValue}-${day}`;

        return {
            dateText,
            type: getDayType(dateText)
        };
    });
}

export function getMonthDayCounts(monthValue) {
    const days = getMonthDays(monthValue);

    return {
        weekdayCount: days.filter((day) => day.type === DAY_TYPES.WEEKDAY).length,
        weekendCount: days.filter((day) => day.type === DAY_TYPES.WEEKEND).length,
        holidayCount: days.filter((day) => day.type === DAY_TYPES.HOLIDAY).length
    };
}

export function formatDisplayDate(dateText) {
    if (!isValidDateText(dateText)) return "Geçersiz tarih";

    return parseLocalDate(dateText).toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        weekday: "long"
    });
}

export function formatMonthLabel(monthValue) {
    if (!isValidMonthText(monthValue)) return "Geçersiz ay";

    const [year, month] = monthValue.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("tr-TR", {
        month: "long",
        year: "numeric"
    });
}

export function getAvailableMonthValues(monthCount = 60, referenceDate = new Date()) {
    const safeMonthCount = Math.max(Number(monthCount) || 0, 0);

    return Array.from({ length: safeMonthCount }, (_, index) => {
        const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - index, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });
}
