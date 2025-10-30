document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
      window.location.href = '/login/login.html';
    });
  }
});
