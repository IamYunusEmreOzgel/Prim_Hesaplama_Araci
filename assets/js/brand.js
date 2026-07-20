/**
 * Uygulamanın ortak logo ve marka alanlarını oluşturur.
 *
 * Görevleri:
 * - Favicon ve Apple Touch Icon bağlantılarını günceller.
 * - Sayfalardaki marka görsellerinin doğru dosya yolunu kullanmasını sağlar.
 */

const LOGO_PATH = `${new URL("./brand.js", import.meta.url).origin}${new URL("../img/yeo-logo.svg", import.meta.url).pathname}`;

function upsertIconLink(rel) {
    let link = document.querySelector(`link[rel='${rel}']`);

    if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
    }

    link.href = LOGO_PATH;
    link.type = "image/svg+xml";
}

function applyBrandStyle() {
    if (document.querySelector("#brandRuntimeStyle")) return;

    const style = document.createElement("style");
    style.id = "brandRuntimeStyle";
    style.textContent = `
        .brand-logo,
        .brand-icon {
            width: 46px;
            height: 46px;
            flex: 0 0 46px;
            display: block;
            border-radius: 16px;
            object-fit: cover;
            box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
        }

        .brand-icon {
            background: url("${LOGO_PATH}") center / cover no-repeat !important;
            color: transparent !important;
            font-size: 0 !important;
            overflow: hidden;
        }

        @media (max-width: 520px) {
            .brand-logo,
            .brand-icon {
                width: 42px;
                height: 42px;
                flex-basis: 42px;
                border-radius: 14px;
            }
        }
    `;
    document.head.appendChild(style);
}

export function initBrand() {
    upsertIconLink("icon");
    upsertIconLink("apple-touch-icon");
    applyBrandStyle();
}
