/**
 * Uygulama genelindeki görüntüleme biçimlerini merkezileştirir.
 *
 * Görevleri:
 * - Sayısal değerleri Türkçe para biçiminde gösterir.
 * - Farklı sayfalarda kullanılan tutar gösterimlerinin tutarlı kalmasını sağlar.
 */

export function formatCurrency(value) {
    const numberValue = Number(value) || 0;
    return `${numberValue.toLocaleString("tr-TR")} TL`;
}
