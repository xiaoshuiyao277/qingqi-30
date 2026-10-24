(() => {
  'use strict';

  const STORAGE_KEY = 'light-start-plan-v1';
  const TASKS = ['meals', 'steps', 'training', 'water', 'sleep'];
  const PLAN_DAYS = 30;
  const DAY_MS = 86400000;
  const ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
  const ACTIVITY_LABELS = { sedentary: '久坐活动', light: '轻度活动', moderate: '中度活动', high: '高度活动' };
  const SEX_LABELS = { male: '男性', female: '女性' };
  const WEEKDAY_SCHEDULE = [
    { title: '完全恢复', hint: '只做轻松活动，给身体修复时间' },
    { title: '下肢力量', hint: '深蹲、臀桥、后撤步，约 25–35 分钟' },
    { title: '快走', hint: '保持能说短句的节奏，约 20–30 分钟' },
    { title: '上肢与核心', hint: '俯卧撑变式、划船替代、平板支撑' },
    { title: '主动恢复', hint: '散步和活动关节约 15 分钟' },
    { title: '全身循环', hint: '六个动作循环 3 轮，约 25–35 分钟' },
    { title: '户外快走', hint: '选择安全路线，走 30–45 分钟' }
  ];
  const WEEK_CONFIG = [
    { target: 6000, walks: 2, title: '先让身体动起来', description: '适应训练节奏，本周不追求力竭。' },
    { target: 7000, walks: 2, title: '把训练变成固定安排', description: '只增加一点步数，重点是按计划出现。' },
    { target: 8000, walks: 2, title: '让强度轻一点地上升', description: '动作标准优先，组间休息可以稍短。' },
    { target: 8000, walks: 3, title: '确认这套生活能继续', description: '不额外节食，增加一次快走并认真复盘。' }
  ];

  let storageAvailable = true;
  try {
    localStorage.setItem('__light_start_test__', '1');
    localStorage.removeItem('__light_start_test__');
  } catch (error) {
    storageAvailable = false;
  }

  function localISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const parts = value.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
    return date;
  }

  function daysBetween(start, end) {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate) return 0;
    return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
  }

  function addDays(value, amount) {
    const date = parseDate(value);
    if (!date) return value;
    date.setDate(date.getDate() + amount);
    return localISO(date);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function createDefaultState() {
    return {
      version: 1,
      profile: {
        age: 30,
        sex: 'male',
        heightCm: 168,
        startWeightKg: 80,
        targetWeightKg: 77,
        activity: 'light',
        startDate: localISO()
      },
      tasks: {},
      weightLog: [],
      reviews: {},
      updatedAt: null
    };
  }

  function normalizeState(raw) {
    const fallback = createDefaultState();
    if (!raw || typeof raw !== 'object') return fallback;
    const profile = { ...fallback.profile, ...(raw.profile || {}) };
    const tasks = raw.tasks && typeof raw.tasks === 'object' ? raw.tasks : {};
    const dedupedWeights = new Map();
    if (Array.isArray(raw.weightLog)) {
      raw.weightLog.forEach((entry) => {
        if (!entry || !parseDate(entry.date)) return;
        const weight = Number(entry.weightKg);
        if (!Number.isFinite(weight) || weight < 35 || weight > 250) return;
        const waist = Number(entry.waistCm);
        dedupedWeights.set(entry.date, {
          date: entry.date,
          weightKg: round(weight, 1),
          waistCm: Number.isFinite(waist) && waist >= 40 && waist <= 200 ? round(waist, 1) : null
        });
      });
    }
    return {
      version: 1,
      profile,
      tasks,
      weightLog: [...dedupedWeights.values()].sort((a, b) => a.date.localeCompare(b.date)),
      reviews: raw.reviews && typeof raw.reviews === 'object' ? raw.reviews : {},
      updatedAt: raw.updatedAt || null
    };
  }

  function loadState() {
    if (!storageAvailable) return createDefaultState();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : createDefaultState();
    } catch (error) {
      return createDefaultState();
    }
  }

  let state = loadState();
  let selectedDate = getInitialSelectedDate();
  let toastTimer = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    navToggle: $('.nav-toggle'),
    siteNav: $('#site-nav'),
    bmiRing: $('#bmiRing'),
    bmiValue: $('#bmiValue'),
    bmiLabel: $('#bmiLabel'),
    heroWeight: $('#heroWeight'),
    heroHeight: $('#heroHeight'),
    monthlyGoal: $('#monthlyGoal'),
    daysRemaining: $('#daysRemaining'),
    calorieTarget: $('#calorieTarget'),
    overallProgress: $('#overallProgress'),
    todayDate: $('#todayDate'),
    selectedDayChip: $('#selectedDayChip'),
    selectedDateTitle: $('#selectedDateTitle'),
    selectedDateHint: $('#selectedDateHint'),
    dailyRing: $('#dailyRing'),
    dailyProgress: $('#dailyProgress'),
    taskList: $('#taskList'),
    stepTaskTitle: $('#stepTaskTitle'),
    trainingTaskHint: $('#trainingTaskHint'),
    weekBadge: $('#weekBadge'),
    weekTitle: $('#weekTitle'),
    weekDescription: $('#weekDescription'),
    weekStepTarget: $('#weekStepTarget'),
    weekWalkCount: $('#weekWalkCount'),
    calendarGrid: $('#calendarGrid'),
    calendarCompletion: $('#calendarCompletion'),
    roadmapCards: $('#roadmapCards'),
    chartTitle: $('#chartTitle'),
    weightChart: $('#weightChart'),
    chartEmpty: $('#chartEmpty'),
    latestWeight: $('#latestWeight'),
    weightChange: $('#weightChange'),
    targetGap: $('#targetGap'),
    weightForm: $('#weightForm'),
    weightDate: $('#weightDate'),
    weightValue: $('#weightValue'),
    waistValue: $('#waistValue'),
    weightError: $('#weightError'),
    recentRecords: $('#recentRecords'),
    clearWeights: $('#clearWeights'),
    profileForm: $('#profileForm'),
    profileAge: $('#profileAge'),
    profileSex: $('#profileSex'),
    profileHeight: $('#profileHeight'),
    profileActivity: $('#profileActivity'),
    profileStartWeight: $('#profileStartWeight'),
    profileTargetWeight: $('#profileTargetWeight'),
    profileStartDate: $('#profileStartDate'),
    profileError: $('#profileError'),
    openResetDialog: $('#openResetDialog'),
    resetDialog: $('#resetDialog'),
    nutritionTitle: $('#nutritionTitle'),
    nutritionDescription: $('#nutritionDescription'),
    proteinTarget: $('#proteinTarget'),
    proteinCalories: $('#proteinCalories'),
    fatTarget: $('#fatTarget'),
    fatCalories: $('#fatCalories'),
    carbTarget: $('#carbTarget'),
    carbCalories: $('#carbCalories'),
    bmrValue: $('#bmrValue'),
    tdeeValue: $('#tdeeValue'),
    toast: $('#toast')
  };

  function saveState() {
    state.updatedAt = new Date().toISOString();
    if (!storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      storageAvailable = false;
      showToast('浏览器未能保存数据，本次记录仅在当前页面有效。', 5000);
    }
  }

  function showToast(message, duration = 2600) {
    if (!elements.toast) return;
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), duration);
  }

  function getInitialSelectedDate() {
    const today = localISO();
    const firstDay = state.profile.startDate;
    const dayNumber = daysBetween(firstDay, today) + 1;
    if (dayNumber < 1) return firstDay;
    return addDays(firstDay, clamp(dayNumber, 1, PLAN_DAYS) - 1);
  }

  function getPlanDayNumber(date = selectedDate) {
    return daysBetween(state.profile.startDate, date) + 1;
  }

  function getWeekNumber(date = selectedDate) {
    return clamp(Math.ceil(clamp(getPlanDayNumber(date), 1, PLAN_DAYS) / 7), 1, 4);
  }

  function getWeekConfig(date = selectedDate) {
    return WEEK_CONFIG[getWeekNumber(date) - 1];
  }

  function getTaskState(date = selectedDate) {
    const dateTasks = state.tasks[date];
    return dateTasks && typeof dateTasks === 'object' ? dateTasks : {};
  }

  function getCompletedTaskCount(date = selectedDate) {
    const dateTasks = getTaskState(date);
    return TASKS.filter((task) => Boolean(dateTasks[task])).length;
  }

  function getCurrentWeight() {
    if (!state.weightLog.length) return Number(state.profile.startWeightKg);
    return Number(state.weightLog[state.weightLog.length - 1].weightKg);
  }

  function calculateBmi(weightKg, heightCm) {
    const heightM = heightCm / 100;
    return weightKg / (heightM * heightM);
  }

  function getBmiLabel(bmi) {
    if (bmi < 18.5) return '偏低范围';
    if (bmi < 24) return '健康范围';
    if (bmi < 28) return '超重范围';
    return '肥胖范围 · 稳步改善';
  }

  function calculateNutrition() {
    const profile = state.profile;
    const currentWeight = getCurrentWeight();
    const sexOffset = profile.sex === 'female' ? -161 : 5;
    const bmr = 10 * profile.startWeightKg + 6.25 * profile.heightCm - 5 * profile.age + sexOffset;
    const tdee = bmr * (ACTIVITY_FACTORS[profile.activity] || ACTIVITY_FACTORS.light);
    const floor = profile.sex === 'female' ? 1200 : 1500;
    const deficitTarget = Math.max(floor, Math.round((tdee - 500) / 50) * 50);
    const calorieTarget = Math.max(floor, deficitTarget);
    const proteinTarget = Math.round(clamp(currentWeight * 1.6, 60, 220));
    const fatTarget = Math.round(clamp(currentWeight * 0.7, 35, 110));
    const carbCalories = Math.max(200, calorieTarget - proteinTarget * 4 - fatTarget * 9);
    const carbTarget = Math.max(50, Math.round(carbCalories / 4));
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      calorieTarget,
      proteinTarget,
      proteinCalories: proteinTarget * 4,
      fatTarget,
      fatCalories: fatTarget * 9,
      carbTarget,
      carbCalories: carbTarget * 4
    };
  }

  function formatDateCN(value, includeWeekday = true) {
    const date = parseDate(value);
    if (!date) return value;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const base = `${date.getMonth() + 1}月${date.getDate()}日`;
    return includeWeekday ? `${base} · 周${weekdays[date.getDay()]}` : base;
  }

  function getSelectedDateHint(completed, date) {
    if (getPlanDayNumber(date) > getPlanDayNumber(localISO())) return '先看一眼安排，到当天再完成。';
    if (completed === TASKS.length) return '今天全部完成，剩下的交给恢复。';
    if (completed >= 3) return '主要动作已经完成，保持这个节奏。';
    if (completed >= 1) return '已经开始了，再完成一件就更好。';
    return '先做最小的一件，进度就会动起来。';
  }

  function renderSummary() {
    const profile = state.profile;
    const currentWeight = getCurrentWeight();
    const bmi = calculateBmi(currentWeight, profile.heightCm);
    const bmiProgress = clamp(((bmi - 17) / 18) * 100, 4, 100);
    const goalLoss = Math.max(0, profile.startWeightKg - profile.targetWeightKg);
    const todayDay = getPlanDayNumber(localISO());
    const remaining = todayDay < 1 ? PLAN_DAYS : todayDay > PLAN_DAYS ? 0 : PLAN_DAYS - todayDay + 1;
    let totalCompleted = 0;
    for (let index = 0; index < PLAN_DAYS; index += 1) {
      totalCompleted += getCompletedTaskCount(addDays(profile.startDate, index));
    }
    const nutrition = calculateNutrition();

    elements.bmiValue.textContent = bmi.toFixed(1);
    elements.bmiLabel.textContent = getBmiLabel(bmi);
    elements.bmiRing.style.setProperty('--bmi-progress', `${bmiProgress}%`);
    elements.heroWeight.textContent = `${currentWeight.toFixed(1)} kg`;
    elements.heroHeight.textContent = String(profile.heightCm);
    elements.monthlyGoal.textContent = `减 ${goalLoss.toFixed(1)} kg`;
    elements.daysRemaining.textContent = `${remaining} 天`;
    elements.calorieTarget.textContent = `${nutrition.calorieTarget} kcal`;
    elements.overallProgress.textContent = `${Math.round((totalCompleted / (PLAN_DAYS * TASKS.length)) * 100)}%`;
    elements.todayDate.textContent = `今天 · ${formatDateCN(localISO(), false)}`;
  }

  function renderTasks() {
    const completed = getCompletedTaskCount();
    const percent = Math.round((completed / TASKS.length) * 100);
    const week = getWeekConfig();
    const selectedDayNumber = clamp(getPlanDayNumber(), 1, PLAN_DAYS);
    const weekday = parseDate(selectedDate)?.getDay() ?? 1;
    const today = localISO();
    const taskState = getTaskState();

    elements.selectedDayChip.textContent = `DAY ${selectedDayNumber}`;
    elements.selectedDateTitle.textContent = selectedDate === today ? `今天 · ${formatDateCN(selectedDate, false)}` : formatDateCN(selectedDate);
    elements.selectedDateHint.textContent = getSelectedDateHint(completed, selectedDate);
    elements.dailyProgress.textContent = `${percent}%`;
    elements.dailyRing.style.setProperty('--progress', `${percent}%`);
    elements.stepTaskTitle.textContent = `走到 ${week.target} 步`;
    elements.trainingTaskHint.textContent = WEEKDAY_SCHEDULE[weekday].hint;
    elements.weekBadge.textContent = `第 ${getWeekNumber()} 周`;
    elements.weekTitle.textContent = week.title;
    elements.weekDescription.textContent = week.description;
    elements.weekStepTarget.textContent = `${week.target} 步`;
    elements.weekWalkCount.textContent = `${week.walks} 次`;

    $$('.task-item').forEach((item) => {
      const input = item.querySelector('input[data-task]');
      const checked = Boolean(taskState[input.dataset.task]);
      input.checked = checked;
      item.classList.toggle('is-checked', checked);
    });
  }

  function renderCalendar() {
    elements.calendarGrid.innerHTML = '';
    const today = localISO();
    let totalCompleted = 0;

    for (let index = 0; index < PLAN_DAYS; index += 1) {
      const date = addDays(state.profile.startDate, index);
      const completed = getCompletedTaskCount(date);
      const percent = (completed / TASKS.length) * 100;
      const button = document.createElement('button');
      totalCompleted += completed;
      button.type = 'button';
      button.className = 'calendar-day';
      button.dataset.date = date;
      button.style.setProperty('--day-progress', `${percent}%`);
      button.setAttribute('aria-label', `第 ${index + 1} 天，${formatDateCN(date)}，完成 ${completed} 项`);
      button.setAttribute('aria-pressed', String(date === selectedDate));
      if (completed === TASKS.length) button.classList.add('is-done');
      else if (completed > 0) button.classList.add('is-partial');
      if (date === selectedDate) button.classList.add('is-selected');
      if (date === today) button.classList.add('is-today');
      button.innerHTML = `<span>${index + 1}</span>`;
      elements.calendarGrid.appendChild(button);
    }
    elements.calendarCompletion.textContent = `${totalCompleted} / ${PLAN_DAYS * TASKS.length}`;
  }

  function renderRoadmap() {
    const currentWeek = getWeekNumber();
    elements.roadmapCards.dataset.currentWeek = String(currentWeek);
  }

  function renderNutrition() {
    const nutrition = calculateNutrition();
    const profile = state.profile;
    elements.nutritionTitle.textContent = `${nutrition.calorieTarget} kcal`;
    elements.nutritionDescription.textContent = `基于 ${profile.age} 岁${SEX_LABELS[profile.sex]}、${profile.heightCm} cm、${profile.startWeightKg.toFixed(1)} kg、${ACTIVITY_LABELS[profile.activity] || '轻度活动'}，并预留约 500 kcal 的温和热量缺口。`;
    elements.proteinTarget.textContent = `${nutrition.proteinTarget} g`;
    elements.proteinCalories.textContent = `${nutrition.proteinCalories} kcal`;
    elements.fatTarget.textContent = `${nutrition.fatTarget} g`;
    elements.fatCalories.textContent = `${nutrition.fatCalories} kcal`;
    elements.carbTarget.textContent = `${nutrition.carbTarget} g`;
    elements.carbCalories.textContent = `${nutrition.carbCalories} kcal`;
    elements.bmrValue.textContent = `${nutrition.bmr} kcal`;
    elements.tdeeValue.textContent = `${nutrition.tdee} kcal`;
  }

  function getChartPoints() {
    const map = new Map();
    map.set(state.profile.startDate, Number(state.profile.startWeightKg));
    state.weightLog.forEach((entry) => map.set(entry.date, Number(entry.weightKg)));
    return [...map.entries()]
      .map(([date, weight]) => ({ date, weight }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function buildMovingAverage(points) {
    return points.map((point) => {
      const windowStart = addDays(point.date, -6);
      const values = points.filter((candidate) => candidate.date >= windowStart && candidate.date <= point.date);
      const average = values.reduce((sum, item) => sum + item.weight, 0) / values.length;
      return { ...point, trend: average };
    });
  }

  function svgElement(name, attributes = {}, text = '') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function renderChart() {
    const width = 720;
    const height = 300;
    const padding = { top: 22, right: 35, bottom: 48, left: 58 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const rawPoints = getChartPoints();
    const points = buildMovingAverage(rawPoints);
    const allWeights = points.flatMap((point) => [point.weight, point.trend]).concat(Number(state.profile.targetWeightKg));
    let minWeight = Math.floor((Math.min(...allWeights) - 0.7) * 2) / 2;
    let maxWeight = Math.ceil((Math.max(...allWeights) + 0.7) * 2) / 2;
    if (maxWeight - minWeight < 2) {
      const center = (maxWeight + minWeight) / 2;
      minWeight = Math.floor(center - 1);
      maxWeight = Math.ceil(center + 1);
    }

    const startTime = parseDate(rawPoints[0].date).getTime();
    const endTime = parseDate(rawPoints[rawPoints.length - 1].date).getTime();
    const timeRange = Math.max(DAY_MS, endTime - startTime);
    const xScale = (date) => {
      if (rawPoints.length === 1) return padding.left + plotWidth / 2;
      return padding.left + ((parseDate(date).getTime() - startTime) / timeRange) * plotWidth;
    };
    const yScale = (weight) => padding.top + ((maxWeight - weight) / (maxWeight - minWeight)) * plotHeight;

    elements.weightChart.innerHTML = '';
    const definitions = svgElement('defs');
    const gradient = svgElement('linearGradient', { id: 'chartArea', x1: '0', y1: '0', x2: '0', y2: '1' });
    gradient.appendChild(svgElement('stop', { offset: '0%', 'stop-color': '#2f6b4f', 'stop-opacity': '0.20' }));
    gradient.appendChild(svgElement('stop', { offset: '100%', 'stop-color': '#2f6b4f', 'stop-opacity': '0' }));
    definitions.appendChild(gradient);
    elements.weightChart.appendChild(definitions);

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (plotHeight / 4) * index;
      const value = maxWeight - ((maxWeight - minWeight) / 4) * index;
      elements.weightChart.appendChild(svgElement('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: '#e7e0d3', 'stroke-width': 1 }));
      elements.weightChart.appendChild(svgElement('text', { x: padding.left - 12, y: y + 4, fill: '#7a857e', 'font-size': '11', 'text-anchor': 'end' }, `${value.toFixed(1)}`));
    }

    const xLabelDates = rawPoints.length > 1
      ? [rawPoints[0].date, rawPoints[Math.floor((rawPoints.length - 1) / 2)].date, rawPoints[rawPoints.length - 1].date]
      : [rawPoints[0].date];
    xLabelDates.forEach((dateValue, index) => {
      const x = rawPoints.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (xLabelDates.length - 1 || 1)) * plotWidth;
      const anchor = index === 0 ? 'start' : index === xLabelDates.length - 1 ? 'end' : 'middle';
      elements.weightChart.appendChild(svgElement('text', { x, y: height - 13, fill: '#7a857e', 'font-size': '11', 'text-anchor': anchor }, formatDateCN(dateValue, false)));
    });

    const targetWeight = Number(state.profile.targetWeightKg);
    if (targetWeight >= minWeight && targetWeight <= maxWeight) {
      const targetY = yScale(targetWeight);
      elements.weightChart.appendChild(svgElement('line', { x1: padding.left, y1: targetY, x2: width - padding.right, y2: targetY, stroke: '#f1bd58', 'stroke-width': 2, 'stroke-dasharray': '7 7' }));
      elements.weightChart.appendChild(svgElement('text', { x: width - padding.right, y: targetY - 8, fill: '#9b6b11', 'font-size': '10', 'text-anchor': 'end' }, `目标 ${targetWeight.toFixed(1)} kg`));
    }

    const rawCoordinates = points.map((point) => `${xScale(point.date)},${yScale(point.weight)}`).join(' ');
    if (points.length > 1) {
      const areaCoordinates = `${padding.left},${padding.top + plotHeight} ${rawCoordinates} ${xScale(points[points.length - 1].date)},${padding.top + plotHeight}`;
      elements.weightChart.appendChild(svgElement('polygon', { points: areaCoordinates, fill: 'url(#chartArea)' }));
    }
    elements.weightChart.appendChild(svgElement('polyline', {
      points: rawCoordinates,
      fill: 'none',
      stroke: '#2f6b4f',
      'stroke-width': 3.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }));
    if (points.length > 1) {
      elements.weightChart.appendChild(svgElement('polyline', {
        points: points.map((point) => `${xScale(point.date)},${yScale(point.trend)}`).join(' '),
        fill: 'none',
        stroke: '#e97947',
        'stroke-width': 2,
        'stroke-dasharray': '6 6',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }));
    }
    points.forEach((point) => {
      elements.weightChart.appendChild(svgElement('circle', { cx: xScale(point.date), cy: yScale(point.weight), r: 4.5, fill: '#fffdf8', stroke: '#2f6b4f', 'stroke-width': 2.5 }));
    });

    const latest = rawPoints[rawPoints.length - 1];
    const startWeight = Number(state.profile.startWeightKg);
    const targetWeightValue = Number(state.profile.targetWeightKg);
    const delta = round(latest.weight - startWeight, 1);
    const gap = Math.max(0, round(latest.weight - targetWeightValue, 1));
    elements.latestWeight.textContent = `${latest.weight.toFixed(1)} kg`;
    elements.weightChange.textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`;
    elements.targetGap.textContent = `${gap.toFixed(1)} kg`;
    elements.chartTitle.textContent = state.weightLog.length
      ? `已记录 ${state.weightLog.length} 次 · 最新 ${latest.weight.toFixed(1)} kg`
      : `从 ${startWeight.toFixed(1)} kg 开始`;
    elements.chartEmpty.classList.toggle('is-visible', state.weightLog.length === 0);
  }

  function renderRecentRecords() {
    const recent = [...state.weightLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (!recent.length) {
      elements.recentRecords.innerHTML = '<p class="empty-copy">还没有额外记录。</p>';
      return;
    }
    elements.recentRecords.innerHTML = recent.map((entry) => {
      const waist = entry.waistCm ? `<em>腰围 ${entry.waistCm.toFixed(1)} cm</em>` : '<em>未记腰围</em>';
      return `<div class="recent-entry"><span>${formatDateCN(entry.date, false)}</span><strong>${entry.weightKg.toFixed(1)} kg</strong>${waist}</div>`;
    }).join('');
  }

  function syncForms() {
    const profile = state.profile;
    elements.profileAge.value = profile.age;
    elements.profileSex.value = profile.sex;
    elements.profileHeight.value = profile.heightCm;
    elements.profileActivity.value = profile.activity;
    elements.profileStartWeight.value = profile.startWeightKg;
    elements.profileTargetWeight.value = profile.targetWeightKg;
    elements.profileStartDate.value = profile.startDate;
    elements.weightDate.value = localISO();
    elements.weightDate.min = profile.startDate;
    elements.weightDate.max = localISO();
  }

  function renderDynamic() {
    renderSummary();
    renderTasks();
    renderCalendar();
    renderRoadmap();
    renderNutrition();
    renderChart();
    renderRecentRecords();
  }

  function setSelectedDate(date) {
    if (!parseDate(date)) return;
    selectedDate = date;
    renderTasks();
    renderCalendar();
    renderRoadmap();
  }

  function handleTaskChange(event) {
    const input = event.target.closest('input[data-task]');
    if (!input) return;
    const dateTasks = { ...getTaskState() };
    dateTasks[input.dataset.task] = input.checked;
    if (input.checked) state.tasks[selectedDate] = dateTasks;
    else delete dateTasks[input.dataset.task];
    if (!TASKS.some((task) => Boolean(dateTasks[task]))) delete state.tasks[selectedDate];
    else state.tasks[selectedDate] = dateTasks;
    saveState();
    renderSummary();
    renderTasks();
    renderCalendar();
  }

  function handleCalendarClick(event) {
    const button = event.target.closest('.calendar-day');
    if (!button) return;
    setSelectedDate(button.dataset.date);
  }

  function handleWeightSubmit(event) {
    event.preventDefault();
    elements.weightError.textContent = '';
    const date = elements.weightDate.value;
    const weight = Number(elements.weightValue.value);
    const waistRaw = elements.waistValue.value.trim();
    const waist = waistRaw ? Number(waistRaw) : null;
    const today = localISO();

    if (!parseDate(date)) {
      elements.weightError.textContent = '请选择有效的记录日期。';
      return;
    }
    if (date < state.profile.startDate) {
      elements.weightError.textContent = '记录日期不能早于计划开始日期。';
      return;
    }
    if (date > today) {
      elements.weightError.textContent = '不能记录未来的体重。';
      return;
    }
    if (!Number.isFinite(weight) || weight < 35 || weight > 250) {
      elements.weightError.textContent = '体重请输入 35–250 kg 之间的数字。';
      return;
    }
    if (waist !== null && (!Number.isFinite(waist) || waist < 40 || waist > 200)) {
      elements.weightError.textContent = '腰围请输入 40–200 cm 之间的数字，也可以留空。';
      return;
    }

    const entry = { date, weightKg: round(weight, 1), waistCm: waist === null ? null : round(waist, 1) };
    const existingIndex = state.weightLog.findIndex((item) => item.date === date);
    if (existingIndex >= 0) state.weightLog[existingIndex] = entry;
    else state.weightLog.push(entry);
    state.weightLog.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    elements.weightValue.value = '';
    elements.waistValue.value = '';
    renderDynamic();
    showToast(existingIndex >= 0 ? '已更新当天记录。' : '体重记录已保存。');
  }

  function validateProfile(profile) {
    if (!Number.isInteger(profile.age) || profile.age < 18 || profile.age > 80) return '年龄请输入 18–80 岁之间的整数。';
    if (!['male', 'female'].includes(profile.sex)) return '请选择性别。';
    if (!Number.isFinite(profile.heightCm) || profile.heightCm < 140 || profile.heightCm > 220) return '身高请输入 140–220 cm 之间的数字。';
    if (!ACTIVITY_FACTORS[profile.activity]) return '请选择活动水平。';
    if (!Number.isFinite(profile.startWeightKg) || profile.startWeightKg < 40 || profile.startWeightKg > 250) return '起始体重请输入 40–250 kg 之间的数字。';
    if (!Number.isFinite(profile.targetWeightKg) || profile.targetWeightKg < 40 || profile.targetWeightKg > 250) return '目标体重请输入 40–250 kg 之间的数字。';
    if (profile.targetWeightKg >= profile.startWeightKg) return '目标体重应低于起始体重。';
    if (!parseDate(profile.startDate)) return '请选择有效的开始日期。';
    const targetBmi = calculateBmi(profile.targetWeightKg, profile.heightCm);
    if (targetBmi < 18.5) return `目标体重不能低于健康 BMI 18.5，对应约 ${round(18.5 * (profile.heightCm / 100) ** 2, 1)} kg。`;
    const totalLoss = profile.startWeightKg - profile.targetWeightKg;
    const maxThirtyDayLoss = profile.startWeightKg * 0.08;
    if (totalLoss > maxThirtyDayLoss) return `若这是 30 天目标，减重不宜超过起始体重的 8%；当前最多约 ${round(maxThirtyDayLoss, 1)} kg。`;
    return '';
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    elements.profileError.textContent = '';
    const profile = {
      age: Number.parseInt(elements.profileAge.value, 10),
      sex: elements.profileSex.value,
      heightCm: Number(elements.profileHeight.value),
      activity: elements.profileActivity.value,
      startWeightKg: Number(elements.profileStartWeight.value),
      targetWeightKg: Number(elements.profileTargetWeight.value),
      startDate: elements.profileStartDate.value
    };
    const error = validateProfile(profile);
    if (error) {
      elements.profileError.textContent = error;
      return;
    }
    const structuralChange = profile.startWeightKg !== state.profile.startWeightKg || profile.startDate !== state.profile.startDate;
    if (structuralChange && state.weightLog.length && !window.confirm('修改起始体重或开始日期后，已有体重记录仍会保留在图表中。确定继续吗？')) return;
    state.profile = profile;
    selectedDate = getInitialSelectedDate();
    saveState();
    syncForms();
    renderDynamic();
    showToast('计划已重新计算并保存。');
  }

  function resetAllData() {
    state = createDefaultState();
    selectedDate = getInitialSelectedDate();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      storageAvailable = false;
    }
    syncForms();
    renderDynamic();
    showToast('全部数据已重置。');
  }

  function bindEvents() {
    elements.navToggle.addEventListener('click', () => {
      const open = elements.siteNav.classList.toggle('is-open');
      elements.navToggle.setAttribute('aria-expanded', String(open));
      elements.navToggle.querySelector('.sr-only').textContent = open ? '关闭导航' : '打开导航';
    });
    elements.siteNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        elements.siteNav.classList.remove('is-open');
        elements.navToggle.setAttribute('aria-expanded', 'false');
      }
    });
    elements.taskList.addEventListener('change', handleTaskChange);
    elements.calendarGrid.addEventListener('click', handleCalendarClick);
    elements.weightForm.addEventListener('submit', handleWeightSubmit);
    elements.profileForm.addEventListener('submit', handleProfileSubmit);
    elements.clearWeights.addEventListener('click', () => {
      if (!state.weightLog.length) {
        showToast('还没有可以清除的体重记录。');
        return;
      }
      if (window.confirm('确定清除全部体重与腰围记录吗？每日打卡不会受到影响。')) {
        state.weightLog = [];
        saveState();
        renderDynamic();
        showToast('体重记录已清除。');
      }
    });
    elements.openResetDialog.addEventListener('click', () => {
      if (typeof elements.resetDialog.showModal === 'function') {
        elements.resetDialog.showModal();
      } else if (window.confirm('确定重置全部数据？此操作无法撤销。')) {
        resetAllData();
      }
    });
    elements.resetDialog.addEventListener('close', () => {
      if (elements.resetDialog.returnValue === 'confirm') resetAllData();
    });
  }

  bindEvents();
  syncForms();
  renderDynamic();

  if (!storageAvailable) {
    window.setTimeout(() => showToast('当前浏览器不允许本地存储，记录刷新后会丢失。', 5000), 500);
  }
})();

