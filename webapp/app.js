import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://sqqbujdebygfbcpztmri.supabase.co';
const supabaseKey = 'sb_publishable_msK6DOpLi0E31YOGYDkrIw_AM8yxtQf';

const supabase = createClient(supabaseUrl, supabaseKey);

const bodyEl = document.body;
const appRoot = document.getElementById('appRoot');

const listEl = document.getElementById('list');
const searchInput = document.getElementById('searchInput');

const activeTabBtn = document.getElementById('activeTabBtn');
const archiveTabBtn = document.getElementById('archiveTabBtn');

const appAccessModal = document.getElementById('appAccessModal');
const appCodeInput = document.getElementById('appCodeInput');
const appAccessError = document.getElementById('appAccessError');
const appUnlockBtn = document.getElementById('appUnlockBtn');

const confirmModal = document.getElementById('confirmModal');
const modalUnitInfo = document.getElementById('modalUnitInfo');
const cancelBtn = document.getElementById('cancelBtn');
const confirmBtn = document.getElementById('confirmBtn');

const archiveAccessModal = document.getElementById('archiveAccessModal');
const archiveCodeInput = document.getElementById('archiveCodeInput');
const archiveAccessError = document.getElementById('archiveAccessError');
const archiveCancelBtn = document.getElementById('archiveCancelBtn');
const archiveUnlockBtn = document.getElementById('archiveUnlockBtn');

let allItems = [];
let filteredItems = [];
let pendingUseId = null;
let openCardId = null;
let currentTab = 'active';
let archiveUnlocked = false;
let appUnlocked = false;
let notifySet = new Set();
let appAccessCode = '';

