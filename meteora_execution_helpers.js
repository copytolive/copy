/*
 * meteora_execution_helpers.js
 *
 * Helper murni (pure functions) untuk halaman execution DLMM
 * (frontend/public/meteora_live.html) pada fitur "Meteora Execution Parity".
 *
 * Modul ini sengaja bebas dari DOM/I/O agar dapat:
 *   - di-`require()` oleh Jest (property-based test dengan fast-check), dan
 *   - dimuat via <script src="meteora_execution_helpers.js"> di meteora_live.html
 *     (fungsi akan ter-attach ke window.MeteoraExecutionHelpers).
 *
 * STATUS IMPLEMENTASI:
 *   - formatSubscriptDecimal / parseSubscriptDecimal            -> Task 2.1 (IMPLEMENTED)
 *   - normalizeStrategyClient                                   -> Task 3.1 (IMPLEMENTED)
 *   - validateRange                                             -> Task 3.3 (IMPLEMENTED)
 *   - setChartDenomination                                      -> Task 5.1 (IMPLEMENTED)
 *   - mapActionToEndpoint / actionGuard / computeActionDisabled  -> Task 4 (IMPLEMENTED)
 *
 * Requirements: 5.3, 5.6, 7.4, 9.6, 7.5, 6.4, 4.3, 12.4
 */

