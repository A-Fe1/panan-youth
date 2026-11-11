/* ============================================================
 * 工具函数库
 * ============================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ---------- toast 轻提示 ---------- */
let _toastTimer = null;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 弹窗 ---------- */
function showModal({ title = '', html = '', buttons = [{ label: '知道了', class: 'btn-primary' }] }) {
  const mask = $('#modal-mask');
  const box = $('#modal-box');
  box.innerHTML = (title ? `<div class="modal-title">${escapeHtml(title)}</div>` : '') +
    `<div class="modal-text">${html}</div><div class="modal-btns"></div>`;
  const btnRow = box.querySelector('.modal-btns');
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.class || 'btn-ghost');
    btn.textContent = b.label;
    btn.onclick = () => { closeModal(); if (b.onClick) b.onClick(); };
    btnRow.appendChild(btn);
  });
  mask.classList.remove('hidden');
}
function closeModal() { $('#modal-mask').classList.add('hidden'); }
$('#modal-mask') && $('#modal-mask').addEventListener('click', (e) => {
  if (e.target.id === 'modal-mask') closeModal();
});

function confirmBox(title, html, onOk) {
  showModal({
    title, html,
    buttons: [
      { label: '取消', class: 'btn-ghost' },
      { label: '确定', class: 'btn-primary', onClick: onOk }
    ]
  });
}

/* ---------- 大图预览 ---------- */
function viewImage(url) {
  const v = document.createElement('div');
  v.className = 'img-viewer';
  v.innerHTML = `<img src="${url}" alt="">`;
  v.onclick = () => v.remove();
  document.body.appendChild(v);
}

/* ---------- HTML 转义 ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- 校验 ---------- */
function validPhone(p) { return /^1[3-9]\d{9}$/.test(p); }
function validPassword(p) { return /^\S{6,20}$/.test(p); }

/* ---------- 日期 ---------- */
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- 哈希（真实模式安全用，PBKDF2 慢哈希防枚举） ---------- */
const HASH_PEPPER = 'panan-youth-2026-v1';   // 全局胡椒，防离线枚举手机号
const PBKDF2_ITER = 100000;

async function pbkdf2Hex(text, salt, iterations = PBKDF2_ITER) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(text), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations },
    keyMat, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* 手机号确定性哈希（用于密保表查询，不暴露明文手机号） */
async function phoneHash(phone) { return pbkdf2Hex(phone, HASH_PEPPER); }

/* 密保答案哈希（以 phone_hash 为盐，确定性） */
async function answerHash(answer, ph) {
  return pbkdf2Hex(String(answer).trim().toLowerCase(), 'ans:' + ph);
}

function randomHex(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- 照片压缩 ---------- */
/* 返回 { blob, dataUrl }，自动缩放+压缩为 JPEG */
function compressImage(file, maxEdge = PHOTO_MAX_EDGE, quality = PHOTO_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('请选择图片文件')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(b => resolve({ blob: b, dataUrl }), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

/* ---------- 演示模式小工具 ---------- */
function genId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* 防抖 */
function debounce(fn, ms = 400) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
