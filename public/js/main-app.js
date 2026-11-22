// ==========================================
// 1. ระบบค้นหา (Topbar Search + Shared Validation)
// ==========================================
const SEARCH_VALID_PATTERN = /^[\p{L}\p{N}\s.\-']+$/u;

// ตรวจสอบความถูกต้องของคำค้นหา (ใช้ร่วมกันทุกหน้า)
function validateSearchInput(rawValue) {
    const trimmed = (rawValue || "").trim();

    if (!trimmed) {
        return { valid: false, message: "Please enter a search keyword." };
    }
    if (trimmed.length < 2) {
        return { valid: false, message: "Please enter at least 2 characters." };
    }
    if (trimmed.length > 50) {
        return { valid: false, message: "Search keyword must not exceed 50 characters." };
    }
    if (!SEARCH_VALID_PATTERN.test(trimmed)) {
        return { valid: false, message: "Special characters are not allowed." };
    }

    return { valid: true, value: trimmed };
}

// แสดงกรอบสีแดงและข้อความแจ้งเตือนบนช่องค้นหา
function showSearchValidationError(inputEl, message) {
    if (!inputEl) return;
    inputEl.style.borderColor = "#FF383C";
    inputEl.setCustomValidity(message);
    inputEl.reportValidity();
    inputEl.focus();
}

// ตั้งค่าช่องค้นหาบน Header (ยกเว้นหน้า search.html ที่มีตัวจัดการเอง)
function initSearch() {
    const searchForm = document.querySelector(".search-form");
    const searchInput = document.querySelector("#search");

    if (!searchForm || !searchInput) return;
    if (window.location.pathname.endsWith("/search.html")) return;

    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q");
    if (query) {
        searchInput.value = query;
    }

    searchInput.addEventListener("input", () => {
        searchInput.setCustomValidity("");
        searchInput.style.borderColor = "";
    });

    searchForm.addEventListener("submit", (e) => {
        const result = validateSearchInput(searchInput.value);
        if (!result.valid) {
            e.preventDefault();
            showSearchValidationError(searchInput, result.message);
            return;
        }
        searchInput.value = result.value;
    });
}

// ==========================================
// 2. ระบบตรวจสอบสถานะการเข้าสู่ระบบ (Auth)
// ==========================================
let currentUser = null; // เก็บข้อมูลผู้ใช้ปัจจุบัน (null = ยังไม่ล็อกอิน)
let authReady;          // Promise ที่ resolve เมื่อเช็กสถานะ Auth เสร็จสิ้น

// เช็ก Session จาก Backend เมื่อโหลดหน้าเว็บ
async function checkStatusLogin() {
    const loginBtnEl = document.getElementById("btn-login");
    const profileEl = document.querySelector(".profile");
    const logoutBtnEl = document.querySelector(".btn-logout");

    try {
        const res = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include"
        });

        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;

            // ปลดล็อกการ์ด My favorite บนหน้า Dashboard (รองรับทั้งโครงสร้างเก่าและใหม่)
            document.getElementById("dashboard-favorites")?.classList.remove("is-locked");
            const loginOverlay = document.querySelector(".favorites-login-overlay, #fav-login-overlay");
            if (loginOverlay) loginOverlay.hidden = true;

            if (profileEl) {
                const nameEl = profileEl.querySelector(".name");
                const roleEl = profileEl.querySelector(".role");
                if (nameEl) nameEl.textContent = currentUser.name;
                if (roleEl) roleEl.textContent = currentUser.role || "Member";
                profileEl.hidden = false;
            }
            if (loginBtnEl) loginBtnEl.style.display = "none";
            if (logoutBtnEl) logoutBtnEl.closest(".bottom-nav").hidden = false;
        } else {
            handleGuestState(loginBtnEl, profileEl, logoutBtnEl);
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        handleGuestState(loginBtnEl, profileEl, logoutBtnEl);
    }
}

// จัดการการแสดงผลสำหรับผู้เยี่ยมชมทั่วไป (Guest)
function handleGuestState(loginBtnEl, profileEl, logoutBtnEl) {
    currentUser = null;
    if (loginBtnEl) loginBtnEl.style.display = "flex";
    if (profileEl) profileEl.hidden = true;
    if (logoutBtnEl) logoutBtnEl.closest(".bottom-nav").hidden = true;

    // หากอยู่หน้า My Favorites โดยไม่ได้ล็อกอิน ให้ส่งกลับไปหน้า Login
    if (window.location.pathname === "/my_fav.html") {
        window.location.href = "/login.html";
    }
}

// ออกจากระบบ (Log out)
async function handleLogout() {
    try {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
        });
    } catch (err) {
        console.error("Logout error:", err);
    } finally {
        window.location.href = "/login.html";
    }
}

// ==========================================
// 3. ระบบจัดการรายการโปรด (Favorites)
// ==========================================
const favoriteIds = { teams: new Set(), players: new Set() };
const MAX_PG_INT = 2147483647;

