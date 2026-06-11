/**
 * ボート競技ライブリザルト - フロントエンドアプリ
 * data/master.json と data/results/race_XXX.json を fetch して動的に表示する
 */

// ========= 設定値 =========
const CONFIG = {
  // master.json のパス
  MASTER_JSON: 'data/master.json',
  // 結果JSONのパスパターン（race_no を3桁ゼロ埋め）
  RESULT_JSON: (no) => `data/results/race_${String(no).padStart(3, '0')}.json`,
  // 自動更新間隔（ミリ秒）
  REFRESH_INTERVAL: 120000,
  // ラウンドの表示名マッピング（正本は RegattaShared.ROUND_NAMES / js/shared.js）
  ROUND_NAMES: RegattaShared.ROUND_NAMES,

};

// ========= ユーティリティ =========

// h() は RegattaShared.h() の別名（js/shared.js で定義）
const h = RegattaShared.h;

// ========= ローカルストレージキャッシュキー（RegattaShared から参照） =========
const LS_MASTER_KEY    = RegattaShared.LS_MASTER_KEY;
const LS_RESULT_PREFIX = RegattaShared.LS_RESULT_PREFIX;

// ========= グローバル状態 =========
let masterData = null;       // master.json の内容
let resultsCache = {};       // race_no → race_XXX.json の内容
let lastUpdated = null;      // 最終更新時刻
let isOffline = false;       // オフラインフラグ
let isUpdating = false;      // 自動更新多重実行防止フラグ
// タイマーを一元管理（メモリリーク防止）
const timers = { refresh: null, highlight: null };
// フィルタ状態（status フィールドを追加）
const filterState = { category: 'all', round: 'all', date: 'all', crew: '', status: 'all' };
// スケジュールビューの日付フィルタ
let scheduleFilterDate = 'all';
// テーブルビューのソート状態
const sortState = { col: null, dir: 'asc' };
// 使用中プロパティ（未使用列を非表示にするため）
let usedProps = {};

// ========= 初期化 =========
document.addEventListener('DOMContentLoaded', () => {
  // URLハッシュによるビュー切替対応
  handleHashChange();
  window.addEventListener('hashchange', handleHashChange);

  loadAll();
  setupRefreshTimer();
  setupOfflineDetection();
});

/**
 * URLハッシュに応じてビューを切り替え、対象レースにスクロールする
 */
function handleHashChange() {
  const hash = location.hash;
  if (!hash) return;

  // #view-table などのビュー切替ハッシュに対応
  if (hash === '#view-table') {
    const tab = document.querySelector('.view-tab:nth-child(2)');
    if (tab) switchView('table', tab);
    return;
  }
  if (hash === '#view-toggle') {
    const tab = document.querySelector('.view-tab:nth-child(1)');
    if (tab) switchView('toggle', tab);
    return;
  }
  if (hash === '#view-schedule') {
    const tab = document.querySelector('.view-tab:nth-child(3)');
    if (tab) switchView('schedule', tab);
    return;
  }

  // #race-N 形式: 該当レースのトグルを開いてスクロール＆ハイライト
  const raceMatch = hash.match(/^#race-(\d+)$/);
  if (raceMatch) {
    const raceNo = parseInt(raceMatch[1], 10);
    // DOMが構築されてから実行
    setTimeout(() => scrollToRace(raceNo), 300);
  }
}

/**
 * 指定レース番号のトグルを開いてハイライトしスクロールする
 */
function scrollToRace(raceNo) {
  if (!masterData) return;
  // race_no が属する event_code のトグルを探す
  const race = (masterData?.schedule || []).find(r => r.race_no === raceNo);
  if (!race) return;

  const toggle = document.querySelector(
    `#view-toggle-content .toggle[data-code="${race.event_code}"]`
  );
  if (!toggle) return;

  // トグルを開く
  toggle.classList.add('open');
  // ハイライト
  toggle.classList.add('highlighted');
  setTimeout(() => toggle.classList.remove('highlighted'), 3000);
  // スクロール
  toggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========= データ読み込み =========

/**
 * マスタと全結果を読み込んでUIを描画する
 */
async function loadAll() {
  try {
    showLoading(true);
    // スケルトンUIを先に表示
    showSkeletonToggle();

    // master.json取得（失敗時はlocalStorageキャッシュにフォールバック）
    let masterFromCache = false;
    try {
      masterData = await fetchJSONWithRetry(CONFIG.MASTER_JSON, 3, 25000);
      if (!masterData || !masterData.schedule) throw new Error('MASTER_NOT_FOUND');
      // 成功したらキャッシュ保存
      try { localStorage.setItem(LS_MASTER_KEY, JSON.stringify({ d: masterData, t: Date.now() })); } catch(_) {}
    } catch(netErr) {
      if (netErr.message === 'MASTER_NOT_FOUND' || netErr.message.includes('HTTP 404')) {
        throw new Error('MASTER_NOT_FOUND');
      }
      // ネットワーク失敗 → localStorageフォールバック
      let usedCache = false;
      try {
        const raw = localStorage.getItem(LS_MASTER_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && saved.d && saved.d.schedule) {
            masterData = saved.d;
            masterFromCache = true;
            usedCache = true;
            const ageMin = Math.round((Date.now() - (saved.t || 0)) / 60000);
            showCacheWarning(ageMin);
          }
        }
      } catch(_) {}
      if (!usedCache) throw netErr;
    }

    // race_num を race_no にリネーム（master.json互換性のため）
    masterData.schedule = masterData.schedule.map(race => ({
      ...race,
      race_no: race.race_num || race.race_no
    }));

    // ページタイトルを大会名に動的更新
    document.title = (masterData.tournament?.race_name || '速報サイト') + ' 速報';

    // master.json 読み込み直後にヘッダ・フィルタの骨格だけ準備（ビュー本体はまだ描画しない）
    // トグルビューはスケルトンUIで読み込み中を表現済み。
    renderStructure();

    // 結果ロード後に各ビューを1回だけ描画（裁定10: 初回二重描画の解消）
    await loadResults();
    renderToggleView();
    renderTableView();
    renderScheduleView();
    // 初回ロード時にも実施中レースをハイライト
    highlightCurrentRace();

    lastUpdated = new Date();
    updateStatusBar();

    // URLハッシュ対応（データ読み込み後）
    handleHashChange();
  } catch (e) {
    console.error('データ読み込みエラー:', e);
    if (e.message === 'MASTER_NOT_FOUND') {
      showError('大会データが見つかりません。管理者にお問い合わせください。');
    } else {
      showError();
    }
  } finally {
    showLoading(false);
    clearSkeletonToggle();
  }
}

/**
 * 全レースの結果JSONを並列 fetch する（存在しないものはスキップ）
 * 更新があった race_no のリストを返す
 */
async function loadResults(cacheMode = 'no-cache') {
  const raceNos = (masterData?.schedule || []).map(r => r.race_no);
  const newlyUpdated = [];
  const BATCH_SIZE = 6; // モバイルの同時接続制限に配慮

  for (let i = 0; i < raceNos.length; i += BATCH_SIZE) {
    const batch = raceNos.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (no) => {
      try {
        const data = await fetchJSON(CONFIG.RESULT_JSON(no), 25000, cacheMode);
        if (data.cleared) {
          // tombstone: 結果クリア済み → キャッシュから除去
          delete resultsCache[no];
          try { localStorage.removeItem(LS_RESULT_PREFIX + no); } catch(_) {}
          return;
        }
        if (!resultsCache[no]) newlyUpdated.push(no);
        resultsCache[no] = data;
        // 成功したらキャッシュ保存
        try { localStorage.setItem(LS_RESULT_PREFIX + no, JSON.stringify({ d: data, t: Date.now() })); } catch(_) {}
      } catch (e) {
        if (e.message.includes('HTTP 404')) {
          // 結果未着は正常（スキップ）
        } else {
          console.warn(`結果JSON取得失敗 race_no=${no}:`, e.message);
          // localStorageフォールバック（キャッシュに結果あれば表示）
          try {
            const raw = localStorage.getItem(LS_RESULT_PREFIX + no);
            if (raw) {
              const saved = JSON.parse(raw);
              if (saved && saved.d) {
                if (!resultsCache[no]) newlyUpdated.push(no);
                resultsCache[no] = saved.d;
              }
            }
          } catch(_) {}
        }
      }
    }));
  }

  console.log(`結果JSON読み込み完了: ${Object.keys(resultsCache).length}/${raceNos.length}件`);
  return newlyUpdated;
}

