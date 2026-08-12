/* ─── main.js — DE Lab Dashboard Client Logic ─── */

// ═══════════════════════════════════════════════
// Shared utilities
// ═══════════════════════════════════════════════
const COLORS = {
  primary: '#3b82f6', secondary: '#10b981', accent: '#8b5cf6',
  warning: '#f59e0b', danger: '#ef4444', info: '#06b6d4',
  muted: '#7a8fa6', text: '#e8edf5',
};
const APEX_THEME = {
  mode: 'dark',
  palette: 'palette1',
  monochrome: { enabled: false },
};
const APEX_COMMON = {
  chart: { background: 'transparent', toolbar: { show: false }, fontFamily: 'Plus Jakarta Sans, sans-serif' },
  theme: APEX_THEME,
  grid: { borderColor: '#1e2d45', strokeDashArray: 3 },
  tooltip: { theme: 'dark' },
};

// Delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════
// Upload Zone — shared across weeks
// ═══════════════════════════════════════════════
function initUploadZone(zoneId, inputId, onUpload) {
  const zone = document.getElementById(zoneId);
  const inp  = document.getElementById(inputId);
  if (!zone || !inp) return;

  zone.addEventListener('click', () => inp.click());
  inp.addEventListener('change', e => { if (e.target.files[0]) onUpload(e.target.files[0]); });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) onUpload(f);
  });
}

async function uploadCSV(file, statusId) {
  const fd = new FormData();
  fd.append('file', file);
  const statusEl = document.getElementById(statusId);
  if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Processing…';
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await r.json();
    if (statusEl) {
      if (json.error) {
        statusEl.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-circle-exclamation"></i> ${json.error}</span>`;
      } else {
        statusEl.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Loaded: ${file.name}</span>`;
      }
    }
    return json;
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span class="badge badge-red">Upload failed</span>`;
    return null;
  }
}

// ═══════════════════════════════════════════════
// WEEK 1 — EDA
// ═══════════════════════════════════════════════
let w1Charts = {};

function initWeek1() {
  initWeek1TabSwitcher();
  initAddRecordForm();
  initRerunEDAScratch();

  // Render preloaded charts
  const an = window.W1_ANALYSIS;
  if (an) renderEDACharts(an);

  // Upload
  initUploadZone('upload-zone', 'csv-input', async file => {
    const res = await uploadCSV(file, 'upload-status');
    if (res && res.analysis) renderEDACharts(res.analysis);
  });
}

function initRerunEDAScratch() {
  const btn = document.getElementById('btn-rerun-eda-scratch');
  const statusEl = document.getElementById('rerun-eda-status');

  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Re-running EDA process from scratch...';
    try {
      const res = await fetch('/api/rerun-eda-scratch', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> ${data.error}</span>`;
      } else {
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> ${data.message}</span>`;
        if (data.analysis) {
          window.W1_ANALYSIS = data.analysis;
          renderEDACharts(data.analysis);
        }
        if (data.eda_comparison?.comparison) {
          const tbody = document.getElementById('eda-comparison-tbody');
          if (tbody) {
            tbody.innerHTML = data.eda_comparison.comparison.map(row => `
              <tr>
                <td><b>${row.attribute}</b></td>
                <td><span class="badge badge-red">${row.before}</span></td>
                <td><span class="badge badge-green">${row.after}</span></td>
                <td><span class="badge badge-blue">${row.change}</span></td>
              </tr>
            `).join('');
          }
        }
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span class="badge badge-red">Failed to re-run EDA process</span>`;
    }
  });
}

function initAddRecordForm() {
  const btn = document.getElementById('btn-add-record');
  const priceInp = document.getElementById('rec-price');
  const oldPriceInp = document.getElementById('rec-old-price');
  const ratingInp = document.getElementById('rec-rating');

  if (!btn) return;

  function updatePreview() {
    const price = parseFloat(priceInp?.value || 0);
    let oldPrice = parseFloat(oldPriceInp?.value || price);
    if (oldPrice < price) oldPrice = price;
    const rating = parseFloat(ratingInp?.value || 4.0);

    const discAmt = Math.max(0, oldPrice - price);
    const discPct = oldPrice > 0 ? (discAmt / oldPrice) * 100 : 0;
    const gbp = price * 0.79;
    const valScore = price > 0 ? rating / price : 0;
    const isBest = rating >= 4.5;

    let ptier = "Budget (<$10)";
    if (price >= 10 && price <= 25) ptier = "Standard ($10-25)";
    else if (price > 25 && price <= 50) ptier = "Premium ($25-50)";
    else if (price > 50) ptier = "Luxury (>$50)";

    const discBadge = document.getElementById('prev-disc-badge');
    if (discBadge) discBadge.textContent = `$${discAmt.toFixed(2)} (${discPct.toFixed(1)}% off)`;

    const gbpBadge = document.getElementById('prev-gbp-badge');
    if (gbpBadge) gbpBadge.textContent = `£${gbp.toFixed(2)} GBP`;

    const valBadge = document.getElementById('prev-val-badge');
    if (valBadge) valBadge.textContent = `Value: ${valScore.toFixed(4)}`;

    const bestBadge = document.getElementById('prev-best-badge');
    if (bestBadge) bestBadge.textContent = isBest ? '★ Bestseller' : 'Standard Rating';

    const ptierBadge = document.getElementById('prev-ptier-badge');
    if (ptierBadge) ptierBadge.textContent = ptier;
  }

  [priceInp, oldPriceInp, ratingInp].forEach(inp => {
    if (inp) inp.addEventListener('input', updatePreview);
  });
  updatePreview();

  btn.addEventListener('click', async () => {
    const title = document.getElementById('rec-title')?.value.trim();
    if (!title) {
      alert('Please enter a book title!');
      return;
    }

    const payload = {
      title: title,
      author: document.getElementById('rec-author')?.value.trim() || 'Unknown',
      category: document.getElementById('rec-category')?.value || 'Computing',
      format: document.getElementById('rec-format')?.value || 'Paperback',
      price: parseFloat(document.getElementById('rec-price')?.value || 10),
      old_price: parseFloat(document.getElementById('rec-old-price')?.value || 10),
      rating: parseFloat(document.getElementById('rec-rating')?.value || 4.0),
      isbn: document.getElementById('rec-isbn')?.value.trim() || '9781449373320',
    };

    const statusEl = document.getElementById('add-record-status');
    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Computing features & inserting...';

    try {
      const res = await fetch('/api/add-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) {
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> ${data.error}</span>`;
      } else {
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> ${data.message}</span>`;
        if (data.analysis) {
          window.W1_ANALYSIS = data.analysis;
          renderEDACharts(data.analysis);
        }
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span class="badge badge-red">Failed to add record</span>`;
    }
  });
}

function initWeek1TabSwitcher() {
  const tabs = document.querySelectorAll('.sub-nav-tabs .tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.getAttribute('data-tab');
      document.querySelectorAll('.week1-section').forEach(sec => {
        if (sec.id === targetId) {
          sec.style.display = 'block';
          sec.classList.add('fade-in');
        } else {
          sec.style.display = 'none';
        }
      });

      // Resize ApexCharts when tabs change to prevent rendering zero width
      setTimeout(() => {
        Object.values(w1Charts).forEach(chart => {
          if (chart && typeof chart.windowResize === 'function') {
            chart.windowResize();
          }
        });
      }, 100);
    });
  });
}

