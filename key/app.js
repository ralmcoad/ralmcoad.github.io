(() => {
  'use strict';
  const docs = window.LIBRARY;
  const cards = document.querySelector('#cards');
  const search = document.querySelector('#search');
  const empty = document.querySelector('#empty');
  const results = document.querySelector('#results');
  const clear = document.querySelector('#clear-search');
  const buttons = [...document.querySelectorAll('[data-filter]')];
  let filter = '전체';
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = title => title.replace(/^@/, '').replace(/_/g, ' ').replace(/╱/g, ' / ');
  const size = bytes => bytes < 1048576 ? Math.round(bytes / 1024) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
  const summaries = {gastrointestinal:'위·대장 질환, 위장관 출혈과 염증',hepatobiliary:'간질환, 담낭·담관 질환과 췌장염',renal:'급성·만성 신질환, 사구체 질환과 전해질',endocrine:'갑상선·부신 질환, 당뇨와 호르몬',cardiology:'고혈압, 부정맥, 심부전과 혈관 질환',obstetrics:'산전관리, 분만, 산후 질환',gynecology:'월경·생식내분비, 유방과 부인과 질환'};
  function render() {
    const query = normalize(search.value.trim());
    const selected = docs.filter(d => (filter === '전체' || d.group === filter) && (!query || normalize(d.name + ' ' + d.titles.join(' ')).includes(query)));
    cards.innerHTML = selected.map(d => {
      const matched = query ? d.titles.filter(t => normalize(t).includes(query)) : [];
      const description = matched.length ? '관련 주제 · ' + matched.slice(0,3).map(clean).join(', ') + (matched.length > 3 ? ' 외' : '') : summaries[d.slug];
      return `<article class="card"><a class="preview" href="${d.pdf}" target="_blank" rel="noopener" aria-label="${escape(d.name)} PDF 새 탭에서 열기"><img src="${d.preview}" alt="${escape(d.name)} 3단 PDF 첫 페이지 미리보기" width="566" height="800" loading="lazy"><span class="preview-tag">3-COLUMN NOTES</span><span class="preview-corner" aria-hidden="true">↗</span></a><div class="card-body"><div class="card-meta"><span>${escape(d.group)}</span><span>NOTE ${String(d.number).padStart(2,'0')}</span></div><h3>${escape(d.name)}</h3><p class="card-subtitle">${d.pages}쪽 <span aria-hidden="true">·</span> ${d.topics}개 주제 <span aria-hidden="true">·</span> ${size(d.bytes)}</p><p class="card-description">${escape(description)}</p><div class="card-actions"><a class="open-pdf" href="${d.pdf}" target="_blank" rel="noopener" aria-label="${escape(d.name)} PDF 열기, 새 탭">PDF 열기 <span aria-hidden="true">↗</span></a><a class="download" href="${d.pdf}" download="${escape(d.name)}_Key_message_3단.pdf" aria-label="${escape(d.name)} PDF 다운로드">다운로드 <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4"/></svg></a></div></div></article>`;
    }).join('');
    results.textContent = `${selected.length}개 자료 · ${selected.reduce((sum, d) => sum + d.topics, 0)}개 주제`;
    empty.hidden = selected.length > 0;
    clear.hidden = search.value.length === 0;
  }
  search.addEventListener('input', render);
  clear.addEventListener('click', () => { search.value = ''; render(); search.focus(); });
  buttons.forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    buttons.forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    render();
  }));
  document.querySelector('#reset').addEventListener('click', () => { search.value = ''; buttons[0].click(); search.focus(); });
  render();
})();
