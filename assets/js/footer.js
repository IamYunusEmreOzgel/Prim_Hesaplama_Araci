/**
 * Uygulamanın ortak alt bilgi bileşenini oluşturur.
 *
 * Görevleri:
 * - Alt bilgiyi uygun ana içerik alanına yalnızca bir kez ekler.
 * - Telif ve geliştirici bilgisinin tüm sayfalarda tutarlı görünmesini sağlar.
 */

export function initFooter() {
    const mainContent = document.querySelector(".main-content");
    if (!mainContent || document.querySelector(".app-footer")) return;

    const footer = document.createElement("footer");
    footer.className = "app-footer";
    footer.innerHTML = `
        <span><strong>Prim Hesaplama Aracı</strong> • YEÖ</span>
        <span>© ${new Date().getFullYear()} Yunus Emre Özgel</span>
    `;

    mainContent.appendChild(footer);
}
