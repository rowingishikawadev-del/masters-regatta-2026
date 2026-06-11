/**
 * RegattaShared — フロント共通定数・共通関数の正本
 *
 * 読み込み順: このファイルを app.js・インラインJSより必ず先に読み込むこと。
 * 参照方法: window.RegattaShared.h() / RegattaShared.ROUND_NAMES / etc.
 * キャッシュ: /js/* は max-age=86400 のため、変更時は ?v=YYYYMMDDX クエリ必須。
 *
 * v20260612a
 */

(function(global) {
  'use strict';

  // ========= XSSエスケープ =========
  // app.js:26 / admin:788 の重複 h() を一本化。
  /**
   * HTMLエスケープ（XSS対策）
   * @param {*} str
   * @returns {string}
   */
  function h(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ========= ラウンド表示名 =========
  // app.js CONFIG.ROUND_NAMES / admin:763 の重複を一本化。
  const ROUND_NAMES = {
    FA: '決勝A', FB: '決勝B', SF: '準決勝',
    H: '予選', RK: '順位決定', R: '敗者復活'
  };

  // ========= localStorageキー定数 =========
  // admin clearBrowserCache(admin:1199) の直書き文字列をこの定数で参照する。
  const LS_MASTER_KEY    = 'regatta_master_v2';
  const LS_RESULT_PREFIX = 'regatta_result_v2_';

  // ========= データパス解決 =========
  /**
   * basePath から master.json / results/ のパスオブジェクトを返す。
   *   index.html  → basePath = ''
   *   admin/9922/ → basePath = '../../'
   *
   * @param {string} basePath - 末尾スラッシュあり or '' を許容
   * @returns {{ master: string, resultDir: string, result: (no: number) => string }}
   */
  function paths(basePath) {
    const trimmed = (basePath || '').replace(/\/?$/, '');
    const base = trimmed === '' ? '' : trimmed + '/';
    const master    = base + 'data/master.json';
    const resultDir = base + 'data/results/';
    const result    = (no) => resultDir + 'race_' + String(no).padStart(3, '0') + '.json';
    return { master, resultDir, result };
  }

  // ========= fetchJSON =========
  /**
   * JSONをfetchしてパースする。
   * cacheMode: 初回ロードは 'default'（ブラウザキャッシュ利用）、強制更新は 'no-cache'
   *
   * @param {string} path
   * @param {number} timeoutMs
   * @param {string} cacheMode
   * @returns {Promise<any>}
   */
  function fetchJSON(path, timeoutMs, cacheMode) {
    timeoutMs = timeoutMs !== undefined ? timeoutMs : 25000;
    cacheMode = cacheMode !== undefined ? cacheMode : 'no-cache';
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
    return fetch(path, { signal: controller.signal, cache: cacheMode })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + path);
        return res.text();
      })
      .then(function(text) {
        clearTimeout(timer);
        return JSON.parse(text);
      })
      .catch(function(e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('タイムアウト: ' + path);
        throw e;
      });
  }

  // ========= fetchJSONWithRetry =========
  /**
   * リトライ付きfetch（最大maxRetries回、失敗時は再試行）
   * app.js の fetchJSONWithRetry 相当を shared.js に移して両者で使う（R3）。
   *
   * @param {string} path
   * @param {number} maxRetries
   * @param {number} timeoutMs
   * @returns {Promise<any>}
   */
  function fetchJSONWithRetry(path, maxRetries, timeoutMs) {
    maxRetries = maxRetries !== undefined ? maxRetries : 3;
    timeoutMs  = timeoutMs  !== undefined ? timeoutMs  : 25000;

    function attempt(n) {
      return fetchJSON(path, timeoutMs, 'no-cache').catch(function(e) {
        if ((e.message || '').indexOf('HTTP 404') !== -1) throw e;
        if (n < maxRetries) {
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(attempt(n + 1)); }, 1000 * n);
          });
        }
        throw e;
      });
    }
    return attempt(1);
  }

  // ========= 公開 =========
  global.RegattaShared = {
    h: h,
    ROUND_NAMES: ROUND_NAMES,
    LS_MASTER_KEY: LS_MASTER_KEY,
    LS_RESULT_PREFIX: LS_RESULT_PREFIX,
    paths: paths,
    fetchJSON: fetchJSON,
    fetchJSONWithRetry: fetchJSONWithRetry,
  };

})(window);
