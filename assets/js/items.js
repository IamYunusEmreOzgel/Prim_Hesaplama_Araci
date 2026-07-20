/**
 * Kullanıcıya ait prim kalemlerinin yönetimini gerçekleştirir.
 *
 * Görevleri:
 * - Prim kalemi ekleme ve düzenleme formlarını doğrular.
 * - Birim ücret ve aktiflik durumlarını Firestore ile senkronize eder.
 * - Kalemleri listeler; düzenleme, durum değiştirme ve silme işlemlerini yönetir.
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { formatCurrency } from "./format-utils.js";
import { MESSAGE_TYPES, notifyUser } from "./message.js";

const itemForm = document.querySelector("#itemForm");
const itemsList = document.querySelector("#itemsList");
let currentUser = null;
let items = [];

function getItemsCollection() {
    return collection(db, "users", currentUser.uid, "items");
}

function renderItems() {
    if (!itemsList) return;

    if (!items.length) {
        itemsList.className = "list-area empty-state";
        itemsList.textContent = "Henüz prim kalemi eklenmedi.";
        return;
    }

    itemsList.className = "list-area";
    itemsList.innerHTML = items.map((item) => `
        <article class="list-item">
            <div>
                <strong>${item.name}</strong>
                <span>Birim ücret: ${formatCurrency(item.unitPrice)}</span>
                <span>Durum: ${item.isActive === false ? "Pasif" : "Aktif"}</span>
            </div>
            <div class="item-actions">
                <button class="small-btn" data-action="edit" data-id="${item.id}">Düzenle</button>
                <button class="small-btn" data-action="toggle" data-id="${item.id}" data-active="${item.isActive !== false}">
                    ${item.isActive === false ? "Aktif Et" : "Pasifleştir"}
                </button>
                <button class="small-btn danger" data-action="delete" data-id="${item.id}">Sil</button>
            </div>
        </article>
    `).join("");
}

async function loadItems() {
    if (!currentUser || !itemsList) return;

    const snapshot = await getDocs(query(getItemsCollection(), orderBy("createdAt", "desc")));
    items = snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
    renderItems();
}

async function editItem(itemId) {
    const item = items.find((itemData) => itemData.id === itemId);
    if (!item || !currentUser) return;

    const newName = prompt("Yeni prim kalemi adını gir:", item.name || "");
    if (newName === null) return;

    const cleanName = newName.trim();
    if (!cleanName) {
        notifyUser("Prim kalemi adı boş olamaz.", MESSAGE_TYPES.ERROR);
        return;
    }

    const newUnitPriceText = prompt("Yeni birim ücret değerini gir:", item.unitPrice ?? 0);
    if (newUnitPriceText === null) return;

    const newUnitPrice = Number(newUnitPriceText.replace?.(",", ".") ?? newUnitPriceText);
    if (Number.isNaN(newUnitPrice) || newUnitPrice < 0) {
        notifyUser("Birim ücret geçerli ve negatif olmayan bir sayı olmalı.", MESSAGE_TYPES.ERROR);
        return;
    }

    await updateDoc(doc(db, "users", currentUser.uid, "items", itemId), {
        name: cleanName,
        unitPrice: newUnitPrice,
        updatedAt: serverTimestamp()
    });

    await loadItems();
}

itemForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const itemName = document.querySelector("#itemName")?.value.trim();
    const unitPrice = Number(document.querySelector("#unitPrice")?.value);

    if (!itemName || Number.isNaN(unitPrice) || unitPrice < 0) {
        notifyUser("Kalem adı ve negatif olmayan birim ücret zorunludur.", MESSAGE_TYPES.ERROR);
        return;
    }

    await addDoc(getItemsCollection(), {
        name: itemName,
        unitPrice,
        isActive: true,
        createdAt: serverTimestamp()
    });

    itemForm.reset();
    await loadItems();
});

itemsList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || !currentUser) return;

    const { id: itemId, action } = button.dataset;
    const itemRef = doc(db, "users", currentUser.uid, "items", itemId);

    try {
        if (action === "edit") {
            await editItem(itemId);
            return;
        }

        if (action === "delete") {
            if (!confirm("Bu prim kalemini silmek istiyor musun?")) return;
            await deleteDoc(itemRef);
        } else if (action === "toggle") {
            await updateDoc(itemRef, {
                isActive: button.dataset.active !== "true",
                updatedAt: serverTimestamp()
            });
        }

        await loadItems();
    } catch (error) {
        console.error(error);
        notifyUser("Prim kalemi işlemi yapılırken hata oluştu.", MESSAGE_TYPES.ERROR);
    }
});

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) loadItems().catch(console.error);
});
