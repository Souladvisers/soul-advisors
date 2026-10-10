/* SOUL Advisors — Estate Planning File cover pack
   Shared by /wasiat and /memorandum. Builds a 2-page cover (contents sheet +
   "When I pass away" family checklist) as PDF (jsPDF) or Word (docx).
   Client data is read from this browser tab only (sessionStorage). The
   adviser's own contact details are remembered on this device (localStorage). */
(function(){
  const ADV_KEY = 'soul_adviser';
  const read = (store, k) => { try { const t = window[store].getItem(k); return t ? JSON.parse(t) : null; } catch(e){ return null; } };
  const write = (store, k, v) => { try { window[store].setItem(k, JSON.stringify(v)); } catch(e){} };
  const esc = t => String(t||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const today = () => new Date().toLocaleDateString('en-SG', { day:'numeric', month:'long', year:'numeric' });

  /* ---------- adviser fields ---------- */
  function mount(boxId){
    const box = document.getElementById(boxId); if(!box) return;
    const a = read('localStorage', ADV_KEY) || { name:'', rep:'', phone:'', email:'' };
    box.innerHTML = `
      <h2 style="margin-top:26px;font-size:17px">Cover pack for printing</h2>
      <p class="lead" style="margin-bottom:6px">A cover sheet and a family checklist to place in front of the will and memorandum. Do not staple it to the will.</p>
      <div class="row"><div><label>Adviser name</label><input type="text" data-adv="name" value="${esc(a.name)}"></div>
        <div><label>Representative no.</label><input type="text" data-adv="rep" value="${esc(a.rep)}"></div></div>
      <div class="row"><div><label>Phone</label><input type="text" data-adv="phone" value="${esc(a.phone)}"></div>
        <div><label>Email</label><input type="text" data-adv="email" value="${esc(a.email)}"></div></div>
      <p class="hint" style="margin:6px 0 0">Your details are remembered on this device for next time.</p>
      <div class="tools"><button class="btn gold" type="button" data-cover="pdf">Print cover pack (PDF)</button>
        <button class="btn sec" type="button" data-cover="docx">Cover pack (Word)</button></div>`;
    box.addEventListener('input', e => { const k = e.target.dataset.adv; if(!k) return;
      const cur = read('localStorage', ADV_KEY) || {}; cur[k] = e.target.value; write('localStorage', ADV_KEY, cur); });
    const sync = () => { const cur = read('localStorage', ADV_KEY) || {}; box.querySelectorAll('[data-adv]').forEach(i => { if(document.activeElement !== i) i.value = cur[i.dataset.adv] || ''; }); };
    window.addEventListener('storage', e => { if(e.key === ADV_KEY) sync(); });
    window.addEventListener('focus', sync);
    box.addEventListener('click', e => { const b = e.target.closest('[data-cover]'); if(!b) return;
      b.dataset.cover === 'pdf' ? pdf() : docxOut(); });
  }

  /* ---------- gather data from both tools ---------- */
  function gather(){
    const w = read('sessionStorage', 'soul_wasiat'), m = read('sessionStorage', 'soul_memo');
    const adv = read('localStorage', ADV_KEY) || {};
    const t = (w && w.t && w.t.name) ? w.t : (m && m.t) || {};
    const ex = ((m && m.executors) || []).concat((w && w.executors) || []).find(e => e && e.name && e.name.trim()) || {};
    const exPhone = ((m && m.executors) || []).find(e => e.name && ex.name && e.name.trim() === ex.name.trim() && e.phone);
    return {
      name: (t.name || '').trim(),
      hasWill: !!(w && w.t && w.t.name && w.t.name.trim()),
      hasMemo: !!(m && m.t && m.t.name && m.t.name.trim()),
      willDate: (m && m.willDate || '').trim(),
      willAt: (m && m.willAt || '').trim(),
      docsAt: (m && m.docs && m.docs.where || '').trim(),
      ex: { name: (ex.name || '').trim(), rel: (ex.rel || '').trim(), phone: exPhone ? exPhone.phone.trim() : '' },
      nominations: !!(w && (w.cpfNom === 'yes' || w.insNom === 'yes')),
      lifetime: !!(w && w.lifetime),
      khairat: (m && m.fun && m.fun.khairat || '').trim(),
      mosque: (m && m.fun && m.fun.mosque || '').trim(),
      adv: { name:(adv.name||'').trim(), rep:(adv.rep||'').trim(), phone:(adv.phone||'').trim(), email:(adv.email||'').trim() },
    };
  }
  const blank = (v, n=22) => v || '_'.repeat(n);

  const CONTENTS = d => [
    [d.hasWill, 'Last Will and Testament (Wasiat)', d.willDate],
    [d.hasMemo, 'Memorandum of Wishes', d.hasMemo ? today() : ''],
    [d.nominations, 'Summary of CPF and insurance nominations', ''],
    [d.lifetime, 'Hibah, trust or waqf documents', ''],
    [false, 'Copies of key documents (property, policies, accounts)', ''],
  ];
  const STEPS = d => [
    ['Certify and register the death', 'Call a doctor to certify the death, or 995 if it is sudden or unexpected. The death is registered and a digital death certificate is issued. The MyLegacy portal (mylegacy.life.gov.sg) guides you through the next steps.'],
    ['Arrange the funeral promptly', `Contact ${d.mosque ? d.mosque : 'the mosque'}${d.khairat ? ` and the khairat scheme (${d.khairat})` : ' and any khairat scheme'}. Burial should take place as soon as practicable. See the Memorandum of Wishes for funeral wishes.`],
    ['Inform the Executor', `Contact ${d.ex.name ? d.ex.name + (d.ex.phone ? ` (${d.ex.phone})` : '') : 'the Executor named in the Will'} and hand over this file. The original Will must not be unstapled, marked or altered.`],
    ['Do not distribute any assets yet', 'Do not sell, withdraw or share out any money or property until the Executor has obtained the necessary court documents.'],
    ['Apply for the Inheritance Certificate', 'The Executor applies to the Syariah Court for the Inheritance Certificate, which sets out the lawful heirs and their shares under Faraid, and then applies for the Grant of Probate.'],
    ['Contact CPF, banks and insurers', `CPF monies are paid directly to nominees. For insurance claims and policy matters, contact the adviser below${d.adv.name ? `, ${d.adv.name}` : ''}, who can help the family.`],
    ['Settle debts before distribution', 'Funeral costs, debts owed to others, and outstanding zakat, fidyah or badal haji are settled first. The balance is then distributed according to the Will and Faraid.'],
  ];
  const VERSE = '“O you who have believed, fear Allah. And let every soul look to what it has put forth for tomorrow.” (Surah Al-Hashr, 59:18)';
  const fname = d => `Cover_Pack_${(d.name || 'Draft').replace(/[^\w]+/g,'_')}`;

  /* ---------- PDF ---------- */
  function pdf(){
    if(!window.jspdf){ alert('The PDF library did not load. Check your connection and reload.'); return; }
    const d = gather(); if(!d.name){ alert('Please enter the client’s name first.'); return; }
    const doc = new window.jspdf.jsPDF({ unit:'pt', format:'a4' });
    const PW = 595.28, PH = 841.89, X0 = 64, X1 = PW - 64, W = X1 - X0;
    const gold = [168,131,74], ink = [20,20,20];
    const T = (txt, x, y, o={}) => { doc.setFont('times', o.b ? 'bold' : o.i ? 'italic' : 'normal'); doc.setFontSize(o.s || 11); doc.setTextColor(...(o.c || ink)); doc.text(txt, x, y, o.align ? {align:o.align} : undefined); };
    const wrap = (txt, w, s=11, b=false) => { doc.setFont('times', b?'bold':'normal'); doc.setFontSize(s); return doc.splitTextToSize(txt, w); };
    const frame = () => { doc.setDrawColor(...gold); doc.setLineWidth(1.2); doc.rect(36, 36, PW-72, PH-72); doc.setLineWidth(0.4); doc.rect(41, 41, PW-82, PH-82); doc.setDrawColor(0); };
    const tick = (x, y, on) => { doc.setLineWidth(0.7); doc.rect(x, y-8.5, 10, 10); if(on){ doc.setLineWidth(1.4); doc.line(x+2, y-3.5, x+4.3, y-1); doc.line(x+4.3, y-1, x+8.5, y-7); } };
    const grid = (y, widths, rows, s=10, onRow) => { const lh = s*1.3, pad = 5;
      rows.forEach((r,i) => { const cells = r.map((c,j)=>wrap(String(c), widths[j]-pad*2, s, i===0)); const h = Math.max(1, ...cells.map(c=>c.length))*lh + pad*2; let x = X0;
        cells.forEach((c,j)=>{ if(i===0){ doc.setFillColor(242,236,224); doc.rect(x,y,widths[j],h,'F'); } doc.setLineWidth(0.5); doc.rect(x,y,widths[j],h);
          c.forEach((ln,k)=>T(ln, x+pad, y+pad+s*0.85+k*lh, {s, b:i===0})); x += widths[j]; });
        if(onRow) onRow(i, y, h); y += h; }); return y; };

    /* page 1 — cover */
    frame();
    let y = 92;
    T('Bismillahirrahmanirrahim', PW/2, y, {i:true, s:12, align:'center'}); y += 36;
    T('ESTATE PLANNING FILE', PW/2, y, {b:true, s:24, align:'center'}); y += 22;
    T('Dokumen Wasiat & Pesanan', PW/2, y, {i:true, s:13, align:'center', c:gold}); y += 24;
    doc.setDrawColor(...gold); doc.setLineWidth(0.8); doc.line(PW/2-90, y, PW/2+90, y); doc.setDrawColor(0); y += 26;
    T(d.name.toUpperCase(), PW/2, y, {b:true, s:17, align:'center'}); y += 18;
    T(`Prepared on ${today()}`, PW/2, y, {s:10.5, align:'center', c:[90,90,90]}); y += 28;

    T('CONTENTS OF THIS FILE', X0, y, {b:true, s:11}); y += 8;
    const cw = [26, 255, 95, W-26-255-95];
    const items = CONTENTS(d);
    y = grid(y, cw, [['', 'Document', 'Dated', 'Original     Copy'], ...items.map(c=>['', c[1], c[2]||'', ''])], 10, (i, ry, h) => {
      if(i===0) return; const mid = ry + h/2 + 4.5; tick(X0+8, mid, items[i-1][0]);
      const cx = X0 + cw[0] + cw[1] + cw[2]; tick(cx + 18, mid, false); tick(cx + 62, mid, false); });
    y += 22;

    T('WHERE THINGS ARE', X0, y, {b:true, s:11}); y += 8;
    y = grid(y, [150, W-150], [['Item', 'Details'],
      ['Original Will kept at', blank(d.willAt, 40)],
      ['Other documents kept at', blank(d.docsAt, 40)],
      ['Executor', d.ex.name ? `${d.ex.name}${d.ex.rel ? ' ('+d.ex.rel+')' : ''}${d.ex.phone ? ' · '+d.ex.phone : ''}` : blank('', 40)],
      ['Copies held by', blank('', 40)]], 10);
    y += 22;

    T('PREPARED BY', X0, y, {b:true, s:11}); y += 8;
    const boxH = 62; doc.setFillColor(250,247,240); doc.setDrawColor(...gold); doc.setLineWidth(0.8); doc.rect(X0, y, W, boxH, 'FD'); doc.setDrawColor(0);
    T('SOUL Advisors', X0+12, y+18, {b:true, s:12, c:gold});
    T(`${blank(d.adv.name, 28)}${d.adv.rep ? '   ·   Rep. No. '+d.adv.rep : '   ·   Rep. No. ____________'}`, X0+12, y+35, {s:10.5});
    T(`${d.adv.phone ? 'Tel: '+d.adv.phone : 'Tel: ____________'}${d.adv.email ? '   ·   '+d.adv.email : '   ·   Email: ______________________'}`, X0+12, y+50, {s:10.5});
    y += boxH + 22;

    T('REVIEW LOG', X0, y, {b:true, s:11}); T('Review every 3–5 years, or after a marriage, divorce, birth or death in the family.', X0+80, y, {i:true, s:9, c:[90,90,90]}); y += 8;
    y = grid(y, [100, 140, W-240], [['Date', 'Reviewed by', 'Changes made'], ['', '', ''], ['', '', ''], ['', '', '']], 10);

    y = Math.max(y + 28, PH - 78);
    const vl = wrap(VERSE, W-40, 10); vl.forEach((ln,i)=>T(ln, PW/2, y + i*13, {i:true, s:10, align:'center', c:[90,90,90]}));

    /* page 2 — family checklist */
    doc.addPage(); frame(); y = 92;
    T('WHEN I PASS AWAY', PW/2, y, {b:true, s:20, align:'center'}); y += 20;
    T(`A checklist for the family of ${d.name}`, PW/2, y, {i:true, s:11.5, align:'center', c:gold}); y += 18;
    const intro = wrap('Inna lillahi wa inna ilayhi raji’un. Please keep this file safe and follow these steps in order. Do not unstaple, mark or remove pages from the original Will.', W, 10.5);
    intro.forEach((ln,i)=>T(ln, PW/2, y + 14 + i*14, {s:10.5, align:'center'})); y += 14 + intro.length*14 + 18;
    STEPS(d).forEach(([h, body], i) => {
      const lines = wrap(body, W-46, 10.5);
      doc.setFillColor(...gold); doc.circle(X0+11, y-3.5, 10, 'F'); T(String(i+1), X0+11, y, {b:true, s:11, align:'center', c:[255,255,255]});
      tick(X1-12, y, false);
      T(h, X0+30, y, {b:true, s:12});
      lines.forEach((ln,k)=>T(ln, X0+30, y + 16 + k*14, {s:10.5}));
      y += 16 + lines.length*14 + 12;
    });
    y += 4;
    doc.setDrawColor(...gold); doc.setLineWidth(0.8); doc.line(X0, y, X1, y); doc.setDrawColor(0); y += 22;
    T('Important contacts', X0, y, {b:true, s:12}); y += 8;
    grid(y, [150, 170, W-320], [['Contact', 'Name', 'Phone'],
      ['Executor', d.ex.name || '', d.ex.phone || ''],
      ['Adviser (SOUL Advisors)', d.adv.name || '', d.adv.phone || ''],
      ['Mosque / khairat', d.mosque || '', ''],
      ['Lawyer', '', '']], 10);
    T('This cover pack is a guide only. It is not part of the Will or the Memorandum of Wishes.', PW/2, PH-50, {i:true, s:8.5, align:'center', c:[110,110,110]});

    doc.setProperties({ title:`Estate Planning File – ${d.name}`, creator:'SOUL Advisors' });
    doc.save(fname(d) + '.pdf');
  }

  /* ---------- Word ---------- */
  async function docxOut(){
    if(!window.docx){ alert('The Word library did not load. Check your connection and reload.'); return; }
    const d = gather(); if(!d.name){ alert('Please enter the client’s name first.'); return; }
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak } = window.docx;
    const F = 'Times New Roman', GOLD = 'A8834A';
    const r = (t, o={}) => new TextRun({ text:t, font:F, size:o.s||22, bold:o.b, italics:o.i, color:o.c });
    const P = (kids, o={}) => new Paragraph({ alignment:o.a || AlignmentType.LEFT, spacing:{ before:o.before||0, after:o.after??120 }, children: Array.isArray(kids) ? kids : [kids] });
    const thin = { style:BorderStyle.SINGLE, size:4, color:'000000' }, B = { top:thin, bottom:thin, left:thin, right:thin };
    const grid = (widths, rows) => new Table({ width:{ size:widths.reduce((a,b)=>a+b,0), type:WidthType.DXA }, columnWidths:widths,
      rows: rows.map((row,i)=>new TableRow({ children: row.map((c,j)=>new TableCell({ width:{ size:widths[j], type:WidthType.DXA }, borders:B,
        margins:{ top:70, bottom:70, left:100, right:100 }, shading: i===0 ? { fill:'F2ECE0', type:ShadingType.CLEAR, color:'auto' } : undefined,
        children:[P(r(String(c), { s:20, b:i===0 }), { after:0 })] })) })) });
    const C = AlignmentType.CENTER, TW = 9026;
    const page1 = [
      P(r('Bismillahirrahmanirrahim', { i:true, s:24 }), { a:C, after:480 }),
      P(r('ESTATE PLANNING FILE', { b:true, s:48 }), { a:C, after:80 }),
      P(r('Dokumen Wasiat & Pesanan', { i:true, s:26, c:GOLD }), { a:C, after:400 }),
      P(r(d.name.toUpperCase(), { b:true, s:34 }), { a:C, after:60 }),
      P(r(`Prepared on ${today()}`, { s:20, c:'5A5A5A' }), { a:C, after:400 }),
      P(r('CONTENTS OF THIS FILE', { b:true }), { after:80 }),
      grid([600, 4300, 1700, 2426], [['', 'Document', 'Dated', 'Original / Copy'], ...CONTENTS(d).map(c=>[c[0] ? '☑' : '☐', c[1], c[2]||'', '☐ Original   ☐ Copy'])]),
      P(r('WHERE THINGS ARE', { b:true }), { before:280, after:80 }),
      grid([2700, TW-2700], [['Item', 'Details'], ['Original Will kept at', d.willAt], ['Other documents kept at', d.docsAt],
        ['Executor', d.ex.name ? `${d.ex.name}${d.ex.rel ? ' ('+d.ex.rel+')' : ''}${d.ex.phone ? ' · '+d.ex.phone : ''}` : ''], ['Copies held by', '']]),
      P(r('PREPARED BY', { b:true }), { before:280, after:80 }),
      P([r('SOUL Advisors', { b:true, c:GOLD })], { after:40 }),
      P(r(`${blank(d.adv.name, 28)}   ·   Rep. No. ${blank(d.adv.rep, 12)}`, { s:21 }), { after:40 }),
      P(r(`Tel: ${blank(d.adv.phone, 12)}   ·   Email: ${blank(d.adv.email, 22)}`, { s:21 }), { after:200 }),
      P([r('REVIEW LOG  ', { b:true }), r('Review every 3–5 years, or after a marriage, divorce, birth or death in the family.', { i:true, s:18, c:'5A5A5A' })], { after:80 }),
      grid([1800, 2500, TW-4300], [['Date', 'Reviewed by', 'Changes made'], ['', '', ''], ['', '', ''], ['', '', '']]),
      P(r(VERSE, { i:true, s:19, c:'5A5A5A' }), { a:C, before:400 }),
      new Paragraph({ children:[ new PageBreak() ] }),
    ];
    const page2 = [
      P(r('WHEN I PASS AWAY', { b:true, s:40 }), { a:C, after:60 }),
      P(r(`A checklist for the family of ${d.name}`, { i:true, s:23, c:GOLD }), { a:C, after:200 }),
      P(r('Inna lillahi wa inna ilayhi raji’un. Please keep this file safe and follow these steps in order. Do not unstaple, mark or remove pages from the original Will.', { s:21 }), { a:C, after:280 }),
      ...STEPS(d).flatMap(([h, body], i) => [
        P([r(`☐  ${i+1}.  `, { b:true, c:GOLD, s:24 }), r(h, { b:true, s:24 })], { after:40 }),
        new Paragraph({ indent:{ left:720 }, spacing:{ after:200 }, children:[ r(body, { s:21 }) ] }),
      ]),
      P(r('Important contacts', { b:true, s:24 }), { before:120, after:80 }),
      grid([2700, 3200, TW-5900], [['Contact', 'Name', 'Phone'], ['Executor', d.ex.name, d.ex.phone], ['Adviser (SOUL Advisors)', d.adv.name, d.adv.phone], ['Mosque / khairat', d.mosque, ''], ['Lawyer', '', '']]),
      P(r('This cover pack is a guide only. It is not part of the Will or the Memorandum of Wishes.', { i:true, s:17, c:'6E6E6E' }), { a:C, before:300 }),
    ];
    const doc = new Document({ creator:'SOUL Advisors', title:`Estate Planning File – ${d.name}`,
      sections:[{ properties:{ page:{ margin:{ top:1200, bottom:1100, left:1440, right:1440 },
        borders:{ pageBorderTop:{ style:BorderStyle.DOUBLE, size:6, color:GOLD, space:20 }, pageBorderBottom:{ style:BorderStyle.DOUBLE, size:6, color:GOLD, space:20 },
                  pageBorderLeft:{ style:BorderStyle.DOUBLE, size:6, color:GOLD, space:20 }, pageBorderRight:{ style:BorderStyle.DOUBLE, size:6, color:GOLD, space:20 } } } },
        children:[...page1, ...page2] }] });
    const blob = await Packer.toBlob(doc); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname(d) + '.docx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  }

  window.CoverPack = { mount, pdf, docx: docxOut, gather };
})();
