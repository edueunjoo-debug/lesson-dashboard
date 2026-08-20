/* ===========================================================
   선택 사항: 가벼운 "입장 비밀번호" 화면.

   ⚠️ 중요: 이 사이트는 정적 HTML/JS라서 이 잠금은 진짜 보안이
   아닙니다. 개발자도구(F12)로 소스를 보거나, data.json 주소를
   직접 열거나, localStorage 값을 지우면 누구나 우회할 수 있습니다.
   검색엔진 노출이나 우연히 링크를 보게 된 사람을 막는 정도의
   "가벼운 안내문" 용도로만 사용하세요. 진짜 비공개가 필요하면
   배포_가이드.md의 다른 방법을 참고하세요.
   =========================================================== */

(function () {
  if (!SITE_PASSWORD_SHA256) return; // config.js에서 설정 안 했으면 그냥 통과

  const UNLOCK_KEY = "lesson_dashboard_unlocked";
  if (localStorage.getItem(UNLOCK_KEY) === "yes") return;

  document.documentElement.classList.add("gate-locked");

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function init() {
    const overlay = document.getElementById("password-gate");
    const input = document.getElementById("gate-password-input");
    const btn = document.getElementById("gate-password-submit");
    const errorEl = document.getElementById("gate-password-error");
    overlay.style.display = "flex";
    input.focus();

    async function tryUnlock() {
      if (!input.value) return;
      const hash = await sha256Hex(input.value);
      if (hash === SITE_PASSWORD_SHA256) {
        localStorage.setItem(UNLOCK_KEY, "yes");
        document.documentElement.classList.remove("gate-locked");
        overlay.style.display = "none";
      } else {
        errorEl.style.display = "block";
        input.value = "";
        input.focus();
      }
    }

    btn.addEventListener("click", tryUnlock);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryUnlock();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
