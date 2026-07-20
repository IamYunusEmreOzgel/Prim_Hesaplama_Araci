/**
 * Uygulama içindeki kullanıcı bildirimlerini yönetir.
 *
 * Görevleri:
 * - Başarı, hata, bilgi ve uyarı mesaj türlerini standartlaştırır.
 * - Toast ve satır içi mesaj bileşenlerini oluşturur.
 * - Eski alert çağrılarını ortak bildirim sistemine yönlendirir.
 */

export const MESSAGE_TYPES = {
    INFO: "info",
    SUCCESS: "success",
    WARNING: "warning",
    ERROR: "error"
};

const TOAST_CONTAINER_ID = "toastContainer";
const TOAST_VISIBLE_MS = {
    [MESSAGE_TYPES.SUCCESS]: 3000,
    [MESSAGE_TYPES.INFO]: 3000,
    [MESSAGE_TYPES.WARNING]: 4000,
    [MESSAGE_TYPES.ERROR]: 5000
};

function normalizeMessageType(type) {
    return Object.values(MESSAGE_TYPES).includes(type) ? type : MESSAGE_TYPES.INFO;
}

function getToastContainer() {
    let container = document.querySelector(`#${TOAST_CONTAINER_ID}`);

    if (!container) {
        container = document.createElement("div");
        container.id = TOAST_CONTAINER_ID;
        container.className = "toast-container";
        container.setAttribute("aria-live", "polite");
        container.setAttribute("aria-atomic", "false");
        document.body.appendChild(container);
    }

    return container;
}

function getToastIcon(type) {
    switch (type) {
        case MESSAGE_TYPES.SUCCESS:
            return "✓";
        case MESSAGE_TYPES.WARNING:
            return "!";
        case MESSAGE_TYPES.ERROR:
            return "×";
        default:
            return "i";
    }
}

function removeToast(toast) {
    if (!toast) return;

    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 180);
}

export function showToast(message, type = MESSAGE_TYPES.INFO) {
    const safeMessage = String(message || "").trim();
    if (!safeMessage || !document.body) return;

    const messageType = normalizeMessageType(type);
    const container = getToastContainer();
    const toast = document.createElement("div");

    toast.className = "toast-message";
    toast.dataset.type = messageType;
    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${getToastIcon(messageType)}</span>
        <span class="toast-text"></span>
        <button class="toast-close" type="button" aria-label="Bildirimi kapat">×</button>
    `;

    toast.querySelector(".toast-text").textContent = safeMessage;
    toast.querySelector(".toast-close")?.addEventListener("click", () => removeToast(toast));
    container.appendChild(toast);

    window.requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    window.setTimeout(() => removeToast(toast), TOAST_VISIBLE_MS[messageType]);
}

export function showInlineMessage(element, message = "", type = MESSAGE_TYPES.INFO) {
    if (!element) return;

    const safeMessage = String(message || "").trim();

    element.textContent = safeMessage;
    element.dataset.type = normalizeMessageType(type);
    element.classList.toggle("hidden", !safeMessage);
}

export function clearInlineMessage(element) {
    showInlineMessage(element, "", MESSAGE_TYPES.INFO);
}

export function createInlineMessage(element, defaultType = MESSAGE_TYPES.INFO) {
    return (message = "", type = defaultType) => {
        showInlineMessage(element, message, type);
    };
}

export function notifyUser(message, type = MESSAGE_TYPES.INFO) {
    const safeMessage = String(message || "").trim();
    if (!safeMessage) return;

    console[type === MESSAGE_TYPES.ERROR ? "error" : "log"](safeMessage);
    showToast(safeMessage, type);
}

export function installAlertBridge() {
    window.alert = (message) => {
        notifyUser(message, MESSAGE_TYPES.ERROR);
    };
}
