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

/* dataUrl 手动转为 Blob（部分手机浏览器 canvas.toBlob 异常时的兜底） */
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(parts[1] || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* 传统解码路径：FileReader + Image（兼容旧浏览器，Safari 也能解码 HEIC 照片） */
function legacyDecodeImage(file, onOk, onFail) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => onOk(img);
    img.onerror = () => onFail(new Error('图片读取失败，请换一张试试'));
    img.src = reader.result;
  };
  reader.onerror = () => onFail(new Error('图片读取失败，请换一张试试'));
  reader.readAsDataURL(file);
}

/* ---------- 照片压缩（iOS 加固版） ----------
 * iPhone Safari 处理大照片（尤其 1200 万像素）时，
 * canvas 偶尔输出空数据导致上传报 no content provided。
 * 策略：优先 createImageBitmap（更省内存）→ 逐级缩小尺寸重试 3 次
 * → toBlob 失败时用 dataUrl 手动构造 → 全部失败才报错。
 */
function compressImage(file, maxEdge = PHOTO_MAX_EDGE, quality = PHOTO_QUALITY) {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('请选择图片文件'));
  }

  const oneAttempt = (edge) => new Promise((resolve, reject) => {
    const finish = (src) => {
      let w = src.width, h = src.height;
      const scale = Math.min(1, edge / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      if (w < 1 || h < 1) { reject(new Error('compress_failed')); return; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(src, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      canvas.toBlob(b => {
        let blob = (b && b.size > 0) ? b : null;
        if (!blob) { try { blob = dataUrlToBlob(dataUrl); } catch (e) { /* 忽略 */ } }
        if (blob && blob.size > 500 && dataUrl.length > 100) {
          resolve({ blob, dataUrl });
        } else {
          reject(new Error('compress_failed'));
        }
      }, 'image/jpeg', quality);
    };
    if (window.createImageBitmap) {
      createImageBitmap(file).then(finish).catch(() => legacyDecodeImage(file, finish, reject));
    } else {
      legacyDecodeImage(file, finish, reject);
    }
  });

  return oneAttempt(maxEdge)
    .catch(e => {
      if (e.message === 'compress_failed') return oneAttempt(Math.round(maxEdge * 0.6));
      throw e;
    })
    .catch(e => {
      if (e.message === 'compress_failed') return oneAttempt(480);
      throw e;
    })
    .catch(() => {
      throw new Error('图片处理失败，请换一张照片，或用相机重新拍一张试试');
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