// fetchJSON / fetchJSONWithRetry は RegattaShared に移管（js/shared.js で定義）
const fetchJSON          = RegattaShared.fetchJSON;
const fetchJSONWithRetry = RegattaShared.fetchJSONWithRetry;

// ========= 描画 =========

/**
 * UIの骨格（ヘッダ・フィルタ・使用プロパティ判定）を準備する。
 * 各ビュー本体の描画はここでは行わず、結果ロード後に1回だけ描画する
 * （裁定10: 初回ロードの二重描画を解消。リフレッシュ時の再描画は別途維持）。
 */
function renderStructure() {
  // 使用中プロパティを計算（未使用列の非表示判定に使用）
  usedProps = detectUsedProps();
  renderTournamentHeader();
  renderFilterOptions();
}

/**
 * 全UIを描画する（骨格準備 + 全ビュー描画）。
 */
function renderAll() {
  renderStructure();
  renderToggleView();
  renderTableView();
  renderScheduleView();
}

/**
 * 大会名・日程・会場をヘッダーに反映する
 */
function renderTournamentHeader() {
  const t = masterData?.tournament || {};
  const el = document.getElementById('tournament-name');
  if (el) el.textContent = '🏁 ' + (t.race_name || '');

  const metaEl = document.getElementById('tournament-meta');
  const dates = (t.dates || []).map(d => formatDate(d)).join('・');
  if (metaEl) {
    metaEl.innerHTML = `<span>📅 ${h(dates)}</span><span>📍 ${h(t.venue || '')}</span>`;
  }

  // カバーエリアにも大会情報を表示
  const coverName = document.getElementById('cover-tournament-name');
  if (coverName) coverName.textContent = t.race_name || '';
  const coverMeta = document.getElementById('cover-meta');
  if (coverMeta) coverMeta.textContent = `${dates} | ${t.venue || ''}`;
}


/**
 * 日別タブとフィルタの日程オプションをマスタから動的生成する
 */
function renderFilterOptions() {
  const dates = [...new Set((masterData?.schedule || []).map(r => r.date))].sort();

  // 日別タブを生成（日数に関わらず常に表示）
  const dayTabs = document.getElementById('day-tabs');
  if (dayTabs) {
    const tabs = [{ value: 'all', label: 'すべて' }]
      .concat(dates.map(d => ({ value: d, label: formatDate(d) })));
    dayTabs.innerHTML = tabs.map(t =>
      `<button class="day-tab${filterState.date === t.value ? ' active' : ''}"
        onclick="selectDayTab('${t.value}')">${t.label}</button>`
    ).join('');
    dayTabs.style.display = '';
  }

  // セレクトボックスも更新（互換性のため残す）
  const daySelect = document.getElementById('filter-day');
  if (daySelect) {
    while (daySelect.options.length > 1) daySelect.remove(1);
    dates.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = formatDate(d);
      daySelect.appendChild(opt);
    });
  }
}

/**
 * 日別タブをクリックしたときに呼ばれる
 */
function selectDayTab(date) {
  filterState.date = date;
  // タブのactive状態を更新
  document.querySelectorAll('.day-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(date === 'all' ? 'すべて' : formatDate(date)));
  });
  // セレクトボックスも同期
  const daySelect = document.getElementById('filter-day');
  if (daySelect) daySelect.value = date;
  applyFilters();
}

/**
 * スケジュールビューの日別タブをクリックしたときに呼ばれる
 */
function selectScheduleDayTab(date) {
  scheduleFilterDate = date;
  renderScheduleView();
}

/**
 * 種目別トグルビューを描画する
 */
function renderToggleView() {
  const container = document.getElementById('view-toggle-content');
  if (!container) return;

  // 種目コードでグループ化 → コード内の数字昇順でソート
  const groups = groupByEventCode(masterData?.schedule || []);
  groups.sort((a, b) => {
    const na = parseInt((a.eventCode.match(/\d+/) || ['999'])[0], 10);
    const nb = parseInt((b.eventCode.match(/\d+/) || ['999'])[0], 10);
    if (na !== nb) return na - nb;
    return a.eventCode.localeCompare(b.eventCode);
  });

  container.innerHTML = '';
  groups.forEach(({ eventCode, eventName, category, races }) => {
    // レースをrace_no昇順にソート
    races.sort((a, b) => a.race_no - b.race_no);

    const completedCount = races.filter(r => resultsCache[r.race_no]).length;
    const totalCount = races.length;
    const allDone = completedCount === totalCount && totalCount > 0;
    const anyLive = !allDone && completedCount > 0;

    const statusBadge = allDone
      ? '<span class="badge badge-done">確定</span>'
      : anyLive
      ? '<span class="badge badge-live">実施中</span>'
      : '';

    const toggleEl = document.createElement('div');
    toggleEl.className = 'toggle';
    toggleEl.dataset.category = category;
    toggleEl.dataset.code = eventCode;
    // 結果ありかどうかをdata属性に付与（状態フィルタ用）
    toggleEl.dataset.hasDone = completedCount > 0 ? 'true' : 'false';
    toggleEl.dataset.crews = races.flatMap(r =>
      (r.entries || []).map(e => `${e.crew_name} ${e.affiliation}`)
    ).join(' ').toLowerCase();

    toggleEl.innerHTML = `
      <div class="toggle-header" onclick="this.parentElement.classList.toggle('open')">
        <span class="toggle-arrow">▶</span>
        <span class="toggle-title">${h(eventName)}</span>
        <span class="toggle-code">${displayCode(eventCode)}</span>
        <span class="toggle-count">${totalCount}レース</span>
        ${statusBadge}
      </div>
      <div class="toggle-body">
        ${races.map(r => renderRaceBlock(r)).join('')}
      </div>`;

    container.appendChild(toggleEl);
  });

  updateFilterCount();
}