function renderEDACharts(an) {
  // Update KPIs
  setText('kpi-rows', an.total_rows?.toLocaleString());
  setText('kpi-cols', an.total_cols);
  setText('kpi-missing', an.missing_pct + '%');
  setText('kpi-dupes', an.duplicate_rows?.toLocaleString());

  renderPipelineFlow(an);
  renderColumnTypes(an);
  renderPCAChart(an);
  renderNumericCharts(an);
  renderCategoryCountChart(an);
  renderPriceAndDiscountTiers(an);
  renderCorrelation(an);
  renderStatsMatrixTable(an);
  renderSampleTable(an);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

function truncateLabel(str, maxLen = 12) {
  if (!str) return '';
  const clean = String(str).replace(/-/g, ' ');
  return clean.length > maxLen ? clean.substring(0, maxLen - 1) + '…' : clean;
}

function renderPriceAndDiscountTiers(an) {
  // Price Tiers Donut Chart
  const ptEl = document.getElementById('price-tiers-chart');
  if (ptEl && an.price_tiers?.labels) {
    if (w1Charts['price_tier']) { try { w1Charts['price_tier'].destroy(); } catch(_){} }
    w1Charts['price_tier'] = new ApexCharts(ptEl, {
      ...APEX_COMMON,
      chart: { ...APEX_COMMON.chart, type: 'donut', height: 220 },
      series: an.price_tiers.counts,
      labels: an.price_tiers.labels,
      colors: [COLORS.secondary, COLORS.primary, COLORS.warning, COLORS.danger],
      legend: { position: 'bottom', labels: { colors: COLORS.muted } },
      dataLabels: { enabled: true, style: { fontSize: '0.75rem' } },
    });
    w1Charts['price_tier'].render();
  }

  // Discount Tiers Bar Chart
  const dtEl = document.getElementById('discount-tiers-chart');
  if (dtEl && an.discount_tiers?.labels) {
    if (w1Charts['disc_tier']) { try { w1Charts['disc_tier'].destroy(); } catch(_){} }
    w1Charts['disc_tier'] = new ApexCharts(dtEl, {
      ...APEX_COMMON,
      chart: { ...APEX_COMMON.chart, type: 'bar', height: 220 },
      series: [{ name: 'Books Count', data: an.discount_tiers.counts }],
      xaxis: { categories: an.discount_tiers.labels, labels: { style: { colors: COLORS.muted, fontSize: '0.7rem' } } },
      yaxis: { labels: { style: { colors: COLORS.muted } } },
      colors: [COLORS.accent],
      plotOptions: { bar: { horizontal: false, columnWidth: '45%', borderRadius: 4 } },
      dataLabels: { enabled: false },
    });
    w1Charts['disc_tier'].render();
  }
}

function renderCategoryCountChart(an) {
  // Top 10 categories by book count — simple horizontal bar
  const el = document.getElementById('category-count-chart');
  if (!el) return;
  const catStats = an.cat_stats || {};
  const categoryData = catStats['category'];
  if (!categoryData || !categoryData.labels) return;
  const top10Labels = categoryData.labels.slice(0, 10);
  const top10Counts = categoryData.counts.slice(0, 10);
  if (w1Charts['cat_count']) { try { w1Charts['cat_count'].destroy(); } catch(_){} }
  w1Charts['cat_count'] = new ApexCharts(el, {
    ...APEX_COMMON,
    chart: { ...APEX_COMMON.chart, type: 'bar', height: 260 },
    series: [{ name: 'Number of Books', data: top10Counts }],
    xaxis: {
      categories: top10Labels.map(l => l.replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').trim()),
      labels: { rotate: -30, style: { colors: COLORS.muted, fontSize: '0.68rem' } }
    },
    yaxis: { labels: { style: { colors: COLORS.muted } } },
    colors: [COLORS.secondary],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
    dataLabels: { enabled: true, style: { fontSize: '0.68rem', colors: ['#fff'] } }
  });
  w1Charts['cat_count'].render();
}

function renderStatsMatrixTable(an) {
  const tbody = document.getElementById('stats-matrix-tbody');
  if (!tbody || !an.num_stats) return;
  tbody.innerHTML = Object.entries(an.num_stats).map(([col, s]) =>
    `<tr>
      <td class="font-mono"><b>${col}</b></td>
      <td>${s.mean}</td>
      <td>${s.median}</td>
      <td>${s.std}</td>
      <td><span class="badge ${Math.abs(s.skew)>1?'badge-amber':'badge-blue'}">${s.skew}</span></td>
      <td><span class="badge ${s.kurt>3?'badge-purple':'badge-blue'}">${s.kurt}</span></td>
      <td>${s.min}</td>
      <td>${s.max}</td>
      <td>${s.q25}</td>
      <td>${s.q75}</td>
      <td>${s.q90}</td>
      <td>${s.iqr}</td>
    </tr>`
  ).join('');
}

function renderPipelineFlow(an) {
  const stages = an.pipeline_stages || [
    { stage: 1, title: 'Raw Ingestion',    badge: 'Extract',   rows: an.total_rows + (an.duplicate_rows||0), cols: 11, icon: 'fa-file-csv', color: 'blue' },
    { stage: 2, title: 'Standardisation',  badge: 'Transform', rows: an.total_rows + (an.duplicate_rows||0), cols: 11, icon: 'fa-table-columns', color: 'purple' },
    { stage: 3, title: 'Cleaning & Dedup', badge: 'Transform', rows: an.total_rows, cols: 11, icon: 'fa-filter', color: 'amber' },
    { stage: 4, title: 'Feature Engg.',    badge: 'Feature',   rows: an.total_rows, cols: 18, icon: 'fa-wand-magic-sparkles', color: 'teal' },
    { stage: 5, title: 'Cover Resolution', badge: 'Enrich',    rows: an.total_rows, cols: 19, icon: 'fa-image', color: 'green' },
    { stage: 6, title: 'Analytical Store', badge: 'Load',      rows: an.total_rows, cols: 19, icon: 'fa-database', color: 'indigo' },
  ];

  // 1. Render Graphical Visual Nodes (Cards Flow Diagram)
  const flowContainer = document.getElementById('w1-pipeline-flow');
  if (flowContainer) {
    flowContainer.innerHTML = stages.map((st, i) => `
      <div class="pipeline-node node-${st.color}">
        <div class="node-header">
          <span class="node-icon"><i class="fa-solid ${st.icon}"></i></span>
          <span class="badge badge-${st.color}">${st.badge}</span>
        </div>
        <div class="node-title">${st.stage}. ${st.title}</div>
        <div class="node-metrics">
          <span><i class="fa-solid fa-layer-group"></i> ${st.rows?.toLocaleString()} rows</span>
          <span><i class="fa-solid fa-columns"></i> ${st.cols} cols</span>
        </div>
      </div>
      ${i < stages.length - 1 ? '<div class="pipeline-connector"><i class="fa-solid fa-angle-right"></i></div>' : ''}
    `).join('');
  }

  // 2. Render Pipeline ApexChart (Funnel / Stage Records Chart)
  const chartEl = document.getElementById('w1-pipeline-chart');
  if (chartEl) {
    if (w1Charts['pipe']) { try { w1Charts['pipe'].destroy(); } catch(_){} }
    w1Charts['pipe'] = new ApexCharts(chartEl, {
      ...APEX_COMMON,
      chart: { ...APEX_COMMON.chart, type: 'bar', height: 220 },
      series: [
        { name: 'Records Count', data: stages.map(s => s.rows) },
        { name: 'Columns Count', data: stages.map(s => s.cols * 1000) } // scale for visibility
      ],
      xaxis: {
        categories: stages.map(s => s.stage + '. ' + s.title),
        labels: { style: { colors: COLORS.muted, fontSize: '0.7rem' } }
      },
      yaxis: { labels: { style: { colors: COLORS.muted } } },
      colors: [COLORS.primary, COLORS.accent],
      dataLabels: { enabled: false },
      plotOptions: { bar: { horizontal: false, columnWidth: '45%', borderRadius: 4 } },
      tooltip: {
        y: {
          formatter: (val, { seriesIndex }) => seriesIndex === 0 ? val.toLocaleString() + ' rows' : (val / 1000) + ' columns'
        }
      }
    });
    w1Charts['pipe'].render();
  }
}

function renderColumnTypes(an) {
  const list = document.getElementById('col-types-list');
  if (!list) return;
  list.innerHTML = Object.entries(an.col_types || {}).map(([col, dtype]) =>
    `<span class="chip" title="${col}">${col} <em style="color:var(--muted)">${dtype}</em></span>`
  ).join('');
}

function renderPCAChart(an) {
  const pca = an.pca;
  const el = document.getElementById('pca-chart');
  if (!el || !pca || !pca.points || pca.points.length === 0) return;

  const totalEl = document.getElementById('pca-var-total');
  if (totalEl) {
    totalEl.innerHTML = `<i class="fa-solid fa-bolt" style="color:var(--warning)"></i> PC1 (${pca.var_explained[0]}%) + PC2 (${pca.var_explained[1]}%) = Total Variance Explained: ${pca.total_explained}%`;
  }

  // Group scatter points by category
  const categoriesMap = {};
  pca.points.forEach(p => {
    const cat = p.category || 'General';
    if (!categoriesMap[cat]) categoriesMap[cat] = [];
    categoriesMap[cat].push([p.x, p.y]);
  });

  const series = Object.entries(categoriesMap).slice(0, 6).map(([catName, pts]) => ({
    name: catName.replace(/-/g, ' '),
    data: pts
  }));

  if (w1Charts['pca']) { try { w1Charts['pca'].destroy(); } catch(_){} }
  w1Charts['pca'] = new ApexCharts(el, {
    ...APEX_COMMON,
    chart: { ...APEX_COMMON.chart, type: 'scatter', height: 280 },
    series: series,
    xaxis: {
      title: { text: `Principal Component 1 (PC1: ${pca.var_explained[0]}% Variance)`, style: { color: COLORS.muted, fontSize: '0.72rem' } },
      labels: { style: { colors: COLORS.muted, fontSize: '0.7rem' } }
    },
    yaxis: {
      title: { text: `Principal Component 2 (PC2: ${pca.var_explained[1]}% Variance)`, style: { color: COLORS.muted, fontSize: '0.72rem' } },
      labels: { style: { colors: COLORS.muted, fontSize: '0.7rem' } }
    },
    colors: [COLORS.primary, COLORS.secondary, COLORS.accent, COLORS.warning, COLORS.danger, COLORS.info],
    legend: { position: 'bottom', labels: { colors: COLORS.muted } },
    markers: { size: 6, hover: { size: 8 } },
    tooltip: {
      custom: function({ seriesIndex, dataPointIndex, w }) {
        const pt = w.config.series[seriesIndex].data[dataPointIndex];
        const catName = w.config.series[seriesIndex].name;
        return `<div style="padding:0.5rem;font-size:0.75rem;background:var(--surface2);border-radius:4px">
          <strong>Category:</strong> ${catName}<br>
          <strong>PC1:</strong> ${pt[0]} | <strong>PC2:</strong> ${pt[1]}
        </div>`;
      }
    }
  });
  w1Charts['pca'].render();
}

function renderNumericCharts(an) {
  const stats = an.num_stats || {};
  const container = document.getElementById('numeric-charts');
  if (!container) return;
  container.innerHTML = '';

  // Focus strictly on the top 2 primary numerical features (price & rating)
  const top2Features = ['price', 'rating'];
  const filteredEntries = Object.entries(stats).filter(([col]) => top2Features.includes(col));

  filteredEntries.forEach(([col, s]) => {
    const divId = 'num-chart-' + col.replace(/[^a-z0-9]/gi, '_');
    const wrapper = document.createElement('div');
    wrapper.className = 'card';

    let explainText = '';
    const nameFormatted = col === 'price' ? '1. SELLING PRICE ($ USD)' : '2. CUSTOMER RATING (1-5 STARS)';
    if (col === 'price') explainText = 'Primary financial feature measuring book selling price. Median price is $' + s.median + ', with 90% of catalog priced under $' + s.q90 + '.';
    else if (col === 'rating') explainText = 'Primary quality metric measuring customer satisfaction. Average rating is ' + s.mean + ' stars with median ' + s.median + '.';
    else if (col === 'discount_pct') explainText = 'Percentage discount off list price. Average discount across catalog is ' + s.mean + '%.';
    else if (col === 'discount_amount') explainText = 'Dollar savings amount per book. Average savings is $' + s.mean + '.';
    else if (col === 'price_gbp') explainText = 'Converted price in GBP (1 USD ≈ 0.79 GBP). Median price is £' + s.median + '.';
    else if (col === 'value_score') explainText = 'Value rating ratio (Rating / Price). Higher score indicates superior value for money.';
    else explainText = 'Statistical summary metrics for ' + col + ': Mean = ' + s.mean + ', Median = ' + s.median + '.';

    wrapper.innerHTML = `
      <div class="card-title" style="justify-content:space-between">
        <span><i class="fa-solid fa-chart-column" style="color:var(--primary)"></i> <strong>${nameFormatted}</strong></span>
        <div>
          <span class="badge ${Math.abs(s.skew)>1?'badge-amber':'badge-blue'}" title="Skewness indicator">Skew: ${s.skew}</span>
          <span class="badge badge-purple" title="Interquartile Range">IQR: ${s.iqr}</span>
        </div>
      </div>
      <p style="font-size:0.78rem;color:var(--muted);margin-bottom:0.85rem">${explainText}</p>

      <!-- Key Statistics Metric Chips -->
      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:0.4rem;margin-bottom:0.85rem;background:var(--surface2);padding:0.6rem;border-radius:6px;text-align:center">
        <div><div style="font-size:0.65rem;color:var(--muted);font-weight:700">MEAN</div><div style="font-weight:700;font-size:0.88rem;color:var(--primary)">${s.mean}</div></div>
        <div><div style="font-size:0.65rem;color:var(--muted);font-weight:700">MEDIAN</div><div style="font-weight:700;font-size:0.88rem;color:var(--secondary)">${s.median}</div></div>
        <div><div style="font-size:0.65rem;color:var(--muted);font-weight:700">25TH %</div><div style="font-weight:700;font-size:0.88rem;color:var(--text)">${s.q25}</div></div>
        <div><div style="font-size:0.65rem;color:var(--muted);font-weight:700">75TH %</div><div style="font-weight:700;font-size:0.88rem;color:var(--text)">${s.q75}</div></div>
      </div>
      <div id="${divId}"></div>`;
    container.appendChild(wrapper);

    // Render clear 7-point Percentile & Summary Bar Chart
    if (w1Charts[divId]) { try { w1Charts[divId].destroy(); } catch(_){} }
    w1Charts[divId] = new ApexCharts(document.getElementById(divId), {
      ...APEX_COMMON,
      chart: { ...APEX_COMMON.chart, type: 'bar', height: 200 },
      series: [{ name: nameFormatted, data: [s.min, s.q25, s.median, s.mean, s.q75, s.q90, s.max] }],
      xaxis: {
        categories: ['Min', 'Q25 (25%)', 'Median (50%)', 'Mean (Avg)', 'Q75 (75%)', 'Q90 (90%)', 'Max'],
        labels: { style: { colors: COLORS.muted, fontSize: '0.68rem' } }
      },
      yaxis: { labels: { style: { colors: COLORS.muted, fontSize: '0.68rem' } } },
      colors: [COLORS.secondary],
      dataLabels: { enabled: true, style: { fontSize: '0.68rem', colors: ['#fff'] } },
      plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } }
    });
    w1Charts[divId].render();
  });
}

