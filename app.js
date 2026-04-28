const API_URL = "https://feed-api.yoshimoto.co.jp/fany/theater/v1";

const THEATERS = [
  {
    id: "lumine",
    label: "ルミネ",
    name: "ルミネtheよしもと",
    theater: "lumine",
    venue: "01",
    scheduleUrl: "https://lumine.yoshimoto.co.jp/schedule/"
  },
  {
    id: "shibuya",
    label: "渋谷",
    name: "渋谷よしもと漫才劇場",
    theater: "shibuya_manzaigekijyo",
    venue: "01",
    scheduleUrl: "https://shibuya-manzaigekijyo.yoshimoto.co.jp/schedule/"
  },
  {
    id: "jimbocho",
    label: "神保町",
    name: "神保町よしもと漫才劇場",
    theater: "jimbocho_manzaigekijyo",
    venue: "01",
    scheduleUrl: "https://jimbocho-manzaigekijyo.yoshimoto.co.jp/schedule/"
  },
  {
    id: "roppongi",
    label: "六本木",
    name: "YOSHIMOTO ROPPONGI THEATER",
    theater: "roppongi",
    venue: "01",
    scheduleUrl: "https://roppongi.yoshimoto.co.jp/schedule/"
  }
];

const state = {
  mode: "date",
  cache: new Map()
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  dateTab: document.querySelector("#dateTab"),
  searchTab: document.querySelector("#searchTab"),
  datePanel: document.querySelector("#datePanel"),
  searchPanel: document.querySelector("#searchPanel"),
  theaterFilter: document.querySelector("#theaterFilter"),
  dateInput: document.querySelector("#dateInput"),
  loadDateButton: document.querySelector("#loadDateButton"),
  dateStatus: document.querySelector("#dateStatus"),
  dateResults: document.querySelector("#dateResults"),
  artistInput: document.querySelector("#artistInput"),
  searchFromInput: document.querySelector("#searchFromInput"),
  searchToInput: document.querySelector("#searchToInput"),
  searchButton: document.querySelector("#searchButton"),
  searchStatus: document.querySelector("#searchStatus"),
  searchResults: document.querySelector("#searchResults"),
  eventTemplate: document.querySelector("#eventTemplate")
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function apiDate(isoDate) {
  return isoDate.replaceAll("-", "");
}

function apiSlashDateToISO(slashDate) {
  return slashDate.replaceAll("/", "-");
}

function endOfMonthAfter(date, monthOffset) {
  return new Date(date.getFullYear(), date.getMonth() + monthOffset + 1, 0);
}

function formatDateLabel(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
}

function normalizeText(value) {
  return (value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function selectedTheaters() {
  const checked = [...els.theaterFilter.querySelectorAll("input:checked")].map((input) => input.value);
  return THEATERS.filter((theater) => checked.includes(theater.id));
}

function setStatus(el, message) {
  el.textContent = message || "";
}

function renderTheaterFilter() {
  els.theaterFilter.replaceChildren();

  for (const theater of THEATERS) {
    const label = document.createElement("label");
    label.className = "theater-toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = theater.id;
    input.checked = true;
    input.addEventListener("change", () => {
      if (state.mode === "date") {
        loadDateSchedule();
      } else if (els.artistInput.value.trim()) {
        searchArtist();
      }
    });

    const span = document.createElement("span");
    span.textContent = theater.label;

    label.append(input, span);
    els.theaterFilter.append(label);
  }
}

function switchMode(mode) {
  state.mode = mode;
  const isDate = mode === "date";

  els.dateTab.classList.toggle("is-active", isDate);
  els.searchTab.classList.toggle("is-active", !isDate);
  els.dateTab.setAttribute("aria-selected", String(isDate));
  els.searchTab.setAttribute("aria-selected", String(!isDate));
  els.datePanel.classList.toggle("is-active", isDate);
  els.searchPanel.classList.toggle("is-active", !isDate);
}

function cacheKey(theater, from, to) {
  return `${theater.id}:${from}:${to}`;
}

async function fetchTheaterEvents(theater, from, to) {
  const key = cacheKey(theater, from, to);
  if (state.cache.has(key)) {
    return state.cache.get(key);
  }

  const params = new URLSearchParams({
    theater: theater.theater,
    venue: theater.venue,
    date_from: apiDate(from),
    date_to: apiDate(to)
  });

  const response = await fetch(`${API_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`${theater.name}: API ${response.status}`);
  }

  const rawEvents = await response.json();
  const events = rawEvents.map((event) => normalizeEvent(event, theater));
  state.cache.set(key, events);
  return events;
}

async function fetchSelectedEvents(from, to) {
  const theaters = selectedTheaters();
  const groups = await Promise.all(
    theaters.map(async (theater) => ({
      theater,
      events: await fetchTheaterEvents(theater, from, to)
    }))
  );
  return groups;
}

function normalizeEvent(event, theater) {
  const dateISO = apiSlashDateToISO(event.date);
  const memberData = extractMembers(event.memberHtml, event.member);
  const searchText = [event.name, event.member, memberData.names.join(" "), memberData.plainText]
    .filter(Boolean)
    .join(" ");

  return {
    id: event.id,
    theaterId: theater.id,
    theaterLabel: theater.label,
    theaterName: theater.name,
    scheduleUrl: `${theater.scheduleUrl}?id=${encodeURIComponent(event.id)}`,
    dateISO,
    title: event.name || "名称未設定",
    openTime: event.dateTime1,
    startTime: event.dateTime2,
    endTime: event.dateTime3,
    membersText: event.member || memberData.plainText || "",
    members: memberData.links,
    memberNames: memberData.names,
    ticketUrl: event.url1,
    onlineTicketUrl: event.url2,
    posterUrl: event.url3,
    searchText: normalizeText(searchText)
  };
}

function extractMembers(memberHtml, memberText) {
  const links = [];
  const seen = new Set();
  let plainText = memberText || "";

  if (memberHtml) {
    const container = document.createElement("div");
    container.innerHTML = memberHtml;
    plainText = container.textContent || plainText;

    for (const anchor of container.querySelectorAll("a")) {
      const name = anchor.textContent.trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      links.push({
        name,
        url: anchor.href
      });
    }
  }

  return {
    links,
    names: links.map((link) => link.name),
    plainText
  };
}

function eventTime(event) {
  const parts = [];
  if (event.openTime && event.openTime !== "00:00") {
    parts.push(`開場 ${event.openTime}`);
  }
  if (event.startTime && event.startTime !== "00:00") {
    parts.push(`開演 ${event.startTime}`);
  }
  if (event.endTime && event.endTime !== "00:00") {
    parts.push(`終演 ${event.endTime}`);
  }
  return parts.join(" / ") || "時間未定";
}

function compareEvents(a, b) {
  return `${a.dateISO} ${a.startTime || ""} ${a.theaterLabel}`.localeCompare(
    `${b.dateISO} ${b.startTime || ""} ${b.theaterLabel}`,
    "ja"
  );
}

async function loadDateSchedule() {
  const date = els.dateInput.value;
  if (!date) {
    return;
  }

  const theaters = selectedTheaters();
  els.dateResults.className = "results is-date-view";
  els.dateResults.replaceChildren();

  if (!theaters.length) {
    setStatus(els.dateStatus, "劇場が選択されていません。");
    renderEmpty(els.dateResults, "劇場を1つ以上選択してください。");
    return;
  }

  setStatus(els.dateStatus, "取得中...");

  try {
    const groups = await fetchSelectedEvents(date, date);
    let total = 0;
    els.dateResults.replaceChildren();

    for (const group of groups) {
      const events = group.events.filter((event) => event.dateISO === date).sort(compareEvents);
      total += events.length;
      els.dateResults.append(renderTheaterSection(group.theater.name, events));
    }

    setStatus(els.dateStatus, `${formatDateLabel(date)} / ${total}件`);
  } catch (error) {
    setStatus(els.dateStatus, "取得に失敗しました。");
    renderError(els.dateResults, error.message);
  }
}

async function searchArtist() {
  const query = els.artistInput.value.trim();
  const from = els.searchFromInput.value;
  const to = els.searchToInput.value;

  els.searchResults.className = "results";
  els.searchResults.replaceChildren();

  if (!query) {
    setStatus(els.searchStatus, "芸名を入力してください。");
    renderEmpty(els.searchResults, "検索語が空です。");
    return;
  }

  if (!from || !to || from > to) {
    setStatus(els.searchStatus, "検索期間を確認してください。");
    renderEmpty(els.searchResults, "開始日と終了日を正しく指定してください。");
    return;
  }

  const theaters = selectedTheaters();
  if (!theaters.length) {
    setStatus(els.searchStatus, "劇場が選択されていません。");
    renderEmpty(els.searchResults, "劇場を1つ以上選択してください。");
    return;
  }

  setStatus(els.searchStatus, "検索中...");

  try {
    const normalizedQuery = normalizeText(query);
    const groups = await fetchSelectedEvents(from, to);
    const matchedEvents = groups
      .flatMap((group) => group.events)
      .filter((event) => event.searchText.includes(normalizedQuery))
      .sort(compareEvents);

    if (!matchedEvents.length) {
      setStatus(els.searchStatus, `${query} / 0件`);
      renderEmpty(els.searchResults, "該当する出演予定は見つかりませんでした。");
      return;
    }

    setStatus(els.searchStatus, `${query} / ${matchedEvents.length}件`);
    els.searchResults.replaceChildren(...matchedEvents.map(renderEventCard));
  } catch (error) {
    setStatus(els.searchStatus, "検索に失敗しました。");
    renderError(els.searchResults, error.message);
  }
}

function renderTheaterSection(title, events) {
  const section = document.createElement("section");
  section.className = "theater-section";

  const heading = document.createElement("h2");
  heading.className = "section-title";
  heading.textContent = title;

  const count = document.createElement("span");
  count.className = "section-count";
  count.textContent = `${events.length}件`;
  heading.append(count);

  section.append(heading);

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "公演なし";
    section.append(empty);
    return section;
  }

  section.append(...events.map(renderEventCard));
  return section;
}

function renderEventCard(event) {
  const node = els.eventTemplate.content.firstElementChild.cloneNode(true);

  node.querySelector(".event-date").textContent = formatDateLabel(event.dateISO);
  node.querySelector(".event-title").textContent = event.title;
  node.querySelector(".theater-badge").textContent = event.theaterLabel;
  node.querySelector(".event-time").textContent = eventTime(event);

  const membersEl = node.querySelector(".event-members");
  renderMembers(membersEl, event);

  const linksEl = node.querySelector(".event-links");
  linksEl.append(makeLink("公式日程", event.scheduleUrl));
  if (event.ticketUrl) {
    linksEl.append(makeLink("チケット", event.ticketUrl));
  }
  if (event.onlineTicketUrl) {
    linksEl.append(makeLink("オンライン", event.onlineTicketUrl));
  }
  if (event.posterUrl) {
    linksEl.append(makeLink("ポスター", event.posterUrl));
  }

  return node;
}

function renderMembers(container, event) {
  container.replaceChildren();

  if (event.membersText) {
    const text = document.createElement("p");
    text.className = "member-text";
    text.textContent = event.membersText;
    container.append(text);
    return;
  }

  if (event.members.length) {
    container.textContent = event.members.map((member) => member.name).join(" / ");
    return;
  }

  container.textContent = "出演者未定";
}

function makeLink(label, url) {
  const link = document.createElement("a");
  link.className = "event-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function renderEmpty(container, message) {
  container.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  container.append(empty);
}

function renderError(container, message) {
  container.replaceChildren();
  const error = document.createElement("div");
  error.className = "error-state";
  error.textContent = message || "エラーが発生しました。";
  container.append(error);
}

function setInitialDates() {
  const today = new Date();
  const todayISO = toISODate(today);
  const defaultTo = toISODate(endOfMonthAfter(today, 2));

  els.dateInput.value = todayISO;
  els.searchFromInput.value = todayISO;
  els.searchToInput.value = defaultTo;
}

function bindEvents() {
  els.dateTab.addEventListener("click", () => switchMode("date"));
  els.searchTab.addEventListener("click", () => switchMode("search"));
  els.loadDateButton.addEventListener("click", loadDateSchedule);
  els.dateInput.addEventListener("change", loadDateSchedule);
  els.searchButton.addEventListener("click", searchArtist);
  els.artistInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchArtist();
    }
  });
  els.refreshButton.addEventListener("click", () => {
    state.cache.clear();
    if (state.mode === "date") {
      loadDateSchedule();
    } else if (els.artistInput.value.trim()) {
      searchArtist();
    } else {
      setStatus(els.searchStatus, "キャッシュを更新しました。");
    }
  });
}

function init() {
  renderTheaterFilter();
  setInitialDates();
  bindEvents();
  loadDateSchedule();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

init();
