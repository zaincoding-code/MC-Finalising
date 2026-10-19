/* Makkah Carpentry — site interactions (navigation, reveals, gallery, form). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BUSINESS_EMAIL = 'Makkahcarpentry@outlook.com';

  /* ---------- copyright year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- header ---------- */
  const header = $('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-compact', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- mobile menu ---------- */
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-menu]');
  if (toggle && menu) {
    const label = toggle.querySelector('.sr-only');
    const shielded = [$('main'), $('footer')].filter(Boolean);
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open, returnFocus) => {
      toggle.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Close menu' : 'Open menu';
      document.body.classList.toggle('menu-open', open);
      shielded.forEach((el) => { el.inert = open; });
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(() => {
          menu.classList.add('is-open');
          const first = menu.querySelector('a');
          if (first) first.focus();
        });
      } else {
        menu.classList.remove('is-open');
        setTimeout(() => { if (!isOpen()) menu.hidden = true; }, reduce ? 0 : 380);
        if (returnFocus) toggle.focus();
      }
    };
    toggle.addEventListener('click', () => setOpen(!isOpen(), false));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false, false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) setOpen(false, true); });
    window.matchMedia('(min-width: 1081px)').addEventListener('change', (e) => { if (e.matches && isOpen()) setOpen(false, false); });
  }

  /* ---------- current section in nav ---------- */
  const navLinks = $$('.site-nav a[href*="#"]');
  if (navLinks.length && 'IntersectionObserver' in window) {
    const sections = new Map();
    navLinks.forEach((a) => {
      const id = a.getAttribute('href').split('#')[1];
      const el = id && document.getElementById(id);
      if (el) sections.set(el, a);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((a) => a.removeAttribute('aria-current'));
        sections.get(en.target).setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((_, el) => io.observe(el));
  }

  /* ---------- scroll reveals ---------- */
  const revealEls = $$('[data-reveal], .reveal-img');
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- process timeline (scroll-linked line drawing) ---------- */
  const proc = $('[data-process]');
  if (proc) {
    const steps = $$('.process__step', proc);
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = proc.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.78 - r.top) / (r.height + vh * 0.2)));
      proc.style.setProperty('--p', p.toFixed(3));
      steps.forEach((s, i) => s.classList.toggle('is-reached', p >= i / steps.length + 0.02 || p >= 0.999));
    };
    const queue = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }

  /* ---------- project gallery lightbox ---------- */
  const dialog = $('[data-lightbox]');
  if (dialog && typeof dialog.showModal === 'function') {
    const img = $('.lightbox__img', dialog);
    const cap = $('.lightbox__caption', dialog);
    const count = $('.lightbox__count', dialog);
    const title = $('.lightbox__name', dialog);
    const prev = $('[data-lb-prev]', dialog);
    const next = $('[data-lb-next]', dialog);
    const galleries = {};
    let items = [];
    let idx = 0;
    let opener = null;

    $$('[data-gallery-item]').forEach((btn) => {
      const g = btn.dataset.galleryItem;
      (galleries[g] = galleries[g] || []).push(btn);
      btn.addEventListener('click', () => open(g, galleries[g].indexOf(btn), btn));
    });
    $$('[data-open-gallery]').forEach((b) => b.addEventListener('click', () => open(b.dataset.openGallery, 0, b)));

    const pad = (n) => String(n).padStart(2, '0');
    function show(i) {
      idx = (i + items.length) % items.length;
      const it = items[idx];
      const src = it.dataset.full;
      dialog.classList.add('is-switching');
      const swap = () => {
        img.src = src;
        img.alt = it.querySelector('img').alt;
        cap.textContent = it.dataset.caption || '';
        count.textContent = `${pad(idx + 1)} / ${pad(items.length)}`;
        requestAnimationFrame(() => dialog.classList.remove('is-switching'));
      };
      const pre = new Image();
      pre.onload = swap;
      pre.onerror = swap;
      pre.src = src;
      if (reduce) swap();
    }
    function open(g, i, from) {
      items = galleries[g] || [];
      if (!items.length) return;
      opener = from;
      title.textContent = items[0].dataset.project || '';
      const multi = items.length > 1;
      prev.hidden = !multi;
      next.hidden = !multi;
      show(i);
      dialog.showModal();
      requestAnimationFrame(() => dialog.classList.add('is-open'));
    }
    function close() { dialog.close(); }
    dialog.addEventListener('close', () => {
      dialog.classList.remove('is-open');
      if (opener) opener.focus();
    });
    $('[data-lb-close]', dialog).addEventListener('click', close);
    prev.addEventListener('click', () => show(idx - 1));
    next.addEventListener('click', () => show(idx + 1));
    dialog.addEventListener('keydown', (e) => {
      if (items.length < 2) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
    });
    dialog.addEventListener('click', (e) => { if (e.target.classList.contains('lightbox__stage')) close(); });
    let touchX = null;
    dialog.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    dialog.addEventListener('touchend', (e) => {
      if (touchX == null || items.length < 2) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
      touchX = null;
    });
  }

  /* ---------- enquiry form ---------- */
  const form = $('[data-enquiry-form]');
  if (form) {
    const wrap = form.closest('[data-form-wrap]');
    const success = wrap && $('[data-form-success]', wrap);
    const summary = $('[data-form-summary]', form);
    const status = $('[data-form-status]', form);
    const fields = form.elements;

    // "Discuss a Project", "Enquire About Subcontracting" and "Request company information"
    // buttons pre-fill the form, then bring the visitor to it. Works from other pages via ?enquiry=...
    const ENQUIRIES = {
      project: { type: '' },
      subcontracting: { type: 'Commercial subcontracting', message: 'We would like to discuss carpentry subcontracting. ' },
      info: { type: '', message: 'Please send through company information for our records. ' },
      capability: { type: 'Government or council', message: 'Please send through company information for our records. ' },
      // "Enquire about this service" links on each service card: the visitor chose a service, so select it.
      framing: { type: 'Framing', force: true },
      extensions: { type: 'Extension', force: true },
      'granny-flats': { type: 'Granny flat', force: true },
      eaves: { type: 'Eaves', force: true },
      renovations: { type: 'Renovation', force: true },
      'new-builds': { type: 'New build', force: true },
      decking: { type: 'Decking', force: true },
      pergolas: { type: 'Pergola', force: true },
      cladding: { type: 'Cladding', force: true },
    };
    function applyEnquiry(kind) {
      const preset = ENQUIRIES[kind];
      if (!preset) return;
      if (preset.type && (preset.force || !fields.type.value)) fields.type.value = preset.type;
      if (preset.message && !fields.message.value.trim()) fields.message.value = preset.message;
      syncFollowup();
      if (fields.type.getAttribute('aria-invalid') === 'true') check(fields.type);
    }

    // Follow-up questions for decking, pergolas and cladding: shown (and submitted) only for those services.
    const followup = $('[data-followup]', form);
    const FOLLOWUP = {
      Decking: { name: 'decking', materials: 'e.g. hardwood, composite, treated pine' },
      Pergola: { name: 'pergola', materials: 'e.g. timber, steel, roof sheeting or open' },
      Cladding: { name: 'cladding', materials: 'e.g. weatherboard, fibre cement, timber' },
    };
    function syncFollowup() {
      if (!followup) return;
      const cfg = FOLLOWUP[fields.type.value];
      followup.hidden = !cfg;
      followup.disabled = !cfg; // disabled fields are left out of the enquiry
      if (cfg) {
        $('[data-followup-name]', followup).textContent = cfg.name;
        $('[data-materials-input]', followup).placeholder = cfg.materials;
      }
    }
    fields.type.addEventListener('change', syncFollowup);

    // Service area: all of NSW. Regional, rural or unsure locations are flagged so travel and availability get confirmed.
    const areaNote = $('[data-area-note]', form);
    const outsideSydney = () => fields.area && /^(Regional|Rural|Not sure)/.test(fields.area.value);
    function syncArea() { if (areaNote) areaNote.hidden = !outsideSydney(); }
    if (fields.area) fields.area.addEventListener('change', syncArea);
    const params = new URLSearchParams(window.location.search);
    // (applied after the validation helpers below are defined)
    $$('a[data-enquiry]').forEach((a) => a.addEventListener('click', (e) => {
      if (!document.getElementById('contact')) return; // not on the home page: follow the link
      e.preventDefault();
      applyEnquiry(a.dataset.enquiry);
      if (!form.hidden) {
        document.getElementById('contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
        history.replaceState(null, '', '#contact');
        setTimeout(() => fields.name.focus({ preventScroll: true }), reduce ? 0 : 600);
      }
    }));

    // Wording depends on how the form is delivered (see the comment above the <form> in index.html).
    const currentMode = () => (form.dataset.submit === 'endpoint' ? (form.dataset.endpoint ? 'endpoint' : 'mailto') : (form.dataset.submit || 'mailto'));
    if (currentMode() !== 'mailto') {
      const label = $('[data-submit-label]', form);
      if (label) label.firstChild.textContent = 'Send Enquiry ';
      const note = $('[data-submit-note]', form);
      if (note) note.textContent = 'Your details are used only to respond to this enquiry. You will see a confirmation once it has been received.';
    }
    let busy = false;

    const rules = {
      name: (v) => v.trim().length >= 2 || 'Enter your full name.',
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Enter a valid email address, for example name@company.com.au.',
      phone: (v) => !v.trim() || (/^[0-9+()\s-]+$/.test(v.trim()) && v.replace(/\D/g, '').length >= 8) || 'Enter a valid phone number, or leave this field blank.',
      type: (v) => !!v || 'Select the type of project.',
      message: (v) => v.trim().length >= 20 || 'Describe the project and scope of work (at least 20 characters).',
      consent: (v, el) => el.checked || 'Confirm that we can use your details to respond to this enquiry.',
    };

    const errorFor = (el) => document.getElementById(`${el.id}-error`);
    function check(el) {
      const res = rules[el.name](el.value, el);
      const ok = res === true;
      el.setAttribute('aria-invalid', String(!ok));
      const field = el.closest('.field');
      if (field) field.classList.toggle('has-error', !ok);
      const err = errorFor(el);
      if (err) err.textContent = ok ? '' : res;
      return ok;
    }

    Object.keys(rules).forEach((name) => {
      const el = fields[name];
      if (!el) return;
      el.addEventListener('blur', () => { if (el.value || el.dataset.touched) { el.dataset.touched = '1'; check(el); } });
      const recheck = () => { if (el.getAttribute('aria-invalid') === 'true') check(el); };
      el.addEventListener('input', recheck);
      el.addEventListener('change', recheck);
    });

    if (params.get('enquiry')) applyEnquiry(params.get('enquiry'));
    syncFollowup();

    summary.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) target.focus();
    });

    function enquiryText(data) {
      const line = (k, v) => `${k}: ${v || '-'}`;
      return [
        line('Name', data.get('name')),
        line('Company / organisation', data.get('company')),
        line('Email', data.get('email')),
        line('Phone', data.get('phone')),
        line('Project type', data.get('type')),
        line('Project area', data.get('area') && (outsideSydney()
          ? `${data.get('area')} (travel, availability and scheduling to be confirmed)` : data.get('area'))),
        line('Project location', data.get('location')),
        line('Site access / travel / location notes', data.get('site_notes')),
        line('Estimated start', data.get('start')),
        ...(data.has('size') ? [
          line('Approximate size', data.get('size')),
          line('Preferred materials', data.get('materials')),
          line('Site access', data.get('access')),
          line('Drawings or plans', data.get('drawings')),
        ] : []),
        line('Procurement / tender requirements', data.get('procurement')),
        '',
        'Message and scope of work:',
        data.get('message') || '',
      ].join('\n');
    }

    function showSuccess(kind) {
      if (!success) return;
      $$('[data-success]', success).forEach((el) => { el.hidden = el.dataset.success !== kind; });
      form.hidden = true;
      success.hidden = false;
      success.focus();
    }

    $('[data-form-reset]', wrap || document)?.addEventListener('click', () => {
      form.reset();
      Object.keys(rules).forEach((n) => {
        const el = fields[n];
        if (!el) return;
        el.removeAttribute('aria-invalid');
        delete el.dataset.touched;
        el.closest('.field')?.classList.remove('has-error');
        const err = errorFor(el);
        if (err) err.textContent = '';
      });
      success.hidden = true;
      form.hidden = false;
      syncFollowup();
      syncArea();
      const cs = $('[data-copy-status]', wrap); if (cs) cs.textContent = '';
      fields.name.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Ignore double clicks and repeat submits: while one is in progress, or once the form has
      // been completed (the visitor must press "Start a new enquiry" to send another).
      if (busy || form.hidden) return;
      status.textContent = '';
      if (fields['bot-field'] && fields['bot-field'].value) return; // spam trap

      const invalid = Object.keys(rules).map((n) => fields[n]).filter((el) => el && !check(el));
      if (invalid.length) {
        const list = $('ul', summary);
        list.innerHTML = '';
        invalid.forEach((el) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `#${el.id}`;
          a.textContent = errorFor(el).textContent;
          li.appendChild(a);
          list.appendChild(li);
        });
        summary.hidden = false;
        summary.focus();
        return;
      }
      summary.hidden = true;

      const data = new FormData(form);
      // Flag for the notification email (form services send each field as a line).
      if (outsideSydney()) data.set('location_check', 'Regional, rural or unconfirmed NSW location: confirm travel, availability and scheduling');
      const mode = currentMode();
      const btn = form.querySelector('[type="submit"]');
      const btnLabel = btn.innerHTML;
      busy = true;
      btn.disabled = true;
      btn.textContent = mode === 'mailto' ? 'Preparing email…' : 'Sending…';

      try {
        if (mode === 'netlify') {
          // Netlify Forms: works once deployed to Netlify (see README).
          const res = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data).toString(),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          showSuccess('sent');
        } else if (mode === 'endpoint' && form.dataset.endpoint) {
          // A form service such as Formspree: public form URL only, never a secret key.
          const res = await fetch(form.dataset.endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: data });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          showSuccess('sent');
        } else {
          // No backend configured: hand the enquiry to the visitor's email app.
          const subject = `Project enquiry: ${data.get('type')} | ${data.get('name')}`;
          const href = `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(enquiryText(data))}`;
          const copy = $('[data-enquiry-copy]', wrap);
          if (copy) copy.textContent = `To: ${BUSINESS_EMAIL}\nSubject: ${subject}\n\n${enquiryText(data)}`;
          window.location.href = href;
          showSuccess('mailto');
        }
      } catch (err) {
        // The form keeps everything the visitor typed, so nothing is lost.
        status.innerHTML = '';
        status.append('Your enquiry has not been sent: the connection to our enquiry service failed. Your details are still in the form, so please try again, call 0414 955 844, or email ');
        const a = document.createElement('a');
        a.href = `mailto:${BUSINESS_EMAIL}`;
        a.textContent = BUSINESS_EMAIL;
        status.append(a, '.');
      } finally {
        busy = false;
        btn.disabled = false;
        btn.innerHTML = btnLabel;
      }
    });

    $('[data-copy-enquiry]', wrap)?.addEventListener('click', async () => {
      const text = $('[data-enquiry-copy]', wrap).textContent;
      const out = $('[data-copy-status]', wrap);
      try { await navigator.clipboard.writeText(text); out.textContent = 'Copied. Paste it into a new email to Makkahcarpentry@outlook.com.'; }
      catch { out.textContent = 'Couldn’t copy automatically. Select the text above and copy it.'; }
    });
  }

  /* ---------- print (capability statement) ---------- */
  $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
})();