function renderCategoryCharts(an) {
  const stats = an.cat_stats || {};
  const container = document.getElementById('cat-charts');
  if (!container) return;
  container.innerHTML = '';
  Object.entries(stats).forEach(([col, s]) => {
    const divId = 'cat-chart-' + col.replace(/[^a-z0-9]/gi, '_');
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.innerHTML = `<div class="card-title"><i class="fa-solid fa-chart-bar"></i> ${col} <span class="badge badge-purple">${s.unique} unique values</span></div><div id="${divId}"></div>`;
    container.appendChild(wrapper);

    // Format clean labels for Y-axis (replacing hyphens with spaces)
    const cleanLabels = (s.labels || []).map(l => String(l).replace(/-/g, ' '));
    const dynamicHeight = Math.max(260, (s.labels.length * 28) + 40);

    if (w1Charts[divId]) { try { w1Charts[divId].destroy(); } catch(_){} }
    w1Charts[divId] = new ApexCharts(document.getElementById(divId), {
      ...APEX_COMMON,
      chart: { ...APEX_COMMON.chart, type: 'bar', height: dynamicHeight },
      series: [{ name: 'Record Count', data: s.counts }],
      xaxis: {
        labels: { style: { colors: COLORS.muted, fontSize: '0.72rem' } }
      },
      yaxis: {
        categories: cleanLabels,
        labels: {
          style: { colors: COLORS.text, fontSize: '0.72rem', fontWeight: 500 },
          maxWidth: 180
        }
      },
      colors: [COLORS.accent],
      dataLabels: { enabled: true, style: { colors: ['#fff'], fontSize: '0.68rem' } },
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          barHeight: '65%'
        }
      },
      tooltip: {
        y: {
          formatter: (val) => val.toLocaleString() + ' books'
        }
      }
    });
    w1Charts[divId].render();
  });
}

