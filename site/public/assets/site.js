/* מאחורי המראות — לוגיקת צד לקוח. ללא תלויות. */
(function () {
  "use strict";

  var API = "/api";
  var state = { ready: false, member: false, demo: false, email: "", plan: "", freeRemaining: null };

  /* ---------------------------------------------------------- utilities */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function ils(n) { return "₪" + Math.round(n).toLocaleString("he-IL"); }
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

  /* ------------------------------------------------------- unit calc */
  function calculator(root) {
    var ids = ["rev", "cap", "fill", "coach", "vari", "fixed", "classes"];
    var inputs = {};
    ids.forEach(function (id) {
      var el = $("#calc-" + id, root);
      inputs[id] = el;
      if (!el) return;
      var saved = store("calc-" + id);
      if (saved !== null && saved !== undefined && saved !== "") el.value = saved;
      el.addEventListener("input", function () { store("calc-" + id, el.value); run(); });
    });

    function num(id) { var el = inputs[id]; var v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? 0 : v; }

    function run() {
      var rev = num("rev"), cap = num("cap"), fill = num("fill") / 100,
        coach = num("coach"), vari = num("vari"), fixed = num("fixed"), classes = num("classes");

      var heads = cap * fill;
      var income = heads * rev;
      var contribution = income - heads * vari - coach - fixed;
      var perHead = rev - vari;
      var breakeven = perHead > 0 ? (coach + fixed) / perHead : Infinity;
      var monthly = contribution * classes * 4.33;

      set("heads", heads.toFixed(1) + " ראשים");
      set("income", ils(income));
      set("contribution", ils(contribution), contribution >= 0 ? "pos" : "neg");
      set("breakeven", isFinite(breakeven) ? breakeven.toFixed(1) + " ראשים" : "—");
      set("monthly", ils(monthly), monthly >= 0 ? "pos" : "neg");

      var fillEl = $("[data-out=gauge]", root);
      if (fillEl) {
        var ratio = isFinite(breakeven) && breakeven > 0 ? heads / breakeven : 0;
        fillEl.style.width = Math.max(2, Math.min(100, ratio * 100)) + "%";
        fillEl.className = "gauge-fill " + (ratio >= 1 ? "pos" : "neg");
      }
      var legend = $("[data-out=legend]", root);
      if (legend) {
        legend.textContent = isFinite(breakeven)
          ? (heads >= breakeven
            ? "מעל האיזון ב-" + (heads - breakeven).toFixed(1) + " ראשים"
            : "חסרים " + (breakeven - heads).toFixed(1) + " ראשים לאיזון")
          : "ההכנסה לראש נמוכה מהעלות המשתנה — אין נקודת איזון";
      }
    }

    function set(key, text, cls) {
      var el = $('[data-out="' + key + '"]', root);
      if (!el) return;
      el.textContent = text;
      el.className = "v" + (cls ? " " + cls : "");
    }

    var reset = $("[data-calc-reset]", root);
    if (reset) reset.addEventListener("click", function () {
      ids.forEach(function (id) {
        var el = inputs[id];
        if (el && el.dataset.default !== undefined) { el.value = el.dataset.default; store("calc-" + id, el.value); }
      });
      run();
    });

    run();
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
      target.scrollIntoView({ block: "nearest" });
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

    // demo mode: no server. Load the preview bodies if the build produced them.
    if (state.demo) {
      var demoBtn = $("[data-unlock]", gateEl);
      if (demoBtn) {
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
    wireCheckout();
    wireForms();
    loadSession().then(function () { paintSession(); gate(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
