// ╔══════════════════════════════════════════╗
// ║   HI Health 달리기 측정 위젯              ║
// ║   Scriptable 앱에서 실행하세요            ║
// ╚══════════════════════════════════════════╝
//
// ★ 설치 방법:
//   1. App Store에서 "Scriptable" 설치 (무료)
//   2. Scriptable 앱 열기 → + 버튼 → 이 코드 붙여넣기
//   3. 스크립트 이름을 "달리기 측정"으로 저장
//   4. 홈 화면 길게 누르기 → 위젯 추가 → Scriptable → Medium
//   5. 위젯 길게 누르기 → 위젯 편집 → Script: "달리기 측정" 선택

// ═══════════ 필수 설정 ═══════════
const APP_URL  = "https://hi-fertility-health.com/index.html";
const MY_EMP_ID = "";  // ← 사번 입력 (예: "A001") - 기록 표시용, 없어도 됨
// ══════════════════════════════════

const SUPABASE_URL = "https://xyfxznhhvrnzbykrrqau.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Znh6bmhodnJuemJ5a3JycWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTQyOTEsImV4cCI6MjA5Mjg3MDI5MX0.b0wby-kvXSHQgXjOmG1FNbL1YrbZDSyswIJqjWHxwIs";

const BASE_URL = APP_URL.replace(/\/index\.html.*$/, '');
const RUN_URL  = APP_URL + "?action=run";

// 색상 — 앱 버튼과 동일
const C_BG     = new Color("#fdfcf0");   // 크림 배경
const C_BLUE   = new Color("#1535c4");   // 파란 CTA
const C_DARK   = new Color("#1e1047");   // 진한 텍스트
const C_GRAY   = new Color("#888888");   // 보조 텍스트
const C_PURPLE = new Color("#7C3AED");   // 뱃지
const C_WHITE  = Color.white();
const C_LINE   = new Color("#aaaaaa", 0.4); // 점선

// ─── 이미지 로드 ──────────────────────────────
async function loadImg(path) {
  try {
    const req = new Request(BASE_URL + path);
    return await req.loadImage();
  } catch (_) { return null; }
}

// ─── 데이터 가져오기 ─────────────────────────
async function getRunData() {
  if (!MY_EMP_ID) return { today: [], weekCount: 0 };
  try {
    const weekAgo = Date.now() - 7 * 86400000;
    const req = new Request(
      `${SUPABASE_URL}/rest/v1/workouts` +
      `?empId=eq.${encodeURIComponent(MY_EMP_ID)}` +
      `&exId=eq.running` +
      `&ts=gte.${weekAgo}` +
      `&order=ts.desc&limit=30`
    );
    req.headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
    };
    const data = await req.loadJSON();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = data.filter(w => Number(w.ts) >= todayStart.getTime());
    return { today, weekCount: data.length };
  } catch (_) {
    return { today: [], weekCount: 0 };
  }
}

function fmtDuration(sec) {
  const s = Number(sec) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}분`;
}

// ─── 위젯 만들기 ─────────────────────────────
async function buildWidget() {
  const [charImg, logoImg, { today, weekCount }] = await Promise.all([
    loadImg('/images/4x/run_day_bla.png'),
    loadImg('/images/4x/run_day.png'),
    getRunData(),
  ]);

  const todayDuration = today.reduce((s, w) => s + (Number(w.duration) || 0), 0);
  const todayDist     = today.reduce((s, w) => s + (Number(w.distance) || 0), 0);

  const widget = new ListWidget();
  widget.backgroundColor = C_BG;
  widget.url = RUN_URL;
  widget.setPadding(0, 0, 0, 0);

  // 점선 상단
  const topLine = widget.addStack();
  topLine.size = new Size(0, 5);

  // 본문 레이아웃 (좌/우 2열)
  const body = widget.addStack();
  body.layoutHorizontally();
  body.centerAlignContent();
  body.setPadding(14, 22, 14, 18);

  // ── 왼쪽: 캐릭터 + 로고 ─────────────────────
  const leftCol = body.addStack();
  leftCol.layoutVertically();
  leftCol.centerAlignContent();

  const stickerRow = leftCol.addStack();
  stickerRow.layoutHorizontally();
  stickerRow.centerAlignContent();

  if (charImg) {
    const charImgEl = stickerRow.addImage(charImg);
    charImgEl.imageSize = new Size(52, 52);
    charImgEl.resizable = true;
    stickerRow.addSpacer(8);
  } else {
    const emojiTxt = stickerRow.addText("🏃");
    emojiTxt.font = Font.systemFont(38);
    stickerRow.addSpacer(8);
  }

  const logoCol = stickerRow.addStack();
  logoCol.layoutVertically();

  if (logoImg) {
    const logoImgEl = logoCol.addImage(logoImg);
    logoImgEl.imageSize = new Size(70, 22);
    logoImgEl.resizable = true;
  } else {
    const titleTxt = logoCol.addText("RUN DAY");
    titleTxt.textColor = C_DARK;
    titleTxt.font = Font.boldSystemFont(15);
  }

  const subTxt = logoCol.addText("거리 · 페이스 · 시간 측정");
  subTxt.textColor = C_GRAY;
  subTxt.font = Font.systemFont(9);

  // 오늘 기록 (사번 입력 시)
  if (MY_EMP_ID && (today.length > 0 || weekCount > 0)) {
    leftCol.addSpacer(8);
    const statsRow = leftCol.addStack();
    statsRow.layoutHorizontally();

    if (today.length > 0) {
      if (todayDist > 0) {
        addMiniStat(statsRow, `${todayDist.toFixed(1)}km`);
        statsRow.addSpacer(6);
        addMiniStat(statsRow, fmtDuration(todayDuration));
        statsRow.addSpacer(6);
      }
      addMiniStat(statsRow, `오늘 ${today.length}회`);
    } else if (weekCount > 0) {
      addMiniStat(statsRow, `이번주 ${weekCount}회`);
    }
  }

  body.addSpacer();

  // ── 오른쪽: CTA 버튼 ─────────────────────────
  const rightCol = body.addStack();
  rightCol.layoutVertically();
  rightCol.centerAlignContent();

  // 이번 주 뱃지 (기록 있을 때)
  if (weekCount > 0) {
    const badge = rightCol.addStack();
    badge.backgroundColor = C_PURPLE;
    badge.cornerRadius = 10;
    badge.setPadding(3, 8, 3, 8);
    const badgeTxt = badge.addText(`이번주 ${weekCount}회`);
    badgeTxt.textColor = C_WHITE;
    badgeTxt.font = Font.boldSystemFont(9);
    rightCol.addSpacer(6);
  }

  const btn = rightCol.addStack();
  btn.backgroundColor = C_BLUE;
  btn.cornerRadius = 20;
  btn.setPadding(7, 14, 7, 14);
  btn.centerAlignContent();
  const btnTxt = btn.addText("달리기 측정하기 »");
  btnTxt.textColor = C_WHITE;
  btnTxt.font = Font.boldSystemFont(12);

  // 점선 하단
  const botLine = widget.addStack();
  botLine.size = new Size(0, 5);

  return widget;
}

function addMiniStat(parent, text) {
  const pill = parent.addStack();
  pill.backgroundColor = new Color("#1535c4", 0.1);
  pill.cornerRadius = 8;
  pill.setPadding(2, 7, 2, 7);
  const t = pill.addText(text);
  t.textColor = C_BLUE;
  t.font = Font.boldSystemFont(9);
}

// ─── 실행 ─────────────────────────────────────
const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