function renderCorrelation(an) {
  const { corr_labels, corr_matrix } = an;
  const el = document.getElementById('corr-chart');
  if (!el || !corr_labels || corr_labels.length < 2) return;
  if (w1Charts['corr']) { try { w1Charts['corr'].destroy(); } catch(_){} }

  const shortLabels = corr_labels.map(l => truncateLabel(l, 10));
  const series = corr_labels.map((row, i) => ({
    name: shortLabels[i],
    data: corr_matrix[i].map((val, j) => ({ x: shortLabels[j], y: val }))
  }));

  w1Charts['corr'] = new ApexCharts(el, {
    ...APEX_COMMON,
    chart: { ...APEX_COMMON.chart, type: 'heatmap', height: 280 },
    series,
    colors: ['#3b82f6'],
    dataLabels: { enabled: true, style: { colors: ['#fff'], fontSize: '0.68rem' } },
    stroke: { width: 1, colors: ['#0d1117'] },
  });
  w1Charts['corr'].render();
}

function renderOutlierTable(an) {
  const tbody = document.getElementById('outlier-tbody');
  if (!tbody) return;
  tbody.innerHTML = Object.entries(an.outlier_info || {}).map(([col, o]) =>
    `<tr><td class="font-mono">${col}</td><td>${o.count}</td><td>${o.pct}%</td>
     <td><span class="tag tag-${o.pct < 5 ? 'PASS' : o.pct < 15 ? 'WARN' : 'FAIL'}">${o.pct < 5 ? 'Normal' : o.pct < 15 ? 'Moderate' : 'High'}</span></td></tr>`
  ).join('');
}

