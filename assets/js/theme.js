/**
 * Açık ve koyu tema tercihlerini yönetir.
 *
 * Görevleri:
 * - Kullanıcının tema seçimini tarayıcı depolamasında saklar.
 * - Sayfa yüklenirken kayıtlı veya sistem temasını uygular.
 * - Tema değiştirme kontrollerinin görünümünü günceller.
 */

const THEME_STORAGE_KEY = "prim-araci-theme";

function getSavedTheme() {
    return localStorage.getItem(THEME_STORAGE_KEY) || "light";
}

export function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);

    document.querySelectorAll("[data-theme-option]").forEach((button) => {
        const isActive = button.dataset.themeOption === safeTheme;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

export function initTheme() {
    applyTheme(getSavedTheme());

    document.querySelectorAll("[data-theme-option]").forEach((button) => {
        button.addEventListener("click", () => {
            applyTheme(button.dataset.themeOption);
        });
    });
}