(function (root, factory) {
  'use strict';
  const api = factory();
  // CommonJS / Jest
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  // Browser global (meteora_live.html via <script src>)
  if (root && typeof root === 'object') {
    root.MeteoraExecutionHelpers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // Peta digit Unicode subscript (subscript 0..9).
  const SUBSCRIPT_DIGITS = ['\u2080', '\u2081', '\u2082', '\u2083', '\u2084', '\u2085', '\u2086', '\u2087', '\u2088', '\u2089'];
  const SUBSCRIPT_CLASS = '[' + SUBSCRIPT_DIGITS.join('') + ']';
  const SUBSCRIPT_RE = new RegExp(SUBSCRIPT_CLASS);
  // Ambang: subscript dipakai bila jumlah nol beruntun setelah titik desimal > 3.
  const ZERO_RUN_THRESHOLD = 3;

  /**
   * Ubah bilangan bulat non-negatif menjadi rangkaian digit subscript.
   * @param {number} n
   * @returns {string}
   */
  function toSubscript(n) {
    return String(n)
      .split('')
      .map(function (d) { return SUBSCRIPT_DIGITS[Number(d)]; })
      .join('');
  }

  /**
   * Inversi toSubscript: rangkaian digit subscript -> bilangan.
   * @param {string} s
   * @returns {number}
   */
  function fromSubscript(s) {
    return Number(
      s
        .split('')
        .map(function (ch) { return String(SUBSCRIPT_DIGITS.indexOf(ch)); })
        .join('')
    );
  }

  /**
   * Ubah number menjadi string desimal penuh (tanpa notasi eksponen/ilmiah),
   * tanpa kehilangan presisi terhadap representasi terpendek `String(x)`.
   *
   * @param {number} x number berhingga
   * @returns {string}
   */
  function numberToPlainString(x) {
    let s = String(x);
    if (!/e/i.test(s)) return s;

    const negative = s[0] === '-';
    if (negative) s = s.slice(1);

    const parts = s.toLowerCase().split('e');
    const mantissa = parts[0];
    const exp = parseInt(parts[1], 10);

    const mantParts = mantissa.split('.');
    const intPart = mantParts[0];
    const fracPart = mantParts.length > 1 ? mantParts[1] : '';
    const digits = intPart + fracPart;
    const pointPos = intPart.length + exp;

    let result;
    if (pointPos <= 0) {
      result = '0.' + '0'.repeat(-pointPos) + digits;
    } else if (pointPos >= digits.length) {
      result = digits + '0'.repeat(pointPos - digits.length);
    } else {
      result = digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
    }
    return (negative ? '-' : '') + result;
  }

  /**
   * Format angka desimal memakai Subscript_Notation bila jumlah nol beruntun
   * tepat setelah titik desimal > 3 (contoh 0.0000018207 -> "0.0" + subscript-5
   * + "18207", dengan subscript-5 menyatakan jumlah nol beruntun).
   *
   * - `text`  : representasi tampilan (subscript bila memenuhi ambang, jika tidak
   *             sama dengan notasi biasa penuh).
   * - `plain` : notasi desimal penuh tanpa subscript, presisi tidak hilang.
   * - `usedSubscript`: penanda apakah notasi subscript dipakai.
   *
   * Non-finite (NaN/Infinity) atau non-number: kembalikan string apa adanya,
   * usedSubscript false.
   *
   * @param {number} value angka yang diformat
   * @param {object} [opts] opsi format (dicadangkan; presisi penuh dipertahankan)
   * @returns {{ text: string, plain: string, usedSubscript: boolean }}
   *
   * Requirements: 5.3, 5.6
   */
  function formatSubscriptDecimal(value, opts) {
    // Non-finite / non-number: kembalikan string apa adanya.
    if (typeof value !== 'number' || !isFinite(value)) {
      const raw = String(value);
      return { text: raw, plain: raw, usedSubscript: false };
    }

    const plain = numberToPlainString(value);

    const negative = plain[0] === '-';
    const abs = negative ? plain.slice(1) : plain;

    const dotIndex = abs.indexOf('.');
    if (dotIndex === -1) {
      // Bilangan bulat: tidak ada bagian pecahan -> tidak ada subscript.
      return { text: plain, plain: plain, usedSubscript: false };
    }

    const intPart = abs.slice(0, dotIndex);
    const fracPart = abs.slice(dotIndex + 1);

    // Hitung jumlah nol beruntun tepat setelah titik desimal.
    let zeroCount = 0;
    while (zeroCount < fracPart.length && fracPart[zeroCount] === '0') {
      zeroCount += 1;
    }
    const significant = fracPart.slice(zeroCount);

    // Subscript hanya dipakai bila nol beruntun > ambang DAN ada digit signifikan.
    if (zeroCount <= ZERO_RUN_THRESHOLD || significant.length === 0) {
      return { text: plain, plain: plain, usedSubscript: false };
    }

    const sign = negative ? '-' : '';
    // Format: <intPart>.0<subscript(zeroCount)><significant>
    const text = sign + intPart + '.0' + toSubscript(zeroCount) + significant;
    return { text: text, plain: plain, usedSubscript: true };
  }

  /**
   * Inversi formatSubscriptDecimal: parse teks (termasuk bentuk subscript)
   * kembali menjadi number sehingga
   * parseSubscriptDecimal(formatSubscriptDecimal(x).text) setara x.
   *
   * @param {string} text
   * @returns {number}
   *
   * Requirements: 5.3, 5.6
   */
  function parseSubscriptDecimal(text) {
    if (typeof text !== 'string') return Number(text);
    const t = text.trim();

    // Tidak ada digit subscript: parse langsung sebagai number biasa.
    if (!SUBSCRIPT_RE.test(t)) return Number(t);

    const negative = t[0] === '-';
    const body = negative ? t.slice(1) : t;

    // Bentuk yang dihasilkan formatSubscriptDecimal: <intPart>.0<subscripts><significant>
    const match = body.match(new RegExp('^(\\d+)\\.0(' + SUBSCRIPT_CLASS + '+)(\\d+)$'));
    if (!match) {
      // Fallback defensif: buang penanda subscript, coba parse sisanya.
      return Number(t.replace(new RegExp(SUBSCRIPT_CLASS + '+', 'g'), ''));
    }

    const intPart = match[1];
    const zeroCount = fromSubscript(match[2]);
    const significant = match[3];

    const rebuilt = (negative ? '-' : '') + intPart + '.' + '0'.repeat(zeroCount) + significant;
    return Number(rebuilt);
  }

  /**
   * Normalisasi tipe strategi masukan menjadi tepat salah satu
   * 'spot' | 'curve' | 'bid-ask', selaras normalizeStrategyType backend
   * ('curve' -> Curve, 'bid-ask' -> BidAsk, selain itu -> Spot).
   * Tahan variasi huruf besar/kecil dan spasi (trim + lowercase).
   *
   * @param {*} value
   * @returns {'spot'|'curve'|'bid-ask'}
   *
   * Requirements: 7.4
   */
  function normalizeStrategyClient(value) {
    const strategy = String(value == null ? '' : value).trim().toLowerCase();
    if (strategy === 'curve') return 'curve';
    if (strategy === 'bid-ask') return 'bid-ask';
    return 'spot';
  }

  /**
   * Validasi rentang harga/bin sebuah posisi.
   * Valid iff minPrice > 0, maxPrice > minPrice, totalBins bilangan bulat positif.
   * Selain itu kembalikan { valid:false, errors:[...] } dengan pesan spesifik.
   *
   * @param {{ minPrice: number, maxPrice: number, totalBins: number }} range
   * @returns {{ valid: boolean, errors: string[] }}
   *
   * Requirements: 9.6, 7.5, 6.4
   */
  function validateRange(range) {
    const r = range || {};
    const minPrice = r.minPrice;
    const maxPrice = r.maxPrice;
    const totalBins = r.totalBins;
    const errors = [];

    const minValid = typeof minPrice === 'number' && isFinite(minPrice) && minPrice > 0;
    if (!minValid) {
      errors.push('minPrice must be a finite number greater than 0');
    }

    const maxValid = typeof maxPrice === 'number' && isFinite(maxPrice) && maxPrice > minPrice;
    if (!maxValid) {
      errors.push('maxPrice must be a finite number greater than minPrice');
    }

    const binsValid =
      typeof totalBins === 'number' &&
      isFinite(totalBins) &&
      Number.isInteger(totalBins) &&
      totalBins > 0;
    if (!binsValid) {
      errors.push('totalBins must be a positive integer');
    }

    return { valid: errors.length === 0, errors: errors };
  }

  // Kumpulan aksi backend yang DIDUKUNG oleh POST /transaction/build + swap.
  // mapActionToEndpoint tidak boleh mengembalikan aksi di luar kumpulan ini.
  const SUPPORTED_BACKEND_ACTIONS = {
    'add-liquidity': true,
    'rebalance-position': true,
    'withdraw-liquidity': true,
    'create-position': true,
    'limit-order': true,
    'claim-fees': true,
    'close-position': true,
    'swap': true,
  };

  // Tabel pemetaan identitas tombol UI -> { action, extra }.
  // Menerima beragam alias (selector / label singkat) agar tahan variasi pemanggil.
  const ACTION_ENDPOINT_MAP = {
    // Manage-mode
    'add-liquidity': { action: 'add-liquidity', extra: {} },
    'add': { action: 'add-liquidity', extra: {} },
    'rebalance-position': { action: 'rebalance-position', extra: {} },
    'rebalance': { action: 'rebalance-position', extra: {} },
    'withdraw-liquidity': { action: 'withdraw-liquidity', extra: {} },
    'withdraw': { action: 'withdraw-liquidity', extra: {} },
    // Create-mode
    'create-position': { action: 'create-position', extra: {} },
    'limit-order': { action: 'limit-order', extra: {} },
    'swap': { action: 'swap', extra: { endpoints: ['order', 'execute'] } },
    // Klaim & tutup
    'claim-fees': { action: 'claim-fees', extra: {} },
    'claim-all': { action: 'claim-fees', extra: {} },
    'claim': { action: 'claim-fees', extra: {} },
    'close-position': { action: 'close-position', extra: {} },
    'close': { action: 'close-position', extra: {} },
    // Close All mereuse close-position + closeAll:true (tanpa action backend baru).
    'close-all': { action: 'close-position', extra: { closeAll: true } },
    'close-all-positions': { action: 'close-position', extra: { closeAll: true } },
  };

  /**
   * Memetakan identitas tombol UI ke aksi Backend_API sesuai tabel pemetaan desain.
   * Selalu mengembalikan { action, extra }. Untuk masukan yang tidak dikenal,
   * action bernilai null (TIDAK PERNAH mengembalikan aksi tak didukung backend).
   *
   * @param {string} uiAction identitas tombol UI (selector/label/alias)
   * @returns {{ action: string|null, extra: object }}
   *
   * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 12.4
   */
  function mapActionToEndpoint(uiAction) {
    const key = String(uiAction == null ? '' : uiAction).trim().toLowerCase();
    // Guard against inherited keys (e.g. "__proto__", "constructor") so a
    // lookup never returns an inherited prototype object with a missing action.
    const mapped = Object.prototype.hasOwnProperty.call(ACTION_ENDPOINT_MAP, key)
      ? ACTION_ENDPOINT_MAP[key]
      : null;
    if (!mapped) {
      return { action: null, extra: {} };
    }
    // Kembalikan salinan agar pemanggil tidak memutasi tabel bersama.
    return { action: mapped.action, extra: Object.assign({}, mapped.extra) };
  }

  /**
   * Guard dedup: true bila aksi BOLEH dijalankan, yaitu tidak ada aksi identik
   * yang sedang diproses (`state.inFlightAction !== actionId`). Dengan pola
   * "cek guard lalu set inFlightAction", tepat satu eksekusi diizinkan selama
   * inFlightAction masih aktif untuk aksi yang sama; penekanan duplikat ditolak.
   *
   * @param {object} state appState.execution (mengandung inFlightAction)
   * @param {string} actionId
   * @returns {boolean} true bila boleh jalan
   *
   * Requirements: 8.6, 11.4
   */
  function actionGuard(state, actionId) {
    const s = state || {};
    return s.inFlightAction !== actionId;
  }

  /**
   * Invarian keadaan tombol aksi. Bernilai true (disabled) jika dan hanya jika:
   *   - ada aksi sedang diproses (`transactionBusy` true ATAU `inFlightAction` non-null), ATAU
   *   - terdapat error aktif pada aksi tersebut (`actionErrors[actionId]` truthy), ATAU
   *   - input aksi tersebut tidak valid (`actionInputValid[actionId] === false`).
   * Bernilai false ketika tidak ada proses, tidak ada error aktif, dan input valid.
   *
   * @param {object} state appState.execution
   * @param {string} actionId
   * @returns {boolean} true bila tombol harus disabled
   *
   * Requirements: 11.4, 11.6, 11.7
   */
  function computeActionDisabled(state, actionId) {
    const s = state || {};
    const processing = !!s.transactionBusy || (s.inFlightAction != null);
    const hasError = !!(s.actionErrors && s.actionErrors[actionId]);
    const inputInvalid = !!(s.actionInputValid && s.actionInputValid[actionId] === false);
    return processing || hasError || inputInvalid;
  }

  /**
   * Transisi denominasi chart: hanya berpindah ke 'Price' atau 'SOL';
   * nilai lain ditolak (state dipertahankan, referensi sama). Saat valid,
   * kembalikan objek state baru (immutable).
   *
   * @param {object} state appState.execution.chart
   * @param {string} next
   * @returns {object} state chart baru (atau state tak berubah bila invalid)
   *
   * Requirements: 4.3
   */
  function setChartDenomination(state, next) {
    if (next !== 'Price' && next !== 'SOL') {
      return state;
    }
    return Object.assign({}, state, { denomination: next });
  }

  // ---------------------------------------------------------------------------
  // Meteora Full Replacement — fungsi murni baru (IMPLEMENTED).
  //
  //   - withCacheBust / compareBuildVersion                 -> Task 2.1
  //   - clampTotalFee / collectFeeModeLabel                 -> Task 3.1
  //   - feesClaimedDisplay / metricDisplay /
  //     metricChangeMarkupSafe                              -> Task 4.1
  //   - poolAddressIdentity / isWithinTolerance             -> Task 5.1
  //   - limitOrderSideConfig / validateLimitBalance /
  //     computeFundingGap / createButtonDisabled            -> Task 6.1
  //
  // Semua bebas DOM/I/O; diekspor via UMD di bawah.
  //
  // Requirements: 1.2, 1.3, 1.5, 2.2, 2.3, 2.5, 2.6, 3.3, 3.4, 3.6, 4.1, 4.2,
  //   4.3, 4.5, 8.2, 8.5, 9.3, 9.4, 9.5, 9.6, 11.1, 11.2, 11.3, 12.1, 12.2,
  //   12.3, 13.1, 13.2
  // ---------------------------------------------------------------------------

  // Utilitas internal ------------------------------------------------------

  // Cek angka berhingga (number murni, bukan NaN/Infinity).
  function isFiniteNumber(x) {
    return typeof x === 'number' && isFinite(x);
  }

  // Format nilai USD sederhana ala Meteora_AG (dua desimal).
  function formatUsdValue(num) {
    const sign = num < 0 ? '-' : '';
    return sign + '$' + Math.abs(num).toFixed(2);
  }

  // Toleransi relatif: |a-b| <= frac * max(|a|,|b|); bila keduanya 0 → dalam ambang.
  function withinRelative(a, b, frac) {
    const diff = Math.abs(a - b);
    const denom = Math.max(Math.abs(a), Math.abs(b));
    if (denom === 0) return true;
    return diff <= frac * denom;
  }

  /**
   * Peta `collect_fee_mode` → label. Totality function:
   *   mode === 0 → 'Base + Quote'
   *   mode === 1 → tokenYSymbol (bila string non-kosong; selain itu null)
   *   selain itu → null (tidak pernah mengembalikan default menyesatkan).
   *
   * @param {*} mode
   * @param {*} tokenYSymbol
   * @returns {string|null}
   *
   * Requirements: 4.1, 4.2, 4.3, 4.5
   */
  function collectFeeModeLabel(mode, tokenYSymbol) {
    if (mode === 0) return 'Base + Quote';
    if (mode === 1) {
      return typeof tokenYSymbol === 'string' && tokenYSymbol !== '' ? tokenYSymbol : null;
    }
    return null;
  }

  /**
   * Clamp total fee ke rentang [base, max].
   *   total = clamp(base + dynamic, base, max)
   *   dynamic' = max(0, total - base)  (dijamin total === base + dynamic')
   * Komponen input non-finite → field keluaran terkait bernilai `null` (BUKAN 0);
   * total/dynamic turunan hanya dihitung bila base, dynamic, dan max ketiganya finite.
   *
   * @param {{base:*, dynamic:*, max:*}} params
   * @returns {{base:number|null, dynamic:number|null, total:number|null, max:number|null}}
   *
   * Requirements: 3.3, 3.4, 3.6
   */
  function clampTotalFee(params) {
    const p = params || {};
    const baseFinite = isFiniteNumber(p.base);
    const dynFinite = isFiniteNumber(p.dynamic);
    const maxFinite = isFiniteNumber(p.max);

    if (baseFinite && dynFinite && maxFinite) {
      const lo = p.base;
      const hi = p.max;
      let total = p.base + p.dynamic;
      if (total < lo) total = lo;
      if (total > hi) total = hi;
      const dynamicPrime = Math.max(0, total - p.base);
      return { base: p.base, dynamic: dynamicPrime, total: total, max: p.max };
    }

    return {
      base: baseFinite ? p.base : null,
      dynamic: dynFinite ? p.dynamic : null,
      total: null,
      max: maxFinite ? p.max : null,
    };
  }

  /**
   * State tampilan Fees Claimed. Tidak pernah menampilkan nol menyesatkan.
   *   loading truthy → { state:'loading', text:'…' } apa pun value-nya.
   *   tidak loading & value null/undefined/'' → { state:'unavailable', text:'tidak tersedia' }
   *       (text TIDAK PERNAH '0' atau '$0.00').
   *   value angka finite (termasuk 0 nyata) → { state:'available', text: '$x.xx' }.
   *   value lain (non-finite/tak dapat di-parse) → unavailable.
   *
   * @param {*} value
   * @param {*} loading
   * @returns {{state:'available'|'loading'|'unavailable', text:string}}
   *
   * Requirements: 2.2, 2.3, 2.5, 2.6
   */
  function feesClaimedDisplay(value, loading) {
    if (loading) {
      return { state: 'loading', text: 'Memuat…' };
    }
    if (value === null || value === undefined || value === '') {
      return { state: 'unavailable', text: 'tidak tersedia' };
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (isFiniteNumber(num)) {
      return { state: 'available', text: formatUsdValue(num) };
    }
    return { state: 'unavailable', text: 'tidak tersedia' };
  }

  /**
   * Markup perubahan metrik yang aman terhadap empty-vs-zero.
   *   kosong (null/undefined/'') → '' (TIDAK pernah '(0%)').
   *   non-finite → ''.
   *   nol numerik nyata (0) → '(0%)'.
   *   angka finite lain → '(<v>%)' dengan dua desimal.
   *
   * @param {*} value
   * @returns {string}
   *
   * Requirements: 13.1, 13.2
   */
  function metricChangeMarkupSafe(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'number' ? value : Number(value);
    if (!isFiniteNumber(num)) return '';
    return '(' + num.toFixed(2) + '%)';
  }

  /**
   * Tampilan nilai metrik yang membedakan kosong vs nol.
   *   null/undefined/'' → '-'.
   *   non-finite → '-'.
   *   nol numerik nyata → '0'.
   *   angka finite lain → representasi String(num).
   *
   * @param {*} value
   * @returns {string}
   *
   * Requirements: 13.1, 13.2
   */
  function metricDisplay(value) {
    if (value === null || value === undefined || value === '') return '-';
    const num = typeof value === 'number' ? value : Number(value);
    if (!isFiniteNumber(num)) return '-';
    if (num === 0) return '0';
    return String(num);
  }

  /**
   * Bandingkan versi build lokal vs terbaru. Tri-state totality:
   *   salah satu kosong/null/undefined → 'unknown'
   *   keduanya non-kosong & sama → 'fresh'
   *   keduanya non-kosong & berbeda → 'stale'
   *
   * @param {*} local
   * @param {*} latest
   * @returns {'fresh'|'stale'|'unknown'}
   *
   * Requirements: 1.3, 1.5
   */
  function compareBuildVersion(local, latest) {
    const l = local === null || local === undefined ? '' : String(local);
    const r = latest === null || latest === undefined ? '' : String(latest);
    if (l === '' || r === '') return 'unknown';
    return l === r ? 'fresh' : 'stale';
  }

  /**
   * Tambahkan penanda cache-bust `v=<version>` ke URL secara idempoten.
   *   version kosong/null/undefined → URL dikembalikan apa adanya.
   *   URL sudah punya query → gunakan '&', selain itu '?'.
   *   Idempoten: withCacheBust(withCacheBust(u,v),v) === withCacheBust(u,v);
   *     penanda `v=<version>` yang sudah ada (nilai sama) tidak diduplikasi.
   *   Tepat satu penanda versi pada hasil.
   *
   * @param {*} url
   * @param {*} version
   * @returns {string}
   *
   * Requirements: 1.2
   */
  function withCacheBust(url, version) {
    const u = url === null || url === undefined ? '' : String(url);
    if (version === null || version === undefined || version === '') {
      return u;
    }
    const v = String(version);
    const marker = 'v=' + v;

    // Pisahkan fragment (#...) agar penanda diletakkan sebelum fragment.
    const hashIndex = u.indexOf('#');
    const hash = hashIndex === -1 ? '' : u.slice(hashIndex);
    const base = hashIndex === -1 ? u : u.slice(0, hashIndex);

    const queryIndex = base.indexOf('?');
    if (queryIndex === -1) {
      return base + '?' + marker + hash;
    }

    const head = base.slice(0, queryIndex);
    const query = base.slice(queryIndex + 1);
    const params = query === '' ? [] : query.split('&');

    // Buang seluruh penanda v= lama, lalu tambahkan tepat satu penanda baru.
    const kept = params.filter(function (pair) {
      return pair !== '' && pair.slice(0, 2) !== 'v=';
    });
    kept.push(marker);
    return head + '?' + kept.join('&') + hash;
  }

  /**
   * Konfigurasi sisi limit order.
   *   'ask' → { isAskSide:true,  inputSymbol:tokenX, inputDecimalsKey:'x' }
   *   'bid' → { isAskSide:false, inputSymbol:tokenY, inputDecimalsKey:'y' }
   *   side tak dikenal → null.
   *
   * @param {*} side
   * @param {*} tokenX
   * @param {*} tokenY
   * @returns {{isAskSide:boolean, inputSymbol:*, inputDecimalsKey:'x'|'y'}|null}
   *
   * Requirements: 11.1, 11.2
   */
  function limitOrderSideConfig(side, tokenX, tokenY) {
    if (side === 'ask') {
      return { isAskSide: true, inputSymbol: tokenX, inputDecimalsKey: 'x' };
    }
    if (side === 'bid') {
      return { isAskSide: false, inputSymbol: tokenY, inputDecimalsKey: 'y' };
    }
    return null;
  }

  /**
   * Hitung Funding_Gap untuk create position.
   *   requiredSol = rentCost + nativeSolDeposit + feeBuffer
   *   shortfall   = max(0, requiredSol - availableSol)
   *   complete    = seluruh input finite.
   * Input yang hilang/non-finite TIDAK dipaksa menjadi 0; nilai turunan
   * (requiredSol/shortfall) bernilai null bila data belum lengkap.
   *
   * @param {{availableSol:*, rentCost:*, nativeSolDeposit:*, feeBuffer:*}} params
   * @returns {{availableSol:number|null, rentCost:number|null, nativeSolDeposit:number|null,
   *            feeBuffer:number|null, requiredSol:number|null, shortfall:number|null, complete:boolean}}
   *
   * Requirements: 12.1, 12.2, 12.3
   */
  function computeFundingGap(params) {
    const p = params || {};
    const availFinite = isFiniteNumber(p.availableSol);
    const rentFinite = isFiniteNumber(p.rentCost);
    const depFinite = isFiniteNumber(p.nativeSolDeposit);
    const bufFinite = isFiniteNumber(p.feeBuffer);
    const complete = availFinite && rentFinite && depFinite && bufFinite;

    let requiredSol = null;
    let shortfall = null;
    if (complete) {
      // Solana funding is integer lamports. Comparing decimal SOL directly can
      // manufacture a sub-lamport shortfall through IEEE-754 rounding and block
      // a transaction that is actually funded.
      const availableLamports = Math.round(p.availableSol * 1e9);
      const rentLamports = Math.round(p.rentCost * 1e9);
      const depositLamports = Math.round(p.nativeSolDeposit * 1e9);
      const bufferLamports = Math.round(p.feeBuffer * 1e9);
      const requiredLamports = rentLamports + depositLamports + bufferLamports;
      requiredSol = requiredLamports / 1e9;
      shortfall = Math.max(0, requiredLamports - availableLamports) / 1e9;
    }

    return {
      availableSol: availFinite ? p.availableSol : null,
      rentCost: rentFinite ? p.rentCost : null,
      nativeSolDeposit: depFinite ? p.nativeSolDeposit : null,
      feeBuffer: bufFinite ? p.feeBuffer : null,
      requiredSol: requiredSol,
      shortfall: shortfall,
      complete: complete,
    };
  }

  /**
   * Tentukan apakah tombol Create disabled.
   *   disabled true iff gap.complete === true DAN availableSol < requiredSol.
   *   gap.complete === false → selalu false (jangan disable karena data belum lengkap).
   *
   * @param {*} gap output computeFundingGap
   * @returns {boolean}
   *
   * Requirements: 12.2, 12.3
   */
  function createButtonDisabled(gap) {
    const g = gap || {};
    if (g.complete !== true) return false;
    if (!isFiniteNumber(g.availableSol) || !isFiniteNumber(g.requiredSol)) return false;
    return Math.round(g.availableSol * 1e9) < Math.round(g.requiredSol * 1e9);
  }

  /**
   * Identitas exact Pool_Address.
   *   true iff kedua string alamat identik setelah trim (case-sensitive).
   *   Input non-string → false.
   *
   * @param {*} requested
   * @param {*} candidate
   * @returns {boolean}
   *
   * Requirements: 9.3, 9.4, 9.5, 9.6
   */
  function poolAddressIdentity(requested, candidate) {
    if (typeof requested !== 'string' || typeof candidate !== 'string') return false;
    return requested.trim() === candidate.trim();
  }

  /**
   * Validasi saldo untuk limit order pada sisi input yang sesuai side.
   *   side 'ask' → cek saldo token X; 'bid' → token Y.
   *   valid iff amount finite, amount >= 0, dan amount <= saldo sisi input.
   *   side tak dikenal / amount non-finite / saldo tak tersedia → invalid.
   *
   * @param {*} side
   * @param {*} amount
   * @param {{x:*, y:*}} balances
   * @returns {{valid:boolean, error:string|null}}
   *
   * Requirements: 11.3
   */
  function validateLimitBalance(side, amount, balances) {
    const cfg = limitOrderSideConfig(side, null, null);
    if (!cfg) {
      return { valid: false, error: 'unknown_side' };
    }
    const num = typeof amount === 'number' ? amount : Number(amount);
    if (!isFiniteNumber(num)) {
      return { valid: false, error: 'invalid_amount' };
    }
    if (num < 0) {
      return { valid: false, error: 'invalid_amount' };
    }
    const b = balances || {};
    const bal = cfg.inputDecimalsKey === 'x' ? b.x : b.y;
    if (!isFiniteNumber(bal)) {
      return { valid: false, error: 'balance_unavailable' };
    }
    if (num > bal) {
      return { valid: false, error: 'insufficient_balance' };
    }
    return { valid: true, error: null };
  }

  // Ambang toleransi realtime per kategori (lihat tabel Realtime_Tolerance desain).
  //   price     : ≤ 0.5% relatif
  //   volume    : ≤ 2% relatif
  //   liquidity : ≤ 1% relatif
  //   fee       : ditangani khusus (base/max exact; dynamic/total ≤ 0.05 poin persen)
  const RELATIVE_TOLERANCE = {
    price: 0.005,
    volume: 0.02,
    liquidity: 0.01,
  };
  // Ambang absolut untuk fee dinamis/total: 0.05 poin persen.
  const FEE_ABS_TOLERANCE = 0.05;

  /**
   * Perbandingan dalam ambang toleransi realtime sesuai kategori.
   *   'price'     → true iff |a-b| ≤ 0.5% * max(|a|,|b|).
   *   'volume'    → true iff |a-b| ≤ 2% relatif.
   *   'liquidity' → true iff |a-b| ≤ 1% relatif.
   *   'fee'       → true iff |a-b| ≤ 0.05 (poin persen absolut) — mencakup
   *                 dynamic/total; base/max yang harus identik memakai selisih 0.
   *   kategori tak dikenal → false.
   *   input non-finite → false.
   *
   * @param {*} a
   * @param {*} b
   * @param {*} category
   * @returns {boolean}
   *
   * Requirements: 8.2, 8.5
   */
  function isWithinTolerance(a, b, category) {
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) return false;
    if (category === 'fee') {
      return Math.abs(a - b) <= FEE_ABS_TOLERANCE;
    }
    if (Object.prototype.hasOwnProperty.call(RELATIVE_TOLERANCE, category)) {
      return withinRelative(a, b, RELATIVE_TOLERANCE[category]);
    }
    return false;
  }

  /**
   * Distribusi bobot likuiditas per-bin untuk sebuah strategi DLMM, selaras
   * dengan bentuk (shape) yang dihasilkan SDK resmi @meteora-ag/dlmm:
   *
   *   - 'spot'    → seragam (flat). Setiap bin memperoleh bobot sama. Ini
   *                 replika StrategyType.Spot (likuiditas rata di seluruh range).
   *   - 'curve'   → terkonsentrasi di tengah (puncak di bin aktif/tengah,
   *                 meluruh ke tepi). Bentuk segitiga/lonceng — StrategyType.Curve.
   *   - 'bid-ask' → terkonsentrasi di kedua tepi (lembah di tengah). Bentuk-U —
   *                 StrategyType.BidAsk.
   *
   * Bobot dinormalisasi sehingga menjumlah = 1 (kecuali count<=0 → []).
   * Fungsi murni & deterministik agar bisa diuji (PBT) dan dipakai untuk
   * pratinjau histogram sebelum posisi dikirim ke rantai.
   *
   * Bentuk dihitung relatif terhadap sebuah TITIK JANGKAR (anchor). Pada
   * Meteora, jangkar = bin aktif (harga pool), BUKAN tengah range:
   *   - Curve   → puncak di jangkar, meluruh menjauh (menuju harga pool).
   *   - BidAsk  → lembah di jangkar, naik menjauh (menjauhi harga pool).
   * Bila anchorIndex tidak diberikan (undefined/NaN) → jangkar = tengah range
   * (perilaku lama, kompatibel mundur untuk uji yang sudah ada).
   *
   * @param {*} strategy     nilai strategi mentah (dinormalisasi via normalizeStrategyClient)
   * @param {*} count        jumlah bin dalam range (bilangan bulat positif)
   * @param {*} [anchorIndex] indeks bin jangkar dalam range (0..count-1); default tengah
   * @returns {number[]}     array bobot ternormalisasi (panjang = count, jumlah = 1)
   *
   * Requirements: 7.4 (kesesuaian shape strategi dgn SDK Meteora)
   */
  function strategyWeights(strategy, count, anchorIndex) {
    const n = Number(count);
    if (!isFinite(n) || !Number.isInteger(n) || n <= 0) return [];
    const kind = normalizeStrategyClient(strategy);
    if (n === 1) return [1];

    const last = n - 1;
    const mid = last / 2;
    // Jangkar: gunakan anchorIndex bila valid, jika tidak pakai tengah range.
    let anchor = mid;
    if (anchorIndex !== undefined && anchorIndex !== null && isFinite(Number(anchorIndex))) {
      anchor = Math.min(last, Math.max(0, Number(anchorIndex)));
    }
    // Jarak maksimum dari jangkar ke salah satu tepi (untuk normalisasi ke [0,1]).
    const maxDist = Math.max(anchor, last - anchor) || 1;

    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i - anchor) / maxDist; // 0 at anchor .. 1 at far edge
      if (kind === 'spot') {
        // Spot: uniform, flat liquidity across the whole range (Meteora Spot).
        raw[i] = 1;
      } else if (kind === 'curve') {
        // Curve: smooth bell concentrated at the anchor (pool price), tapering
        // to near-zero at the edges. Gaussian-like falloff matches Meteora's
        // Curve shape far better than a straight linear ramp.
        raw[i] = Math.exp(-3.2 * d * d) + 0.02;
      } else {
        // Bid Ask: U-shape — a deep valley at the anchor rising steeply toward
        // both edges (heaviest liquidity away from the pool price). Quadratic
        // growth matches Meteora's Bid-Ask curvature.
        raw[i] = 0.05 + 0.95 * (d * d);
      }
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += raw[i];
    if (!(sum > 0)) {
      const even = 1 / n;
      return raw.map(function () { return even; });
    }
    return raw.map(function (w) { return w / sum; });
  }

  return {
    formatSubscriptDecimal,
    parseSubscriptDecimal,
    normalizeStrategyClient,
    strategyWeights,
    validateRange,
    mapActionToEndpoint,
    actionGuard,
    computeActionDisabled,
    setChartDenomination,
    // Meteora Full Replacement (scaffolding — Task 1)
    collectFeeModeLabel,
    clampTotalFee,
    feesClaimedDisplay,
    metricChangeMarkupSafe,
    metricDisplay,
    compareBuildVersion,
    withCacheBust,
    limitOrderSideConfig,
    computeFundingGap,
    createButtonDisabled,
    poolAddressIdentity,
    validateLimitBalance,
    isWithinTolerance,
  };
});