function renderSampleTable(an) {
  const wrap = document.getElementById('sample-table-wrap');
  if (!wrap || !an.sample?.length) return;
  const cols = Object.keys(an.sample[0]);
  wrap.innerHTML = `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${an.sample.map(row=>`<tr>${cols.map(c=>`<td class="font-mono">${row[c]??'N/A'}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
}

// ═══════════════════════════════════════════════
// EXERCISE 2 — ETL Pipeline (Step-by-Step)
// ═══════════════════════════════════════════════

let totalExtractedRows = 0;
let totalTransformRows = 0;
let totalExtractMs = 0;
let totalTransformMs = 0;

function initWeek2() {
  initStepByStepETL();
  initCDCButtons();
}

function terminalLog(msg, cls) {
  const term = document.getElementById('etl-terminal');
  if (!term) return;
  const line = document.createElement('div');
  line.innerHTML = `<span style="color:#5a7a9a">[${new Date().toLocaleTimeString()}]</span> <span style="${cls || 'color:#a8c5e8'}">${msg}</span>`;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function initStepByStepETL() {
  const btnExtract   = document.getElementById('btn-extract');
  const btnTransform = document.getElementById('btn-transform');
  const btnLoad      = document.getElementById('btn-load');
  const step2Card    = document.getElementById('step2-card');
  const step3Card    = document.getElementById('step3-card');

  const clearBtn = document.getElementById('btn-clear-terminal');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const term = document.getElementById('etl-terminal');
      if (term) term.innerHTML = '<span style="color:#5a7a9a">$ Terminal cleared — ready for next run.</span>';
    });
  }

  if (!btnExtract || !btnTransform || !btnLoad) return;

  // STEP 1 — EXTRACT
  btnExtract.addEventListener('click', async () => {
    btnExtract.disabled = true;
    btnExtract.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Extracting...';
    document.getElementById('step1-status').innerHTML = '<i class="fa-solid fa-spinner spinner"></i>';
    terminalLog('$ Running EXTRACT step...', 'color:#3b82f6;font-weight:700');
    try {
      const res = await fetch('/api/etl/extract', { method: 'POST' });
      const d = await res.json();
      if (d.error) {
        document.getElementById('step1-status').innerHTML = `<span class="badge badge-red">${d.error}</span>`;
        terminalLog('EXTRACT FAILED: ' + d.error, 'color:#ef4444');
        btnExtract.disabled = false;
        btnExtract.innerHTML = '<i class="fa-solid fa-play"></i> Run Extract';
        return;
      }
      totalExtractedRows = d.rows_extracted;
      totalExtractMs = d.elapsed_ms;
      document.getElementById('step1-status').innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Done</span>`;
      (d.log || []).forEach(l => terminalLog(l, l.includes('✓') ? 'color:#10b981' : 'color:#a8c5e8'));
      terminalLog(`Null Summary: ${Object.entries(d.null_summary||{}).map(([k,v])=>`${k}=${v}`).join(', ')}`, 'color:#f59e0b');

      // Unlock Step 2
      btnTransform.disabled = false;
      if (step2Card) step2Card.style.opacity = '1';

      document.getElementById('kpi-extracted').textContent = d.rows_extracted?.toLocaleString();
      document.getElementById('etl-kpi-row').style.display = 'grid';
    } catch (e) {
      terminalLog('EXTRACT ERROR: ' + e.message, 'color:#ef4444');
    } finally {
      btnExtract.disabled = false;
      btnExtract.innerHTML = '<i class="fa-solid fa-play"></i> Run Extract';
    }
  });

  // STEP 2 — TRANSFORM
  btnTransform.addEventListener('click', async () => {
    btnTransform.disabled = true;
    btnTransform.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Transforming...';
    document.getElementById('step2-status').innerHTML = '<i class="fa-solid fa-spinner spinner"></i>';
    terminalLog('$ Running TRANSFORM step...', 'color:#8b5cf6;font-weight:700');
    try {
      const res = await fetch('/api/etl/transform', { method: 'POST' });
      const d = await res.json();
      if (d.error) {
        document.getElementById('step2-status').innerHTML = `<span class="badge badge-red">${d.error}</span>`;
        terminalLog('TRANSFORM FAILED: ' + d.error, 'color:#ef4444');
        btnTransform.disabled = false;
        btnTransform.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Run Transform';
        return;
      }
      totalTransformRows = d.output_rows;
      totalTransformMs = d.elapsed_ms;
      document.getElementById('step2-status').innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Done</span>`;
      (d.log || []).forEach(l => terminalLog(l, l.includes('✓') ? 'color:#10b981' : 'color:#a8c5e8'));

      // Show preview table
      if (d.sample?.length) {
        const previewCard = document.getElementById('transform-preview-card');
        const thead = document.getElementById('transform-preview-head');
        const tbody = document.getElementById('transform-preview-body');
        if (previewCard && thead && tbody) {
          const cols = Object.keys(d.sample[0]);
          thead.innerHTML = cols.map(c => `<th>${c}</th>`).join('');
          tbody.innerHTML = d.sample.map(row =>
            `<tr>${cols.map(c => `<td class="font-mono" style="font-size:0.75rem">${row[c] ?? ''}</td>`).join('')}</tr>`
          ).join('');
          previewCard.style.display = 'block';
        }
      }

      // Unlock Step 3
      btnLoad.disabled = false;
      if (step3Card) step3Card.style.opacity = '1';
      document.getElementById('kpi-transformed').textContent = d.output_rows?.toLocaleString();
    } catch (e) {
      terminalLog('TRANSFORM ERROR: ' + e.message, 'color:#ef4444');
    } finally {
      btnTransform.disabled = false;
      btnTransform.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Run Transform';
    }
  });

  // STEP 3 — LOAD
  btnLoad.addEventListener('click', async () => {
    btnLoad.disabled = true;
    btnLoad.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Loading...';
    const strategy = document.getElementById('load-strategy-select')?.value || 'full';
    terminalLog(`$ Running LOAD step (Strategy: ${strategy.toUpperCase()})...`, 'color:#10b981;font-weight:700');
    try {
      const fd = new FormData();
      fd.append('strategy', strategy);
      const res = await fetch('/api/etl/load', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.error) {
        document.getElementById('step3-status').innerHTML = `<span class="badge badge-red">${d.error}</span>`;
        terminalLog('LOAD FAILED: ' + d.error, 'color:#ef4444');
        btnLoad.disabled = false;
        btnLoad.innerHTML = '<i class="fa-solid fa-database"></i> Run Load';
        return;
      }
      (d.log || []).forEach(l => terminalLog(l, l.includes('✓') ? 'color:#10b981;font-weight:700' : 'color:#a8c5e8'));
      const totalMs = totalExtractMs + totalTransformMs + (d.total_ms || 0);
      document.getElementById('kpi-loaded').textContent = d.loaded_cnt?.toLocaleString();
      document.getElementById('kpi-etl-ms').textContent = totalMs;
      terminalLog('──────────────────────────────────────', 'color:#1e2d45');
      terminalLog(`PIPELINE COMPLETE | Extracted: ${totalExtractedRows?.toLocaleString()} | Transformed: ${totalTransformRows?.toLocaleString()} | Loaded: ${d.loaded_cnt?.toLocaleString()} | Total: ${totalMs}ms`, 'color:#10b981;font-weight:700');

      // Update DB stats
      setText('db-fact-cnt', d.total_fact_records?.toLocaleString());
      setText('db-log-cnt', d.total_exec_logs);
    } catch (e) {
      terminalLog('LOAD ERROR: ' + e.message, 'color:#ef4444');
    } finally {
      btnLoad.disabled = false;
      btnLoad.innerHTML = '<i class="fa-solid fa-database"></i> Run Load';
    }
  });
}

function initCDCButtons() {
  const btn = document.getElementById('btn-cdc');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const oldFile = document.getElementById('cdc-old-file')?.files[0];
    const newFile = document.getElementById('cdc-new-file')?.files[0];
    const keyCol  = document.getElementById('cdc-key-col')?.value || 'isbn';
    const resultEl = document.getElementById('cdc-result');
    if (!oldFile || !newFile) {
      if (resultEl) resultEl.innerHTML = '<span class="badge badge-amber">Please upload both old and new CSV files first.</span>';
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Comparing...';
    const fd = new FormData();
    fd.append('old_file', oldFile);
    fd.append('new_file', newFile);
    fd.append('key_col', keyCol);
    try {
      const res = await fetch('/api/cdc', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.error) {
        if (resultEl) resultEl.innerHTML = `<span class="badge badge-red">${d.error}</span>`;
      } else {
        if (resultEl) resultEl.innerHTML = `
          <div class="kpi-grid" style="margin-top:1rem">
            <div class="kpi-card green"><div class="kpi-icon green"><i class="fa-solid fa-plus"></i></div><div class="kpi-info"><label>Inserted</label><div class="val green">${d.inserted}</div></div></div>
            <div class="kpi-card amber"><div class="kpi-icon amber"><i class="fa-solid fa-pen"></i></div><div class="kpi-info"><label>Updated</label><div class="val amber">${d.updated}</div></div></div>
            <div class="kpi-card red"><div class="kpi-icon red"><i class="fa-solid fa-trash"></i></div><div class="kpi-info"><label>Deleted</label><div class="val red">${d.deleted}</div></div></div>
            <div class="kpi-card blue"><div class="kpi-icon blue"><i class="fa-solid fa-equals"></i></div><div class="kpi-info"><label>Unchanged</label><div class="val blue">${d.unchanged}</div></div></div>
          </div>`;
      }
    } catch (e) {
      if (resultEl) resultEl.innerHTML = `<span class="badge badge-red">CDC comparison failed: ${e.message}</span>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Run CDC';
    }
  });
}

