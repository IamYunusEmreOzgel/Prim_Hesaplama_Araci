/**
 * Prim kayıtları için ortak Firestore ve veri dönüştürme yardımcılarını içerir.
 *
 * Görevleri:
 * - Kullanıcıya ait kayıt koleksiyonu referanslarını oluşturur.
 * - Kayıt açıklamalarını ve listeleme verilerini standartlaştırır.
 * - Aylık kayıtların ortak alanlarını ve sıralama davranışlarını destekler.
 */

import { collection } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { getMonthKey } from "./date-utils.js";
import { formatCurrency } from "./format-utils.js";

export function getUserCollection(userId, collectionName) {
    return collection(db, "users", userId, collectionName);
}

export function isMonthlyFixedEntry(entry) {
    return entry.type === "monthly-fixed" ||
        entry.itemId === "monthly-fixed-bonus" ||
        entry.itemName === "Aylık Toplu Sabit Prim";
}

export function getEntryMonth(entry) {
    return entry.month || (entry.date ? getMonthKey(entry.date) : "");
}

export function getEntryMeta(entry) {
    if (isMonthlyFixedEntry(entry)) {
        const monthText = entry.month || getEntryMonth(entry);
        const hasDayBreakdown = entry.weekdayCount !== undefined || entry.weekendCount !== undefined;

        if (hasDayBreakdown) {
            const weekdayText = entry.paidWeekdayCount !== undefined
                ? `${entry.paidWeekdayCount}/${entry.weekdayCount || 0} hafta içi`
                : `${entry.weekdayCount || 0} hafta içi`;
            const weekendText = entry.paidWeekendCount !== undefined
                ? `${entry.paidWeekendCount}/${entry.weekendCount || 0} cumartesi`
                : `${entry.weekendCount || 0} cumartesi`;
            const leaveText = entry.leaveDayCount ? ` • ${entry.leaveDayCount} izinli gün` : "";
            const workedHolidayText = entry.workedHolidayCount
                ? ` + ${entry.workedHolidayCount} resmi tatil çalışması`
                : "";

            return `${monthText} dönemi • ${weekdayText} + ${weekendText}${workedHolidayText}${leaveText}`;
        }

        return `${monthText} dönemi • Aylık toplu kayıt`;
    }

    return `${entry.date || "Tarih yok"} • ${entry.quantity || 0} adet x ${formatCurrency(entry.unitPrice || 0)}`;
}

export function renderListItem({ title, meta, value, actions = "" }) {
    return `
        <article class="list-item">
            <div>
                <strong>${title}</strong>
                <span>${meta}</span>
            </div>
            <div class="list-value-area">
                <b>${value}</b>
                ${actions}
            </div>
        </article>
    `;
}
