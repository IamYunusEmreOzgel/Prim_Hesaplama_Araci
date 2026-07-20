/**
 * Hızlı hesap sonuçlarından PDF raporu üretir.
 *
 * Görevleri:
 * - Prim kalemlerini gruplayarak adet ve tutar toplamlarını hesaplar.
 * - Aylık hesap ayrıntılarını ve genel kazanç özetini PDF'e aktarır.
 * - PDF oluşturma hatalarını kullanıcı bildirim sistemiyle raporlar.
 */

import { MESSAGE_TYPES, notifyUser } from "./message.js";

const quickPdfButton = document.querySelector("#quickPdfButton");
const PAGE = {
    width: 210,
    height: 297,
    margin: 14,
    footerY: 288,
    contentBottom: 274
};

function normalizeText(value = "") {
    return String(value)
        .replace(/İ/g, "I")
        .replace(/İ/g, "I")
        .replace(/ı/g, "i")
        .replace(/Ş/g, "S")
        .replace(/ş/g, "s")
        .replace(/Ğ/g, "G")
        .replace(/ğ/g, "g")
        .replace(/Ü/g, "U")
        .replace(/ü/g, "u")
        .replace(/Ö/g, "O")
        .replace(/ö/g, "o")
        .replace(/Ç/g, "C")
        .replace(/ç/g, "c")
        .replace(/₺/g, "TL")
        .replace(/×/g, "x");
}

function getText(selector, fallback = "-") {
    return document.querySelector(selector)?.textContent?.trim() || fallback;
}

function getInputValue(selector, fallback = "-") {
    return document.querySelector(selector)?.value?.trim() || fallback;
}

function parseLocalizedNumber(value = "") {
    const cleanValue = String(value)
        .replace(/[^0-9,.-]/g, "")
        .trim();

    if (!cleanValue) return 0;

    const hasComma = cleanValue.includes(",");
    const hasDot = cleanValue.includes(".");

    if (hasComma && hasDot) {
        return Number(cleanValue.replace(/\./g, "").replace(",", ".")) || 0;
    }

    if (hasComma) {
        return Number(cleanValue.replace(",", ".")) || 0;
    }

    if (hasDot) {
        const parts = cleanValue.split(".");
        const looksLikeThousands = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);

        if (looksLikeThousands) {
            return Number(parts.join("")) || 0;
        }
    }

    return Number(cleanValue) || 0;
}

function formatPdfMoney(value) {
    return `${Number(value || 0).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} TL`;
}

function parseQuickDetail(detail = "") {
    const quantityMatch = String(detail).match(/([\d.,]+)\s*adet/i);
    const unitPriceMatch = String(detail).match(/[×x]\s*(.+)$/i);
    const quantity = quantityMatch ? parseLocalizedNumber(quantityMatch[1]) : 0;
    const unitPriceText = unitPriceMatch?.[1]?.trim() || "-";

    return { quantity, unitPriceText };
}

function getQuickListItems() {
    return Array.from(document.querySelectorAll(".quick-single-item")).map((item, index) => {
        const detail = item.querySelector(".quick-single-info span")?.textContent?.trim() || "-";
        const parsedDetail = parseQuickDetail(detail);
        const total = item.querySelector(".quick-single-value strong")?.textContent?.trim() || "0 TL";

        return {
            index: index + 1,
            name: item.querySelector(".quick-single-info strong")?.textContent?.trim() || "Islem",
            detail,
            quantity: parsedDetail.quantity,
            unitPriceText: parsedDetail.unitPriceText,
            total,
            totalValue: parseLocalizedNumber(total)
        };
    });
}

function groupQuickListItems(items) {
    const groupedItems = new Map();

    items.forEach((item) => {
        const groupKey = item.name.trim().toLocaleLowerCase("tr-TR");

        if (!groupedItems.has(groupKey)) {
            groupedItems.set(groupKey, {
                name: item.name,
                quantity: 0,
                totalValue: 0,
                unitPrices: new Set()
            });
        }

        const groupedItem = groupedItems.get(groupKey);
        groupedItem.quantity += Number(item.quantity) || 0;
        groupedItem.totalValue += Number(item.totalValue) || 0;

        if (item.unitPriceText && item.unitPriceText !== "-") {
            groupedItem.unitPrices.add(item.unitPriceText);
        }
    });

    return Array.from(groupedItems.values()).map((item, index) => {
        const unitPriceText = item.unitPrices.size === 1
            ? Array.from(item.unitPrices)[0]
            : "Farkli birim ucretler";

        return {
            index: index + 1,
            name: item.name,
            detail: `Toplam ${item.quantity} adet x ${unitPriceText}`,
            total: formatPdfMoney(item.totalValue)
        };
    });
}