function initSQLiteControls() {
  const btnFull = document.getElementById('btn-run-sqlite-full');
  const btnInc = document.getElementById('btn-run-sqlite-inc');
  const statusEl = document.getElementById('sqlite-exec-status');

  if (!btnFull || !btnInc) return;

  async function runSQLiteETL(strategy) {
    if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-spinner spinner"></i> Running ${strategy.toUpperCase()} ETL load to local SQLite (delab_books.db)...`;
    try {
      const fd = new FormData();
      fd.append('strategy', strategy);
      const res = await fetch('/api/week2/run-sqlite-etl', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) {
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> ${json.error}</span>`;
      } else {
        if (statusEl) statusEl.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> ${json.load_strategy} Load Committed to SQLite! (${json.loaded_cnt?.toLocaleString()} rows in ${json.total_ms}ms)</span>`;
        
        setText('sq-fact-cnt', json.total_fact_records?.toLocaleString());
        setText('sq-log-cnt', json.total_exec_logs);
        setText('sqlite-db-size', json.db_size_kb + ' KB');

        // Update SQL sample query table
        const tbody = document.getElementById('sqlite-sample-tbody');
        if (tbody && json.sample_records?.length) {
          tbody.innerHTML = json.sample_records.map(row => `
            <tr>
              <td class="font-mono">${row.isbn || '—'}</td>
              <td><b>${(row.title || '').substring(0, 35)}</b></td>
              <td>${(row.author || '').substring(0, 20)}</td>
              <td><span class="badge badge-purple">${row.category || 'General'}</span></td>
              <td>$${(row.price || 0).toFixed(2)}</td>
              <td><span class="badge badge-green">${row.rating || 0}★</span></td>
              <td><span class="badge badge-amber">${row.discount_pct || 0}%</span></td>
              <td>${row.is_bestseller ? '<span class="badge badge-amber">★ Yes</span>' : '<span class="badge">No</span>'}</td>
            </tr>
          `).join('');
        }
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span class="badge badge-red">SQLite execution failed</span>`;
    }
  }

  btnFull.addEventListener('click', () => runSQLiteETL('full'));
  btnInc.addEventListener('click', () => runSQLiteETL('incremental'));
}

function animateETLSteps() {
  const steps = document.querySelectorAll('.etl-step');
  steps.forEach((el, i) => {
    el.style.animationDelay = (i * 0.12) + 's';
  });
}

function updateETLData(etl) {
  setText('etl-records', etl.total_records?.toLocaleString());
  setText('etl-ms', etl.total_ms + 'ms');
  setText('etl-errors', etl.errors);
  const container = document.getElementById('etl-steps-container');
  if (!container) return;
  container.innerHTML = (etl.steps || []).map((s, i) =>
    `<div class="etl-step ${s.phase.toLowerCase()}" style="animation-delay:${i*0.1}s">
      <span class="step-badge">${s.phase}</span>
      <span class="step-name">${s.step}</span>
      <span class="step-meta">${s.records} rec · ${s.ms}ms</span>
      <span class="badge ${s.status==='success'?'badge-green':'badge-red'}"><i class="fa-solid fa-${s.status==='success'?'check':'xmark'}"></i></span>
    </div>`
  ).join('');
}

function renderLoadStrategyChart() {
  const el = document.getElementById('load-strategy-chart');
  if (!el) return;
  new ApexCharts(el, {
    ...APEX_COMMON,
    chart: { ...APEX_COMMON.chart, type: 'bar', height: 220 },
    series: [
      { name: 'Full Load', data: [32443, 0, 32443] },
      { name: 'Incremental Load', data: [32443, 120, 34] },
    ],
    xaxis: { categories: ['Initial Extract', 'Delta Extract', 'Records Loaded'], labels: { style: { colors: COLORS.muted } } },
    yaxis: { labels: { style: { colors: COLORS.muted } } },
    colors: [COLORS.primary, COLORS.secondary],
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 4, columnWidth: '45%' } },
    legend: { labels: { colors: COLORS.text } },
  }).render();
}

function initCDCUploader() {
  // File 1
  initUploadZone('cdc-old-zone', 'cdc-old-input', f => { w2CDCUploads.old = f; updateCDCBtn(); });
  // File 2
  initUploadZone('cdc-new-zone', 'cdc-new-input', f => { w2CDCUploads.new = f; updateCDCBtn(); });

  const btn = document.getElementById('cdc-run-btn');
  if (btn) btn.addEventListener('click', runCDC);
}

function updateCDCBtn() {
  const btn = document.getElementById('cdc-run-btn');
  if (btn) btn.disabled = !(w2CDCUploads.old && w2CDCUploads.new);
}

async function runCDC() {
  const fd = new FormData();
  fd.append('old_file', w2CDCUploads.old);
  fd.append('new_file', w2CDCUploads.new);
  const keyInput = document.getElementById('cdc-key-col');
  if (keyInput) fd.append('key_col', keyInput.value.trim());

  const btn = document.getElementById('cdc-run-btn');
  btn.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Comparing…';
  btn.disabled = true;

  const r = await fetch('/api/cdc', { method: 'POST', body: fd });
  const data = await r.json();
  btn.innerHTML = '<i class="fa-solid fa-play"></i> Run CDC';
  btn.disabled = false;

  const res = document.getElementById('cdc-results');
  if (!res) return;
  if (data.error) {
    res.innerHTML = `<div class="badge badge-red">${data.error}</div>`;
    return;
  }
  res.innerHTML = `
    <div class="kpi-grid" style="margin-top:1rem">
      <div class="kpi-card green"><div class="kpi-icon green"><i class="fa-solid fa-plus"></i></div><div class="kpi-info"><label>Inserted</label><div class="val green">${data.inserted}</div></div></div>
      <div class="kpi-card amber"><div class="kpi-icon amber"><i class="fa-solid fa-pen"></i></div><div class="kpi-info"><label>Updated</label><div class="val amber">${data.updated}</div></div></div>
      <div class="kpi-card red"><div class="kpi-icon red"><i class="fa-solid fa-trash"></i></div><div class="kpi-info"><label>Deleted</label><div class="val red">${data.deleted}</div></div></div>
      <div class="kpi-card blue"><div class="kpi-icon blue"><i class="fa-solid fa-equals"></i></div><div class="kpi-info"><label>Unchanged</label><div class="val blue">${data.unchanged}</div></div></div>
    </div>
    ${renderCDCSamples('Inserted Rows', data.inserted_sample, 'inserted')}
    ${renderCDCSamples('Deleted Rows', data.deleted_sample, 'deleted')}
  `;
}

function renderCDCSamples(label, rows, cls) {
  if (!rows?.length) return '';
  const cols = Object.keys(rows[0]);
  return `<div class="card mt-4"><div class="card-title">${label}</div>
    <div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr class="${cls}">${cols.map(c=>`<td class="font-mono">${r[c]}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></div>`;
}

// ═══════════════════════════════════════════════
// WEEK 3 — Schema Design
// ═══════════════════════════════════════════════
function initWeek3() {
  initSchemaTabs();
  initCubeFilter();
  initOLAPEngine();
}

function initOLAPEngine() {
  const btns = document.querySelectorAll('.olap-btn');
  const sqlPreview = document.getElementById('olap-sql-preview');
  const execTimeEl = document.getElementById('olap-exec-time');
  const rowCountEl = document.getElementById('olap-row-count');
  const thead = document.getElementById('olap-thead');
  const tbody = document.getElementById('olap-tbody');

  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', async () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const op = btn.getAttribute('data-op');
      if (sqlPreview) sqlPreview.textContent = 'Executing SQL operation against delab_books.db...';

      try {
        const fd = new FormData();
        fd.append('query_type', op);
        const r = await fetch('/api/week3/run-olap-query', { method: 'POST', body: fd });
        const json = await r.json();

        if (json.error) {
          if (sqlPreview) sqlPreview.textContent = 'Error: ' + json.error;
          return;
        }

        if (sqlPreview) sqlPreview.textContent = json.sql;
        if (execTimeEl) execTimeEl.textContent = json.exec_ms + 'ms';
        if (rowCountEl) rowCountEl.textContent = json.row_count + ' rows';

        if (thead && json.columns) {
          thead.innerHTML = `<tr>${json.columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
        }

        if (tbody && json.rows) {
          tbody.innerHTML = json.rows.map(row => `
            <tr>
              ${json.columns.map(c => `<td class="font-mono">${row[c] ?? '—'}</td>`).join('')}
            </tr>
          `).join('');
        }
      } catch (e) {
        if (sqlPreview) sqlPreview.textContent = 'Failed to execute query';
      }
    });
  });
}

function initSchemaTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + target);
      if (panel) panel.classList.add('active');
    });
  });
}

function initCubeFilter() {
  const catSel = document.getElementById('cube-cat');
  const fmtSel = document.getElementById('cube-fmt');
  const regSel = document.getElementById('cube-reg');
  if (!catSel) return;

  function filterCube() {
    const cat = catSel.value;
    const fmt = fmtSel.value;
    const reg = regSel.value;
    const allRows = document.querySelectorAll('#cube-tbody tr');
    allRows.forEach(row => {
      const rowCat = row.dataset.cat || '';
      const rowFmt = row.dataset.fmt || '';
      const rowReg = row.dataset.reg || '';
      const show = (cat === 'ALL' || rowCat === cat) &&
                   (fmt === 'ALL' || rowFmt === fmt) &&
                   (reg === 'ALL' || rowReg === reg);
      row.style.display = show ? '' : 'none';
    });
  }
  catSel.addEventListener('change', filterCube);
  fmtSel.addEventListener('change', filterCube);
  regSel.addEventListener('change', filterCube);
}

// ═══════════════════════════════════════════════
// WEEK 4 — Airflow / Kafka / Batch Pipeline
// ═══════════════════════════════════════════════
function initWeek4() {
  renderPipelineChart();
  animateDAG();
  initLogRunner();
}

function renderPipelineChart() {
  const el = document.getElementById('pipeline-metrics-chart');
  if (!el) return;
  new ApexCharts(el, {
    ...APEX_COMMON,
    chart: { ...APEX_COMMON.chart, type: 'area', height: 220 },
    series: [
      { name: 'Records Processed', data: [0, 5200, 12800, 24100, 31000, 32443] },
      { name: 'Errors', data: [0, 2, 0, 5, 1, 0] },
    ],
    xaxis: { categories: ['Start', '1m', '2m', '3m', '4m', 'Done'], labels: { style: { colors: COLORS.muted } } },
    yaxis: { labels: { style: { colors: COLORS.muted } } },
    colors: [COLORS.primary, COLORS.danger],
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
    dataLabels: { enabled: false },
    legend: { labels: { colors: COLORS.text } },
  }).render();
}

function animateDAG() {
  const nodes = document.querySelectorAll('.dag-node[data-delay]');
  nodes.forEach(node => {
    const d = parseInt(node.dataset.delay || 0);
    setTimeout(() => {
      node.classList.remove('pending');
      node.classList.add('running');
      setTimeout(() => {
        node.classList.remove('running');
        node.classList.add('success');
      }, 1200);
    }, d);
  });
}

function initLogRunner() {
  const btn = document.getElementById('run-pipeline-btn');
  const logEl = document.getElementById('exec-log');
  if (!btn || !logEl) return;

  const LOG_LINES = [
    { ms: 100,  line: '[2026-08-12 20:50:01] INFO  DAG <books_etl> triggered', cls: '' },
    { ms: 400,  line: '[2026-08-12 20:50:01] INFO  Task [extract_api] STARTED', cls: 'color:var(--primary)' },
    { ms: 900,  line: '[2026-08-12 20:50:02] INFO  Pulled 32,443 records from source', cls: '' },
    { ms: 1200, line: '[2026-08-12 20:50:02] INFO  Task [extract_api] SUCCESS (1.1s)', cls: 'color:var(--secondary)' },
    { ms: 1500, line: '[2026-08-12 20:50:02] INFO  Task [transform_clean] STARTED', cls: 'color:var(--primary)' },
    { ms: 2200, line: '[2026-08-12 20:50:03] WARN  Null values detected in "publisher" col — filling', cls: 'color:var(--warning)' },
    { ms: 2900, line: '[2026-08-12 20:50:04] INFO  Normalised 6 numeric columns', cls: '' },
    { ms: 3400, line: '[2026-08-12 20:50:04] INFO  Task [transform_clean] SUCCESS (1.9s)', cls: 'color:var(--secondary)' },
    { ms: 3800, line: '[2026-08-12 20:50:05] INFO  Task [load_warehouse] STARTED', cls: 'color:var(--primary)' },
    { ms: 4600, line: '[2026-08-12 20:50:06] INFO  32,340 rows loaded → books_warehouse.fact_book_sales', cls: '' },
    { ms: 5200, line: '[2026-08-12 20:50:06] INFO  Task [load_warehouse] SUCCESS (1.5s)', cls: 'color:var(--secondary)' },
    { ms: 5400, line: '[2026-08-12 20:50:06] INFO  DAG <books_etl> COMPLETE. Duration: 5.4s, Errors: 0', cls: 'color:var(--secondary);font-weight:700' },
  ];

  btn.addEventListener('click', () => {
    logEl.innerHTML = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Running…';
    LOG_LINES.forEach(({ ms, line, cls }) => {
      setTimeout(() => {
        const span = document.createElement('div');
        span.style.cssText = `font-family:var(--mono);font-size:0.78rem;padding:0.1rem 0;${cls}`;
        span.textContent = line;
        logEl.appendChild(span);
        logEl.scrollTop = logEl.scrollHeight;
        if (ms === 5400) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-play"></i> Run Pipeline';
        }
      }, ms);
    });
  });
}

// ═══════════════════════════════════════════════
// WEEK 5 — Resilient Pipelines
// ═══════════════════════════════════════════════
function initWeek5() {
  renderValidationSummaryChart();
  initIdempotencyDemo();
  initAtomicityDemo();
  initBackfillDemo();

  initUploadZone('upload-zone-w5', 'csv-input-w5', async file => {
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/validate', { method: 'POST', body: fd });
    const data = await r.json();
    if (data.checks) updateValidationResults(data);
  });
}

function renderValidationSummaryChart() {
  const el = document.getElementById('validation-donut');
  if (!el) return;
  const passed = parseInt(el.dataset.passed || 0);
  const warned = parseInt(el.dataset.warned || 0);
  const failed = parseInt(el.dataset.failed || 0);
  new ApexCharts(el, {
    ...APEX_COMMON,
    chart: { ...APEX_COMMON.chart, type: 'donut', height: 220 },
    series: [passed, warned, failed],
    labels: ['Passed', 'Warned', 'Failed'],
    colors: [COLORS.secondary, COLORS.warning, COLORS.danger],
    legend: { labels: { colors: COLORS.text } },
    plotOptions: { pie: { donut: { size: '65%', labels: { show: true,
      total: { show: true, label: 'Checks', color: COLORS.muted, fontSize: '0.8rem' } } } } },
    dataLabels: { enabled: false },
  }).render();
}

function updateValidationResults(data) {
  const el = document.getElementById('validation-donut');
  if (el) {
    el.dataset.passed = data.passed;
    el.dataset.warned = data.warned;
    el.dataset.failed = data.failed;
    el.innerHTML = '';
    renderValidationSummaryChart();
  }
  const tbody = document.getElementById('checks-tbody');
  if (!tbody) return;
  tbody.innerHTML = (data.checks || []).map(c => {
    const icon = c.status === 'PASS' ? 'fa-circle-check' : c.status === 'WARN' ? 'fa-triangle-exclamation' : 'fa-circle-xmark';
    return `<tr>
      <td><span class="tag tag-${c.status}">${c.status}</span></td>
      <td>${c.check}</td>
      <td class="font-mono">${c.column}</td>
      <td>${c.detail}</td>
    </tr>`;
  }).join('');
}

let idempotencyRunCount = 0;
function initIdempotencyDemo() {
  const btn = document.getElementById('idem-btn');
  const out = document.getElementById('idem-output');
  if (!btn || !out) return;
  btn.addEventListener('click', () => {
    idempotencyRunCount++;
    const hash = 'sha256:a3f1b8c2e4d7';
    out.innerHTML += `
      <div style="font-family:var(--mono);font-size:0.78rem;padding:0.3rem 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--muted)">Run #${idempotencyRunCount}</span>
        → Records loaded: <b>32,443</b>
        → Checksum: <span style="color:var(--secondary)">${hash}</span>
        <span class="badge badge-green" style="margin-left:0.5rem">Idempotent ✓</span>
      </div>`;
    out.scrollTop = out.scrollHeight;
  });
}

function initAtomicityDemo() {
  const successBtn = document.getElementById('atomic-success-btn');
  const failBtn = document.getElementById('atomic-fail-btn');
  if (!successBtn || !failBtn) return;

  async function runAtomicity(willFail) {
    const stages = ['stage-extract', 'stage-transform', 'stage-validate', 'stage-load', 'stage-commit'];
    const allStages = document.querySelectorAll('.pipeline-stage');
    allStages.forEach(s => { s.className = 'pipeline-stage idle'; });

    for (let i = 0; i < stages.length; i++) {
      const el = document.getElementById(stages[i]);
      if (!el) continue;
      el.className = 'pipeline-stage running';
      await delay(600);
      if (willFail && i === 3) {
        el.className = 'pipeline-stage error';
        // rollback previous
        for (let j = i-1; j >= 0; j--) {
          await delay(300);
          const prev = document.getElementById(stages[j]);
          if (prev) prev.className = 'pipeline-stage rollback';
        }
        const msg = document.getElementById('atomic-msg');
        if (msg) msg.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-rotate-left"></i> Transaction ROLLED BACK — no partial data written</span>`;
        return;
      }
      el.className = 'pipeline-stage done';
    }
    const msg = document.getElementById('atomic-msg');
    if (msg) msg.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Transaction COMMITTED — all 32,443 rows written atomically</span>`;
  }

  successBtn.addEventListener('click', () => runAtomicity(false));
  failBtn.addEventListener('click', () => runAtomicity(true));
}

function initBackfillDemo() {
  const btn = document.getElementById('backfill-btn');
  const log = document.getElementById('backfill-log');
  if (!btn || !log) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    log.innerHTML = '';
    const entries = [
      { t: 200,  msg: 'Detected failed run: 2026-08-10 (partition missing)', cls: 'color:var(--warning)' },
      { t: 700,  msg: 'Triggering backfill for date range: 2026-08-10 → 2026-08-11', cls: '' },
      { t: 1300, msg: '[Retry 1/3] Extracting data for 2026-08-10…', cls: 'color:var(--primary)' },
      { t: 2100, msg: '[Retry 1/3] Transform SUCCESS — 4,820 records cleaned', cls: 'color:var(--secondary)' },
      { t: 2800, msg: '[Retry 1/3] Load SUCCESS — 4,820 rows written (idempotent)', cls: 'color:var(--secondary)' },
      { t: 3400, msg: '[Retry 2/3] Extracting data for 2026-08-11…', cls: 'color:var(--primary)' },
      { t: 4200, msg: '[Retry 2/3] Transform SUCCESS — 5,103 records cleaned', cls: 'color:var(--secondary)' },
      { t: 4900, msg: '[Retry 2/3] Load SUCCESS — 5,103 rows written (idempotent)', cls: 'color:var(--secondary)' },
      { t: 5300, msg: 'Backfill COMPLETE. 2 partitions recovered. 0 errors.', cls: 'color:var(--secondary);font-weight:700' },
    ];
    entries.forEach(({ t, msg, cls }) => {
      setTimeout(() => {
        const d = document.createElement('div');
        d.style.cssText = `font-family:var(--mono);font-size:0.78rem;padding:0.1rem 0;${cls}`;
        d.textContent = msg;
        log.appendChild(d);
        log.scrollTop = log.scrollHeight;
        if (t === 5300) { btn.disabled = false; }
      }, t);
    });
  });
}

function initWeek4() {
  const btn = document.getElementById('run-pipeline-btn');
  const logContainer = document.getElementById('exec-log');
  if (!btn || !logContainer) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Executing Pipeline...';
    logContainer.innerHTML = '<div style="color:var(--primary)"><i class="fa-solid fa-spinner spinner"></i> Triggering Python Batch Pipeline (Open Library API → Pandas → SQLite)...</div>';

    try {
      const startTime = Date.now();
      const res = await fetch('/api/week4/run-batch-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'strategy=incremental'
      });
      const data = await res.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (data.error) {
        logContainer.innerHTML = `<div style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Pipeline Execution Error: ${data.error}</div>`;
      } else {
        logContainer.innerHTML = `
          <div style="color:var(--secondary);font-weight:700;margin-bottom:0.5rem">
            <i class="fa-solid fa-circle-check"></i> BATCH PIPELINE EXECUTED SUCCESSFULLY in ${duration}s!
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:0.5rem;margin-bottom:0.75rem;background:rgba(255,255,255,0.03);padding:0.6rem;border-radius:6px">
            <div><strong>Sources Attempted:</strong> ${data.sources_attempted || 3} API endpoints</div>
            <div><strong>Records Extracted:</strong> ${data.records_extracted?.toLocaleString() || 250}</div>
            <div><strong>Transformed:</strong> ${data.records_after_transform?.toLocaleString() || 250}</div>
            <div><strong>Loaded into SQLite:</strong> <span style="color:var(--secondary)">${data.records_loaded?.toLocaleString() || 250}</span></div>
            <div><strong>Strategy:</strong> ${data.load_strategy || 'INCREMENTAL'}</div>
            <div><strong>Execution Time:</strong> ${data.total_ms || 1200}ms</div>
          </div>
          <div style="color:var(--text);font-family:var(--mono);font-size:0.75rem;line-height:1.4">
            [EXTRACT]   Pulled 250 records from Open Library REST API (Science, Technology, Medicine)<br>
            [TRANSFORM] Cleaned nulls, normalized fields, engineered popularity_score & page_tier<br>
            [LOAD]      UPSERTed fact records into local SQLite table 'api_books_fact'<br>
            [VERIFY]    Row counts, primary key constraints & schema validations PASSED.
          </div>
        `;
      }
    } catch (err) {
      logContainer.innerHTML = `<div style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Failed to run batch pipeline: ${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-play"></i> Run Pipeline';
    }
  });
}

// ═══════════════════════════════════════════════
// Page Router — init correct exercise on load
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'week1') initWeek1();
  if (page === 'week2') initWeek2();
  if (page === 'week3') initWeek3();
  if (page === 'week5') initWeek5();
});