/**
 * 1レースのHTMLブロックを返す
 */
function renderRaceBlock(race) {
  const result = resultsCache[race.race_no];
  const dateStr = formatDate(race.date);
  const ageLabel = (usedProps.hasAgeGroup && race.age_group) ? `<span class="age-group">(${race.age_group})</span>` : '';

  const statusBadge = result
    ? '<span class="badge badge-done">確定</span>'
    : '';

  const tableHTML = result
    ? renderResultTable(race, result)
    : renderEntryTable(race);

  return `
    <div class="race-header" id="race-${race.race_no}">
      <div>
        <span class="race-label">${h(race.event_name)}${ageLabel}</span>
        ${statusBadge}
      </div>
      <div class="race-info">Race No.${race.race_no} | ${dateStr} ${race.time ? formatRaceTime(race.time) : '-'}</div>
    </div>
    ${tableHTML}`;
}

// ========= 共通描画ヘルパー（トグル/テーブル両ビュー共用） =========

/**
 * 写真フラグの絵文字を返す（裁定7: photoMark方式に統一）
 */
function photoMark(r) {
  return r.photo_flag ? '📷' : '';
}

/**
 * 結果有無に応じたバッジHTMLを返す
 * 裁定3: 確定（結果あり）/ 未実施（結果なし）に統一。
 * pendingClass で結果なし時のクラスをビュー間で吸収（テーブルは badge-pending を維持）。
 */
function raceBadgeHTML(hasResult, opts = {}) {
  if (hasResult) return '<span class="badge badge-done">確定</span>';
  const pendingClass = opts.pendingClass || 'badge-upcoming';
  return `<span class="badge ${pendingClass}">未実施</span>`;
}

/**
 * このレースで有効な計測ポイントと中間表示フラグを返す
 */
function resolveMeasurementPoints(race) {
  const raceCourseLength = race.course_length || masterData?.tournament?.course_length || 1000;
  const allPts = masterData?.measurement_points || ['500', '1000'];
  const pts = allPts.filter(p => {
    const m = parseInt(p, 10);
    return isNaN(m) || m <= raceCourseLength;
  });
  return { raceCourseLength, pts, showMidpoint: pts.length > 1 };
}

/**
 * 結果テーブルの thead HTML を返す（裁定2: age_group 列構成は共通）
 * opts.hideMobileAffiliation で「所属」列の hide-mobile を制御（テーブル/トグルとも true）
 */
function buildTableHeadHTML(opts) {
  const { raceCourseLength, showMidpoint } = opts;
  const timeHeader = showMidpoint
    ? `<th class="col-times" style="width:110px">${raceCourseLength}m / 500m</th>`
    : `<th class="col-times" style="width:90px">${raceCourseLength}m</th>`;
  return `
    <thead>
      <tr>
        <th style="width:44px">着順</th>
        <th class="col-lane" style="width:28px">B</th>
        <th class="hide-mobile" style="min-width:90px">所属</th>
        <th style="min-width:110px">クルー</th>
        <th class="cat-col" style="width:48px">区分</th>
        ${timeHeader}
        <th class="hide-mobile" style="width:50px">備考</th>
      </tr>
    </thead>`;
}

/**
 * 結果あり時の <tr> 群を生成する（完走→DNF→DNS 振り分け・tie集計・行生成）
 * 裁定5: tie_group は完走結果のみで集計
 * 裁定6: rankClass は r.rank !== null && r.rank <= 3
 * 裁定7: photoMark + note を備考列に出力
 * 裁定8: row-retired クラスは付けない
 * 裁定9: showMidpoint / h(val) || '-' をセルに適用
 */
function buildResultRowsHTML(race, result, opts) {
  const { pts, showMidpoint } = opts;

  const entryMap = {};
  (race.entries || []).forEach(e => { entryMap[e.lane] = e; });

  // エントリーにあるが結果にないレーン → 棄権（DNS）として追加
  const resultsList = result?.results || [];
  const resultLanes = new Set(resultsList.map(r => r.lane));
  const dnsRows = (race.entries || [])
    .filter(e => !resultLanes.has(e.lane))
    .map(e => ({ lane: e.lane, rank: null, times: {}, finish: null, split: '', tie_group: '', photo_flag: false, note: '', status: 'dns' }));

  // 完走→DNF→DNS の順、同 status 内は rank→lane
  const sorted = [...resultsList, ...dnsRows].sort((a, b) => {
    if (a.status === 'finish' && b.status !== 'finish') return -1;
    if (a.status !== 'finish' && b.status === 'finish') return 1;
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    return a.lane - b.lane;
  });

  // 同着グループ集計: 完走結果のみで数える（裁定5）
  const tieGroupCounts = {};
  resultsList.forEach(r => {
    if (r.tie_group) tieGroupCounts[r.tie_group] = (tieGroupCounts[r.tie_group] || 0) + 1;
  });

  // エントリーのないレーン（所属・クルー未登録）は表示しない
  const validSorted = sorted.filter(r => {
    const e = entryMap[r.lane] || {};
    return e.crew_name || e.affiliation;
  });

  return validSorted.map(r => {
    const entry = entryMap[r.lane] || {};
    const isDns = r.status === 'dns';
    const isDnf = r.status === 'dnf';

    const rankClass = (r.rank !== null && r.rank <= 3) ? `rank-${r.rank}` : '';
    const mark = photoMark(r);
    const note = r.note ? `<span style="color:#e03e3e;font-size:11px">${h(r.note)}</span>` : '';
    const isTie = r.tie_group && tieGroupCounts[r.tie_group] > 1;

    const sub500 = (showMidpoint && r.times && r.times[pts[0]])
      ? `<div class="time-500-sub">500m ${r.times[pts[0]].formatted}</div>` : '';

    let rankDisplay, timesDisplay;
    if (isDns) {
      rankDisplay = `<span class="rank-dns">棄権</span>`;
      timesDisplay = `<span class="status-dns">DNS</span>`;
    } else if (isDnf) {
      rankDisplay = `<span class="rank-dnf">途中棄権</span>`;
      timesDisplay = `<span class="status-dnf">DNF</span>${sub500}`;
    } else {
      rankDisplay = `<span class="rank rank-${r.rank}">${r.rank}${isTie ? '=' : ''}</span>`;
      timesDisplay = `<span class="time-main">${r.finish ? r.finish.formatted : '-'}</span>${sub500}`;
    }

    const cat = entry.category || '';
    const categoryCell = `<td class="cat-col"><span class="entry-category">${h(cat) || '-'}</span></td>`;
    const entryAgeLabel = entry.age_group
      ? `<span class="entry-age-group">${h(entry.age_group)}</span>` : '';
    const affiliationSub = entry.affiliation
      ? `<div class="crew-affiliation-sub">${h(entry.affiliation)}</div>` : '';
    const noteInline = (!isDns && (r.photo_flag || r.note))
      ? `<div class="note-inline">${mark}${note}</div>` : '';

    return `
      <tr class="${rankClass}">
        <td>${rankDisplay}</td>
        <td class="col-lane">${r.lane}</td>
        <td class="hide-mobile">${h(entry.affiliation) || '-'}</td>
        <td class="crew-name">${h(entry.crew_name) || '-'}${entryAgeLabel}${affiliationSub}</td>
        ${categoryCell}
        <td class="col-times">${timesDisplay}${noteInline}</td>
        <td class="hide-mobile">${isDns ? '' : mark + note}</td>
      </tr>`;
  }).join('');
}

