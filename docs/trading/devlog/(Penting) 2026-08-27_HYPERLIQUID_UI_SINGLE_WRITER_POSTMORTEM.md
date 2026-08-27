# (Penting) 2026-08-27 — Hyperliquid UI Single-Writer Postmortem

## Tujuan
Dokumen ini adalah regression contract untuk area **Detailed Trade Log / Pending Order / Langsung Entry / Performance / Equity**. Jangan menambah patch baru sebelum membaca aturan di bawah.

## Incident
Gejala yang terlihat di production:
- PENDING ORDER dapat muncul lalu kembali kosong/`TOTAL ENTRY 0`.
- Summary PNL/Probability/Risk-Reward dapat berubah ke `—` walaupun canonical active TP/SL belum berubah.
- Equity chart sempat memiliki lebih dari satu writer/canvas sehingga garis/sumbu terlihat ganda atau berubah.

## Root cause final
Masalah utamanya bukan sekadar response Hyperliquid kosong. Masalahnya adalah **multiple DOM writers**.

`history_hl_mode_v20.js` memiliki private `renderCustom()` dan timer sendiri. Sebelum patch owner-aware, beberapa jalur memanggil private renderer ini langsung:
- `refreshMeta()`
- `refreshData()`
- `setMode()`
- `loadMore()`

V23 hanya membungkus `st.render`. Karena itu private `renderCustom()` dapat melewati V23 dan menulis empty state setelah V19/V23 sudah menampilkan active TP/SL. Ini menghasilkan pola visual “muncul → hilang → muncul”.

## Fix architecture
### V20
- `renderOwnerAware: true`
- `ownerRender()` mendelegasikan semua async/click/pagination render ke **current `st.render` owner**.
- V20 tetap boleh menjadi producer metadata historicalOrders, tetapi tidak boleh mengambil kembali ownership DOM bila wrapper yang lebih baru aktif.

### V23
- Canonical Pending Order = active TP/SL dari `frontendOpenOrders`, live positions, `_hlSlTpByCoin`, dan validated target.
- V23 memeriksa **DOM state**, bukan hanya fingerprint data.
- Jika table/summary/empty-state diubah writer lain, canonical Pending Order dirender ulang.

### Loader
- V20 lama tidak dianggap sehat hanya karena `ready=true`.
- Loader wajib melihat capability `renderOwnerAware===true`.
- Cache bust V20: `history_hl_mode_v20.js?v=20260827-owner-aware-5`.
- V23 dianggap sehat hanya bila `st.render.__ctlV23===true`; jika V20 di-reinstall, V23 wajib dipasang kembali.

### Equity
- Canvas legacy `#equityChart` harus hidden.
- Hanya canonical V22 overlay yang boleh terlihat.

## Source-of-truth matrix
| UI | Canonical source | Render owner |
|---|---|---|
| Header wallet / Available / Margin | Hyperliquid clearinghouse + spot state | V22 |
| Performance / Equity | `_hlPortfolio` + closed `userFills` ALL PAIRS | V22 |
| ALL | Hyperliquid `userFills` ALL PAIRS | V10/V20 |
| PENDING ORDER | active TP/SL (`frontendOpenOrders` + live position + validated target) | V19/V23 |
| LANGSUNG ENTRY | direct entry fills excluding bracket-owned entry | V20/V23 |

## Anti-pattern yang dilarang
1. Menambah `V24/V25/...` tanpa audit semua timer/observer/render writer yang menyentuh DOM target.
2. Menganggap satu screenshot akhir sebagai bukti tidak flicker.
3. Menggunakan cache sebagai solusi race condition. Cache menjaga data, bukan ownership DOM.
4. Menganggap data fingerprint stabil berarti DOM stabil.
5. Loader hanya mengecek `ready=true` tanpa capability marker.
6. Mengklaim production fixed sebelum temporal browser test dan production loader PASS.
7. Acceptance step bergantung pada server/process dari workflow step sebelumnya.

## Mandatory release gates
- `node --check` semua runtime yang disentuh.
- ALL → PENDING → DIRECT → PENDING tidak boleh menimbulkan writer conflict.
- Active TP/SL harus tetap visible melewati polling cycles.
- Competing-writer stress minimal 30 samples dengan `bad=0`.
- Transient 0/error API tidak boleh menghapus last-good snapshot yang masih sah.
- Hanya satu equity canvas visible.
- Production loader harus memuat capability marker terbaru.
- GitHub Pages deploy + browser acceptance harus SUCCESS.

## Evidence 2026-08-27
Final temporal acceptance:

`V23_PENDING_ANTIFLICKER=PASS | bad=0 | samples=30 | rogue=39 | repairs=39 | rows=2 | TOTAL ENTRY 1`

Production loader: `PASS`.
GitHub Pages deployment: `PASS`.

## Relevant commits
- V20 owner-aware: `ff57a6e6d1ad4e6b3f831c639d429458fa1ae158`
- Loader capability/rewrap: `f6718c1831f2ee2946ee5bb4b1693b282f7fd2be`
- Deterministic anti-flicker fixture: `b19ba0044e15edda9052e8f7e5a0cbfb51711a36`

## Definition of Done
**“Tidak berdetak” = tidak ada frame salah pada temporal stress test, bukan sekadar angka akhirnya kembali benar.**
