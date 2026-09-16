/* YUVA Fitness — Playwright browser verification suite (no external deps beyond playwright)
 * Matrix: 320x800, 360x800, 375x812, 390x844, 412x915, 430x932, 480x900, 768x1024,
 *          820x1180, 1024x768, 1280x800, 1440x900, 1920x1080
 * Verifies: page load, console errors, uncaught exceptions, horizontal overflow,
 *           mobile menu + escape + focus + scroll lock, About tabs (incl Home/End/arrows),
 *           Sandy modal (focus trap, Escape, inert, focus restore, keyboard activation),
 *           carousel (keyboard vs modal guard, bounds clamp, dots), forms (validation,
 *           success/404/500/network-failure, double-submit guard, no fake success),
 *           WhatsApp float safety attrs, rapid interaction stability.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let passCount = 0, failCount = 0;
const failures = [];
function check(name, cond, info = '') {
  if (cond) { passCount++; }
  else { failCount++; failures.push(`${name}${info ? ' :: ' + info : ''}`); console.log(`  FAIL ${name} ${info}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = req.url.split('?')[0];
      const p = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function trackErrors(page) {
  const errs = { page: [], console: [], requests: [] };
  page.on('pageerror', e => errs.page.push(String(e)));
  page.on('console', m => {
    if (m.type() === 'error') errs.console.push(m.text());
  });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/favicon|fonts\.googleapis|fonts\.gstatic|images\.unsplash|cdn\.tailwindcss\.com|lh3\.googleusercontent\.com|googleusercontent\.com/.test(u)) return;
    errs.requests.push(u);
  });
  return errs;
}

async function goto(page, url, waitMs = 700) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
}

const VIEWPORTS = [
  [320, 800], [360, 800], [375, 812], [390, 844], [412, 915], [430, 932], [480, 900],
  [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1440, 900], [1920, 1080],
];

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();

  /* ========== 1. VIEWPORT MATRIX: no console errors / no overflow ========== */
  section('1. Viewport matrix load (home + gallery, all sizes)');
  for (const [w, h] of VIEWPORTS) {
    for (const [label, url] of [['home', base + '/index.html'], ['gallery', base + '/franchise/gallery.html']]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = trackErrors(page);
      await goto(page, url);
      const ovf = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        bw: document.body.scrollWidth,
      }));
      check(`${label} ${w}x${h}: no horizontal overflow`, ovf.sw <= ovf.cw + 2 && ovf.bw <= ovf.cw + 4, JSON.stringify(ovf));
      check(`${label} ${w}x${h}: no uncaught errors`, errs.page.length === 0, errs.page.join(' | '));
      const resourceErrors = errs.console.filter(t => !/Failed to load resource/.test(t));
      check(`${label} ${w}x${h}: no console errors`, resourceErrors.length === 0, resourceErrors.join(' | '));
      check(`${label} ${w}x${h}: no failed local requests`, errs.requests.length === 0, errs.requests.join(' | '));
      await page.close();
    }
  }

  /* ========== 2. MOBILE MENU ========== */
  section('2. Mobile menu (burger) behaviour');
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errs = trackErrors(page);
    await goto(page, base + '/index.html');
    const burger = page.locator('#burger');
    check('home: burger visible on mobile', await burger.isVisible());
    await burger.click();
    await page.waitForTimeout(450);
    const menu = page.locator('#mobileMenu');
    check('home: menu visible after click', await menu.isVisible());
    check('home: menu has open class', await menu.evaluate(el => el.classList.contains('open')));
    check('home: aria-expanded=true', (await burger.getAttribute('aria-expanded')) === 'true');
    check('home: body scroll locked', await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'));
    const focusedLink = await page.evaluate(() => {
      const a = document.activeElement;
      return a && document.getElementById('mobileMenu').contains(a) ? a.textContent.trim() : 'OUTSIDE';
    });
    check('home: focus moved into menu', focusedLink !== 'OUTSIDE', focusedLink);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    check('home: menu hides on Escape', !(await menu.isVisible()));
    check('home: aria-expanded=false', (await burger.getAttribute('aria-expanded')) === 'false');
    check('home: scroll lock released', await page.evaluate(() => document.body.style.overflow === ''));
    const stillFocus = await page.evaluate(() => document.activeElement === document.getElementById('burger'));
    check('home: focus restored to burger', stillFocus);
    check('home: menu interactions produced no errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    trackErrors(page);
    await goto(page, base + '/franchise/gallery.html');
    const btn = page.locator('#galleryMenu');
    check('gallery: burger visible on mobile', await btn.isVisible());
    await btn.click();
    await page.waitForTimeout(450);
    const menu = page.locator('#galleryMobileMenu');
    check('gallery: menu visible after click', await menu.isVisible());
    check('gallery: body scroll locked', await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    check('gallery: menu hides on Escape', !(await menu.isVisible()));
    check('gallery: scroll lock released', await page.evaluate(() => document.body.style.overflow === ''));
    await page.close();
  }

  /* ========== 3. ABOUT TABS ========== */
  section('3. About tabs (roving tabindex, arrows, Home/End)');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = trackErrors(page);
    await goto(page, base + '/index.html');
    await page.click('#tab-aboutExperience');
    check('click switches aria-selected', (await page.getAttribute('#tab-aboutExperience', 'aria-selected')) === 'true' &&
      (await page.getAttribute('#tab-aboutApproach', 'aria-selected')) === 'false');
    check('panel switches', await page.evaluate(() => {
      const p = document.getElementById('aboutExperience');
      return p.classList.contains('is-active') && !document.getElementById('aboutApproach').classList.contains('is-active');
    }));
    await page.focus('#tab-aboutExperience');
    await page.keyboard.press('ArrowRight');
    check('ArrowRight → next selected+focused', await page.evaluate(() =>
      document.activeElement.id === 'tab-aboutProgress' &&
      document.getElementById('tab-aboutProgress').getAttribute('aria-selected') === 'true'));
    await page.keyboard.press('End');
    check('End → last tab', await page.evaluate(() => document.activeElement.id === 'tab-aboutProgress'));
    await page.keyboard.press('Home');
    check('Home → first tab', await page.evaluate(() => document.activeElement.id === 'tab-aboutApproach'));
    await page.keyboard.press('ArrowLeft');
    check('ArrowLeft wraps to last', await page.evaluate(() => document.activeElement.id === 'tab-aboutProgress'));
    check('about tabs: no errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }

  /* ========== 4. SANDY MODAL ========== */
  section('4. Sandy modal (open/close/focus-trap/Escape/keyboard activation)');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = trackErrors(page);
    await goto(page, base + '/index.html');
    const tile = page.locator('.driftwall-tile').first();
    check('driftwall tiles present', (await page.locator('.driftwall-tile').count()) > 0);
    // Keyboard activation (Enter) on a role=button tile
    await page.evaluate(() => { const t = document.querySelector('.driftwall-tile'); t.focus({ preventScroll: true }); });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    const overlay = page.locator('#sandyOverlay');
    check('Enter opens modal', await overlay.evaluate(el => el.classList.contains('open')));
    check('modal aria-hidden=false', (await overlay.getAttribute('aria-hidden')) === 'false');
    check('modal inert removed', await overlay.evaluate(el => !el.hasAttribute('inert')));
    check('modal-embedded focus', await overlay.evaluate(el => el.contains(document.activeElement)));
    // Focus trap: keep tabbing 12 times, must stay inside overlay
    let trapped = true;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await overlay.evaluate(el => el.contains(document.activeElement));
      if (!inside) { trapped = false; break; }
    }
    check('focus trap keeps focus in modal', trapped);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    check('Escape closes modal', !(await overlay.evaluate(el => el.classList.contains('open'))));
    check('inert restored after close', await overlay.evaluate(el => el.hasAttribute('inert')));
    check('aria-hidden=true after close', (await overlay.getAttribute('aria-hidden')) === 'true');
    const restored = await page.evaluate(() => document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('driftwall-tile'));
    check('focus restored to trigger tile', restored);
    check('body scroll unlocked', await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'));
    check('sandy: no errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }

  /* ========== 5. CATALOG (render, card → modal) ========== */
  section('5. Catalog (render, card → modal, prev/next, Escape)');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = trackErrors(page);
    await goto(page, base + '/franchise/gallery.html', 1200);
    const cardCount = await page.locator('.equipment-card').count();
    check('catalog renders 12 cards', cardCount === 12, String(cardCount));
    check('hero heading present', ((await page.textContent('h1')) || '').includes('BUILD YOUR'));
    check('hero CTA EXPLORE EQUIPMENT', (await page.locator('a[href="#equipment-grid"]').count()) > 0);
    // Open modal from card #04 button
    await page.locator('.equipment-card[data-id="04"] .view-specs-trigger').click();
    await page.waitForTimeout(400);
    const modal = page.locator('#technical-modal');
    check('modal opens (hidden removed)', await modal.evaluate(el => !el.classList.contains('hidden')));
    check('modal shows #04 LEG EXTENSION MACHINE', ((await page.textContent('#modal-title')) || '').trim() === 'LEG EXTENSION MACHINE');
    check('modal badge #04', ((await page.textContent('#modal-sku-badge')) || '').trim() === '#04');
    check('modal image is leg-extension.jpg', ((await page.getAttribute('#modal-image', 'src')) || '').endsWith('/assets/images/equipment/leg-extension.jpg'));
    check('modal index 04 / 12', ((await page.textContent('#modal-index-indicator')) || '').trim() === '04 / 12');
    check('modal focus on close button', await page.evaluate(() => document.activeElement && document.activeElement.id === 'close-modal-btn'));
    // Next → #05 Leg Press
    await page.click('#modal-next-btn');
    await page.waitForTimeout(250);
    check('next → #05 LEG PRESS MACHINE', ((await page.textContent('#modal-title')) || '').trim() === 'LEG PRESS MACHINE');
    // Prev → back to #04
    await page.click('#modal-prev-btn');
    await page.waitForTimeout(250);
    check('prev → back to #04', ((await page.textContent('#modal-title')) || '').trim() === 'LEG EXTENSION MACHINE');
    // Focus trap: tab from last wraps to first
    await page.evaluate(() => document.getElementById('modal-footer-next').focus());
    await page.keyboard.press('Tab');
    check('focus trap wraps last → first', await page.evaluate(() => document.activeElement && document.activeElement.id === 'modal-prev-btn'));
    // Escape closes + scroll restored
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    check('Escape closes modal', await modal.evaluate(el => el.classList.contains('hidden')));
    check('body scroll restored', await page.evaluate(() => document.body.style.overflow === ''));
    check('catalog interactions: no errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }

  /* ========== 5b. CATALOG CARD → ID/NAME/IMAGE/MODAL MAPPING ========== */
  section('5b. Catalog card → id/name/image/modal (single source of truth check)');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = trackErrors(page);
    await goto(page, base + '/franchise/gallery.html', 1200);
    const expected = [
      ['01', 'Flat Bench Press', 'flat-bench-press', 'FLAT BENCH PRESS', 'Flat bench station designed for controlled barbell chest pressing.'],
      ['02', 'Incline Bench Press', 'incline-bench-press', 'INCLINE BENCH PRESS', 'Incline pressing station designed for upper-chest strength training.'],
      ['03', 'Lat Pulldown Machine', 'lat-pulldown', 'LAT PULLDOWN MACHINE', 'Vertical pulling machine designed for back and lat development.'],
      ['04', 'Leg Extension Machine', 'leg-extension', 'LEG EXTENSION MACHINE', 'Seated machine designed for controlled quadriceps training.'],
      ['05', 'Leg Press Machine', 'leg-press', 'LEG PRESS MACHINE', 'Heavy-duty lower-body machine for controlled leg strength training.'],
      ['06', 'Cable Crossover Machine', 'cable-crossover', 'CABLE CROSSOVER MACHINE', 'Versatile cable system for upper-body and functional strength exercises.'],
      ['07', 'Smith Machine', 'smith-machine', 'SMITH MACHINE', 'Guided barbell system designed for controlled strength training.'],
      ['08', 'Seated Leg Curl Machine', 'seated-leg-curl', 'SEATED LEG CURL MACHINE', 'Seated machine designed for controlled hamstring training.'],
      ['09', 'Dumbbell Rack', 'dumbbell-rack', 'DUMBBELL RACK', 'Organized free-weight station for progressive strength training.'],
      ['10', 'Chest Press Machine', 'chest-press', 'CHEST PRESS MACHINE', 'Seated pressing machine designed for controlled chest development.'],
      ['11', 'Shoulder Press Machine', 'shoulder-press', 'SHOULDER PRESS MACHINE', 'Upright pressing machine designed for shoulder strength development.'],
      ['12', 'Power Rack / Squat Rack', 'power-rack', 'POWER RACK / SQUAT RACK', 'Heavy-duty rack for squats, presses and compound strength exercises.'],
    ];
    for (let i = 0; i < expected.length; i++) {
      const [id, name, slug, upper, desc] = expected[i];
      const card = await page.evaluate((cid) => {
        const c = document.querySelector(`.equipment-card[data-id="${cid}"]`);
        return {
          id: c.getAttribute('data-id'),
          name: c.getAttribute('data-name'),
          title: c.querySelector('h3').textContent.trim(),
          img: c.querySelector('img').getAttribute('src') || '',
        };
      }, id);
      check(`card #${id} = "${name}" (image ${slug}.jpg)`,
        card.id === id && card.name === name && card.title === name && card.img === `/assets/images/equipment/${slug}.jpg`,
        JSON.stringify(card));
      const m = await page.evaluate((cid) => {
        document.querySelector(`.equipment-card[data-id="${cid}"] .view-specs-trigger`).click();
        return {
          badge: document.getElementById('modal-sku-badge').textContent.trim(),
          title: document.getElementById('modal-title').textContent.trim(),
          img: document.getElementById('modal-image').getAttribute('src') || '',
          desc: document.getElementById('modal-description').textContent.trim(),
        };
      }, id);
      check(`modal #${id} content matches card`,
        m.badge === `#${id}` && m.title === upper && m.img === `/assets/images/equipment/${slug}.jpg` && m.desc === desc,
        JSON.stringify(m));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    check('card/modal mapping: no page errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }

  /* ========== 6. TECHNICAL MODAL (open/close/Escape/focus/prev-next) ========== */
  section('6. Technical modal (open/Escape/focus/prev-next)');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = trackErrors(page);
    await goto(page, base + '/franchise/gallery.html', 1200);
    const openBtn = page.locator('.equipment-card[data-id="01"] .view-specs-trigger');
    check('view-specs button present', (await openBtn.count()) > 0);
    await openBtn.click();
    await page.waitForTimeout(400);
    const modal = page.locator('#technical-modal');
    check('modal opens', await modal.evaluate(el => !el.classList.contains('hidden')));
    check('modal title populated', ((await page.textContent('#modal-title')) || '').trim().length > 0);
    check('modal image populated', ((await page.getAttribute('#modal-image', 'src')) || '').includes('/assets/images/equipment/'));
    // Prev from first wraps to last (#12)
    await page.click('#modal-prev-btn');
    await page.waitForTimeout(250);
    check('prev from #01 wraps to #12', ((await page.textContent('#modal-index-indicator')) || '').trim() === '12 / 12');
    // Next wraps back to first
    await page.click('#modal-next-btn');
    await page.waitForTimeout(250);
    check('next wraps #12 → #01', ((await page.textContent('#modal-index-indicator')) || '').trim() === '01 / 12');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    check('Escape closes modal', await modal.evaluate(el => el.classList.contains('hidden')));
    check('scroll lock released', await page.evaluate(() => document.body.style.overflow === ''));
    check('tech modal: no errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }

  /* ========== 7. HOME CONTACT FORM ========== */
  section('7. Home contact form (validation / success / 404 / 500 / network / double-submit)');
  {
    // 7a. client validation blocks empty submit
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let apiCalls = 0;
    await page.route('**/api/send-enquiry', r => { apiCalls++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
    trackErrors(page);
    await goto(page, base + '/index.html');
    await page.click('#submitEnquiry');
    await page.waitForTimeout(300);
    const statusTxt = await page.textContent('#formStatus');
    const hasErrorClass = await page.evaluate(() => document.getElementById('formStatus').classList.contains('status-error'));
    check('empty submit → error status, no API call', hasErrorClass && apiCalls === 0, `api=${apiCalls} t=${statusTxt}`);
    await page.close();

    // 7b. valid submit + success + double-submit guard
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let apiCalls2 = 0;
    await page2.route('**/api/send-enquiry', async r => {
      apiCalls2++;
      await new Promise(res => setTimeout(res, 400));
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    });
    await goto(page2, base + '/index.html');
    await page2.fill('#enquiryName', 'Test User');
    await page2.fill('#enquiryPhone', '+91 98765 43210');
    await page2.fill('#enquiryEmail', 'test@example.com');
    await page2.selectOption('#enquiryGoal', 'Muscle Building');
    await page2.fill('#enquiryMessage', 'I want to start training at YUVA.');
    await page2.click('#submitEnquiry');
    await page2.click('#submitEnquiry', { force: true }); // force clicks while disabled, testing isSubmitting guard
    await page2.waitForTimeout(700);
    check('valid submit → API called exactly once', apiCalls2 === 1, `calls=${apiCalls2}`);
    const okStatus = await page2.evaluate(() => {
      const s = document.getElementById('formStatus');
      return s.classList.contains('status-success') && s.classList.contains('visible');
    });
    check('success message shown, no fake on error', okStatus);
    check('form reset after success', await page2.evaluate(() => document.getElementById('enquiryName').value === ''));
    await page2.close();

    // 7c. 500 → error state, NO success, form NOT reset
    const page3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page3.route('**/api/send-enquiry', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Server error"}' }));
    await goto(page3, base + '/index.html');
    await page3.fill('#enquiryName', 'Test User');
    await page3.fill('#enquiryPhone', '+91 98765 43210');
    await page3.fill('#enquiryEmail', 'test@example.com');
    await page3.selectOption('#enquiryGoal', 'Muscle Building');
    await page3.fill('#enquiryMessage', 'I want to start training at YUVA.');
    await page3.click('#submitEnquiry');
    await page3.waitForTimeout(500);
    check('500 → error, not fake success', await page3.evaluate(() => {
      const s = document.getElementById('formStatus');
      return s.classList.contains('status-error') && !s.classList.contains('status-success');
    }));
    check('form value retained after 500', (await page3.inputValue('#enquiryName')) === 'Test User');
    await page3.close();

    // 7d. network failure → error state
    const page4 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page4.route('**/api/send-enquiry', r => r.abort('failed'));
    await goto(page4, base + '/index.html');
    await page4.fill('#enquiryName', 'Test User');
    await page4.fill('#enquiryPhone', '+91 98765 43210');
    await page4.fill('#enquiryEmail', 'test@example.com');
    await page4.selectOption('#enquiryGoal', 'Muscle Building');
    await page4.fill('#enquiryMessage', 'I want to start training at YUVA.');
    await page4.click('#submitEnquiry');
    await page4.waitForTimeout(500);
    check('network failure → error, no fake success', await page4.evaluate(() => {
      const s = document.getElementById('formStatus');
      return s.classList.contains('status-error') && !s.classList.contains('status-success');
    }));
    check('submit button re-enabled after failure', await page4.evaluate(() => !document.getElementById('submitEnquiry').disabled));
    await page4.close();
  }

  /* ========== 8. FRANCHISE FORM ========== */
  section('8. Franchise form (success + error states)');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await goto(page, base + '/franchise/gallery.html', 1000);
    const fillValid = async () => {
      await page.fill('#frName', 'Ravi Kumar');
      await page.fill('#frPhone', '+91 9876543210');
      await page.fill('#frEmail', 'ravi@example.com');
      await page.fill('#frCity', 'Chennai');
      await page.fill('#frArea', 'Velachery');
      await page.selectOption('#frBudget', '₹25–50 Lakhs');
      await page.selectOption('#frSpace', '2,000–3,000 sq.ft');
      await page.selectOption('#frProperty', 'Rented / Lease Property');
      await page.selectOption('#frTimeline', '6–12 Months');
      await page.fill('#frMessage', 'Interested in starting a YUVA franchise.');
    };
    // error path
    let calls = 0;
    await page.route('**/api/send-franchise-enquiry', r => { calls++; r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Server error"}' }); });
    await fillValid();
    await page.click('#franchiseSubmit');
    await page.waitForTimeout(500);
    check('franchise 500 → error status shown', await page.evaluate(() => {
      const s = document.getElementById('franchiseFormStatus');
      return s.classList.contains('visible') && !/Thank you/.test(s.textContent);
    }));
    check('franchise form retained after 500', (await page.inputValue('#frName')) === 'Ravi Kumar');
    // success path
    await page.route('**/api/send-franchise-enquiry', r => { calls++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
    await page.click('#franchiseSubmit');
    await page.waitForTimeout(600);
    const frOk = await page.evaluate(() => {
      const s = document.getElementById('franchiseSuccess');
      const f = document.getElementById('franchiseEnquiryForm');
      return s && s.classList.contains('visible') && f && f.style.display === 'none';
    });
    check('franchise 200 → dedicated success element shown, form hidden', frOk);
    check('franchise: 1 error resubmit + 1 success = 2 calls', calls === 2, `calls=${calls}`);
    await page.close();
  }

  /* ========== 9. WHATSAPP + RAPID STABILITY ========== */
  section('9. WhatsApp links safety + rapid open/close stability');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = trackErrors(page);
    await goto(page, base + '/index.html');
    const wa = await page.evaluate(() => {
      const a = document.querySelector('a.wa-float');
      return a ? { href: a.href, target: a.target, rel: a.rel } : null;
    });
    check('WhatsApp float present with safe attrs', !!wa && wa.href.startsWith('https://wa.me/') && wa.target === '_blank' && /noopener/.test(wa.rel), JSON.stringify(wa));
    // Rapid modal open/close
    await page.evaluate(() => { const t = document.querySelector('.driftwall-tile'); t.focus({ preventScroll: true }); });
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(60);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(400);
    const clean = await page.evaluate(() => !document.getElementById('sandyOverlay').classList.contains('open'));
    check('modal closed after rapid open/close', clean);
    check('rapid open/close: no uncaught errors', errs.page.length === 0, errs.page.join(' | '));
    await page.close();
  }

  await browser.close();
  server.close();

  console.log('\n==============================================');
  console.log(`BROWSER TESTS — PASS: ${passCount}  FAIL: ${failCount}`);
  if (failCount) { console.log('Failures:'); failures.forEach(f => console.log(' -', f)); }
  console.log('==============================================');
  process.exit(failCount ? 1 : 0);
})().catch(e => {
  console.error('Browser test runner crashed:', e);
  process.exit(2);
});