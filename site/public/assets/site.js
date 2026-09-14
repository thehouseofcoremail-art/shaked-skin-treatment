/* הרצפה — לוגיקת צד לקוח. ללא תלויות. */
(function () {
  "use strict";

  var API = "/api";
  var state = { ready: false, member: false, demo: false, email: "", plan: "", freeRemaining: null };

  /* ---------------------------------------------------------- utilities */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function ils(n) { return "₪" + Math.round(n).toLocaleString("he-IL"); }
  function months(n) { return isFinite(n) ? n.toFixed(1) + " חודשים" : "—"; }
  function say(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = "msg" + (kind ? " msg--" + kind : "");
  }
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); }
    catch (e) { return null; }
  }

  function api(path, opts) {
    return fetch(API + path, Object.assign({
      credentials: "same-origin",
      headers: { "content-type": "application/json" }
    }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      });
    });
  }

  /* ------------------------------------------------ contour line field */
  function contours(canvas) {
    var ctx = canvas.getContext("2d");
    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var lines = 14, gap = Math.max(h, 420) / 9, cx = w * 0.42, curve = 1 / (w * 0.9);
      for (var k = 0; k < lines; k++) {
        ctx.beginPath();
        for (var x = -20; x <= w + 20; x += 6) {
          var d = x - cx;
          var y = h * 1.02 - d * d * curve - k * gap + Math.sin((x / w) * 2.2) * 10;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(157,180,255," + Math.max(0.03, 0.24 - k * 0.013).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    draw();
    var t;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(draw, 160); });
  }

  /* ------------------------------------------------------- calculators
   * כל מחשבון מקבל את ערכי השדות ומחזיר ערכים מוכנים להצגה.
   * המבנה של ה-HTML נבנה ב-build.mjs; כאן רק החשבון.
   */
  var WEEKS = 4.33;

  var COMPUTE = {
    unit: function (v) {
      var heads = v.cap * (v.fill / 100);
      var income = heads * v.rev;
      var contribution = income - heads * v.vari - v.coach - v.fixed;
      var perHead = v.rev - v.vari;
      var breakeven = perHead > 0 ? (v.coach + v.fixed) / perHead : Infinity;
      var monthly = contribution * v.classes * WEEKS;
      var ratio = isFinite(breakeven) && breakeven > 0 ? heads / breakeven : 0;
      return {
        out: {
          heads: [heads.toFixed(1) + " ראשים"],
          income: [ils(income)],
          contribution: [ils(contribution), contribution >= 0 ? "pos" : "neg"],
          breakeven: [isFinite(breakeven) ? breakeven.toFixed(1) + " ראשים" : "—"],
          monthly: [ils(monthly), monthly >= 0 ? "pos" : "neg"],
        },
        ratio: ratio,
        good: ratio >= 1,
        legend: !isFinite(breakeven)
          ? "ההכנסה לראש נמוכה מהעלות המשתנה — אין נקודת איזון"
          : heads >= breakeven
            ? "מעל האיזון ב-" + (heads - breakeven).toFixed(1) + " ראשים"
            : "חסרים " + (breakeven - heads).toFixed(1) + " ראשים לאיזון",
      };
    },

    churn: function (v) {
      var rate = v.active > 0 ? v.left / v.active : 0;
      var life = rate > 0 ? 1 / rate : Infinity;
      var ltv = isFinite(life) ? v.contrib * life : Infinity;
      var ratio = v.cac > 0 && isFinite(ltv) ? ltv / v.cac : Infinity;
      var payback = v.contrib > 0 ? v.cac / v.contrib : Infinity;
      return {
        out: {
          churn: [(rate * 100).toFixed(1) + "%", rate <= 0.08 ? "pos" : rate >= 0.12 ? "neg" : ""],
          life: [months(life)],
          ltv: [isFinite(ltv) ? ils(ltv) : "—"],
          ratio: [isFinite(ratio) ? ratio.toFixed(1) + " : 1" : "—", ratio >= 3 ? "pos" : ratio < 1 ? "neg" : ""],
          payback: [months(payback)],
        },
        ratio: isFinite(ratio) ? ratio / 3 : 0,
        good: ratio >= 3,
        legend: !isFinite(ratio)
          ? "אין מספיק נתונים ליחס"
          : ratio >= 3
            ? "יחס בריא. יש מקום להגדיל תקציב גיוס"
            : ratio >= 1
              ? "שורדות, בלי מקום לטעות. יעד: 3 ומעלה"
              : "כל לקוחה חדשה מכניסה אתכן להפסד",
      };
    },

    pricing: function (v) {
      var classesMonth = v.classes * WEEKS;
      var headsMonth = classesMonth * v.cap * (v.fill / 100);
      var needed = v.fixedm + v.coach * classesMonth + v.vari * headsMonth + v.target;
      var price = headsMonth > 0 ? needed / headsMonth : 0;
      var gap = v.current - price;
      var ratio = price > 0 ? v.current / price : 0;
      return {
        out: {
          headsMonth: [Math.round(headsMonth).toLocaleString("he-IL") + " כניסות"],
          needed: [ils(needed)],
          price: [ils(price), "accent"],
          sub8: [ils(price * 8)],
          gap: [(gap >= 0 ? "+" : "") + ils(gap), gap >= 0 ? "pos" : "neg"],
        },
        ratio: ratio,
        good: ratio >= 1,
        legend: price <= 0
          ? "חסרים נתונים"
          : ratio >= 1
            ? "המחיר הנוכחי מכסה את היעד"
            : "המחיר הנוכחי מכסה " + Math.round(ratio * 100) + "% מהנדרש",
      };
    },
  };

  function calculator(root) {
    var id = root.dataset.calc;
    var compute = COMPUTE[id];
    if (!compute) return;
    var inputs = $$("input[data-f]", root);

    inputs.forEach(function (el) {
      var key = "calc:" + id + ":" + el.dataset.f;
      var saved = store(key);
      if (saved !== null && saved !== undefined && saved !== "") el.value = saved;
      el.addEventListener("input", function () { store(key, el.value); run(); });
    });

    function run() {
      var v = {};
      inputs.forEach(function (el) {
        var n = parseFloat(el.value);
        v[el.dataset.f] = isNaN(n) ? 0 : n;
      });
      var res = compute(v);

      Object.keys(res.out).forEach(function (k) {
        var el = $('[data-out="' + k + '"]', root);
        if (!el) return;
        el.textContent = res.out[k][0];
        el.className = "v" + (res.out[k][1] ? " " + res.out[k][1] : "");
      });

      var fill = $('[data-out="gauge"]', root);
      if (fill) {
        fill.style.width = Math.max(2, Math.min(100, (res.ratio || 0) * 100)) + "%";
        fill.className = "gauge-fill " + (res.good ? "pos" : "neg");
      }
      var legend = $('[data-out="legend"]', root);
      if (legend) legend.textContent = res.legend;
    }

    var reset = $("[data-calc-reset]", root);
    if (reset) reset.addEventListener("click", function () {
      inputs.forEach(function (el) {
        if (el.dataset.default === undefined) return;
        el.value = el.dataset.default;
        store("calc:" + id + ":" + el.dataset.f, el.value);
      });
      run();
    });

    run();
  }

  /* ------------------------------------------------------ reading bar */
  function progress(bar) {
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      bar.style.width = (max > 0 ? Math.min(1, doc.scrollTop / max) * 100 : 0) + "%";
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  /* ----------------------------------------------------------- session */
  function loadSession() {
    return api("/session").then(function (res) {
      if (!res.ok) throw new Error("no session endpoint");
      state.member = !!res.body.member;
      state.email = res.body.email || "";
      state.plan = res.body.plan || "";
      state.freeRemaining = typeof res.body.freeRemaining === "number" ? res.body.freeRemaining : null;
      state.ready = true;
    }).catch(function () {
      state.demo = true; state.ready = true;
      state.member = store("demo-member") === "1";
    });
  }

  function paintSession() {
    $$("[data-member-only]").forEach(function (el) { el.hidden = !state.member; });
    $$("[data-guest-only]").forEach(function (el) { el.hidden = state.member; });
    $$("[data-email-slot]").forEach(function (el) { el.textContent = state.email || "—"; });
    $$("[data-plan-slot]").forEach(function (el) { el.textContent = state.plan || (state.member ? "פעיל" : "אורחת"); });
    $$("[data-demo-only]").forEach(function (el) { el.hidden = !state.demo; });
  }

  /* -------------------------------------------------------- paywall */
  function gate() {
    var gateEl = $("#gate");
    if (!gateEl) return;
    var slug = gateEl.dataset.slug;
    var target = $("#premium");
    var fade = $("#fade");

    function reveal(html, note) {
      target.innerHTML = html;
      gateEl.hidden = true;
      if (fade) fade.hidden = true;
      if (note) {
        var n = document.createElement("p");
        n.className = "meter";
        n.textContent = note;
        target.insertBefore(n, target.firstChild);
      }
      $$("[data-calc]", target).forEach(calculator);
    }

    function unlock(consume) {
      var btn = $("[data-unlock]", gateEl);
      if (btn) { btn.disabled = true; btn.textContent = "טוען…"; }
      return api("/article/" + encodeURIComponent(slug) + (consume ? "?consume=1" : "")).then(function (res) {
        if (res.ok && res.body.html) {
          reveal(res.body.html, res.body.via === "meter"
            ? "קריאה חינם — נותרו לך " + res.body.freeRemaining + " החודש."
            : "");
          return true;
        }
        if (btn) { btn.disabled = false; btn.textContent = "שימוש בקריאה חינם"; }
        return false;
      }).catch(function () { return false; });
    }

    // מצב הדגמה: אין שרת. נטען את גוף הכתבות שנבנה עם --demo, אם קיים.
    if (state.demo) {
      var demoBtn = $("[data-unlock]", gateEl);
      if (demoBtn) {
        demoBtn.hidden = false;
        demoBtn.classList.remove("btn--ghost");
        demoBtn.textContent = "פתיחת הכתבה (הדגמה)";
        demoBtn.addEventListener("click", function () {
          fetch("../../data/bodies.demo.json").then(function (r) { return r.json(); }).then(function (map) {
            if (map[slug]) reveal(map[slug], "מצב הדגמה — כך נראית הכתבה למנויה משלמת.");
            else say($("[data-gate-msg]", gateEl), "אין גוף כתבה בתצוגה המקדימה.", "err");
          }).catch(function () {
            say($("[data-gate-msg]", gateEl), "מצב הדגמה: הגוף המלא מוגש מהשרת בלבד.", "err");
          });
        });
      }
      return;
    }

    if (state.member) { unlock(false); return; }

    var meterEl = $("[data-meter]", gateEl);
    if (meterEl && state.freeRemaining !== null) {
      if (state.freeRemaining > 0) {
        meterEl.textContent = "נותרו לך " + state.freeRemaining + " קריאות חינם החודש";
        meterEl.hidden = false;
        var ub = $("[data-unlock]", gateEl);
        if (ub) { ub.hidden = false; ub.addEventListener("click", function () { unlock(true); }); }
      } else {
        meterEl.textContent = "ניצלת את הקריאות החינם של החודש";
        meterEl.hidden = false;
      }
    }
  }

  /* ---------------------------------------------------------- actions */
  function wireCheckout() {
    $$("[data-checkout]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var plan = btn.dataset.checkout;
        var msg = $("[data-checkout-msg]") || null;
        btn.disabled = true;
        var was = btn.textContent;
        btn.textContent = "מעביר לתשלום…";
        api("/checkout", { method: "POST", body: JSON.stringify({ plan: plan }) }).then(function (res) {
          if (res.ok && res.body.url) { window.location.href = res.body.url; return; }
          btn.disabled = false; btn.textContent = was;
          say(msg, res.body.error || "התשלום לא מוגדר עדיין. ראו README — חיבור Stripe.", "err");
        }).catch(function () {
          btn.disabled = false; btn.textContent = was;
          say(msg, state.demo
            ? "תצוגה מקדימה — הסליקה פועלת רק באתר החי אחרי חיבור Stripe."
            : "שגיאת רשת. נסו שוב.", "err");
        });
      });
    });
  }

  function wireForms() {
    $$("form[data-post]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var msg = $(".msg", form);
        var btn = $("button", form);
        var data = {};
        $$("input", form).forEach(function (i) { if (i.name) data[i.name] = i.value; });
        if (btn) btn.disabled = true;
        api(form.dataset.post, { method: "POST", body: JSON.stringify(data) }).then(function (res) {
          if (btn) btn.disabled = false;
          if (res.ok) { say(msg, res.body.message || "נשלח.", "ok"); form.reset(); }
          else say(msg, res.body.error || "משהו השתבש.", "err");
        }).catch(function () {
          if (btn) btn.disabled = false;
          say(msg, state.demo
            ? "תצוגה מקדימה — הטופס פועל רק באתר החי."
            : "שגיאת רשת. נסו שוב.", "err");
        });
      });
    });

    $$("[data-logout]").forEach(function (b) {
      b.addEventListener("click", function () {
        api("/logout", { method: "POST" }).then(function () { location.reload(); })
          .catch(function () { store("demo-member", "0"); location.reload(); });
      });
    });
  }

  /* ------------------------------------------------------------- boot */
  function boot() {
    $$("canvas.contours").forEach(contours);
    $$("[data-calc]").forEach(calculator);
    var bar = $("#progress");
    if (bar) progress(bar);
    wireCheckout();
    wireForms();
    loadSession().then(function () { paintSession(); gate(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