/**
 * 結果なし時のエントリー <tr> 群を生成する
 * 裁定8: lane 昇順ソート + h(val) || '-' null ガード。row-retired は付けない。
 * opts.fullColumns=true で結果テーブルと同じ7列構成（テーブルビュー用）、
 * false でトグルビューの簡易5列構成（区分付き）。
 */
function buildEntryRowsHTML(race, opts = {}) {
  const entries = [...(race.entries || [])].sort((a, b) => a.lane - b.lane);
  if (opts.fullColumns) {
    return entries.map(e => `
        <tr>
          <td>-</td>
          <td class="col-lane">${e.lane}</td>
          <td class="hide-mobile">${h(e.affiliation) || '-'}</td>
          <td class="crew-name">${h(e.crew_name) || '-'}</td>
          <td class="cat-col"><span class="entry-category">${h(e.category) || '-'}</span></td>
          <td class="col-times">-</td>
          <td class="hide-mobile"></td>
        </tr>`).join('');
  }
  return entries.map(e => `<tr>
      <td></td>
      <td>${e.lane}</td>
      <td>${h(e.affiliation) || '-'}</td>
      <td class="crew-name">${h(e.crew_name) || '-'}</td>
      <td class="cat-col"><span class="entry-category">${h(e.category) || '-'}</span></td>
    </tr>`).join('');
}

/**
 * 結果未投入時のエントリー情報テーブルを返す
 */
