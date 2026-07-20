/**
 * Masaüstü ve mobil navigasyon menülerini oluşturur.
 *
 * Görevleri:
 * - Sayfanın konumuna göre doğru bağlantı yollarını belirler.
 * - Aktif sayfayı menüde işaretler.
 * - Ortak menü yapısının tüm sayfalarda tutarlı kalmasını sağlar.
 */

const menuItems = [
    { title: "Ana Sayfa", mobileTitle: "Ana", file: "index.html", rootHref: "index.html", pageHref: "../index.html" },
    { title: "İşlem Ekle", mobileTitle: "Ekle", file: "add-entry.html", rootHref: "pages/add-entry.html", pageHref: "add-entry.html" },
    { title: "Prim Kalemleri", mobileTitle: "Kalem", file: "items.html", rootHref: "pages/items.html", pageHref: "items.html" },
    { title: "Raporlar", mobileTitle: "Rapor", file: "reports.html", rootHref: "pages/reports.html", pageHref: "reports.html" },
    { title: "Grafikler", mobileTitle: "Grafik", file: "charts.html", rootHref: "pages/charts.html", pageHref: "charts.html" },
    { title: "Prim Takvimi", mobileTitle: "Takvim", file: "calendar.html", rootHref: "pages/calendar.html", pageHref: "calendar.html" },
    { title: "Hızlı Hesap", mobileTitle: "Hızlı", file: "quick-calc.html", rootHref: "pages/quick-calc.html", pageHref: "quick-calc.html" },
    { title: "Ayarlar", mobileTitle: "Ayar", file: "settings.html", rootHref: "pages/settings.html", pageHref: "settings.html" }
];

function isInsidePagesFolder() {
    return window.location.pathname.includes("/pages/");
}

function getCurrentFileName() {
    const fileName = window.location.pathname.split("/").filter(Boolean).pop() || "index.html";
    return fileName === "Prim_Hesaplama_Araci" ? "index.html" : fileName;
}

function getItemHref(item) {
    return isInsidePagesFolder() ? item.pageHref : item.rootHref;
}

function createMenuLink(item, labelType = "desktop") {
    const link = document.createElement("a");
    link.href = getItemHref(item);
    link.textContent = labelType === "mobile" ? item.mobileTitle : item.title;

    if (item.file === getCurrentFileName()) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
    }

    return link;
}

function renderNavigationContainer(selector, labelType) {
    const navigation = document.querySelector(selector);
    if (!navigation) return;

    navigation.replaceChildren(...menuItems.map((item) => createMenuLink(item, labelType)));
}

export function renderNavigation() {
    renderNavigationContainer(".side-nav", "desktop");
    renderNavigationContainer(".bottom-nav", "mobile");
}
