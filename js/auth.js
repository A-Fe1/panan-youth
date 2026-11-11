/* ============================================================
 * 登录 / 注册 / 找回密码
 * ============================================================ */

const Auth = {

  bind() {
    /* ---------- 登录 ---------- */
    $('#btn-login').addEventListener('click', async () => {
      const phone = $('#login-phone').value.trim();
      const pwd = $('#login-password').value;
      if (!validPhone(phone)) { toast('请输入正确的11位手机号'); return; }
      if (!pwd) { toast('请输入密码'); return; }
      const btn = $('#btn-login');
      btn.disabled = true; btn.textContent = '登录中…';
      const r = await DB.auth.signIn(phone, pwd);
      btn.disabled = false; btn.textContent = '登 录';
      if (!r.ok) { toast(r.error); return; }
      location.hash = '#/discover';
    });
    // 回车快捷登录
    $('#login-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });

    /* ---------- 注册 ---------- */
    $('#btn-register').addEventListener('click', async () => {
      const phone = $('#reg-phone').value.trim();
      const pwd = $('#reg-password').value;
      const pwd2 = $('#reg-password2').value;
      const secq = $('#reg-secq').value.trim();
      const seca = $('#reg-seca').value.trim();
      if (!validPhone(phone)) { toast('请输入正确的11位手机号'); return; }
      if (!validPassword(pwd)) { toast('密码需为6-20位，不含空格'); return; }
      if (pwd !== pwd2) { toast('两次输入的密码不一致'); return; }
      if (!secq || !seca) { toast('请设置密保问题和答案'); return; }
      if (!$('#reg-agree').checked) { toast('请先阅读并勾选同意用户协议'); return; }
      const btn = $('#btn-register');
      btn.disabled = true; btn.textContent = '注册中…';
      const r = await DB.auth.signUp({ phone, password: pwd, secq, seca });
      btn.disabled = false; btn.textContent = '注 册';
      if (!r.ok) { toast(r.error); return; }
      toast('注册成功，请完善个人资料');
      location.hash = '#/edit';
    });

    /* ---------- 找回密码 ---------- */
    $('#btn-fg-phone').addEventListener('click', async () => {
      const phone = $('#fg-phone').value.trim();
      if (!validPhone(phone)) { toast('请输入正确的11位手机号'); return; }
      const s = await DB.auth.getSecqa(phone);
      if (!s) { toast('该手机号未注册'); return; }
      $('#fg-question').textContent = '「 ' + s.question + ' 」';
      $('#forgot-step1').classList.add('hidden');
      $('#forgot-step2').classList.remove('hidden');
    });

    $('#btn-fg-answer').addEventListener('click', async () => {
      const phone = $('#fg-phone').value.trim();
      const answer = $('#fg-answer').value.trim();
      if (!answer) { toast('请输入密保答案'); return; }
      const ok = await DB.auth.verifySecqa(phone, answer);
      if (!ok) { toast('密保答案不正确'); return; }
      $('#fg-admin-contact').textContent = ADMIN_CONTACT;
      $('#forgot-step2').classList.add('hidden');
      $('#forgot-step3').classList.remove('hidden');
    });
  },

  /* 进入忘记密码页时重置步骤 */
  resetForgot() {
    $('#forgot-step1').classList.remove('hidden');
    $('#forgot-step2').classList.add('hidden');
    $('#forgot-step3').classList.add('hidden');
    $('#fg-phone').value = '';
    $('#fg-answer').value = '';
  }
};
