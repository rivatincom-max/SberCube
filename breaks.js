(() => {
  const dialog = document.querySelector("#breaksDialog");
  const find = selector => dialog.querySelector(selector);
  const dateField = find("#btDate");
  const overview = find("#btOverview");
  const form = find("#btForm");
  const list = find("#btList");
  const editor = find("#btRows");
  const error = find("#btError");
  const phase = find("#btPhase");
  const target = find("#btTarget");
  const mainClock = find("#btCountdown");
  const shiftPhase = find("#btShiftPhase");
  const shiftClock = find("#btShiftCountdown");
  const shiftRange = find("#btShiftRange");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const storeKey = "sbercubeBreakSchedules1";
  const typeNames = { personal: "Личная необходимость", lunch: "Обед" };
  const preset = {
    start: "09:00", end: "19:30", breaks: [
      ["personal", "10:50", "11:00"],
      ["lunch", "13:00", "13:20"], ["lunch", "15:00", "15:10"],
      ["lunch", "17:00", "17:10"], ["lunch", "18:00", "18:10"], ["lunch", "19:00", "19:10"]
    ]
  };
  let schedules = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) schedules = saved;
  } catch {}
  const dateInYekaterinburg = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const today = () => {
    const parts = Object.fromEntries(dateInYekaterinburg.formatToParts().map(part => [part.type, part.value]));
    return [parts.year, parts.month, parts.day].join("-");
  };
  const defaultSchedule = date => date === "2026-11-20" ? preset : { start: "09:00", end: "19:30", breaks: [] };
  const minute = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : NaN;
  const countdown = ms => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
  };
  const updateText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  const highlight = [
    { textShadow: "0 0 .12em #d0ffe0, 0 0 .4em #39d982" },
    { textShadow: "0 0 0 transparent" }
  ];

  function parseSchedule(date, data) {
    const start = minute(data?.start), end = minute(data?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) throw new Error("Укажи разное время начала и конца смены.");
    const endOfShift = end < start ? end + 1440 : end;
    const shiftMinute = value => end < start && value < start ? value + 1440 : value;
    const periods = data.breaks.map(([type, from, to]) => {
      const a = shiftMinute(minute(from)), b = shiftMinute(minute(to));
      if (!Object.hasOwn(typeNames, type) || !(a >= start && b <= endOfShift && a < b)) {
        throw new Error("Каждый перерыв должен начинаться и заканчиваться в пределах смены.");
      }
      return { type, from, to, a, b };
    }).sort((a, b) => a.a - b.a);
    if (periods.some((item, i) => i && item.a < periods[i - 1].b)) throw new Error("Перерывы не должны пересекаться.");
    const midnight = Date.parse(date + "T00:00:00+05:00");
    const ts = m => midnight + m * 60000;
    return {
      start: ts(start), end: ts(endOfShift),
      periods: periods.map((item, i) => ({
        ...item, start: ts(item.a), end: ts(item.b), waiting: ts(i ? periods[i - 1].b : start)
      }))
    };
  }

  let schedule, timings, cards = [], timer = 0;
  let lastDigits;
  const digitDisplay = mainClock.querySelector("#btDigits");
  let digits = digitDisplay.querySelectorAll("[data-bt-digit]");
  function drawClock(value) {
    if (lastDigits === value) return;
    const chars = value.replaceAll(":", "");
    if (digits.length !== chars.length) {
      digitDisplay.replaceChildren(...[...value].map(char => {
        if (char === ":") return document.createTextNode(char);
        const digit = document.createElement("span");
        digit.dataset.btDigit = "";
        digit.textContent = char;
        return digit;
      }));
      digits = digitDisplay.querySelectorAll("[data-bt-digit]");
    }
    digits.forEach((digit, index) => {
      if (digit.textContent === chars[index]) return;
      digit.textContent = chars[index];
      if (lastDigits && !reduceMotion.matches && !document.body.classList.contains("eco")) {
        digit.animate(highlight, { duration: 500, easing: "ease-out" });
      }
    });
    updateText(find("#btCountdownText"), value);
    lastDigits = value;
  }

  function render(now = Date.now()) {
    if (!timings) return;
    const next = timings.periods.find(item => now < item.end);
    const active = next && now >= next.start;
    const beforeShift = now < timings.start;
    updateText(shiftPhase, beforeShift ? "До начала смены" : now < timings.end ? "До конца смены" : "Смена закончилась");
    updateText(shiftClock, countdown((beforeShift ? timings.start : timings.end) - now));
    updateText(phase, next ? (active ? "До конца перерыва" : "До перерыва") : (cards.length ? "Все перерывы закончились" : "Нет перерывов"));
    updateText(target, next ? typeNames[next.type] + " · " + next.from + "–" + next.to : "");
    drawClock(countdown(next ? (active ? next.end : next.start) - now : 0));
    cards.forEach(({ item, row, ring, fill, percentage, detail }) => {
      const finished = now >= item.end, started = now >= item.start;
      const begin = started ? item.start : item.waiting;
      const end = started ? item.end : item.start;
      const ratio = now >= end ? 1 : now <= begin ? 0 : (now - begin) / (end - begin);
      const percent = Math.floor(ratio * 100);
      row.toggleAttribute("data-active", started && !finished);
      ring.setAttribute("aria-valuenow", percent);
      fill.style.strokeDashoffset = 100 - ratio * 100;
      updateText(percentage, percent + "%");
      updateText(detail, finished ? "Завершён" : started ? "До конца " + countdown(item.end - now) : now < item.waiting ? "Ожидание ещё не началось" : "Через " + countdown(item.start - now));
    });
  }

  function loadDate() {
    const date = dateField.value || today();
    dateField.value = date;
    schedule = schedules[date] || defaultSchedule(date);
    try {
      timings = parseSchedule(date, schedule);
    } catch {
      schedule = defaultSchedule(date);
      timings = parseSchedule(date, schedule);
    }
    shiftRange.textContent = schedule.start + "–" + schedule.end + (schedule.end < schedule.start ? " (+1 день)" : "");
    list.replaceChildren();
    cards = timings.periods.map(item => {
      const row = find("#btCardTemplate").content.firstElementChild.cloneNode(true);
      const title = typeNames[item.type] + " · " + item.from + "–" + item.to;
      row.querySelector("b").textContent = title;
      const ring = row.querySelector(".bt-ring");
      ring.setAttribute("aria-label", "Прогресс · " + title);
      list.append(row);
      return { item, row, ring, fill: ring.querySelector(".bt-fill"), percentage: ring.querySelector("span"), detail: row.querySelector("small") };
    });
    lastDigits = undefined;
    render();
  }

  function addRow([type, from, to] = ["lunch", "", ""]) {
    const row = find("#btRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector("select").value = type;
    row.querySelector("[name=from]").value = from;
    row.querySelector("[name=to]").value = to;
    row.querySelector("button").onclick = () => row.remove();
    editor.append(row);
    return row;
  }

  function showEditor(editing) {
    overview.hidden = editing;
    form.hidden = !editing;
    dateField.disabled = editing;
    error.textContent = "";
    if (!editing) {
      find("#btEdit").focus();
      return;
    }
    form.elements.shiftStart.value = schedule.start;
    form.elements.shiftEnd.value = schedule.end;
    editor.replaceChildren();
    schedule.breaks.forEach(addRow);
    form.elements.shiftStart.focus();
  }

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-open-breaks]") || dialog.open) return;
    dateField.value = today();
    dateField.disabled = false;
    overview.hidden = false;
    form.hidden = true;
    loadDate();
    dialog.showModal();
    clearInterval(timer);
    timer = setInterval(render, 250);
  });
  find("#btClose").onclick = () => dialog.close();
  dialog.addEventListener("close", () => { if (!dialog.open) clearInterval(timer); });
  dateField.addEventListener("change", loadDate);
  find("#btEdit").onclick = () => showEditor(true);
  find("#btCancel").onclick = () => showEditor(false);
  find("#btAdd").onclick = () => addRow().querySelector("[name=from]").focus();
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = {
      start: form.elements.shiftStart.value,
      end: form.elements.shiftEnd.value,
      breaks: [...editor.children].map(row => [
        row.querySelector("select").value,
        row.querySelector("[name=from]").value,
        row.querySelector("[name=to]").value
      ])
    };
    try {
      parseSchedule(dateField.value, data);
    } catch (problem) {
      error.textContent = problem.message;
      return;
    }
    const updated = { ...schedules, [dateField.value]: data };
    try {
      localStorage.setItem(storeKey, JSON.stringify(updated));
    } catch {
      error.textContent = "Браузер не смог сохранить расписание. Проверь доступ к локальному хранилищу.";
      return;
    }
    schedules = updated;
    loadDate();
    showEditor(false);
  });
})();
