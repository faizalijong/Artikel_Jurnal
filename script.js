
async function migrateOldJournals() {
  const OLD_STORAGE_KEY = "lexscholar_journals_v1";

  let oldItems = [];

  try {
    oldItems = JSON.parse(
      localStorage.getItem(OLD_STORAGE_KEY) || "[]"
    );
  } catch (error) {
    console.error("Gagal membaca jurnal lama:", error);
    return;
  }

  if (!Array.isArray(oldItems) || oldItems.length === 0) {
    return;
  }

  try {
    const existing = await getAllJournals();
    const knownIds = new Set(existing.map(item => item.id));

    for (const item of oldItems) {
      if (
        !item?.id ||
        knownIds.has(item.id) ||
        typeof item.dataUrl !== "string"
      ) {
        continue;
      }

      const response = await fetch(item.dataUrl);

      if (!response.ok) {
        throw new Error("PDF lama gagal dibaca.");
      }

      const blob = await response.blob();

      await putJournal({
        ...item,
        fileBlob: blob
      });

      knownIds.add(item.id);
    }

    // Hapus cadangan lama setelah migrasi berhasil.
    localStorage.removeItem(OLD_STORAGE_KEY);

    console.log("Migrasi jurnal berhasil.");

  } catch (error) {
    console.error("Migrasi jurnal gagal:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (selector) => document.querySelector(selector);

  // MENU MOBILE
  const menuToggle = $("#menuToggle");
  const sidebar = $("#sidebar");

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  document.addEventListener("click", (event) => {
    if (
      sidebar?.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menuToggle?.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }
  });

  // TAHUN FOOTER
  const yearLabel = $("#currentYear");
  if (yearLabel) {
    yearLabel.textContent = new Date().getFullYear();
  }

  // DATABASE INDEXEDDB
  const DB_NAME = "LexScholarDB";
  const STORE_NAME = "journals";
  const OLD_STORAGE_KEY = "lexscholar_journals_v1";

  const currentYear = new Date().getFullYear();
  const list = $("#journalList");
  const empty = $("#emptyState");
  const search = $("#globalSearch");
  const form = $("#journalForm");

  const objectUrls = new Set();

  // MENGHINDARI HTML BERBAHAYA
  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  // MEMBUKA DATABASE
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB tidak didukung."));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id"
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  let db;

  try {
    db = await openDatabase();
  } catch (error) {
    console.error(error);

    const message = $("#formMessage");
    if (message) {
      message.textContent =
        "Database gagal dibuka. Jalankan website menggunakan Live Server.";
    }

    return;
  }

  // MENGAMBIL SEMUA JURNAL
  function getAllJournals() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // MENYIMPAN JURNAL
  function putJournal(journal) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).put(journal);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // MENGHAPUS JURNAL
  function deleteJournal(id) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).delete(id);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // MEMINDAHKAN DATA LAMA
  async function migrateOldJournals() {
    let oldItems = [];

    try {
      oldItems = JSON.parse(
        localStorage.getItem(OLD_STORAGE_KEY) || "[]"
      );
    } catch (error) {
      console.warn("Data lama tidak dapat dibaca:", error);
    }

    if (!Array.isArray(oldItems) || oldItems.length === 0) {
      return;
    }

    const existing = await getAllJournals();
    const knownIds = new Set(existing.map(item => item.id));

    for (const item of oldItems) {
      if (
        !item?.id ||
        knownIds.has(item.id) ||
        typeof item.dataUrl !== "string"
      ) {
        continue;
      }

      try {
        const response = await fetch(item.dataUrl);
        const blob = await response.blob();

        await putJournal({
          ...item,
          fileBlob: blob
        });
      } catch (error) {
        console.warn("Migrasi jurnal gagal:", error);
      }
    }
  }

  // MEMBUAT URL PDF
  function makePdfUrl(blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  }

  // MENAMPILKAN JURNAL
  async function renderJournals(query = "") {
    if (!list) return;

    const journals = await getAllJournals();
    const normalized = query.trim().toLowerCase();

    const filtered = journals
      .filter(journal =>
        [
          journal.title,
          journal.author,
          journal.category,
          journal.year
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      )
      .sort(
        (a, b) =>
          (b.createdAt || 0) - (a.createdAt || 0)
      );

    $("#totalJurnal") &&
      ($("#totalJurnal").textContent = journals.length);

    $("#uploadedYear") &&
      ($("#uploadedYear").textContent =
        journals.filter(
          journal => Number(journal.uploadedYear) === currentYear
        ).length);

    $("#totalKategori") &&
      ($("#totalKategori").textContent =
        new Set(journals.map(journal => journal.category)).size);

    $("#collectionCount") &&
      ($("#collectionCount").textContent =
        `${filtered.length} dokumen`);

    // MEMBERSIHKAN URL LAMA
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls.clear();

    list.innerHTML = filtered.map(journal => {
      const pdfUrl =
        journal.fileBlob instanceof Blob
          ? makePdfUrl(journal.fileBlob)
          : "";

      return `
        <article class="journal-item">

          <div class="pdf-icon">PDF</div>

          <div class="journal-info">
            <h3>${escapeHTML(journal.title)}</h3>

            <p>
              ${escapeHTML(journal.author)}
              ·
              ${escapeHTML(journal.year)}
            </p>

            <div class="journal-meta">
              <span>${escapeHTML(journal.category)}</span>
            </div>
          </div>

          <div class="journal-actions">

            ${
              pdfUrl
                ? `
                  <a
                    href="${pdfUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Buka
                  </a>
                `
                : "<span>PDF tidak ditemukan</span>"
            }

            <button
              type="button"
              data-delete="${escapeHTML(journal.id)}"
            >
              Hapus
            </button>

          </div>
        </article>
      `;
    }).join("");

    if (empty) {
      empty.hidden = filtered.length > 0;
    }

    if (journals.length === 0 && empty) {
      empty.hidden = false;
    }

    // EVENT HAPUS
    list.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", async () => {
        const confirmed = confirm(
          "Apakah kamu yakin ingin menghapus jurnal ini?"
        );

        if (!confirmed) return;

        try {
          await deleteJournal(button.dataset.delete);
          await renderJournals(search?.value || "");
        } catch (error) {
          console.error(error);
          alert("Jurnal gagal dihapus.");
        }
      });
    });
  }

  // MIGRASI DATA LAMA
  try {
    await migrateOldJournals();
  } catch (error) {
    console.error("Migrasi gagal:", error);
  }

  // PENCARIAN JURNAL
  if (search) {
    search.addEventListener("input", () => {
      renderJournals(search.value);
    });
  }

  // RESET PENCARIAN
  $("#clearSearch")?.addEventListener("click", () => {
    if (search) search.value = "";
    renderJournals("");
  });

  // UPLOAD PDF
  if (form) {
    const fileInput = $("#pdfFile");

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      const hint = $("#fileHint");

      if (hint) {
        hint.textContent = file
          ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`
          : "Klik untuk memilih file dari perangkat Anda · Maksimal 25 MB";
      }
    });

    // PROSES SIMPAN JURNAL
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const file = fileInput?.files?.[0];
      const message = $("#formMessage");

      if (
        !file ||
        (
          file.type !== "application/pdf" &&
          !file.name.toLowerCase().endsWith(".pdf")
        )
      ) {
        message.textContent = "Silakan pilih file PDF yang valid.";
        return;
      }

      if (file.size > 25 * 1024 * 1024) {
        message.textContent = "Ukuran PDF maksimal 25 MB.";
        return;
      }

      const submitButton =
        form.querySelector('button[type="submit"]');

      if (submitButton) submitButton.disabled = true;

      message.textContent = "Menyimpan jurnal...";

      try {
        const journal = {
          id: (
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : String(Date.now())
          ),

          title: $("#title").value.trim(),
          author: $("#author").value.trim(),
          year: $("#year").value,
          category: $("#category").value,
          abstract: $("#abstract").value.trim(),

          uploadedYear: currentYear,
          createdAt: Date.now(),

          fileName: file.name,
          fileBlob: file
        };

        await putJournal(journal);

        form.reset();

        $("#fileHint").textContent =
          "Klik untuk memilih file dari perangkat Anda · Maksimal 25 MB";

        message.textContent =
          "Jurnal berhasil disimpan. Silakan klik Buka untuk membaca PDF.";

        await renderJournals(search?.value || "");

      } catch (error) {
        console.error(error);

        message.textContent =
          "Jurnal gagal disimpan. Periksa penyimpanan browser.";
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  // TAMPILKAN DATA SAAT WEBSITE DIBUKA
  try {
    await renderJournals();
  } catch (error) {
    console.error("Gagal menampilkan jurnal:", error);
  }

});
