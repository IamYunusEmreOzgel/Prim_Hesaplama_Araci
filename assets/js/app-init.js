/**
 * Uygulamanın tüm sayfalarda kullanılan ortak başlangıç işlemlerini çalıştırır.
 *
 * Görevleri:
 * - Marka, navigasyon, alt bilgi ve tema bileşenlerini başlatır.
 * - Sayfa yüklenirken ortak arayüz davranışlarını tek noktadan devreye alır.
 */

import { initBrand } from "./brand.js";
import { initFooter } from "./footer.js";
import { renderNavigation } from "./navigation.js";
import { initTheme } from "./theme.js";
import { installAlertBridge } from "./message.js";
import "./date-selectors.js";

function loadSharedStylesheet(fileName) {
    const href = new URL(`../css/${fileName}`, import.meta.url).href;

    if (document.querySelector(`link[href='${href}']`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

["footer.css", "message.css", "date-selectors.css"].forEach(loadSharedStylesheet);

installAlertBridge();
initBrand();
renderNavigation();
initFooter();
initTheme();
