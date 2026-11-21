// ==========================================
// 1. ระบบค้นหา (Topbar Search)
// ==========================================
function initSearch() {
    const searchForm = document.querySelector(".search-form");
    const searchInput = document.querySelector("#search");

    if (!searchForm || !searchInput) return;

    // ดึงคำค้นหาจาก URL (?q=...) มาแสดงค้างไว้ในช่องค้นหา
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q");
    if (query) {
        searchInput.value = query;
    }

    // ป้องกันการกด Submit หากช่องค้นหาว่างเปล่า
    searchForm.addEventListener("submit", (e) => {
        if (!searchInput.value.trim()) {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

// ==========================================
// 2. ระบบตรวจสอบสถานะการเข้าสู่ระบบ (Auth)
// ==========================================
let currentUser = null; // เก็บข้อมูลผู้ใช้ปัจจุบัน (null = ยังไม่ล็อกอิน)

// เช็ก Session/Token จาก Backend เมื่อโหลดหน้าเว็บ
async function checkStatusLogin() {
    const authGuestEl = document.getElementById("btn-login");   // ปุ่ม Login / Register
    const authMemberEl = document.querySelector(".profile"); // ข้อมูลโปรไฟล์มุมขวาบน
    const logoutBtnEl = document.querySelector(".btn-logout");   // ปุ่ม Log out ล่างซ้าย

    try {
        const res = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include" // ส่ง Cookie/Session ไปตรวจสอบกับ Backend
        });

        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            document.getElementById("dashboard-favorites")?.classList.remove("is-locked");

            // อัปเดต UI สำหรับสมาชิกที่ล็อกอินแล้ว
            if (authMemberEl) {
                const nameEl = authMemberEl.querySelector(".name");
                const roleEl = authMemberEl.querySelector(".role");
                if (nameEl) nameEl.textContent = currentUser.name;
                if (roleEl) roleEl.textContent = currentUser.role || "Member";
                authMemberEl.hidden = false;
            }
            if (authGuestEl) authGuestEl.style.display = "none";
            if (logoutBtnEl) logoutBtnEl.closest(".bottom-nav").hidden = false;

            // โหลดรายการโปรดจาก Database (หากหน้านั้นมีฟังก์ชัน loadFavorites)
            if (typeof loadFavorites === "function") {
                await loadFavorites();
            }
        } else {
            // กรณี 401 Unauthorized หรือยังไม่ได้เข้าสู่ระบบ
            handleGuestState(authGuestEl, authMemberEl, logoutBtnEl);
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        handleGuestState(authGuestEl, authMemberEl, logoutBtnEl);
    } finally {
        // แสดงผล Element ที่ซ่อนไว้ระหว่างรอเช็กสถานะ (ป้องกันหน้าจอกระพริบ)
        if (authGuestEl) authGuestEl.style.visibility = "visible";
        if (authMemberEl) authMemberEl.style.visibility = "visible";
        if (logoutBtnEl) logoutBtnEl.style.visibility = "visible";
    }
}

// จัดการการแสดงผลสำหรับผู้เยี่ยมชมทั่วไป (Guest)
function handleGuestState(authGuestEl, authMemberEl, logoutBtnEl) {
    currentUser = null;
    if (authGuestEl) authGuestEl.style.display = "flex";
    if (authMemberEl) authMemberEl.hidden = true;
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
let authReady;

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
        playerIds = players.filter((player) =>
            playerNames.includes(player.name)
            && players.filter((entry) => entry.name === player.name).length === 1
        ).map((player) => player.id);
    }

    for (const [type, ids] of [["teams", teamIds], ["players", playerIds]]) {
        for (const id of new Set(ids.map(Number))) {
            if (!Number.isInteger(id) || id <= 0 || id > 2147483647) continue;
            const response = await fetch(`/api/favorites/${type}/${id}`, { method: "PUT" });
            if (!response.ok) throw new Error("Could not import favorites.");
        }
    }
    localStorage.removeItem(teamKey);
    if (playerIds.length === playerNames.length) localStorage.removeItem(playerKey);
    else alert("Some saved player names could not be matched. You can add them from Players.");
}

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
        if (isFav) favoriteIds[type].add(itemId);
        else favoriteIds[type].delete(itemId);
        document.dispatchEvent(new Event("favoriteschange"));
    } catch (error) {
        console.error(error);
        alert("Could not save this favorite. Please try again.");
    } finally {
        button.disabled = false;
    }
}

// ==========================================
// 4. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ (Init & Events)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    authReady = checkStatusLogin().then(() => currentUser && loadFavoriteIds());

    // ผูก Event ปุ่มออกจากระบบ
    const logoutBtn = document.querySelector(".btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-fav-id]");
    if (!button) return;
    event.preventDefault();
    toggleFavorite(button.dataset.favType, button.dataset.favId, button);
});

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

document.addEventListener("error", (event) => {
    const logo = event.target;
    if (!(logo instanceof HTMLImageElement) || !logo.dataset.missingLogo) return;
    if (logo.dataset.missingLogo === "placeholder" && logo.getAttribute("src") !== "/assets/img.jpg") {
        logo.src = "/assets/img.jpg";
        return;
    }
    logo.hidden = true;
}, true);
