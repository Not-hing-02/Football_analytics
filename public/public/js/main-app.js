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
    const authGuestEl = document.getElementById("auth-guest");   // ปุ่ม Login / Register
    const authMemberEl = document.getElementById("auth-member"); // ข้อมูลโปรไฟล์มุมขวาบน
    const logoutBtnEl = document.getElementById("logout-btn");   // ปุ่ม Log out ล่างซ้าย

    try {
        const res = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include" // ส่ง Cookie/Session ไปตรวจสอบกับ Backend
        });

        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;

            // อัปเดต UI สำหรับสมาชิกที่ล็อกอินแล้ว
            if (authMemberEl) {
                const nameEl = authMemberEl.querySelector(".user-name");
                const roleEl = authMemberEl.querySelector(".user-role");
                if (nameEl) nameEl.textContent = currentUser.name;
                if (roleEl) roleEl.textContent = currentUser.role || "Member";
                authMemberEl.style.display = "flex";
            }
            if (authGuestEl) authGuestEl.style.display = "none";
            if (logoutBtnEl) logoutBtnEl.style.display = "flex";

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
    if (authMemberEl) authMemberEl.style.display = "none";
    if (logoutBtnEl) logoutBtnEl.style.display = "none";

    // หากอยู่หน้า My Favorites โดยไม่ได้ล็อกอิน ให้ส่งกลับไปหน้า Login
    if (window.location.pathname.includes("my_fav.html")) {
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
const FAV_STORAGE_KEY = {
    teams: "pl_fav_teams",
    players: "pl_fav_players"
};

// อ่านรายการ ID ที่บันทึกไว้จาก localStorage (ค่าเริ่มต้นทีมคือ [17] Nottingham Forest)
function getFavorites(type) {
    const raw = localStorage.getItem(FAV_STORAGE_KEY[type]);
    if (!raw) {
        const defaultData = type === "teams" ? [17] : [];
        localStorage.setItem(FAV_STORAGE_KEY[type], JSON.stringify(defaultData));
        return defaultData;
    }
    return JSON.parse(raw);
}

// อัปเดตสีและไอคอนของปุ่มหัวใจบนหน้าจอ
function updateHeartUI(btnElement, isFav) {
    btnElement.classList.toggle("active", isFav);
    btnElement.style.color = isFav ? "#ef4444" : "#9ca3af";
    btnElement.innerHTML = isFav ? "&#10084;" : "&#9825;"; // ❤ หรือ ♡
    btnElement.title = isFav ? "Remove from favorites" : "Add to favorites";
}

// เพิ่มหรือลบ ID ออกจากรายการโปรด คืนค่าเป็นสถานะล่าสุด (true = เพิ่ม, false = ลบ)
function toggleFavorite(type, id, btnElement = null) {
    const numId = Number(id);
    let favList = getFavorites(type);
    const exists = favList.includes(numId);

    favList = exists
        ? favList.filter((item) => item !== numId)
        : [...favList, numId];

    localStorage.setItem(FAV_STORAGE_KEY[type], JSON.stringify(favList));

    const isNowFav = !exists;
    if (btnElement) {
        updateHeartUI(btnElement, isNowFav);
    }
    return isNowFav;
}

// ==========================================
// 4. เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ (Init & Events)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    checkStatusLogin();

    // ผูก Event ปุ่มออกจากระบบ
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});

// Event Delegation: ดักจับการคลิกปุ่มหัวใจ ([data-fav-id]) ทุกปุ่มในหน้าเว็บ
document.addEventListener("click", (e) => {
    const favBtn = e.target.closest("[data-fav-id]");
    if (!favBtn) return;

    e.preventDefault();
    e.stopPropagation();

    // ตรวจสอบการล็อกอินก่อนอนุญาตให้กดหัวใจ
    if (!currentUser) {
        alert("กรุณาเข้าสู่ระบบก่อนบันทึกรายการโปรด");
        window.location.href = "/login.html";
        return;
    }

    const { favType, favId, removeCard } = favBtn.dataset;
    const isNowFav = toggleFavorite(favType, favId, favBtn);

    // หากกดเอาออกในหน้า My Favorites ให้ลบการ์ดนั้นออกจากหน้าจอทันที
    if (!isNowFav && removeCard === "true") {
        const card = favBtn.closest(".fav-card, .team-card, .player-card");
        if (card) card.remove();
    }
});