// นำเข้ารายการโปรดเก่าที่เคยบันทึกไว้ใน localStorage เข้าบัญชีผู้ใช้
async function importBrowserFavorites() {
    const teamKey = "football.teams.favorites.v1";
    const playerKey = "football.players.favorites.v1";
    const teamIds = JSON.parse(localStorage.getItem(teamKey) || "[]");
    const playerNames = JSON.parse(localStorage.getItem(playerKey) || "[]");

    if (!teamIds.length && !playerNames.length) return;
    if (!confirm("Import favorites saved in this browser into the signed-in account?")) return;

    let playerIds = [];
    if (playerNames.length) {
        const response = await fetch("/api/players");
        if (!response.ok) throw new Error("Could not look up saved players.");
        const players = await response.json();

        playerIds = players
            .filter((player) =>
                playerNames.includes(player.name) &&
                players.filter((entry) => entry.name === player.name).length === 1
            )
            .map((player) => player.id);
    }

    for (const [type, ids] of [["teams", teamIds], ["players", playerIds]]) {
        for (const id of new Set(ids.map(Number))) {
            if (!Number.isInteger(id) || id <= 0 || id > MAX_PG_INT) continue;
            const response = await fetch(`/api/favorites/${type}/${id}`, { method: "PUT" });
            if (!response.ok) throw new Error("Could not import favorites.");
        }
    }

    localStorage.removeItem(teamKey);
    if (playerIds.length === playerNames.length) {
        localStorage.removeItem(playerKey);
    } else {
        alert("Some saved player names could not be matched. You can add them from Players.");
    }
}

// โหลดรายการ ID ที่กดถูกใจทั้งหมดของผู้ใช้จาก API
async function loadFavoriteIds() {
    try {
        await importBrowserFavorites();
    } catch (error) {
        console.error("Could not import older favorites:", error);
    }

    try {
        const response = await fetch("/api/favorites");
        if (!response.ok) return;
        const data = await response.json();

        for (const type of ["teams", "players"]) {
            favoriteIds[type] = new Set(data[type].map(Number));
        }
        document.dispatchEvent(new Event("favoriteschange"));
    } catch (error) {
        console.error("Could not load favorites:", error);
    }
}

// สลับสถานะเพิ่ม/ลบรายการโปรดผ่าน API
async function toggleFavorite(type, id, button) {
    if (button.disabled) return;
    button.disabled = true;

    try {
        await authReady;
        if (!currentUser) {
            window.location.assign("/login.html");
            return;
        }

        const itemId = Number(id);
        const response = await fetch(`/api/favorites/${type}/${itemId}`, {
            method: favoriteIds[type].has(itemId) ? "DELETE" : "PUT"
        });

        if (response.status === 401) {
            window.location.assign("/login.html");
            return;
        }
        if (!response.ok) throw new Error("Favorite update failed.");

        const { isFav } = await response.json();
        if (isFav) {
            favoriteIds[type].add(itemId);
        } else {
            favoriteIds[type].delete(itemId);
        }
        document.dispatchEvent(new Event("favoriteschange"));
    } catch (error) {
        console.error(error);
        alert("Could not save this favorite. Please try again.");
    } finally {
        button.disabled = false;
    }
}

// ==========================================
// 4. Helper สำหรับสร้างโลโก้ทีมและจัดการรูปภาพเสีย
// ==========================================
function createTeamLogo(teamId, showPlaceholder = false, extraClass = "") {
    const logo = document.createElement("img");
    logo.className = extraClass ? `club-logo ${extraClass}` : "club-logo";
    logo.alt = "";
    logo.width = 28;
    logo.height = 28;
    logo.dataset.missingLogo = showPlaceholder ? "placeholder" : "hide";

    const id = Number(teamId);
    if (Number.isSafeInteger(id) && id > 0) {
        logo.setAttribute("src", `/assets/Logo_Teams/${id}.png`);
    } else if (showPlaceholder) {
        logo.setAttribute("src", "/assets/img.jpg");
    } else {
        logo.hidden = true;
    }
    return logo;
}

// ดักจับ Error หากโหลดรูปโลโก้ทีมไม่สำเร็จ ให้สลับเป็นรูปสำรองหรือซ่อนรูป
document.addEventListener("error", (event) => {
    const logo = event.target;
    if (!(logo instanceof HTMLImageElement) || !logo.dataset.missingLogo) return;

    if (logo.dataset.missingLogo === "placeholder" && logo.getAttribute("src") !== "/assets/img.jpg") {
        logo.src = "/assets/img.jpg";
        return;
    }
    logo.hidden = true;
}, true);

// ==========================================
// 5. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ (Init & Events)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    authReady = checkStatusLogin().then(() => currentUser && loadFavoriteIds());

    const logoutBtn = document.querySelector(".btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});

// Event Delegation: ดักจับการคลิกปุ่มหัวใจทุกปุ่มในหน้าเว็บ
document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-fav-id]");
    if (!button) return;

    event.preventDefault();
    toggleFavorite(button.dataset.favType, button.dataset.favId, button);
});