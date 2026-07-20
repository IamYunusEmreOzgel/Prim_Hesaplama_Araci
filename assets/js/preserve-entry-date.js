/**
 * Tekli kayıt formu sıfırlanırken kullanıcının son seçtiği tarihi korur.
 *
 * Bu modül yalnızca form alanlarının sıfırlanma davranışını düzenler;
 * Firestore kayıt modeline ve prim hesaplama mantığına müdahale etmez.
 */

const entryForm = document.querySelector("#entryForm");
const itemSelect = document.querySelector("#itemSelect");
const quantityInput = document.querySelector("#quantity");
const entryDate = document.querySelector("#entryDate");

if (entryForm && entryDate) {
    entryForm.addEventListener("reset", (event) => {
        const lastSelectedDate = entryDate.value;

        // Varsayılan form sıfırlamasını durdurup yalnızca tekrar girilecek alanları temizle.
        event.preventDefault();

        if (itemSelect) itemSelect.value = "";
        if (quantityInput) quantityInput.value = "1";

        // entries.js tarih alanını bugüne çevirdikten sonra son kullanılan tarihi geri yükle.
        queueMicrotask(() => {
            entryDate.value = lastSelectedDate;
        });
    });
}