function normalize(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

function matches(item, query) {
  const q = normalize(query);
  if (!q) return true;
  return normalize(item.tank).includes(q) || normalize(item.ref).includes(q);
}

function makeNotifyKey(tank, ref, email) {
  return `${String(tank || '').trim()}__${String(ref || '').trim()}__${String(email || '').trim().toLowerCase()}`;
}

function getSavedNotifyEmail() {
  return (localStorage.getItem('notify_email') || '').trim().toLowerCase();
}

async function loadItems() {
  if (!appAccessCode) {
    listEl.innerHTML = `<div class="empty">Access code required.</div>`;
    return;
  }

  const items = await fetchUnitsFromFunction(appAccessCode);

  if (!items) {
    console.error('loadItems failed: no items returned from get-units');
    listEl.innerHTML = `<div class="empty">Could not load data.</div>`;
    return;
  }

  allItems = items;
  applyFilter();
}

function setTab(tabName) {
  currentTab = tabName;
  activeTabBtn.classList.toggle('is-active', tabName === 'active');
  archiveTabBtn.classList.toggle('is-active', tabName === 'archive');
  openCardId = null;
  applyFilter();
}

function formatDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function applyFilter() {
  const query = searchInput.value || '';

  const baseItems = allItems.filter((item) => {
    if (currentTab === 'active') return item.status !== 'used';
    return item.status === 'used';
  });

  filteredItems = baseItems.filter((item) => matches(item, query));

  if (openCardId && !filteredItems.some((item) => item.id === openCardId)) {
    openCardId = null;
  }

  renderList();
}

function renderList() {
  if (!filteredItems.length) {
    const message =
      currentTab === 'archive'
        ? 'No archived units found'
        : 'No matching codes found';

    listEl.innerHTML = `<div class="empty">${message}</div>`;
    return;
  }

  const email = getSavedNotifyEmail();

  listEl.innerHTML = filteredItems
    .map((item) => {
      const isOpen = openCardId === item.id;
      const isActive = item.status === 'active' && item.a_kod;
      const isUsed = item.status === 'used';

      const notifyKey = makeNotifyKey(item.tank, item.ref, email);
      const notifyEnabled = !!email && notifySet.has(notifyKey);

      const statusLabel = isUsed
        ? 'Used'
        : isActive
          ? `A-code ${item.a_kod}`
          : 'Unit is not ready for pickup just yet';

      const statusClass = isUsed
        ? 'used-pill'
        : isActive
          ? 'code-pill'
          : 'pending-pill';

      const metaHtml = isUsed
        ? `
          <div class="card-meta">
            Pickup ref: ${escapeHtml(item.ref || '-')}
            <br>
            Archived: ${escapeHtml(formatDateTime(item.used_at))}
          </div>
        `
        : '';

      return `
        <article class="card ${isOpen ? 'open' : ''}" data-id="${item.id}">
          <button class="card-summary" type="button" data-action="toggle" data-id="${item.id}">
            <div class="tank">${escapeHtml(item.tank)}</div>
            <div class="${statusClass}">${escapeHtml(statusLabel)}</div>
          </button>

          <div class="card-expand">
            <div class="card-expand-inner">
              <div class="card-expand-content">
                ${metaHtml}

                <div class="card-actions">
                  ${isUsed
          ? ''
          : isActive
            ? `<button class="btn btn-used" type="button" data-action="used" data-id="${item.id}">Mark as used</button>`
            : `
                          <button
                            class="btn btn-notify ${notifyEnabled ? 'is-active' : ''}"
                            type="button"
                            data-action="notify"
                            data-id="${item.id}"
                            data-tank="${escapeAttr(item.tank)}"
                            data-ref="${escapeAttr(item.ref || '')}"
                          >
                            ${notifyEnabled ? 'Notification enabled' : 'Notify me'}
                          </button>
                        `
        }
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  bindCardEvents();
}

function bindCardEvents() {
  document.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const clickedCard = btn.closest('.card');
      const currentlyOpenCard = listEl.querySelector('.card.open');

      if (currentlyOpenCard && currentlyOpenCard !== clickedCard) {
        currentlyOpenCard.classList.remove('open');
      }

      const willOpen = !clickedCard.classList.contains('open');
      clickedCard.classList.toggle('open', willOpen);
      openCardId = willOpen ? id : null;
    });
  });

  document.querySelectorAll('[data-action="used"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.blur();
      pendingUseId = btn.dataset.id;

      const item = allItems.find((x) => x.id === pendingUseId);

      modalUnitInfo.innerHTML = `
        <strong>${escapeHtml(item?.tank || '')}</strong><br>
        ${escapeHtml(item?.a_kod || '')}
      `;

      openModal(confirmModal);
    });
  });

  document.querySelectorAll('[data-action="notify"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      searchInput.blur();

      const tank = btn.dataset.tank;
      const ref = btn.dataset.ref;

      await toggleNotification(tank, ref);
      renderList();
    });
  });
}

async function toggleNotification(tank, ref) {
  let email = getSavedNotifyEmail();

  if (!email) {
    email = window.prompt('Enter your email for notifications:') || '';
    email = email.trim().toLowerCase();

    if (!email) {
      return;
    }

    localStorage.setItem('notify_email', email);
  }

  const result = await toggleNotifyViaFunction(tank, ref, email);

  if (!result) {
    console.error('Could not toggle notification via Edge Function');
    return;
  }

  const key = makeNotifyKey(tank, ref, email);

  if (result.enabled) {
    notifySet.add(key);
  } else {
    notifySet.delete(key);
  }
}

async function verifyAppAccess(code) {
  try {
    const response = await fetch(
      'https://sqqbujdebygfbcpztmri.supabase.co/functions/v1/verify-access',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      }
    );

    const text = await response.text();
    console.log('verify-access status:', response.status);
    console.log('verify-access raw response:', text);

    if (!response.ok) {
      return false;
    }

    const data = JSON.parse(text);
    return data?.ok === true;
  } catch (error) {
    console.error('verify-access request failed', error);
    return false;
  }
}

async function verifyArchiveAccess(code) {
  try {
    const response = await fetch(
      'https://sqqbujdebygfbcpztmri.supabase.co/functions/v1/verify-archive',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      }
    );

    const text = await response.text();
    console.log('verify-archive status:', response.status);
    console.log('verify-archive raw response:', text);

    if (!response.ok) {
      return false;
    }

    const data = JSON.parse(text);
    return data?.ok === true;
  } catch (error) {
    console.error('verify-archive request failed', error);
    return false;
  }
}

async function fetchUnitsFromFunction(code) {
  try {
    const response = await fetch(
      'https://sqqbujdebygfbcpztmri.supabase.co/functions/v1/get-units',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      }
    );

    const text = await response.text();
    console.log('get-units status:', response.status);
    console.log('get-units raw response:', text);

    if (!response.ok) {
      return null;
    }

    const data = JSON.parse(text);
    if (data?.ok !== true || !Array.isArray(data.items)) {
      return null;
    }

    return data.items;
  } catch (error) {
    console.error('get-units request failed', error);
    return null;
  }
}

async function markUsedViaFunction(id) {
  if (!appAccessCode) {
    return null;
  }

  try {
    const response = await fetch(
      'https://sqqbujdebygfbcpztmri.supabase.co/functions/v1/mark-used',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: appAccessCode,
          id,
        }),
      }
    );

    const text = await response.text();
    console.log('mark-used status:', response.status);
    console.log('mark-used raw response:', text);

    if (!response.ok) {
      return null;
    }

    const data = JSON.parse(text);
    if (data?.ok !== true || !data.item) {
      return null;
    }

    return data.item;
  } catch (error) {
    console.error('mark-used request failed', error);
    return null;
  }
}

async function toggleNotifyViaFunction(tank, ref, email) {
  if (!appAccessCode) {
    return null;
  }

  try {
    const response = await fetch(
      'https://sqqbujdebygfbcpztmri.supabase.co/functions/v1/toggle-notify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: appAccessCode,
          tank,
          ref,
          email,
        }),
      }
    );

    const text = await response.text();
    console.log('toggle-notify status:', response.status);
    console.log('toggle-notify raw response:', text);

    if (!response.ok) {
      return null;
    }

    const data = JSON.parse(text);
    if (data?.ok !== true || typeof data.enabled !== 'boolean') {
      return null;
    }

    return data;
  } catch (error) {
    console.error('toggle-notify request failed', error);
    return null;
  }
}

function openModal(modalEl) {
  modalEl.classList.remove('hidden');
  modalEl.setAttribute('aria-hidden', 'false');
  bodyEl.classList.add('modal-open');
}

function closeModal(modalEl) {
  modalEl.classList.add('hidden');
  modalEl.setAttribute('aria-hidden', 'true');

  const anyModalOpen =
    !appAccessModal.classList.contains('hidden') ||
    !confirmModal.classList.contains('hidden') ||
    !archiveAccessModal.classList.contains('hidden');

  if (!anyModalOpen) {
    bodyEl.classList.remove('modal-open');
  }
}

async function markAsUsed(id) {
  const updatedItem = await markUsedViaFunction(id);

  if (!updatedItem) {
    console.error('Could not mark item as used via Edge Function');
    return;
  }

  allItems = allItems.map((item) =>
    item.id === id ? updatedItem : item
  );

  if (currentTab === 'active') {
    openCardId = null;
  }

  applyFilter();
}

function unlockAppUi() {
  appUnlocked = true;
  appRoot.classList.remove('app-hidden');
  closeModal(appAccessModal);
}

function lockAppUi() {
  appUnlocked = false;
  appRoot.classList.add('app-hidden');
  openModal(appAccessModal);
  setTimeout(() => appCodeInput.focus(), 20);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

searchInput.addEventListener('input', () => {
  applyFilter();
});

activeTabBtn.addEventListener('click', () => {
  setTab('active');
});

archiveTabBtn.addEventListener('click', () => {
  if (archiveUnlocked) {
    setTab('archive');
    return;
  }

  archiveCodeInput.value = '';
  archiveAccessError.classList.add('hidden');
  searchInput.blur();
  openModal(archiveAccessModal);
  setTimeout(() => archiveCodeInput.focus(), 20);
});

appUnlockBtn.addEventListener('click', async () => {
  const code = appCodeInput.value.trim();
  const ok = await verifyAppAccess(code);

  if (!ok) {
    appAccessError.classList.remove('hidden');
    return;
  }

  appAccessError.classList.add('hidden');
  appAccessCode = code;
  unlockAppUi();
  await loadItems();
});

appCodeInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    appUnlockBtn.click();
  }
});

cancelBtn.addEventListener('click', () => {
  pendingUseId = null;
  closeModal(confirmModal);
});

confirmBtn.addEventListener('click', async () => {
  if (!pendingUseId) return;
  const id = pendingUseId;
  pendingUseId = null;
  closeModal(confirmModal);
  await markAsUsed(id);
});

confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    pendingUseId = null;
    closeModal(confirmModal);
  }
});

archiveCancelBtn.addEventListener('click', () => {
  closeModal(archiveAccessModal);
});

archiveUnlockBtn.addEventListener('click', async () => {
  const code = archiveCodeInput.value.trim();
  const ok = await verifyArchiveAccess(code);
  if (!ok) {
    archiveAccessError.classList.remove('hidden');
    return;
  }

  archiveUnlocked = true;
  archiveAccessError.classList.add('hidden');
  closeModal(archiveAccessModal);
  setTab('archive');
});

archiveCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    archiveUnlockBtn.click();
  }
});

archiveAccessModal.addEventListener('click', (e) => {
  if (e.target === archiveAccessModal) {
    closeModal(archiveAccessModal);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!confirmModal.classList.contains('hidden')) {
      pendingUseId = null;
      closeModal(confirmModal);
    } else if (!archiveAccessModal.classList.contains('hidden')) {
      closeModal(archiveAccessModal);
    }
  }
});

async function init() {
  lockAppUi();
}

init();