function getCheckedDateLabels(selector) {
    return Array.from(document.querySelectorAll(`${selector} input[type='checkbox']:checked`))
        .map((input) => input.closest("label")?.querySelector("strong")?.textContent?.trim() || input.value)
        .filter(Boolean);
}

function formatReportDate(date = new Date()) {
    return date.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getMonthLabel(monthValue) {
    if (!/^\d{4}-\d{2}$/.test(monthValue)) return "Secilmedi";

    const [year, month] = monthValue.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("tr-TR", {
        month: "long",
        year: "numeric"
    });
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 5) {
    const lines = doc.splitTextToSize(normalizeText(text), maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
}

function drawHeader(doc, createdAt, monthLabel) {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, PAGE.width, 38, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Prim Hesaplama Raporu", PAGE.margin, 17);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(normalizeText("Rapor turu: Hizli Hesap"), PAGE.margin, 26);
    doc.text(normalizeText(`Rapor donemi: ${monthLabel}`), PAGE.margin, 32);
    doc.text(normalizeText(`Olusturma zamani: ${createdAt}`), PAGE.width - PAGE.margin, 26, { align: "right" });

    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(1.4);
    doc.line(PAGE.margin, 37, PAGE.width - PAGE.margin, 37);
}

function drawPageTitle(doc, title) {
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, PAGE.width, 30, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(PAGE.margin, 30, PAGE.width - PAGE.margin, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(normalizeText(title), PAGE.margin, 18);
    return 40;
}

function drawSummaryCard(doc, x, y, width, label, value) {
    doc.setDrawColor(220, 226, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, width, 22, 3, 3, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(normalizeText(label), x + 5, y + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(normalizeText(value), x + 5, y + 17);
}

function drawSectionTitle(doc, title, y) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(normalizeText(title), PAGE.margin, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(PAGE.margin, y + 3, PAGE.width - PAGE.margin, y + 3);
    return y + 10;
}

function drawTableHeader(doc, y) {
    doc.setFillColor(37, 99, 235);
    doc.rect(PAGE.margin, y, 182, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("#", 18, y + 7);
    doc.text("Kalem", 28, y + 7);
    doc.text("Toplam Adet / Birim", 92, y + 7);
    doc.text("Tutar", 190, y + 7, { align: "right" });
    return y + 13;
}

function drawFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setDrawColor(226, 232, 240);
        doc.line(PAGE.margin, 282, PAGE.width - PAGE.margin, 282);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Prim Hesaplama Araci - YEO", PAGE.margin, PAGE.footerY);
        doc.text(`Sayfa ${pageNumber}/${pageCount}`, PAGE.width - PAGE.margin, PAGE.footerY, { align: "right" });
    }
}

function addPageForTable(doc, title = "Gruplanmis Tekli Islem Listesi - Devam") {
    doc.addPage();
    const y = drawPageTitle(doc, title);
    return drawTableHeader(doc, y);
}

function drawDateList(doc, title, dates, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(normalizeText(title), PAGE.margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    const text = dates.length ? dates.join(", ") : "Secim yapilmadi.";
    return addWrappedText(doc, text, PAGE.margin, y, 182, 5) + 2;
}

function drawGroupedItemsTable(doc, items, grandTotal) {
    let y = addPageForTable(doc, "Gruplanmis Tekli Islem Listesi");

    items.forEach((item) => {
        if (y + 12 > PAGE.contentBottom) {
            y = addPageForTable(doc);
        }

        doc.setDrawColor(226, 232, 240);
        doc.line(PAGE.margin, y + 7, PAGE.width - PAGE.margin, y + 7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(String(item.index), 18, y);
        doc.text(normalizeText(item.name).slice(0, 30), 28, y);
        doc.text(normalizeText(item.detail).slice(0, 42), 92, y);
        doc.setFont("helvetica", "bold");
        doc.text(normalizeText(item.total), 190, y, { align: "right" });
        y += 10;
    });

    if (y + 20 > PAGE.contentBottom) {
        y = addPageForTable(doc, "Gruplanmis Tekli Islem Listesi - Toplam");
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(220, 226, 240);
    doc.roundedRect(PAGE.margin, y + 2, 182, 14, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Genel Toplam", 20, y + 11);
    doc.text(normalizeText(grandTotal), 190, y + 11, { align: "right" });
}

function createQuickPdf() {
    if (!window.jspdf?.jsPDF) {
        notifyUser("PDF altyapısı yüklenemedi. Sayfayı yenileyip tekrar dene.", MESSAGE_TYPES.ERROR);
        return;
    }

    const items = groupQuickListItems(getQuickListItems());

    if (!items.length) {
        notifyUser("PDF oluşturmak için önce hızlı listeye en az bir tekli işlem eklemelisin.", MESSAGE_TYPES.ERROR);
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const now = new Date();
    const createdAt = formatReportDate(now);
    const selectedMonth = getInputValue("#quickMonth", "");
    const monthLabel = getMonthLabel(selectedMonth);
    const singleTotal = getText("#quickSingleTotalSummary", "0 TL");
    const monthlyTotal = getText("#quickMonthlyTotal", "0 TL");
    const grandTotal = getText("#quickGrandTotal", "0 TL");
    const weekdayCount = getText("#quickWeekdayCount", "0");
    const weekendCount = getText("#quickWeekendCount", "0");
    const holidayCount = getText("#quickHolidayCount", "0");
    const leaveCount = getText("#quickLeaveCount", "0 gün");
    const workedHolidayCount = getText("#quickWorkedHolidayCount", "0 gün");
    const paidDayCount = getText("#quickPaidDayCount", "0");
    const leaveDates = getCheckedDateLabels("#quickLeaveSelector");
    const workedHolidayDates = getCheckedDateLabels("#quickHolidayWorkSelector");

    doc.setProperties({
        title: "Prim Hesaplama Raporu",
        subject: "Prim Hesaplama Araci - Hizli Hesap",
        author: "Prim Hesaplama Araci"
    });

    drawHeader(doc, createdAt, monthLabel);

    let y = 50;
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y = addWrappedText(
        doc,
        "Bu rapor sadece Hızlı Hesap sayfasındaki geçici listeye göre oluşturulmuştur. Aynı isimdeki tekli prim kalemleri PDF içinde gruplanarak toplam adet ve toplam tutar şeklinde gösterilir.",
        PAGE.margin,
        y,
        182,
        5
    ) + 6;

    drawSummaryCard(doc, 14, y, 56, "Tekli Islem Primi", singleTotal);
    drawSummaryCard(doc, 77, y, 56, "Aylik Sabit Prim", monthlyTotal);
    drawSummaryCard(doc, 140, y, 56, "Toplam Tahmini Prim", grandTotal);
    y += 32;

    y = drawSectionTitle(doc, "Aylik Toplu Hesap Ozeti", y);
    drawSummaryCard(doc, 14, y, 41, "Hafta Ici", weekdayCount);
    drawSummaryCard(doc, 61, y, 41, "Cumartesi", weekendCount);
    drawSummaryCard(doc, 108, y, 41, "Tatil", holidayCount);
    drawSummaryCard(doc, 155, y, 41, "Dahil Gun", paidDayCount);
    y += 30;
    drawSummaryCard(doc, 14, y, 88, "Izinli Gun", leaveCount);
    drawSummaryCard(doc, 108, y, 88, "Tatil/Pazar Calismasi", workedHolidayCount);
    y += 32;

    y = drawDateList(doc, "Izinli Gunler", leaveDates, y);
    y = drawDateList(doc, "Resmi Tatil / Pazar Calisma Gunleri", workedHolidayDates, y);

    drawGroupedItemsTable(doc, items, grandTotal);
    drawFooter(doc);

    const dateKey = now.toISOString().slice(0, 10);
    const monthKey = selectedMonth || dateKey.slice(0, 7);
    doc.save(`prim-raporu-hizli-hesap-${monthKey}-${dateKey}.pdf`);
    notifyUser("PDF raporu indirildi.", MESSAGE_TYPES.SUCCESS);
}

if (quickPdfButton) {
    quickPdfButton.addEventListener("click", createQuickPdf);
}