function renderEntryTable(race) {
  if ((race.entries || []).length === 0) {
    return '<p class="no-result">エントリー情報なし</p>';
  }
  const rows = buildEntryRowsHTML(race);
  const categoryHeader = `<th class="cat-col" style="width:48px">区分</th>`;
  return `
    <div class="result-table-wrapper">
    <table class="result-table">
      <thead><tr>
        <th style="width:36px"></th>
        <th style="width:28px">B</th>
        <th style="min-width:100px">所属</th>
        <th style="min-width:120px">クルー</th>
        ${categoryHeader}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/**
 * レース結果テーブルHTMLを返す
 */
function renderResultTable(race, result) {
  const opts = resolveMeasurementPoints(race);
  const rows = buildResultRowsHTML(race, result, opts);
  return `
    <div class="result-table-wrapper">
    <table class="result-table">
      ${buildTableHeadHTML(opts)}
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/**
 * スケジュールビュー（時系列順レース一覧）を描画する
 */
function renderScheduleView() {
  const container = document.getElementById('schedule-table-container');
  if (!container || !masterData) return;

  // レースナンバー順にソート
  const sorted = [...(masterData?.schedule || [])].sort((a, b) => a.race_no - b.race_no);

  // 日付ごとにグループ化（日付セパレーター挿入用）
  const uniqueDates = [...new Set(sorted.map(r => r.date))].sort();

  // 日別タブを生成
  const schedDayTabs = document.getElementById('schedule-day-tabs');
  if (schedDayTabs) {
    const tabs = [{ value: 'all', label: 'すべて' }]
      .concat(uniqueDates.map(d => ({ value: d, label: formatDate(d) })));
    schedDayTabs.innerHTML = tabs.map(t =>
      `<button class="day-tab${scheduleFilterDate === t.value ? ' active' : ''}"
        onclick="selectScheduleDayTab('${t.value}')">${t.label}</button>`
    ).join('');
  }

  // 日付フィルタを適用
  const filtered = scheduleFilterDate === 'all' ? sorted : sorted.filter(r => r.date === scheduleFilterDate);

  // 現在時刻より後で最も近い「未確定」レースを「次」とする
  const now = new Date();
  let nextRaceNo = null;
  let minFutureDiff = Infinity;
  sorted.forEach(race => {
    if (resultsCache[race.race_no]) return; // 結果確定済みは除外
    const raceTime = new Date(race.date + 'T' + race.time + ':00+09:00');
    const diff = raceTime - now;
    if (diff >= 0 && diff < minFutureDiff) {
      minFutureDiff = diff;
      nextRaceNo = race.race_no;
    }
  });

  let html = '<table class="schedule-table">';
  html += '<thead><tr>';
  html += '<th class="sc-time">時刻</th>';
  html += '<th class="sc-no">Race No.</th>';
  html += '<th class="sc-event">種目名</th>';
  html += '<th class="sc-status">状態</th>';
  html += '<th class="sc-winner">1位クルー</th>';
  html += '</tr></thead><tbody>';

  let lastDate = null;
  filtered.forEach((race, idx) => {
    // 複数日表示のときだけ日付セパレーターを挿入
    if (scheduleFilterDate === 'all' && race.date !== lastDate) {
      lastDate = race.date;
      const dayIdx = uniqueDates.indexOf(race.date) + 1;
      html += `<tr class="schedule-date-sep">
        <td colspan="5">── ${formatDate(race.date)} ──</td>
      </tr>`;
    }

    const result = resultsCache[race.race_no];
    const ageLabel = (usedProps.hasAgeGroup && race.age_group) ? ` (${race.age_group})` : '';
    const isNext = race.race_no === nextRaceNo;

    // 状態バッジ
    const statusBadge = result
      ? '<span class="badge badge-done">確定</span>'
      : '<span class="badge badge-upcoming">未実施</span>';

    // 1位クルー名・所属・タイム（結果ありの場合のみ）
    let winnerHtml = '-';
    if (result) {
      const winner = (result.results || []).find(r => r.rank === 1);
      if (winner) {
        const entryMap = {};
        (race.entries || []).forEach(e => { entryMap[e.lane] = e; });
        const entry = entryMap[winner.lane] || {};
        const timeStr = winner.finish ? winner.finish.formatted : '';
        winnerHtml = `<span class="sc-winner-name">${h(entry.crew_name) || '-'}${timeStr ? `<span class="sc-winner-time"> ${timeStr}</span>` : ''}</span>`;
      }
    }

    // 未実施レースは薄い色で表示、実施済みは通常
    const rowClass = [
      isNext ? 'schedule-next-race' : '',
      result ? '' : 'schedule-row-pending',
    ].filter(Boolean).join(' ');

    html += `<tr class="${rowClass}" data-race="${race.race_no}">
      <td class="sc-time">${formatRaceTime(race.time)}</td>
      <td class="sc-no">${race.race_no}</td>
      <td class="sc-event"><span class="sc-event-name">${h(race.event_name)}${ageLabel}</span></td>
      <td class="sc-status">${statusBadge}</td>
      <td class="sc-winner">${winnerHtml}</td>
    </tr>`;
  });

  html += '</tbody></table>';

  // 全レースが確定済みの場合は「本日のレースは終了しました」を末尾に表示
  const allConfirmed = (masterData?.schedule || []).every(r => resultsCache[r.race_no]);
  if (allConfirmed) {
    html += '<p class="schedule-all-done">全レース結果が確定しました</p>';
  }

  container.innerHTML = html;

  // 次のレース行があればスクロール位置を設定（ページ先頭から遠い場合のみ）
  const nextRow = container.querySelector('.schedule-next-race');
  if (nextRow) {
    setTimeout(() => {
      nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}

/**
 * 現在時刻に基づいて「実施中」レースを推定してハイライトする
 * - マスタの date + time が現在時刻の ±15分以内のレースを「実施中」とみなす
 * - まだ結果JSONがないレースが対象
 * - 対象トグルに badge-live バッジを追加
 */
function highlightCurrentRace() {
  if (!masterData) return;
  const now = new Date();
  const WINDOW_MS = 20 * 60 * 1000; // ±20分（R1: レース実所要13〜18分に合わせadminの20分と統一）

  // 結果未確定のレースの中で、現在時刻に最も近い1レースだけを「実施中」にする
  let currentRace = null;
  let minDiff = Infinity;
  (masterData?.schedule || []).forEach(race => {
    if (resultsCache[race.race_no]) return; // 結果済みはスキップ
    const raceTime = new Date(race.date + 'T' + race.time + ':00+09:00');
    const diff = Math.abs(now - raceTime);
    if (diff <= WINDOW_MS && diff < minDiff) {
      minDiff = diff;
      currentRace = race;
    }
  });

  // 全トグルのliveバッジを一旦リセット
  document.querySelectorAll('#view-toggle-content .toggle .badge-live').forEach(badge => {
    badge.remove();
  });

  // 該当レースだけliveに設定
  if (currentRace) {
    const toggle = document.querySelector(
      `#view-toggle-content .toggle[data-code="${currentRace.event_code}"]`
    );
    if (toggle) {
      const existingBadge = toggle.querySelector('.toggle-header .badge');
      if (existingBadge) {
        existingBadge.className = 'badge badge-live';
        existingBadge.textContent = '実施中';
      }
    }
  }

  // スケジュールビューの「次のレース」ハイライトだけDOM最小更新（全再描画は不要）
  const prevNext = document.querySelector('.schedule-next-race');
  if (prevNext) prevNext.classList.remove('schedule-next-race');
  if (currentRace) {
    const nextRow = document.querySelector(`#schedule-table-container [data-race="${currentRace.race_no}"]`);
    if (nextRow) nextRow.classList.add('schedule-next-race');
  }

  // 進行中レースバナーを更新
  updateCurrentRaceBar(currentRace);
}

function updateCurrentRaceBar(race) {
  const bar = document.getElementById('current-race-bar');
  if (!bar) return;
  if (!race) {
    bar.style.display = 'none';
    return;
  }
  const time = formatRaceTime(race.time);
  bar.innerHTML = `
    <span class="crb-badge">実施中</span>
    <span class="crb-name">R${race.race_no} ${h(race.event_name)}</span>
    <span class="crb-time">${time} スタート</span>`;
  bar.style.display = 'flex';
}

/**
 * 全レース一覧ビューをトグル形式で描画する（レースごとに折り畳み可能）
 */
function renderTableView() {
  const container = document.getElementById('view-table-content');
  if (!container) return;

  // 裁定1: schedule配列順依存をやめ race_no 昇順に統一
  const races = [...(masterData?.schedule || [])].sort((a, b) => a.race_no - b.race_no);

  const html = races.map(race => {
    const opts = resolveMeasurementPoints(race);
    const result = resultsCache[race.race_no];
    const hasResult = !!result;

    // 裁定3: 確定/未実施バッジに統一（テーブルは badge-pending を維持）
    const badge = raceBadgeHTML(hasResult, { pendingClass: 'badge-pending' });
    // 裁定2: age_group は <span class="age-group"> ラップに統一
    const ageLabel = (usedProps.hasAgeGroup && race.age_group)
      ? `<span class="age-group">(${race.age_group})</span>` : '';
    const title = `Race ${race.race_no}｜${h(race.event_name)}${ageLabel}`;

    // 裁定8: 結果なし時は共通ヘルパーで lane 昇順・null ガード・row-retired なし
    const tableBody = hasResult
      ? buildResultRowsHTML(race, result, opts)
      : buildEntryRowsHTML(race, { fullColumns: true, showMidpoint: opts.showMidpoint });

    // テーブルビューはレース軸・1行ヘッダ構成（意図的差異・維持）。裁定4: 矢印は先頭に統一。
    return `
      <div class="toggle" data-race="${race.race_no}" data-category="${h(race.category)}" data-crews="${h((race.entries || []).map(e => `${e.crew_name} ${e.affiliation}`).join(' ').toLowerCase())}">
        <div class="toggle-header" onclick="this.parentElement.classList.toggle('open')">
          <span class="toggle-arrow">▶</span>
          <span class="toggle-title">${title}</span>
          <span class="toggle-meta">${formatDate(race.date)} ${formatRaceTime(race.time)}</span>
          ${badge}
        </div>
        <div class="toggle-body">
          <div class="result-table-wrapper">
          <table class="result-table">
            ${buildTableHeadHTML(opts)}
            <tbody>${tableBody}</tbody>
          </table>
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

// ========= テーブルビューのソート =========

// ========= 固定検索バー =========

/**
 * 固定検索バーとフィルタバーを同期して検索を適用する
 */
function syncStickySearch(value) {
  const crewEl = document.getElementById('filter-crew');
  if (crewEl) crewEl.value = value;
  const clearBtn = document.getElementById('sticky-search-clear');
  if (clearBtn) clearBtn.style.display = value ? 'flex' : 'none';
  applyFilters();
}

/**
 * 固定検索バーをクリアする
 */
function clearStickySearch() {
  const stickyEl = document.getElementById('sticky-search-input');
  if (stickyEl) stickyEl.value = '';
  syncStickySearch('');
  stickyEl?.focus();
}

// スクロールで影を強くする
window.addEventListener('scroll', () => {
  const bar = document.getElementById('sticky-search-bar');
  if (bar) bar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// ========= フィルタ =========

/**
 * フィルタを適用してトグルの表示/非表示を更新する
 */
function applyFilters() {
  filterState.category = document.getElementById('filter-cat')?.value || 'all';
  filterState.round = document.getElementById('filter-round')?.value || 'all';
  filterState.date = document.getElementById('filter-day')?.value || 'all';
  const crewValue = document.getElementById('filter-crew')?.value || '';
  filterState.crew = crewValue.toLowerCase();
  // 固定検索バーと同期
  const stickyEl = document.getElementById('sticky-search-input');
  if (stickyEl && stickyEl !== document.activeElement) stickyEl.value = crewValue;
  const clearBtn = document.getElementById('sticky-search-clear');
  if (clearBtn) clearBtn.style.display = crewValue ? 'flex' : 'none';
  filterState.status = document.getElementById('filter-status')?.value || 'all';

  document.querySelectorAll('#view-toggle-content .toggle').forEach(toggle => {
    const cat = toggle.dataset.category;
    const code = toggle.dataset.code;
    const crews = toggle.dataset.crews || '';
    const hasDone = toggle.dataset.hasDone === 'true';

    let show = true;
    if (filterState.category !== 'all' && cat !== filterState.category) show = false;
    if (filterState.crew && !crews.includes(filterState.crew)) show = false;

    // 状態フィルタ
    if (show && filterState.status !== 'all') {
      if (filterState.status === 'done' && !hasDone) show = false;
      if (filterState.status === 'upcoming' && hasDone) show = false;
    }

    // round・date フィルタはトグル内のレースで判定
    if (show && (filterState.round !== 'all' || filterState.date !== 'all')) {
      const races = (masterData?.schedule || []).filter(r => r.event_code === code);
      const hasMatch = races.some(r =>
        (filterState.round === 'all' || r.round === filterState.round) &&
        (filterState.date === 'all' || r.date === filterState.date)
      );
      if (!hasMatch) show = false;
    }

    toggle.style.display = show ? 'block' : 'none';
    // 検索ヒット時は自動展開・検索クリア時は閉じる
    if (filterState.crew) {
      if (show) toggle.classList.add('open');
    } else {
      toggle.classList.remove('open');
    }
  });

  updateFilterCount();
}

/**
 * フィルタをリセットする
 */
function resetFilters() {
  ['filter-cat', 'filter-round', 'filter-day', 'filter-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'all';
  });
  const crewEl = document.getElementById('filter-crew');
  if (crewEl) crewEl.value = '';
  const stickyEl = document.getElementById('sticky-search-input');
  if (stickyEl) stickyEl.value = '';
  const clearBtn = document.getElementById('sticky-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  Object.assign(filterState, { category: 'all', round: 'all', date: 'all', crew: '', status: 'all' });

  document.querySelectorAll('#view-toggle-content .toggle').forEach(t => {
    t.style.display = 'block';
  });
  updateFilterCount();
}

/**
 * フィルタ件数を更新する
 */
function updateFilterCount() {
  const el = document.getElementById('filter-count');
  if (!el) return;
  const visible = document.querySelectorAll('#view-toggle-content .toggle:not([style*="display: none"])').length;
  const total = document.querySelectorAll('#view-toggle-content .toggle').length;
  el.textContent = `${visible}/${total}種目 表示中`;

  // 0件のとき「見つかりません」メッセージを表示
  let noResult = document.getElementById('filter-no-result');
  if (visible === 0 && filterState.crew) {
    if (!noResult) {
      noResult = document.createElement('p');
      noResult.id = 'filter-no-result';
      noResult.style.cssText = 'text-align:center;padding:40px 16px;color:var(--text-sub);font-size:14px;';
      document.getElementById('view-toggle-content')?.appendChild(noResult);
    }
    noResult.textContent = `「${filterState.crew}」に一致するクルーが見つかりません`;
    noResult.style.display = 'block';
  } else if (noResult) {
    noResult.style.display = 'none';
  }
}

// ========= 全展開・全折畳 =========

/** 全トグルを開く */
function expandAll() {
  document.querySelectorAll('#view-toggle-content .toggle').forEach(t => t.classList.add('open'));
}

/** 全トグルを折畳む */
function collapseAll() {
  document.querySelectorAll('#view-toggle-content .toggle').forEach(t => t.classList.remove('open'));
}

// ========= ビュー切替 =========

/**
 * ビュータブを切り替える
 * @param {string} id - ビューID ('toggle' | 'table' | 'schedule')
 * @param {HTMLElement} [tabEl] - クリックされたタブ要素（onclick="switchView('toggle', this)" 形式で渡す）
 */
function switchView(id, tabEl) {
  const viewTabs = document.querySelector('.view-tabs');
  const tabsTopBefore = viewTabs ? viewTabs.getBoundingClientRect().top : 0;

  document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + id)?.classList.add('active');
  if (tabEl) tabEl.classList.add('active');
  // ボトムナビも同期
  const bnavItem = document.querySelector(`.bnav-item[data-view="${id}"]`);
  if (bnavItem) bnavItem.classList.add('active');
  // URLハッシュを更新（pushStateで履歴に残さない）
  history.replaceState(null, '', '#view-' + id);
  // タブバーの位置を固定（rAFでリフロー後に補正）
  if (viewTabs) {
    requestAnimationFrame(() => {
      const tabsTopAfter = viewTabs.getBoundingClientRect().top;
      window.scrollBy(0, tabsTopAfter - tabsTopBefore);
    });
  }
}

// フィルターパネルの開閉（モバイル用）
function toggleFilterPanel() {
  const panel = document.getElementById('filter-panel');
  const btn = document.getElementById('filter-toggle-btn');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', isOpen);
}

// ========= ステータスバー =========

/**
 * 大会日程が全て過去かどうかを判定する（R2: JST明示・UTC深夜ズレ解消）
 * - toLocaleString('en-US', {timeZone:'Asia/Tokyo'}) でJST日付を取得（adminと統一）
 * - 大会当日は「終了」に含めない（< 比較。UTC基準では深夜0〜9時に翌日扱いになるバグを修正）
 */
function isTournamentOver() {
  if (!masterData || !masterData.tournament?.dates?.length) return false;
  const lastDate = masterData.tournament.dates.slice(-1)[0];
  // JST で今日の日付を取得（toISOString は常に UTC 出力で深夜0〜9時にズレるため不使用。en-CA は YYYY-MM-DD を返す）
  const todayJST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  return lastDate < todayJST; // 当日は「終了」に含めない（< のみ）
}

/**
 * ステータスバーを更新する
 */
function updateStatusBar() {
  const timeEl = document.getElementById('last-updated');
  if (timeEl && lastUpdated) {
    timeEl.textContent = lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }

  const summaryEl = document.getElementById('status-summary');
  if (summaryEl && masterData) {
    const totalRaces = (masterData?.schedule || []).length;
    const doneRaces = Object.keys(resultsCache).length;
    // 全レース確定の場合は専用メッセージを表示
    if (doneRaces === totalRaces && totalRaces > 0) {
      summaryEl.textContent = '全レース結果確定';
    } else {
      summaryEl.textContent = `${doneRaces}/${totalRaces} 確定`;
    }
  }

  // 大会終了後はライブドットを非表示、アーカイブバッジを表示
  const liveDot = document.querySelector('.live-dot');
  const archiveBadge = document.getElementById('archive-badge');
  const tournamentOver = isTournamentOver();
  if (liveDot) liveDot.style.display = tournamentOver ? 'none' : '';
  if (archiveBadge) archiveBadge.style.display = tournamentOver ? 'inline-block' : 'none';

  // 次のレース情報を計算して中央に表示
  const nextInfoEl = document.getElementById('next-race-info');
  if (nextInfoEl && masterData) {
    const now = new Date();
    // 全レース確定、または大会終了後は「次のレース」なし
    const totalRaces = (masterData?.schedule || []).length;
    const doneRaces = Object.keys(resultsCache).length;
    if (doneRaces === totalRaces && totalRaces > 0) {
      nextInfoEl.textContent = '本日のレースは終了しました';
    } else {
      // 未実施レースから現在時刻以降に最も近いものを選ぶ
      let nextRace = null;
      let minFutureDiff = Infinity;
      (masterData?.schedule || []).forEach(race => {
        if (resultsCache[race.race_no]) return;
        const raceTime = new Date(race.date + 'T' + race.time + ':00+09:00');
        const diff = raceTime - now;
        if (diff >= 0 && diff < minFutureDiff) {
          minFutureDiff = diff;
          nextRace = race;
        }
      });
      if (nextRace) {
        const ageLabel = nextRace.age_group ? ` ${nextRace.age_group}` : '';
        nextInfoEl.textContent = `次: Race ${nextRace.race_no} ${nextRace.event_name}${ageLabel} ${formatRaceTime(nextRace.time)}`;
      } else {
        nextInfoEl.textContent = '';
      }
    }
  }
}

// ========= 手動更新 =========

/**
 * 手動更新ボタンから即時リフレッシュする
 */
async function manualRefresh() {
  if (isUpdating) return; // 自動更新中は二重実行を防止
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '更新中...';
  }
  isUpdating = true;
  try {
    const newlyUpdated = await loadResults();
    renderToggleView();
    renderTableView();
    renderScheduleView();
    highlightCurrentRace();
    lastUpdated = new Date();
    updateStatusBar();
    // 更新されたレースのトースト通知
    newlyUpdated.forEach(no => {
      showToast(`Race No.${no} の結果が更新されました`);
    });
  } catch (e) {
    console.error('手動更新エラー:', e);
    showToast('更新に失敗しました。しばらく待ってから再試行してください。');
  } finally {
    isUpdating = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄';
    }
  }
}

// ========= 自動更新 =========

/**
 * 自動更新タイマーをセットする（既存タイマーをクリアしてから登録）
 */
function setupRefreshTimer() {
  // 既存タイマーをクリア（メモリリーク防止）
  if (timers.refresh) clearInterval(timers.refresh);
  if (timers.highlight) clearInterval(timers.highlight);

  // 同時アクセス時のリクエスト集中を分散させるためランダムジッターを付加（±15秒）
  const jitter = Math.floor(Math.random() * 30000);
  timers.refresh = setInterval(async () => {
    if (isOffline || isUpdating) return; // オフライン中・更新中はスキップ
    isUpdating = true;
    try {
      const newlyUpdated = await loadResults('no-cache');
      if (newlyUpdated.length > 0) {
        renderToggleView();
        renderTableView();
        renderScheduleView();
        highlightCurrentRace();
        lastUpdated = new Date();
        updateStatusBar();
        newlyUpdated.forEach(no => showToast(`Race No.${no} の結果が更新されました`));
      }
    } catch (e) {
      console.error('自動更新エラー:', e);
      showToast('データの更新に失敗しました。通信状況をご確認ください。');
    } finally {
      isUpdating = false;
    }
  }, CONFIG.REFRESH_INTERVAL + jitter);

  // 実施中レース判定タイマー（独立管理）
  timers.highlight = setInterval(highlightCurrentRace, 60000);

  // ページ離脱時にタイマーをクリア（beforeunload + pagehide 両対応）
  const cleanup = () => {
    clearInterval(timers.refresh);
    clearInterval(timers.highlight);
  };
  window.addEventListener('beforeunload', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });
}

// ========= オフライン検知 =========

/**
 * オンライン/オフラインイベントを監視してステータスバーに反映する
 */
function setupOfflineDetection() {
  window.addEventListener('offline', () => {
    isOffline = true;
    updateOfflineStatus();
    showToast('⚠️ オフラインです。キャッシュ表示中。');
  });
  window.addEventListener('online', () => {
    isOffline = false;
    updateOfflineStatus();
    showToast('✓ オンライン復帰 - 最新データを取得中');
    setTimeout(() => manualRefresh(), 500);
  });
}

/**
 * オフライン状態をステータスバーに反映する
 */
function updateOfflineStatus() {
  const timeEl = document.getElementById('last-updated');
  if (!timeEl) return;
  if (isOffline) {
    const timeStr = lastUpdated ? lastUpdated.toLocaleTimeString('ja-JP') : '-';
    timeEl.textContent = `⚠️ オフライン中 - 最後の更新: ${timeStr}`;
  } else {
    // オンライン復帰時は通常表示に戻す
    if (lastUpdated) timeEl.textContent = lastUpdated.toLocaleTimeString('ja-JP');
  }
}

// ========= トースト通知 =========

/**
 * トースト通知を表示する（durationミリ秒後に自動消去）
 */
function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  // アニメーション: 表示
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast-show'));
  });

  // durationミリ秒後にフェードアウトして削除
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ========= スケルトンUI =========

/**
 * データ読み込み前にスケルトンブロックを表示する
 */
function showSkeletonToggle() {
  const container = document.getElementById('view-toggle-content');
  if (!container) return;
  // 5つのスケルトンブロックを表示
  container.innerHTML = Array.from({ length: 5 }, () =>
    '<div class="toggle skeleton skeleton-toggle"></div>'
  ).join('');
}

/**
 * スケルトンブロックをクリアする
 */
function clearSkeletonToggle() {
  // renderToggleView() が上書きするので特に何もしなくてよいが、
  // エラー時用に明示的にクリアする
  const container = document.getElementById('view-toggle-content');
  if (container && container.querySelector('.skeleton-toggle')) {
    container.innerHTML = '';
  }
}

// ========= ユーティリティ =========

/**
 * スケジュールを event_code でグループ化して返す
 */
function groupByEventCode(schedule) {
  const map = new Map();
  schedule.forEach(race => {
    if (!map.has(race.event_code)) {
      map.set(race.event_code, {
        eventCode: race.event_code,
        eventName: race.event_name,
        category: race.category,
        races: [],
      });
    }
    map.get(race.event_code).races.push(race);
  });
  return Array.from(map.values());
}

/**
 * "07:00" → "7:00" に変換（先頭ゼロを除去）
 * スケジュールビューやレースヘッダーで使用する
 */
function formatRaceTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '--:--';
  const parts = timeStr.split(':');
  if (parts.length !== 2) return '--:--';
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return '--:--';
  return `${h}:${parts[1]}`;
}

/**
 * YYYY-MM-DD を M/D 形式にフォーマットする
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === 'all') return dateStr || '';
  const normalized = dateStr.replace(/\//g, '-');
  const parts = normalized.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}(${days[d.getDay()]})`;
}


/**
 * 種目コードの表示用変換（アンダースコアを除去）
 * 内部データ（event_code）は変更せず、表示時のみ変換する
 */
function displayCode(code) {
  return code ? code.replace(/_/g, '') : '';
}

/**
 * スケジュール全体を走査して使用中のプロパティセットを返す
 */
function detectUsedProps() {
  if (!masterData) return {};
  const schedule = masterData.schedule || [];
  return {
    hasAgeGroup:    schedule.some(r => r.age_group && r.age_group.trim() !== ''),
    hasRound:       schedule.some(r => r.round     && r.round.trim()     !== ''),
    hasCategories:  schedule.some(r => r.categories && r.categories.length > 1),
    hasAgeCategories: !!(masterData.age_categories && masterData.age_categories.length > 0),
  };
}

/**
 * ローディング表示の切替（タイムアウト検知付き）
 */
let _loadingSlowTimer = null;
function showLoading(show) {
  const el = document.getElementById('loading');
  const slowEl = document.getElementById('loading-slow');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (show) {
    // 8秒後に「遅い」メッセージを表示
    _loadingSlowTimer = setTimeout(() => {
      if (slowEl) slowEl.style.display = 'block';
    }, 8000);
  } else {
    clearTimeout(_loadingSlowTimer);
    if (slowEl) slowEl.style.display = 'none';
  }
}

/**
 * エラーメッセージを丁寧なトラブルシューティング案内付きで表示
 */
function showError(msg) {
  const el = document.getElementById('error-message');
  if (el) {
    el.innerHTML = `
      <div class="error-msg-title">⚠ データを読み込めませんでした</div>
      <div class="error-msg-body">
        以下をご確認ください：<br>
        ① インターネットに接続されていますか？（Wi-Fi・モバイル通信）<br>
        ② ブラウザを一度閉じて、もう一度開いてみてください<br>
        ③ しばらく待ってから再度お試しください（数分で自動復旧することがあります）<br>
        <span style="color:var(--text-muted);font-size:12px">技術情報: 接続エラー</span>
      </div>
      <div class="error-msg-action">
        <button onclick="location.reload()">🔄 画面を再読み込みする</button>
        <span style="font-size:12px;color:var(--text-muted);margin-left:12px">それでも解決しない場合は会場スタッフへお声がけください</span>
      </div>`;
    el.style.display = 'block';
  }
}

/**
 * キャッシュからデータを表示している旨を通知するバナーを表示
 */
function showCacheWarning(ageMin) {
  const ageText = ageMin < 1 ? '1分未満' : `約${ageMin}分`;
  let banner = document.getElementById('cache-warning-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'cache-warning-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59e0b;color:#fff;text-align:center;padding:8px 12px;font-size:13px;font-weight:600;';
    document.body.prepend(banner);
  }
  banner.innerHTML = `⚡ 電波が不安定なため${ageText}前の保存データを表示しています。Wi-Fiで再読込すると最新に更新されます。<button onclick="location.reload()" style="margin-left:12px;padding:2px 10px;background:#fff;color:#92400e;border:none;border-radius:4px;cursor:pointer;font-size:12px">再読込</button>`;
}

// ========= 文字サイズ変更 =========

/**
 * 文字サイズを変更してlocalStorageに保存
 */
function setFontSize(size) {
  document.body.classList.remove('fs-small', 'fs-normal', 'fs-large');
  document.body.classList.add('fs-' + size);
  document.querySelectorAll('.fs-btn').forEach(btn => btn.classList.remove('fs-btn-active'));
  const activeBtn = document.querySelector(`.fs-btn[onclick*="${size}"]`);
  if (activeBtn) activeBtn.classList.add('fs-btn-active');
  try { localStorage.setItem('fontSize', size); } catch(e) {}
}

/**
 * 保存済みの文字サイズを復元
 */
function restoreFontSize() {
  try {
    const saved = localStorage.getItem('fontSize');
    if (saved) setFontSize(saved);
  } catch(e) {}
}

// 起動時に文字サイズを復元
restoreFontSize();
