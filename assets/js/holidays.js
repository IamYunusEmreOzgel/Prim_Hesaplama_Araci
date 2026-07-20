/**
 * Prim hesaplarında kullanılan resmi tatil tarihlerini tanımlar.
 *
 * Görevleri:
 * - Bir tarihin resmi tatil olup olmadığını kontrol eder.
 * - Tarih yardımcılarının gün türü sınıflandırmasına veri sağlar.
 */

export const publicHolidays = {
    "2026": [
        "2026-01-01",
        "2026-03-20",
        "2026-03-21",
        "2026-03-22",
        "2026-04-23",
        "2026-05-01",
        "2026-05-19",
        "2026-05-27",
        "2026-05-28",
        "2026-05-29",
        "2026-05-30",
        "2026-07-15",
        "2026-08-30",
        "2026-10-29"
    ]
};

export function isPublicHoliday(dateText) {
    if (!dateText) return false;

    const year = dateText.slice(0, 4);
    return publicHolidays[year]?.includes(dateText) || false;
}
