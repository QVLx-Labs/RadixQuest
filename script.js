/*
  RadixQuest

  Copyright QVLX LLC. All Rights Reserved. 
*/

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* ========================= THEME SWITCHER ============================= */

  const themeSelect = document.getElementById("theme");
  const root = document.documentElement;
  const THEME_KEY = "calcconvert.theme";

  const mqlDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const mqlLight = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

  function applyTheme(val) {
    // val in: "auto" | "nocturne" | "aurora" | "cyberviolet" | "oceanglass" | "terminal" | "paper"
    root.setAttribute("data-theme", val);
    // Save except when explicitly auto? (we still save "auto" so user intent persists)
    try { localStorage.setItem(THEME_KEY, val); } catch {}
  }

  // React to system changes when in auto
  function onSystemChange() {
    if (root.getAttribute("data-theme") === "auto") {
      // nothing else required; CSS media queries handle it
      // We can force a reflow cue if needed:
      root.style.setProperty("--_ts", String(Date.now()));
    }
  }

  if (mqlDark) mqlDark.addEventListener("change", onSystemChange);
  if (mqlLight) mqlLight.addEventListener("change", onSystemChange);

  // Init from storage or default
  (function initTheme(){
    let stored = "nocturne";
    try { stored = localStorage.getItem(THEME_KEY) || "nocturne"; } catch {}
    if (!["auto","nocturne","aurora","cyberviolet","oceanglass","terminal","paper"].includes(stored)) stored = "nocturne";
    themeSelect.value = stored;
    applyTheme(stored);
  })();

  themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

  /* ========================= TAB NAVIGATION ============================= */

  const tabs = document.querySelectorAll(".tab");
  const panels = {
    calc: document.getElementById("calc-panel"),
    convert: document.getElementById("convert-panel"),
    help: document.getElementById("help-panel"),
  };
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      Object.values(panels).forEach(p => { p.hidden = true; p.classList.remove("is-active"); });
      const k = btn.dataset.tab;
      panels[k].hidden = false;
      panels[k].classList.add("is-active");
    });
  });

  /* ========================= CALCULATOR ================================= */

  const exprEl = document.getElementById("expr");
  const inputBaseEl = document.getElementById("input-base");
  const displayBaseEl = document.getElementById("display-base");
  const modeEl = document.getElementById("mode");
  const intCfg = document.getElementById("int-config");
  const bitwidthEl = document.getElementById("bitwidth");
  const signedEl = document.getElementById("signed");
  const btnEval = document.getElementById("evaluate");
  const btnClear = document.getElementById("clear");
  const warnEl = document.getElementById("warn");
  const outMain = document.getElementById("result-main");
  const outMB = document.getElementById("result-multibase");
  const outBits = document.getElementById("result-bits");
  const histList = document.getElementById("history-list");
  const histClear = document.getElementById("history-clear");

  let history = [];

  modeEl.addEventListener("change", () => {
    const isInt = modeEl.value === "int";
    intCfg.setAttribute("aria-hidden", String(!isInt));
    intCfg.style.pointerEvents = isInt ? "auto" : "none";
    intCfg.style.opacity = isInt ? "1" : ".6";
    render(); // re-evaluate display if needed
  });

  function showWarn(msg) {
    if (!msg) { warnEl.classList.remove("show"); warnEl.textContent = ""; return; }
    warnEl.textContent = msg;
    warnEl.classList.add("show");
  }

  btnClear.addEventListener("click", () => {
    exprEl.value = "";
    outMain.textContent = "";
    outMB.innerHTML = "";
    outBits.innerHTML = "";
    showWarn("");
  });

  histClear.addEventListener("click", () => {
    history = [];
    renderHistory();
  });

  function pushHistory(expr, display) {
    history.unshift({ expr, display, ts: Date.now() });
    if (history.length > 30) history.pop();
    renderHistory();
  }

  function renderHistory() {
    histList.innerHTML = "";
    if (history.length === 0) return;
    for (const item of history) {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const right = document.createElement("div");
      right.className = "hist-btns";
      const btnUse = document.createElement("button");
      btnUse.type = "button"; btnUse.className = "ghost"; btnUse.textContent = "↺ Use";
      btnUse.addEventListener("click", () => { exprEl.value = item.expr; exprEl.focus(); render(); });
      const btnCopy = document.createElement("button");
      btnCopy.type = "button"; btnCopy.className = "ghost"; btnCopy.textContent = "Copy";
      btnCopy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(item.display); btnCopy.textContent = "Copied"; setTimeout(()=>btnCopy.textContent="Copy", 900); } catch {}
      });
      right.append(btnUse, btnCopy);
      left.innerHTML = `<div><code>${escapeHtml(item.expr)}</code></div><div class="small">${escapeHtml(item.display)}</div>`;
      li.append(left, right);
      histList.append(li);
    }
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // Handle Enter to evaluate
  exprEl.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); evaluateNow(); }
  });
  btnEval.addEventListener("click", evaluateNow);

  function render(){ /* soft re-render upon mode change */ 
    if (!exprEl.value.trim()) { outMain.textContent=""; outMB.innerHTML=""; outBits.innerHTML=""; showWarn(""); return; }
    evaluateNow(true);
  }

  function evaluateNow(silent=false) {
    const expr = exprEl.value.trim();
    if (!expr) { if(!silent){showWarn("Enter an expression.");} return; }

    const options = {
      inputBase: inputBaseEl.value, 
      displayBase: displayBaseEl.value,
      mode: modeEl.value, // "float" | "int"
      bitWidth: parseInt(bitwidthEl.value,10),
      signed: !!signedEl.checked,
    };

    try {
      const { value, kind, notes } = evaluateExpression(expr, options);
      showWarn(notes || "");

      if (kind === "float") {
        const primary = formatFloat(value, options.displayBase);
        outMain.textContent = primary.text;
        outMB.innerHTML = primary.multibaseHtml;
        outBits.innerHTML = "";
        pushHistory(expr, primary.text);
      } else { // integer BigInt
        const primary = formatInt(value, options);
        outMain.textContent = primary.text;
        outMB.innerHTML = primary.multibaseHtml;
        outBits.innerHTML = primary.bitHtml;
        pushHistory(expr, primary.text);
      }
    } catch (err) {
      showWarn(String(err.message || err));
      outMain.textContent = "";
      outMB.innerHTML = "";
      outBits.innerHTML = "";
    }
  }

  /* ======================== PARSER / EVALUATOR =========================== */

  const OPINFO = (() => {
    const B = {
      "+": {p:10,a:"L",n:2}, "-": {p:10,a:"L",n:2},
      "*": {p:20,a:"L",n:2}, "/": {p:20,a:"L",n:2}, "%": {p:20,a:"L",n:2},
      "^": {p:30,a:"R",n:2}, "**": {p:30,a:"R",n:2},
      "<<":{p:9,a:"L",n:2, int:true}, ">>":{p:9,a:"L",n:2, int:true},
      "&": {p:8,a:"L",n:2, int:true}, "xor": {p:7,a:"L",n:2, int:true}, "|": {p:6,a:"L",n:2, int:true},
      "u-":{p:40,a:"R",n:1}, "u+":{p:40,a:"R",n:1}, "~": {p:40,a:"R",n:1, int:true},
    };
    return B;
  })();

  const FUNCS = {
    sin:  {n:1, f:Math.sin}, cos:{n:1, f:Math.cos}, tan:{n:1, f:Math.tan},
    asin: {n:1, f:Math.asin}, acos:{n:1, f:Math.acos}, atan:{n:1, f:Math.atan},
    sqrt: {n:1, f:Math.sqrt}, abs:{n:1, f:Math.abs},
    floor:{n:1, f:Math.floor}, ceil:{n:1, f:Math.ceil}, round:{n:1, f:Math.round},
    log:  {n:1, f:(x)=>Math.log10(x)}, ln:{n:1, f:Math.log},
    min:  {n:-1,f:(...xs)=>xs.reduce((a,b)=>Math.min(a,b))},
    max:  {n:-1,f:(...xs)=>xs.reduce((a,b)=>Math.max(a,b))},
    xor:  {n:2, int:true, f:null},
  };

  const CONSTS = { pi: Math.PI, tau: Math.PI*2, e: Math.E };

  function evaluateExpression(expr, opts){
    const tokens = tokenize(expr, opts.inputBase);
    const rpn = shuntingYard(tokens);
    if (opts.mode === "int") {
      const val = evalIntRPN(rpn, opts);
      return { value: val, kind: "int", notes: "" };
    } else {
      const {val, note} = evalFloatRPN(rpn);
      return { value: val, kind: "float", notes: note };
    }
  }

  function isIdentStart(c){ return /[A-Za-z_]/.test(c); }
  function isIdent(c){ return /[A-Za-z0-9_]/.test(c); }
  function isDigit(c){ return /[0-9]/.test(c); }

  function tokenize(input, inputBaseSetting){
    const s = input.replace(/\s+/g, "");
    const toks = [];
    let i=0, prevType=null;

    function peek(n=0){ return s[i+n]; }
    function take(){ return s[i++]; }

    while (i < s.length){
      const c = peek();

      if (c === "("){ toks.push({t:"lparen"}); take(); prevType="lparen"; continue; }
      if (c === ")"){ toks.push({t:"rparen"}); take(); prevType="rparen"; continue; }
      if (c === ","){ toks.push({t:"comma"}); take(); prevType="comma"; continue; }

      const two = s.slice(i,i+2);
      if (two === "**" || two === "<<" || two === ">>"){ toks.push({t:"op", op:two}); i+=2; prevType="op"; continue; }

      if ("+-*/%^&|~".includes(c)){
        if ((c === "+" || c === "-") && (prevType === null || prevType==="op" || prevType==="lparen" || prevType==="comma")){
          toks.push({t:"op", op: c === "+" ? "u+" : "u-"});
        } else {
          toks.push({t:"op", op:c});
        }
        take(); prevType="op"; continue;
      }

      if (isIdentStart(c)){
        let id = take();
        while (i<s.length && isIdent(peek())) id += take();
        if (id.toLowerCase() === "xor"){ toks.push({t:"op", op:"xor"}); prevType="op"; continue; }
        toks.push({t:"ident", name:id.toLowerCase()});
        prevType="ident"; continue;
      }

      if (isDigit(c) || (c==="." && isDigit(peek(1)))){
        const start = i;

        if (s.slice(i,i+2).toLowerCase()==="0x"){
          i+=2; let body=""; while (i<s.length && /[0-9a-fA-F_]/.test(peek())) body += take();
          if (!body) throw new Error("Malformed hex literal.");
          toks.push({t:"number", raw:"0x"+body}); prevType="number"; continue;
        }
        if (s.slice(i,i+2).toLowerCase()==="0b"){
          i+=2; let body=""; while (i<s.length && /[01_]/.test(peek())) body += take();
          if (!body) throw new Error("Malformed binary literal.");
          toks.push({t:"number", raw:"0b"+body}); prevType="number"; continue;
        }
        if (s.slice(i,i+2).toLowerCase()==="0o"){
          i+=2; let body=""; while (i<s.length && /[0-7_]/.test(peek())) body += take();
          if (!body) throw new Error("Malformed octal literal.");
          toks.push({t:"number", raw:"0o"+body}); prevType="number"; continue;
        }

        let body = ""; let hasDot=false, hasExp=false;
        while (i<s.length){
          const ch = peek();
          if (ch === "_" ) { take(); continue; }
          if (/[0-9]/.test(ch)){ body += take(); continue; }
          if (ch === "." && !hasDot && !hasExp){ hasDot=true; body += take(); continue; }
          if ((ch === "e" || ch === "E") && !hasExp){
            hasExp=true; body += take();
            if (peek()==="+" || peek()==="-") body += take();
            continue;
          }
          break;
        }
        if (!body) throw new Error("Malformed number.");
        toks.push({t:"number", raw: body, intBase: (!hasDot && !hasExp ? inputBaseSetting : "decimal")});
        prevType="number"; continue;
      }

      throw new Error(`Unexpected character '${c}' near position ${i+1}.`);
    }

    const final = [];
    for (let j=0;j<toks.length;j++){
      const tk = toks[j];
      if (tk.t==="ident" && toks[j+1] && toks[j+1].t==="lparen"){
        final.push({t:"func", name:tk.name});
      } else {
        final.push(tk);
      }
    }
    return final;
  }

  function shuntingYard(tokens){
    const out = [];
    const st = [];
    const argCountStack = [];

    for (let i=0;i<tokens.length;i++){
      const tk = tokens[i];
      if (tk.t==="number" || tk.t==="ident") out.push(tk);
      else if (tk.t==="func"){ st.push(tk); argCountStack.push(1); }
      else if (tk.t==="comma"){
        while (st.length && st[st.length-1].t!=="lparen") out.push(st.pop());
        if (!st.length) throw new Error("Misplaced comma or mismatched parentheses.");
        if (argCountStack.length) argCountStack[argCountStack.length-1]++;
      }
      else if (tk.t==="op"){
        const o1 = tk.op;
        while (st.length && st[st.length-1].t==="op"){
          const o2 = st[st.length-1].op;
          const p1 = OPINFO[o1].p, p2 = OPINFO[o2].p;
          if ((OPINFO[o1].a==="L" && p1<=p2) || (OPINFO[o1].a==="R" && p1<p2)){
            out.push(st.pop());
          } else break;
        }
        st.push(tk);
      }
      else if (tk.t==="lparen"){ st.push(tk); }
      else if (tk.t==="rparen"){
        while (st.length && st[st.length-1].t!=="lparen") out.push(st.pop());
        if (!st.length) throw new Error("Mismatched parentheses.");
        st.pop();
        if (st.length && st[st.length-1].t==="func"){
          const f = st.pop();
          const argc = argCountStack.pop() || 0;
          out.push({t:"call", name:f.name, argc});
        }
      }
    }
    while (st.length){
      const top = st.pop();
      if (top.t==="lparen" || top.t==="rparen") throw new Error("Mismatched parentheses.");
      if (top.t==="func") throw new Error("Mismatched function call.");
      out.push(top);
    }
    return out;
  }

  function parseNumberToken(tk, mode, inputBaseSetting){
    const raw = tk.raw;
    if (raw.startsWith("0x") || raw.startsWith("0X")){
      const body = raw.slice(2).replaceAll("_","");
      if (mode==="int") return {kind:"int", num: BigInt("0x"+body)};
      const bi = BigInt("0x"+body); const n = Number(bi);
      const note = (bi > BigInt(Number.MAX_SAFE_INTEGER)) ? "⚠️ Precision risk: integer exceeds 2^53−1." : "";
      return {kind:"float", num:n, note};
    }
    if (raw.startsWith("0b") || raw.startsWith("0B")){
      const body = raw.slice(2).replaceAll("_","");
      if (!/^[01]+$/.test(body)) throw new Error("Malformed binary literal.");
      if (mode==="int") return {kind:"int", num: BigInt("0b"+body)};
      const bi = BigInt("0b"+body); const n = Number(bi);
      const note = (bi > BigInt(Number.MAX_SAFE_INTEGER)) ? "⚠️ Precision risk: integer exceeds 2^53−1." : "";
      return {kind:"float", num:n, note};
    }
    if (raw.startsWith("0o") || raw.startsWith("0O")){
      const body = raw.slice(2).replaceAll("_","");
      if (!/^[0-7]+$/.test(body)) throw new Error("Malformed octal literal.");
      if (mode==="int") return {kind:"int", num: BigInt("0o"+body)};
      const bi = BigInt("0o"+body); const n = Number(bi);
      const note = (bi > BigInt(Number.MAX_SAFE_INTEGER)) ? "⚠️ Precision risk: integer exceeds 2^53−1." : "";
      return {kind:"float", num:n, note};
    }

    if (mode==="int"){
      if (tk.intBase && tk.intBase!=="decimal" && tk.intBase!=="auto"){
        const b = parseInt(tk.intBase,10);
        const body = raw.replaceAll("_","");
        if (!validDigits(body, b)) throw new Error(`Invalid digits for base ${b}.`);
        return {kind:"int", num: BigInt(parseInt(body, b))};
      }
      if (!/^[+-]?\d+(_\d+)*$/.test(raw)) throw new Error("Only integers allowed without prefix in integer mode.");
      return {kind:"int", num: BigInt(raw.replaceAll("_",""))};
    } else {
      const n = Number(raw.replaceAll("_",""));
      if (!Number.isFinite(n)) throw new Error("Invalid number.");
      return {kind:"float", num:n};
    }
  }

  function validDigits(str, base){
    const reMap = {2:/^[01]+$/,8:/^[0-7]+$/,10:/^[0-9]+$/,16:/^[0-9a-fA-F]+$/};
    const clean = str.replaceAll("_","");
    const re = reMap[base];
    return re ? re.test(clean) : false;
  }

  function evalFloatRPN(rpn){
    const st = [];
    let note = "";
    for (const tk of rpn){
      if (tk.t==="number"){
        const parsed = parseNumberToken(tk, "float");
        if (parsed.note) note = parsed.note;
        st.push(parsed.num);
      } else if (tk.t==="ident"){
        const c = CONSTS[tk.name];
        if (typeof c === "number"){ st.push(c); }
        else throw new Error(`Unknown identifier '${tk.name}'.`);
      } else if (tk.t==="call"){
        const fn = FUNCS[tk.name];
        if (!fn) throw new Error(`Unknown function '${tk.name}'.`);
        if (fn.int) throw new Error(`Function '${tk.name}' is integer-only.`);
        const argc = tk.argc;
        if (fn.n !== -1 && argc !== fn.n) throw new Error(`Function '${tk.name}' expects ${fn.n} args.`);
        const args = [];
        for (let i=0;i<argc;i++) args.unshift(st.pop());
        const v = (tk.name==="log" && argc===1) ? fn.f(args[0]) :
                  (fn.n===-1 ? fn.f(...args) : fn.f(...args));
        if (!Number.isFinite(v)) throw new Error("Computation produced a non-finite result.");
        st.push(v);
      } else if (tk.t==="op"){
        const op = tk.op;
        if (OPINFO[op].int) throw new Error(`Operator '${op}' is integer-only.`);
        if (OPINFO[op].n===1){
          const a = st.pop();
          st.push(op==="u-" ? -a : +a);
        } else {
          const b = st.pop(); const a = st.pop();
          switch(op){
            case "+": st.push(a+b); break;
            case "-": st.push(a-b); break;
            case "*": st.push(a*b); break;
            case "/": st.push(a/b); break;
            case "%": st.push(a%b); break;
            case "^":
            case "**": st.push(Math.pow(a,b)); break;
            default: throw new Error(`Unknown operator '${op}'.`);
          }
        }
      }
    }
    if (st.length!==1) throw new Error("Invalid expression.");
    return {val: st[0], note};
  }

  function maskForWidth(n){ return (BigInt(1) << BigInt(n)) - BigInt(1); }
  function toSigned(value, bits){
    const m = BigInt(1) << BigInt(bits-1);
    return (value & maskForWidth(bits)) >= m ? (value - (BigInt(1)<<BigInt(bits))) : (value & maskForWidth(bits));
  }
  function toUnsigned(value, bits){ return value & maskForWidth(bits); }
  function powBigInt(base, exp){
    if (exp < 0n) throw new Error("Negative exponent not allowed in integer mode.");
    let r = 1n, b = base, e = exp;
    while (e > 0n){ if (e & 1n) r *= b; b *= b; e >>= 1n; }
    return r;
  }

  function evalIntRPN(rpn, opts){
    const st = [];
    const W = opts.bitWidth;

    for (const tk of rpn){
      if (tk.t==="number"){
        const {num} = parseNumberToken(tk, "int", opts.inputBase);
        st.push(toUnsigned(num, W));
      } else if (tk.t==="ident"){
        const c = CONSTS[tk.name];
        if (typeof c === "number") throw new Error(`Constant '${tk.name}' is float-only.`);
        throw new Error(`Unknown identifier '${tk.name}'.`);
      } else if (tk.t==="call"){
        const name = tk.name; const argc = tk.argc;
        if (name === "xor"){
          if (argc!==2) throw new Error("xor expects 2 args.");
          const b = toUnsigned(BigInt(st.pop()), W);
          const a = toUnsigned(BigInt(st.pop()), W);
          st.push( (a ^ b) & maskForWidth(W) );
          continue;
        }
        if (name==="abs"){
          if (argc!==1) throw new Error("abs expects 1 arg.");
          const a0 = toUnsigned(BigInt(st.pop()), W);
          const a = opts.signed ? toSigned(a0, W) : a0;
          const res = a < 0n ? -a : a;
          st.push(toUnsigned(res, W));
        } else if (name==="min" || name==="max"){
          const args = [];
          for (let i=0;i<argc;i++) args.unshift(toUnsigned(BigInt(st.pop()), W));
          let v = args[0];
          for (let k=1;k<args.length;k++){
            v = (name==="min") ? (v <= args[k] ? v : args[k]) : (v >= args[k] ? v : args[k]);
          }
          st.push(toUnsigned(v, W));
        } else {
          throw new Error(`Function '${name}' is not available in integer mode.`);
        }
      } else if (tk.t==="op"){
        const op = tk.op;
        if (OPINFO[op].n===1){
          const a = toUnsigned(BigInt(st.pop()), W);
          if (op==="u-"){
            const res = toUnsigned(-toSigned(a, W), W);
            st.push(res);
          } else if (op==="u+"){
            st.push(a);
          } else if (op==="~"){
            st.push( (~a) & maskForWidth(W) );
          }
        } else {
          const b = toUnsigned(BigInt(st.pop()), W);
          const a = toUnsigned(BigInt(st.pop()), W);
          switch(op){
            case "+": st.push( (a + b) & maskForWidth(W) ); break;
            case "-": st.push( (a - b) & maskForWidth(W) ); break;
            case "*": st.push( (a * b) & maskForWidth(W) ); break;
            case "/":
              if (b===0n) throw new Error("Division by zero.");
              if (opts.signed){
                const aa = toSigned(a, W), bb = toSigned(b, W);
                st.push( toUnsigned( aa / bb, W) );
              } else st.push( a / b );
              break;
            case "%":
              if (b===0n) throw new Error("Modulo by zero.");
              if (opts.signed){
                const aa = toSigned(a, W), bb = toSigned(b, W);
                st.push( toUnsigned( aa % bb, W) );
              } else st.push( a % b );
              break;
            case "^":
            case "**":
              st.push( toUnsigned( powBigInt(a, b), W) ); break;
            case "<<": st.push( toUnsigned( a << (b & 63n), W) ); break;
            case ">>":
              if (opts.signed){
                const sa = toSigned(a, W);
                const k = Number(b & 63n);
                let shifted = sa;
                if (k>0) shifted = sa >> BigInt(k);
                st.push( toUnsigned(shifted, W) );
              } else {
                st.push( toUnsigned( a >> (b & 63n), W) );
              }
              break;
            case "&": st.push( (a & b) & maskForWidth(W) ); break;
            case "|": st.push( (a | b) & maskForWidth(W) ); break;
            case "xor": st.push( (a ^ b) & maskForWidth(W) ); break;
            default: throw new Error(`Unknown operator '${op}'.`);
          }
        }
      }
    }
    if (st.length!==1) throw new Error("Invalid expression.");
    return toUnsigned(BigInt(st[0]), opts.bitWidth);
  }

  /* ============================ FORMATTERS =============================== */

  function formatFloat(n, displayBase){
    const main = (x)=> {
      if (displayBase === "10") return String(x);
      if (displayBase === "2" || displayBase==="8" || displayBase==="16"){
        if (Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER){
          const bi = BigInt(x);
          return `${x}  (int→ ${formatIntAsBase(bi, parseInt(displayBase,10))})`;
        }
        return `${x}  (tip: show all bases works best for integers)`;
      }
      return String(x);
    };

    const mb = [];
    if (displayBase==="all"){
      if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER){
        const bi = BigInt(n);
        mb.push(kv("Dec", String(n)));
        mb.push(kv("Hex", formatIntAsBase(bi,16)));
        mb.push(kv("Oct", formatIntAsBase(bi,8)));
        mb.push(kv("Bin", formatIntAsBase(bi,2)));
      } else {
        mb.push(kv("Value", String(n)));
        mb.push(kv("Note","Non-integer: base views show integer casts."));
      }
    }
    return { text: main(n), multibaseHtml: mb.join("") };
  }

  function formatInt(value, opts){
    const b = opts.displayBase;
    const signedVal = opts.signed ? toSigned(value, opts.bitWidth) : value;
    const mainText = (b==="all")
      ? `${signedVal} (dec)`
      : (b==="10" ? (opts.signed ? String(signedVal) : String(value)) : formatIntAsBase(value, parseInt(b,10)));

    const mb = [];
    if (b==="all"){
      mb.push(kv("Dec (signed)", String(signedVal)));
      mb.push(kv("Dec (unsigned)", String(value)));
      mb.push(kv("Hex", formatIntAsBase(value,16)));
      mb.push(kv("Oct", formatIntAsBase(value,8)));
      mb.push(kv("Bin", formatIntAsBase(value,2)));
    } else {
      mb.push(kv("Dec", String(signedVal)));
      const show = new Set([2,8,16]); show.delete(parseInt(b,10));
      for (const bb of show) mb.push(kv(baseName(bb), formatIntAsBase(value,bb)));
    }

    const bitStr = groupBits(value, opts.bitWidth);
    const bitHtml = kv("Bits", bitStr);

    return { text: mainText, multibaseHtml: mb.join(""), bitHtml };
  }

  function baseName(n){ return n===2?"Bin":n===8?"Oct":n===16?"Hex":"Dec"; }
  function kv(k,v){ return `<div class="kv"><div class="k">${escapeHtml(k)}</div><div class="v"><code>${escapeHtml(v)}</code></div></div>`; }

  function formatIntAsBase(v, base){
    const sign = v<0n ? "-" : "";
    const x = v<0n ? -v : v;
    let body = x.toString(base);
    if (base===2){ body = group(body,4,"_"); return sign + "0b" + body; }
    if (base===8){ body = group(body,3,"_"); return sign + "0o" + body; }
    if (base===16){ body = group(body,4,"_").toUpperCase(); return sign + "0x" + body; }
    return sign + body;
  }
  function group(s, n, sep){
    let out=""; let cnt=0;
    for (let i=s.length-1;i>=0;i--){
      out = s[i] + out;
      cnt++;
      if (i>0 && cnt===n){ out = sep + out; cnt=0; }
    }
    return out;
  }
  function groupBits(v, width){
    const bits = (v & ((1n<<BigInt(width))-1n)).toString(2).padStart(width,"0");
    return bits.replace(/(.{4})/g,"$1 ").trim();
  }

  /* ============================= CONVERTER =============================== */

  const CATS = getUnitCatalog();
  const catEl = document.getElementById("category");
  const fromUnitEl = document.getElementById("from-unit");
  const toUnitEl = document.getElementById("to-unit");
  const fromValEl = document.getElementById("from-value");
  const toValEl = document.getElementById("to-value");
  const swapBtn = document.getElementById("swap");

  Object.keys(CATS).forEach(k => {
    const o = document.createElement("option");
    o.value = k; o.textContent = CATS[k].label;
    catEl.append(o);
  });

  catEl.addEventListener("change", refreshUnits);
  fromUnitEl.addEventListener("change", convertNow);
  toUnitEl.addEventListener("change", convertNow);
  fromValEl.addEventListener("input", convertNow);
  swapBtn.addEventListener("click", () => {
    const a = fromUnitEl.value, b = toUnitEl.value;
    toUnitEl.value = a; fromUnitEl.value = b;
    convertNow();
  });

  catEl.value = "length";
  refreshUnits();

  function refreshUnits(){
    const cat = CATS[catEl.value];
    fromUnitEl.innerHTML = ""; toUnitEl.innerHTML = "";
    if (cat.affine){
      for (const u of Object.keys(cat.toBase)){
        fromUnitEl.append(new Option(labelUnit(u, cat), u));
        toUnitEl.append(new Option(labelUnit(u, cat), u));
      }
    } else {
      for (const u of Object.keys(cat.factor)){
        fromUnitEl.append(new Option(labelUnit(u, cat), u));
        toUnitEl.append(new Option(labelUnit(u, cat), u));
      }
    }
    fromUnitEl.value = cat.defaults?.[0] || Object.keys(cat.affine?cat.toBase:cat.factor)[0];
    toUnitEl.value = cat.defaults?.[1] || Object.keys(cat.affine?cat.toBase:cat.factor)[1];
    fromValEl.value = ""; toValEl.value = "";
  }

  function labelUnit(u, cat){
    return cat.names?.[u] ? `${u} — ${cat.names[u]}` : u;
  }

  function convertNow(){
    const raw = fromValEl.value.trim();
    if (!raw){ toValEl.value=""; return; }
    const val = Number(raw.replaceAll("_",""));
    if (!Number.isFinite(val)){ toValEl.value=""; return; }

    const cat = CATS[catEl.value];
    let out;
    if (cat.affine){
      const toBase = cat.toBase[fromUnitEl.value];
      const fromBase = cat.fromBase[toUnitEl.value];
      if (!toBase || !fromBase){ toValEl.value=""; return; }
      out = fromBase( toBase(val) );
    } else {
      const fFrom = cat.factor[fromUnitEl.value];
      const fTo = cat.factor[toUnitEl.value];
      if (!fFrom || !fTo){ toValEl.value=""; return; }
      out = val * fFrom / fTo;
    }
    toValEl.value = formatNumberSmart(out);
  }

  function formatNumberSmart(x){
    if (!Number.isFinite(x)) return String(x);
    const ax = Math.abs(x);
    if (ax===0) return "0";
    if (ax>=0.001 && ax<1e6) return String(+x.toFixed(8)).replace(/\.?0+$/,"");
    const s = x.toExponential(8);
    return s.replace(/0+e/,"e").replace(/(\.\d+?)0+e/,"$1e");
  }

  function getUnitCatalog(){
    return {
      length: {
        label:"Length",
        factor: { m:1, km:1000, cm:0.01, mm:0.001, μm:1e-6, nm:1e-9, inch:0.0254, ft:0.3048, yd:0.9144, mile:1609.344, nmi:1852 },
        names:{ μm:"micrometre", nmi:"nautical mile" }, defaults:["m","ft"]
      },
      mass: {
        label:"Mass",
        factor: { kg:1, g:0.001, mg:1e-6, μg:1e-9, lb:0.45359237, oz:0.028349523125, tonUS:907.18474, tonUK:1016.0469088 },
        names:{ tonUS:"short ton (US)", tonUK:"long ton (UK)" }, defaults:["kg","lb"]
      },
      time: {
        label:"Time",
        factor: { s:1, ms:1e-3, μs:1e-6, ns:1e-9, min:60, h:3600, day:86400, week:604800, year:31557600 },
        names:{ μs:"microsecond" }, defaults:["s","h"]
      },
      temperature: {
        label:"Temperature", affine:true,
        toBase: { C:(v)=>v+273.15, F:(v)=> (v-32)*5/9 + 273.15, K:(v)=>v },
        fromBase: { C:(v)=>v-273.15, F:(v)=> (v-273.15)*9/5 + 32, K:(v)=>v },
        defaults:["C","F"]
      },
      area: {
        label:"Area",
        factor: { "m²":1, "cm²":1e-4, "mm²":1e-6, "km²":1e6, "ft²":0.09290304, "in²":0.00064516, "yd²":0.83612736, acre:4046.8564224, hectare:10000 },
        defaults:["m²","ft²"]
      },
      volume: {
        label:"Volume",
        factor: { "m³":1, "cm³":1e-6, "mm³":1e-9, L:0.001, mL:1e-6, tspUS:4.92892159375e-6, tbspUS:14.78676478125e-6, flozUS:29.5735295625e-6, cupUS:0.0002365882365, pintUS:0.000473176473, quartUS:0.000946352946, gallonUS:0.003785411784 },
        names:{ tspUS:"teaspoon (US)", tbspUS:"tablespoon (US)", flozUS:"fluid oz (US)" }, defaults:["L","gallonUS"]
      },
      speed: {
        label:"Speed",
        factor: { "m/s":1, "km/h":1000/3600, mph:1609.344/3600, knot:1852/3600 },
        defaults:["m/s","mph"]
      },
      pressure: {
        label:"Pressure",
        factor: { Pa:1, kPa:1000, MPa:1e6, bar:1e5, atm:101325, psi:6894.757293168, mmHg:133.322387415, inHg:3386.389 },
        defaults:["kPa","psi"]
      },
      energy: {
        label:"Energy",
        factor: { J:1, kJ:1000, Wh:3600, kWh:3.6e6, cal:4.184, kcal:4184, BTU:1055.05585262, eV:1.602176634e-19 },
        defaults:["kJ","kWh"]
      },
      power: {
        label:"Power",
        factor: { W:1, kW:1000, hp:745.6998715822702 },
        names:{ hp:"horsepower (mechanical)" }, defaults:["W","hp"]
      },
      angle: {
        label:"Angle",
        factor: { rad:1, deg:Math.PI/180, grad:Math.PI/200, arcmin:(Math.PI/180)/60, arcsec:(Math.PI/180)/3600 },
        defaults:["deg","rad"]
      },
      frequency: {
        label:"Frequency",
        factor: { Hz:1, kHz:1e3, MHz:1e6, GHz:1e9 },
        defaults:["Hz","kHz"]
      },
      force: {
        label:"Force",
        factor: { N:1, kN:1000, lbf:4.4482216152605 },
        names:{ lbf:"pound-force" }, defaults:["N","lbf"]
      },
      torque: {
        label:"Torque",
        factor: { "N·m":1, "lbf·ft":1.3558179483314004 },
        defaults:["N·m","lbf·ft"]
      },
      data: {
        label:"Data",
        factor: {
          bit:1, byte:8,
          kB:8000, MB:8e6, GB:8e9, TB:8e12,
          KiB:8192, MiB:8*1024*1024, GiB:8*1024*1024*1024, TiB:8*1024*1024*1024*1024
        },
        names:{ kB:"kilobyte (×1000)", KiB:"kibibyte (×1024)" }, defaults:["MB","MiB"]
      },
    };
  }

  /* ============================ END DOM LOAD ============================= */
});
